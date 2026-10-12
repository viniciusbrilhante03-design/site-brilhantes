"""Regression test for Duplicate Sale + AI extract-one with Gemini 2.5 Flash."""
import os
import io
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0]
BASE = BASE.rstrip("/")

MASTER = {"Authorization": "Bearer qa_session_vinicius_001"}
CORRETOR_CREDS = {"email": "carlos.teste@brilhantes.com", "password": "12345678900"}


@pytest.fixture(scope="module")
def master_session():
    s = requests.Session()
    s.headers.update(MASTER)
    return s


@pytest.fixture(scope="module")
def corretor_session():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=CORRETOR_CREDS, timeout=15)
    assert r.status_code == 200, f"corretor login failed: {r.status_code} {r.text}"
    # access_token cookie is set httpOnly by backend; session already stores cookie
    assert s.cookies.get("access_token"), f"no access_token cookie: {s.cookies.get_dict()}"
    return s


def _count(s):
    r = s.get(f"{BASE}/api/sales", timeout=15)
    assert r.status_code == 200, r.text
    return len(r.json()), r.json()


def test_master_list_sales(master_session):
    n, _ = _count(master_session)
    assert n >= 1


def test_duplicate_creates_new_sale_master(master_session):
    """Simulate the frontend duplicate flow: fetch sale, drop id/quadra/lote/installments, POST new."""
    before, sales = _count(master_session)
    assert before >= 1
    original = sales[0]
    orig_id = original["id"]
    orig_qd = original.get("quadra")
    orig_lt = original.get("lote")
    orig_val = original.get("sale_value")

    payload = {k: v for k, v in original.items() if k not in ("id", "_id", "created_at", "updated_at")}
    payload["quadra"] = "TEST_D"
    payload["lote"] = "999"
    payload["sale_value"] = 123456.78
    payload["installments"] = []
    payload["parcelado"] = False

    r = master_session.post(f"{BASE}/api/sales", json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    new_sale = r.json()
    assert new_sale["id"] != orig_id, "duplicate must create NEW id"
    assert new_sale.get("client_name") == original.get("client_name")
    assert new_sale.get("property_name") == original.get("property_name")

    # count +1
    after, _ = _count(master_session)
    assert after == before + 1, f"expected {before+1}, got {after}"

    # original intact
    r2 = master_session.get(f"{BASE}/api/sales/{orig_id}", timeout=15)
    if r2.status_code == 200:
        o = r2.json()
        assert o.get("quadra") == orig_qd
        assert o.get("lote") == orig_lt
        assert float(o.get("sale_value") or 0) == float(orig_val or 0)

    # cleanup
    d = master_session.delete(f"{BASE}/api/sales/{new_sale['id']}", timeout=15)
    assert d.status_code in (200, 204)
    final, _ = _count(master_session)
    assert final == before


def test_edit_updates_same_sale(master_session):
    before, sales = _count(master_session)
    original = sales[0]
    sid = original["id"]
    orig_notes = original.get("notes") or ""

    payload = {k: v for k, v in original.items() if k not in ("id", "_id", "created_at", "updated_at")}
    payload["notes"] = "TEST_EDIT_MARKER"

    r = master_session.put(f"{BASE}/api/sales/{sid}", json=payload, timeout=15)
    assert r.status_code == 200, r.text

    after, _ = _count(master_session)
    assert after == before, "edit must NOT create a new sale"

    g = master_session.get(f"{BASE}/api/sales/{sid}", timeout=15)
    if g.status_code == 200:
        assert g.json().get("notes") == "TEST_EDIT_MARKER"

    # revert
    payload["notes"] = orig_notes
    r2 = master_session.put(f"{BASE}/api/sales/{sid}", json=payload, timeout=15)
    assert r2.status_code == 200


def test_create_and_delete_sale_master(master_session):
    before, _ = _count(master_session)
    payload = {
        "property_name": "TEST_LOT_REGRESSION",
        "quadra": "T", "lote": "1",
        "client_name": "TEST_CLIENT_ZZ", "client_phone": "", "client_email": "",
        "broker_name": "TEST_BROKER", "brokers": [{"name": "TEST_BROKER", "split_pct": 100}],
        "sale_date": "2026-10-01", "sale_value": 50000.0,
        "commission_rate": 5, "commission_value": 2500,
        "broker_split": 60, "broker_commission": 1500, "agency_commission": 1000,
        "commission_received": False, "entrada": 0, "parcelado": False,
        "installments": [], "notes": "TEST",
    }
    r = master_session.post(f"{BASE}/api/sales", json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    sid = r.json()["id"]
    after, _ = _count(master_session)
    assert after == before + 1
    d = master_session.delete(f"{BASE}/api/sales/{sid}", timeout=15)
    assert d.status_code in (200, 204)
    final, _ = _count(master_session)
    assert final == before


def test_corretor_duplicate_creates_new(corretor_session):
    r = corretor_session.get(f"{BASE}/api/sales", timeout=15)
    assert r.status_code == 200
    sales = r.json()
    if not sales:
        pytest.skip("corretor has no sales to duplicate")
    before = len(sales)
    original = sales[0]
    orig_id = original["id"]
    payload = {k: v for k, v in original.items() if k not in ("id", "_id", "created_at", "updated_at")}
    payload["quadra"] = "TEST_CD"
    payload["lote"] = "888"
    payload["installments"] = []
    payload["parcelado"] = False

    r2 = corretor_session.post(f"{BASE}/api/sales", json=payload, timeout=15)
    assert r2.status_code in (200, 201), r2.text
    new_id = r2.json()["id"]
    assert new_id != orig_id

    after = len(corretor_session.get(f"{BASE}/api/sales").json())
    assert after == before + 1

    d = corretor_session.delete(f"{BASE}/api/sales/{new_id}", timeout=15)
    assert d.status_code in (200, 204)
    assert len(corretor_session.get(f"{BASE}/api/sales").json()) == before


def test_ai_extract_one_text(master_session):
    """POST /api/sales/extract-one with a tiny text file (uses Gemini 2.5 Flash)."""
    content = b"Loteamento,Quadra,Lote,Cliente,Valor,Comissao,Corretor,Data\nVista Verde,5,10,Joao Silva,80000,6,Carlao,2026-10-15\n"
    files = {"file": ("sale.csv", io.BytesIO(content), "text/csv")}
    # drop content-type header so requests sets multipart boundary
    headers = dict(master_session.headers)
    r = requests.post(f"{BASE}/api/sales/extract-one", files=files, headers=headers, timeout=90)
    assert r.status_code == 200, f"extract-one failed: {r.status_code} {r.text[:400]}"
    data = r.json()
    assert "extracted" in data, data
    assert isinstance(data["extracted"], dict)


def test_ai_import_preview_text(master_session):
    content = b"Loteamento,Quadra,Lote,Cliente,Valor,Corretor\nVista Verde,5,10,Joao Silva,80000,Carlao\n"
    files = {"file": ("sales.csv", io.BytesIO(content), "text/csv")}
    headers = dict(master_session.headers)
    r = requests.post(f"{BASE}/api/sales/import-ai/preview", files=files, headers=headers, timeout=90)
    assert r.status_code == 200, f"preview failed: {r.status_code} {r.text[:400]}"
    data = r.json()
    assert "rows" in data or "preview" in data or isinstance(data, (list, dict)), data


def test_final_counts_clean(master_session):
    n, _ = _count(master_session)
    assert n == 20, f"expected 20 sales after cleanup, got {n}"
    goals = master_session.get(f"{BASE}/api/goals").json()
    assert len(goals) == 0, f"expected 0 goals, got {len(goals)}"
