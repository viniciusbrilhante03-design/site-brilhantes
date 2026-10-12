"""Tests for CLIENTS aggregation + GOALS (metas) features.

Validates:
- /api/clients: master sees all, corretor sees only own; aggregation shape
- /api/goals: scope rules, validation, master-only mutations, progress compute
- Cleanup: all created sales and goals are removed at end
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MASTER_HEADERS = {"Authorization": "Bearer qa_session_vinicius_001"}

CARLOS_EMAIL = "carlos.teste@brilhantes.com"
CARLOS_PWD = "12345678900"
ANINHA_UID = "user_252bf3878561"
CARLOS_UID = "user_d7a1b7b351e7"


@pytest.fixture(scope="module")
def corretor_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": CARLOS_EMAIL, "password": CARLOS_PWD}, timeout=20)
    assert r.status_code == 200, r.text
    assert s.cookies.get("access_token"), "login did not set access_token cookie"
    return s


@pytest.fixture
def tracked():
    """Collect created sale_ids and goal_ids for teardown."""
    sales, goals = [], []
    yield sales, goals
    for sid in sales:
        try:
            requests.delete(f"{BASE_URL}/api/sales/{sid}", headers=MASTER_HEADERS, timeout=15)
        except Exception:
            pass
    for gid in goals:
        try:
            requests.delete(f"{BASE_URL}/api/goals/{gid}", headers=MASTER_HEADERS, timeout=15)
        except Exception:
            pass


# ---------------- CLIENTS ----------------
class TestClients:
    def test_master_clients_shape_and_known_client(self):
        r = requests.get(f"{BASE_URL}/api/clients", headers=MASTER_HEADERS, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0
        for c in data:
            assert {"name", "phone", "email", "qtd", "volume", "last_date", "purchases"} <= set(c)
            assert isinstance(c["purchases"], list)
            for p in c["purchases"]:
                assert {"property_name", "quadra", "lote", "sale_date", "sale_value", "broker_name"} <= set(p)
        wp = [c for c in data if "WASHINGTON PINHEIRO" in c["name"].upper()]
        assert wp, "Expected client WASHINGTON PINHEIRO in /api/clients"
        assert wp[0]["qtd"] >= 1
        assert len(wp[0]["purchases"]) >= 1

    def test_corretor_clients_scope(self, corretor_session, tracked):
        sales, _ = tracked
        # Create a sale assigned to Carlão (master-created, resolved by name "Carlão")
        payload = {
            "property_name": "TEST_CLIENT_LOT",
            "quadra": "9", "lote": "9",
            "client_name": "TEST_CLIENTE_CARLOS",
            "client_phone": "11999990001",
            "client_email": "test_client_carlos@example.com",
            "broker_name": "Carlão",
            "brokers": [{"name": "Carlão", "split_pct": 100.0}],
            "sale_date": "2026-01-10",
            "sale_value": 150000.0,
            "commission_rate": 5.0, "commission_value": 7500.0,
            "broker_split": 60.0, "broker_commission": 4500.0, "agency_commission": 3000.0,
        }
        r = requests.post(f"{BASE_URL}/api/sales", json=payload,
                          headers=MASTER_HEADERS, timeout=20)
        assert r.status_code == 200, r.text
        sales.append(r.json()["id"])

        # Carlos should see TEST client
        r2 = corretor_session.get(f"{BASE_URL}/api/clients", timeout=20)
        assert r2.status_code == 200
        names = [c["name"] for c in r2.json()]
        assert "TEST_CLIENTE_CARLOS" in names

        # Carlos should NOT see WASHINGTON PINHEIRO (not his sale)
        assert not any("WASHINGTON PINHEIRO" in n.upper() for n in names), \
            "Corretor should not see master-only clients"


# ---------------- GOALS validation ----------------
class TestGoalsValidation:
    def test_target_zero_rejected(self, tracked):
        r = requests.post(f"{BASE_URL}/api/goals",
                          json={"scope": "company", "metric": "vgv", "target": 0, "year": 2026},
                          headers=MASTER_HEADERS, timeout=15)
        assert r.status_code == 400

    def test_broker_without_owner_rejected(self, tracked):
        r = requests.post(f"{BASE_URL}/api/goals",
                          json={"scope": "broker", "metric": "vgv", "target": 100, "year": 2026},
                          headers=MASTER_HEADERS, timeout=15)
        assert r.status_code == 400

    def test_invalid_metric_rejected(self, tracked):
        r = requests.post(f"{BASE_URL}/api/goals",
                          json={"scope": "company", "metric": "xxx", "target": 100, "year": 2026},
                          headers=MASTER_HEADERS, timeout=15)
        assert r.status_code == 400

    def test_invalid_scope_rejected(self, tracked):
        r = requests.post(f"{BASE_URL}/api/goals",
                          json={"scope": "weird", "metric": "vgv", "target": 100, "year": 2026},
                          headers=MASTER_HEADERS, timeout=15)
        assert r.status_code == 400

    def test_corretor_cannot_mutate_goals(self, corretor_session, tracked):
        r = corretor_session.post(f"{BASE_URL}/api/goals",
                                  json={"scope": "company", "metric": "vgv", "target": 100, "year": 2026},
                                  timeout=15)
        assert r.status_code == 403


# ---------------- GOALS CRUD + progress ----------------
class TestGoalsCRUD:
    def test_company_vgv_goal_progress(self, tracked):
        _, goals = tracked
        r = requests.post(f"{BASE_URL}/api/goals",
                          json={"scope": "company", "metric": "vgv",
                                "target": 10_000_000, "month": None, "year": 2026},
                          headers=MASTER_HEADERS, timeout=15)
        assert r.status_code == 200, r.text
        g = r.json()
        goals.append(g["id"])
        assert g["scope"] == "company" and g["metric"] == "vgv"

        # GET returns computed current + pct
        r2 = requests.get(f"{BASE_URL}/api/goals?year=2026",
                          headers=MASTER_HEADERS, timeout=15)
        assert r2.status_code == 200
        found = [x for x in r2.json() if x["id"] == g["id"]]
        assert found, "created goal not returned on GET"
        gg = found[0]
        assert "current" in gg and "pct" in gg and "label" in gg
        assert gg["label"] == "Imobiliária"
        assert isinstance(gg["current"], (int, float))
        assert 0 <= gg["pct"] <= 100

    def test_broker_count_goal_progress_and_update_delete(self, tracked):
        sales, goals = tracked
        # Create a sale for Aninha in 2026 to generate progress
        payload = {
            "property_name": "TEST_GOAL_LOT",
            "quadra": "1", "lote": "1",
            "client_name": "TEST_GOAL_CLIENT",
            "broker_name": "Aninha",
            "brokers": [{"name": "Aninha", "split_pct": 100.0}],
            "sale_date": "2026-02-05",
            "sale_value": 300000.0,
            "commission_rate": 5.0, "commission_value": 15000.0,
            "broker_split": 60.0, "broker_commission": 9000.0, "agency_commission": 6000.0,
        }
        r = requests.post(f"{BASE_URL}/api/sales", json=payload,
                          headers=MASTER_HEADERS, timeout=20)
        assert r.status_code == 200, r.text
        sales.append(r.json()["id"])

        # Create broker-count goal for Aninha target=5
        r = requests.post(f"{BASE_URL}/api/goals",
                          json={"scope": "broker", "owner_id": ANINHA_UID,
                                "metric": "count", "target": 5, "year": 2026},
                          headers=MASTER_HEADERS, timeout=15)
        assert r.status_code == 200, r.text
        g = r.json()
        goals.append(g["id"])

        r2 = requests.get(f"{BASE_URL}/api/goals?year=2026",
                          headers=MASTER_HEADERS, timeout=15)
        found = [x for x in r2.json() if x["id"] == g["id"]]
        assert found
        gg = found[0]
        assert gg["current"] >= 1, f"Aninha should have at least 1 sale counted, got {gg['current']}"
        assert gg["label"].lower() in ("aninha",)

        # PUT update target
        r3 = requests.put(f"{BASE_URL}/api/goals/{g['id']}",
                          json={"scope": "broker", "owner_id": ANINHA_UID,
                                "metric": "count", "target": 10, "year": 2026},
                          headers=MASTER_HEADERS, timeout=15)
        assert r3.status_code == 200
        assert r3.json()["target"] == 10

        # DELETE
        r4 = requests.delete(f"{BASE_URL}/api/goals/{g['id']}",
                             headers=MASTER_HEADERS, timeout=15)
        assert r4.status_code == 200
        # Remove from tracked (already deleted)
        goals.remove(g["id"])

        # Confirm gone
        r5 = requests.get(f"{BASE_URL}/api/goals?year=2026",
                          headers=MASTER_HEADERS, timeout=15)
        assert not any(x["id"] == g["id"] for x in r5.json())

    def test_corretor_goals_scope(self, corretor_session, tracked):
        _, goals = tracked
        # Create a company goal + a broker goal for Carlos + a broker goal for Aninha
        r1 = requests.post(f"{BASE_URL}/api/goals",
                           json={"scope": "company", "metric": "count",
                                 "target": 100, "year": 2026},
                           headers=MASTER_HEADERS, timeout=15)
        assert r1.status_code == 200
        gc = r1.json()["id"]; goals.append(gc)

        r2 = requests.post(f"{BASE_URL}/api/goals",
                           json={"scope": "broker", "owner_id": CARLOS_UID,
                                 "metric": "vgv", "target": 500000, "year": 2026},
                           headers=MASTER_HEADERS, timeout=15)
        assert r2.status_code == 200
        gcarlos = r2.json()["id"]; goals.append(gcarlos)

        r3 = requests.post(f"{BASE_URL}/api/goals",
                           json={"scope": "broker", "owner_id": ANINHA_UID,
                                 "metric": "vgv", "target": 500000, "year": 2026},
                           headers=MASTER_HEADERS, timeout=15)
        assert r3.status_code == 200
        gan = r3.json()["id"]; goals.append(gan)

        rc = corretor_session.get(f"{BASE_URL}/api/goals?year=2026", timeout=15)
        assert rc.status_code == 200
        ids = {x["id"] for x in rc.json()}
        assert gc in ids, "Corretor should see company goal"
        assert gcarlos in ids, "Corretor should see own broker goal"
        assert gan not in ids, "Corretor should NOT see other broker's goal"


def test_zz_final_cleanup_state():
    """At end: 20 real sales, 0 goals."""
    r = requests.get(f"{BASE_URL}/api/sales", headers=MASTER_HEADERS, timeout=20)
    assert r.status_code == 200
    sales = r.json()
    test_sales = [s for s in sales if (s.get("property_name") or "").startswith("TEST")]
    assert not test_sales, f"Found leftover TEST sales: {[s['id'] for s in test_sales]}"
    assert len(sales) == 20, f"Expected 20 real sales, got {len(sales)}"

    r2 = requests.get(f"{BASE_URL}/api/goals?year=2026", headers=MASTER_HEADERS, timeout=15)
    assert r2.status_code == 200
    assert r2.json() == [], f"Expected 0 goals remaining, got {r2.json()}"
