"""Lote 2 features: #4 transfer sale, #6 notifications, #7 goal bands, #8 hide vgv_geral, #9 birthdays."""
import os
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE}/api"

MASTER_TOKEN = "qa_session_vinicius_001"
CRON_SECRET = "b9f3c1a27e4d48f6a0c5d2e8b7146f93aa21c64d9e0f3b5c7d81a2e4f6097c3b1"
CORRETOR_EMAIL = "carlos.teste@brilhantes.com"
CORRETOR_PASSWORD = "12345678900"


@pytest.fixture(scope="module")
def master():
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {MASTER_TOKEN}"})
    return s


@pytest.fixture(scope="module")
def corretor():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": CORRETOR_EMAIL, "password": CORRETOR_PASSWORD})
    assert r.status_code == 200, r.text
    return s


# ---------- #8 hide VGV geral from corretor ----------
def test_stats_master_has_vgv_geral(master):
    r = master.get(f"{API}/stats")
    assert r.status_code == 200
    data = r.json()
    assert data.get("vgv_geral") is not None
    assert isinstance(data["vgv_geral"], (int, float))


def test_stats_corretor_hides_vgv_geral(corretor):
    r = corretor.get(f"{API}/stats")
    assert r.status_code == 200
    data = r.json()
    assert data.get("vgv_geral") is None


# ---------- #9 birthdays endpoint ----------
def test_birthdays_endpoint_ok(master):
    r = master.get(f"{API}/clients/birthdays", params={"month": 10})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_birthdays_endpoint_corretor(corretor):
    r = corretor.get(f"{API}/clients/birthdays", params={"month": 10})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_cron_birthdays_requires_secret():
    r = requests.post(f"{API}/cron/birthdays")
    assert r.status_code == 401


def test_cron_birthdays_ok():
    r = requests.post(f"{API}/cron/birthdays",
                     headers={"Authorization": f"Bearer {CRON_SECRET}"})
    assert r.status_code == 200
    assert r.json().get("ok") is True


# ---------- #4 transfer sale ----------
def test_transfer_sale_no_duplication(master, corretor):
    # Get brokers list
    br = master.get(f"{API}/corretores").json()
    assert len(br) >= 2, "Need at least 2 brokers for transfer test"
    source = br[0]["war_name"] or br[0]["full_name"]
    target = br[1]["war_name"] or br[1]["full_name"]

    # Create a test sale assigned to source
    payload = {
        "property_name": "Loteamento QA Transfer",
        "quadra": "99", "lote": "99",
        "client_name": "TEST_TransferClient",
        "sale_value": 100000.0,
        "commission_pct": 5.0,
        "sale_date": "2026-10-15",
        "broker_name": source,
        "brokers": [{"name": source, "split_pct": 100.0}],
    }
    r = master.post(f"{API}/sales", json=payload)
    assert r.status_code in (200, 201), r.text
    sale = r.json()
    sale_id = sale["id"]

    try:
        count_before = len(master.get(f"{API}/sales").json())

        # Transfer
        tr = master.post(f"{API}/sales/{sale_id}/transfer", json={"broker_name": target})
        assert tr.status_code == 200, tr.text

        count_after = len(master.get(f"{API}/sales").json())
        assert count_after == count_before, "Sale duplicated during transfer!"

        # Verify broker changed via GET /api/sales
        all_sales = master.get(f"{API}/sales").json()
        updated = next((s for s in all_sales if s["id"] == sale_id), None)
        assert updated is not None
        assert updated["broker_name"] == target
        assert updated.get("owner_id") is not None
    finally:
        master.delete(f"{API}/sales/{sale_id}")


def test_transfer_requires_master(corretor):
    # Corretor cannot transfer
    r = corretor.post(f"{API}/sales/anything/transfer", json={"broker_name": "X"})
    assert r.status_code in (401, 403)


# ---------- #6 Notifications on new sale ----------
def test_new_sale_generates_notifications(master, corretor):
    # Ensure the loteamento exists
    lots = master.get(f"{API}/loteamentos").json()
    lot_name = lots[0]["name"] if lots else None
    if not lot_name:
        pytest.skip("No loteamento available")

    # Clear corretor's notification baseline
    nbase = corretor.get(f"{API}/notifications").json()
    base_count = len(nbase.get("items", []))

    mbase = master.get(f"{API}/notifications").json()
    master_base_count = len(mbase.get("items", []))

    payload = {
        "property_name": lot_name,
        "quadra": "77", "lote": "77",
        "client_name": "TEST_NotifyClient",
        "sale_value": 80000.0,
        "commission_pct": 5.0,
        "sale_date": "2026-10-20",
        "broker_name": "Carlos Teste",
        "brokers": [{"name": "Carlos Teste", "split_pct": 100.0}],
    }
    r = corretor.post(f"{API}/sales", json=payload)
    assert r.status_code in (200, 201), r.text
    sale_id = r.json()["id"]

    try:
        import time; time.sleep(1.0)
        mn = master.get(f"{API}/notifications").json()
        assert len(mn.get("items", [])) > master_base_count, "Master did not receive notification"
        # Should contain the sale message
        msgs = [i.get("message", "") for i in mn["items"][:5]]
        assert any("vendeu 1 lote" in m for m in msgs), f"Expected 'vendeu 1 lote' in {msgs}"
    finally:
        master.delete(f"{API}/sales/{sale_id}")


# ---------- #7 Goals endpoint sanity (band logic is FE; here just /goals works) ----------
def test_goals_list_ok(master):
    r = master.get(f"{API}/goals")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
