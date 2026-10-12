"""Commission-based financial tracking tests (iteration 4)."""
import os
import pytest
import requests
from datetime import date, timedelta

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
MASTER_TOKEN = "qa_session_vinicius_001"

# Pin all tests here to the same xdist worker to avoid cross-worker interference
# on global stats aggregation.
pytestmark = pytest.mark.xdist_group("commission_stats")
HEADERS = {"Authorization": f"Bearer {MASTER_TOKEN}", "Content-Type": "application/json"}


def _get_lot_name():
    r = requests.get(f"{BASE_URL}/api/loteamentos", headers=HEADERS, timeout=30)
    assert r.status_code == 200
    lots = r.json()
    assert lots, "need at least one loteamento"
    return lots[0]["name"]


def _get_stats(year=2026):
    r = requests.get(f"{BASE_URL}/api/stats?year={year}", headers=HEADERS, timeout=30)
    assert r.status_code == 200
    return r.json()


@pytest.fixture
def lot_name():
    return _get_lot_name()


@pytest.fixture(autouse=True)
def cleanup():
    yield
    # cleanup TEST_ sales
    r = requests.get(f"{BASE_URL}/api/sales", headers=HEADERS, timeout=30)
    if r.status_code == 200:
        for s in r.json():
            if (s.get("property_name") or "").startswith("TEST_") or (s.get("client_name") or "").startswith("TEST_"):
                requests.delete(f"{BASE_URL}/api/sales/{s['id']}", headers=HEADERS, timeout=30)


class TestStatsShape:
    def test_stats_contains_commission_keys(self):
        s = _get_stats()
        for k in ("comissao_total", "comissao_recebida", "comissao_a_receber",
                  "comissao_vencida", "ticket_medio", "vgv_geral", "qtd_vendas"):
            assert k in s, f"missing key {k} in stats: {list(s.keys())}"

    def test_ticket_medio_matches_total_over_qtd(self):
        s = _get_stats()
        qtd = s["qtd_vendas"]
        if qtd:
            assert abs(s["ticket_medio"] - s["total_vendido"] / qtd) < 0.01
        else:
            assert s["ticket_medio"] == 0


def _make_payload(lot, commission_value=10000.0, commission_received=False, installments=None):
    return {
        "property_name": lot,
        "quadra": "A",
        "lote": "1",
        "client_name": "TEST_Cliente",
        "broker_name": "Carlão",
        "sale_date": "2026-01-15",
        "sale_value": 100000.0,
        "commission_rate": 10.0,
        "commission_value": commission_value,
        "broker_split": 60.0,
        "broker_commission": commission_value * 0.6,
        "agency_commission": commission_value * 0.4,
        "commission_received": commission_received,
        "entrada": 0.0,
        "parcelado": bool(installments),
        "installments": installments or [],
        "notes": "",
    }


class TestCommissionCashReceived:
    def test_a_vista_recebida_moves_to_recebida(self, lot_name):
        before = _get_stats()
        payload = _make_payload(lot_name, commission_value=10000, commission_received=True)
        r = requests.post(f"{BASE_URL}/api/sales", headers=HEADERS, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        after = _get_stats()
        assert after["comissao_recebida"] - before["comissao_recebida"] == pytest.approx(10000, abs=0.5)
        # a_receber should NOT grow by the commission value
        diff_pending = after["comissao_a_receber"] - before["comissao_a_receber"]
        assert diff_pending < 1.0, f"a_receber should not include received cash commission (diff={diff_pending})"


class TestCommissionCashPending:
    def test_a_vista_nao_recebida_moves_to_a_receber(self, lot_name):
        before = _get_stats()
        payload = _make_payload(lot_name, commission_value=10000, commission_received=False)
        r = requests.post(f"{BASE_URL}/api/sales", headers=HEADERS, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        after = _get_stats()
        assert after["comissao_a_receber"] - before["comissao_a_receber"] == pytest.approx(10000, abs=0.5)
        assert after["comissao_recebida"] - before["comissao_recebida"] < 1.0


class TestCommissionInstallments:
    def test_installments_with_overdue(self, lot_name):
        today = date.today()
        past = (today - timedelta(days=10)).isoformat()
        future1 = (today + timedelta(days=20)).isoformat()
        future2 = (today + timedelta(days=50)).isoformat()
        installments = [
            {"number": 1, "due_date": past, "value": 500, "received": False, "received_date": None},
            {"number": 2, "due_date": future1, "value": 500, "received": False, "received_date": None},
            {"number": 3, "due_date": future2, "value": 500, "received": False, "received_date": None},
        ]
        before = _get_stats()
        payload = _make_payload(lot_name, commission_value=1500, commission_received=False,
                                installments=installments)
        r = requests.post(f"{BASE_URL}/api/sales", headers=HEADERS, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        sale_id = r.json()["id"]
        after = _get_stats()
        assert after["comissao_a_receber"] - before["comissao_a_receber"] == pytest.approx(1500, abs=0.5)
        assert after["comissao_vencida"] - before["comissao_vencida"] == pytest.approx(500, abs=0.5)

        # pay installment 1 -> moves from a_receber to recebida; vencida drops to 0
        r2 = requests.patch(f"{BASE_URL}/api/sales/{sale_id}/installments/1",
                            headers=HEADERS, timeout=30)
        assert r2.status_code == 200, r2.text
        after2 = _get_stats()
        assert after2["comissao_recebida"] - after["comissao_recebida"] == pytest.approx(500, abs=0.5)
        assert after["comissao_a_receber"] - after2["comissao_a_receber"] == pytest.approx(500, abs=0.5)
        assert after2["comissao_vencida"] - after["comissao_vencida"] == pytest.approx(-500, abs=0.5)
