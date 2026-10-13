"""Iteration 10 regression tests:
- CurrencyInput → backend receives numeric sale_value/commission_value
- CPF / birthdate optional + persist
- Required-only sale saves fine
- Proportional qty & volume for 2-broker 50/50 split (ranking + corretores)
- RankingCard labels/order are UI-only; qty is fractional (verified via /api/ranking)
"""
import os
import requests
import pytest

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MASTER = {"Authorization": "Bearer qa_session_vinicius_001"}

ANINHA_UID = "user_252bf3878561"
CARLOS_UID = "user_d7a1b7b351e7"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update(MASTER)
    return sess


@pytest.fixture(scope="module")
def loteamento(s):
    # pick an existing one
    r = s.get(f"{BASE}/api/loteamentos")
    assert r.status_code == 200
    lots = r.json()
    assert lots, "need at least one loteamento seeded"
    return lots[0]["name"]


def _cleanup(s, sale_id):
    try:
        s.delete(f"{BASE}/api/sales/{sale_id}")
    except Exception:
        pass


class TestCurrencyAndRequired:
    def test_create_sale_numeric_values_and_only_required(self, s, loteamento):
        """Front sends numeric sale_value (CurrencyInput → number). 40000.00, not 40."""
        payload = {
            "property_name": loteamento,
            "quadra": "QA10",
            "lote": "L10",
            "client_name": "TEST_Currency Client",
            "sale_value": 40000.00,
            "commission_rate": 6,
            "commission_value": 2400.00,
            "sale_date": "2026-01-15",
            "broker_name": "Carlão", "brokers": [{"name": "Carlão", "split_pct": 100.0}],
        }
        r = s.post(f"{BASE}/api/sales", json=payload)
        assert r.status_code in (200, 201), r.text
        sale = r.json()
        sid = sale["id"]
        try:
            # GET back and verify numeric persistence
            g = s.get(f"{BASE}/api/sales").json()
            got = next((x for x in g if x["id"] == sid), None)
            assert got, "sale not found in listing"
            assert got["sale_value"] == 40000.0, f"expected 40000, got {got['sale_value']}"
            assert got["commission_value"] == 2400.0, f"expected 2400, got {got['commission_value']}"
            # Optional CPF/birthdate omitted → stored as empty/None
            assert got.get("client_cpf", "") in ("", None)
            assert got.get("client_birthdate", "") in ("", None)
        finally:
            _cleanup(s, sid)

    def test_create_sale_with_cpf_and_birthdate_persists(self, s, loteamento):
        payload = {
            "property_name": loteamento,
            "quadra": "QA11",
            "lote": "L11",
            "client_name": "TEST_Cpf Client",
            "client_cpf": "123.456.789-00",
            "client_birthdate": "1990-05-20",
            "sale_value": 50000.0,
            "commission_rate": 5,
            "commission_value": 2500.0,
            "sale_date": "2026-01-15",
            "broker_name": "Carlão", "brokers": [{"name": "Carlão", "split_pct": 100.0}],
        }
        r = s.post(f"{BASE}/api/sales", json=payload)
        assert r.status_code in (200, 201), r.text
        sid = r.json()["id"]
        try:
            g = s.get(f"{BASE}/api/sales").json()
            got = next(x for x in g if x["id"] == sid)
            assert got["client_cpf"] == "123.456.789-00"
            assert got["client_birthdate"] == "1990-05-20"
        finally:
            _cleanup(s, sid)


class TestProportionalRanking:
    def test_two_broker_50_50_proportional(self, s, loteamento):
        """Carlão 50 / Aninha 50 of R$200.000 → each gets +0.5 qty & +100000 volume."""
        # baseline
        rk_url = f"{BASE}/api/ranking"
        before = s.get(rk_url, params={"year": 2026}).json()
        corr_before = s.get(f"{BASE}/api/corretores").json()

        def _bk(data, name):
            return next((x for x in data if x.get("broker_name") == name or x.get("name") == name), None)

        payload = {
            "property_name": loteamento,
            "quadra": "QAP1",
            "lote": "L50",
            "client_name": "TEST_Partner Client",
            "sale_value": 200000.0,
            "commission_rate": 5,
            "commission_value": 10000.0,
            "sale_date": "2026-01-15",
            "broker_name": "Carlão + Aninha",
            "brokers": [
                {"name": "Carlão", "split_pct": 50.0},
                {"name": "Aninha", "split_pct": 50.0},
            ],
        }
        r = s.post(f"{BASE}/api/sales", json=payload)
        assert r.status_code in (200, 201), r.text
        sid = r.json()["id"]
        try:
            after = s.get(rk_url, params={"year": 2026}).json()
            carlos_b = _bk(before, "Carlão") or {"qtd": 0, "volume": 0}
            carlos_a = _bk(after, "Carlão")
            aninha_b = _bk(before, "Aninha") or {"qtd": 0, "volume": 0}
            aninha_a = _bk(after, "Aninha")
            assert carlos_a and aninha_a, "both brokers must appear in ranking"

            d_carlos_qty = carlos_a["qtd"] - carlos_b["qtd"]
            d_aninha_qty = aninha_a["qtd"] - aninha_b["qtd"]
            d_carlos_vol = carlos_a["volume"] - carlos_b["volume"]
            d_aninha_vol = aninha_a["volume"] - aninha_b["volume"]

            assert abs(d_carlos_qty - 0.5) < 1e-6, f"Carlão qty delta expected 0.5 got {d_carlos_qty}"
            assert abs(d_aninha_qty - 0.5) < 1e-6, f"Aninha qty delta expected 0.5 got {d_aninha_qty}"
            assert abs(d_carlos_vol - 100000.0) < 1e-3, f"Carlão vol delta expected 100000 got {d_carlos_vol}"
            assert abs(d_aninha_vol - 100000.0) < 1e-3, f"Aninha vol delta expected 100000 got {d_aninha_vol}"

            # /api/corretores proportional qty
            corr_after = s.get(f"{BASE}/api/corretores").json()
            cb = _bk(corr_before, "Carlão") or {"qtd": 0}
            ca = _bk(corr_after, "Carlão")
            ab_b = _bk(corr_before, "Aninha") or {"qtd": 0}
            ab_a = _bk(corr_after, "Aninha")
            if ca and ab_a:
                # corretores endpoint may count across all time → still delta is +0.5 each
                assert abs((ca["qtd"] - cb["qtd"]) - 0.5) < 1e-6
                assert abs((ab_a["qtd"] - ab_b["qtd"]) - 0.5) < 1e-6
        finally:
            _cleanup(s, sid)


class TestFinalCounts:
    def test_end_state_counts(self, s):
        sales = s.get(f"{BASE}/api/sales").json()
        goals = s.get(f"{BASE}/api/goals", params={"year": 2026}).json()
        groups = s.get(f"{BASE}/api/broker-groups").json()
        # Only "TEST_" sales should be cleaned up by fixtures; ensure none remain
        test_sales = [x for x in sales if (x.get("client_name") or "").startswith("TEST_")]
        assert not test_sales, f"leftover TEST_ sales: {test_sales}"
        assert len(sales) == 20, f"expected 20 sales, got {len(sales)}"
        assert len(goals) == 0, f"expected 0 goals, got {len(goals)}"
        assert len(groups) == 0, f"expected 0 broker-groups, got {len(groups)}"
