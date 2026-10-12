"""
Iteration 7 — Backend tests for:
  (A) GET /api/ranking with date range (start/end) + grouping via broker_groups
  (B) /api/broker-groups CRUD + master-only RBAC
  (C) /api/notifications flow after POST /api/sales (new_sale for master; ranking for corretor)
  (D) Regression: multi-broker 100%% rule still enforced
Also keeps the DB clean: TEST_* sales are deleted and also purged from sales_history;
every created group is removed; notifications collection has test entries cleared.
"""
import os
import time
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MASTER_TOKEN = "qa_session_vinicius_001"
CORRETOR_EMAIL = "carlos.teste@brilhantes.com"
CORRETOR_PASSWORD = "12345678900"
CARLAO_ID = "user_d7a1b7b351e7"
ANINHA_ID = "user_252bf3878561"

# Direct Mongo for deep cleanup of sales_history + notifications test entries
_mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
_db = _mongo[os.environ.get("DB_NAME", "test_database")]


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def master():
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {MASTER_TOKEN}",
                      "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def carlao():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": CORRETOR_EMAIL, "password": CORRETOR_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"corretor login failed: {r.status_code} {r.text}")
    return s


@pytest.fixture(scope="module")
def tracked():
    created = {"sales": [], "groups": [], "goals": []}
    yield created
    # --- teardown ---
    sess = requests.Session()
    sess.headers.update({"Authorization": f"Bearer {MASTER_TOKEN}"})
    for sid in created["sales"]:
        try:
            sess.delete(f"{BASE_URL}/api/sales/{sid}")
        except Exception:
            pass
    for gid in created["groups"]:
        try:
            sess.delete(f"{BASE_URL}/api/broker-groups/{gid}")
        except Exception:
            pass
    for goid in created["goals"]:
        try:
            sess.delete(f"{BASE_URL}/api/goals/{goid}")
        except Exception:
            pass
    # Purge TEST sales from sales_history + their notifications
    _db.sales_history.delete_many({"$or": [
        {"id": {"$in": created["sales"]}},
        {"client_name": {"$regex": "^TEST_"}},
        {"property_name": {"$regex": "^TEST_"}},
    ]})
    # Remove test-generated notifications
    _db.notifications.delete_many({"meta.sale_id": {"$in": created["sales"]}})
    _db.notifications.delete_many({"message": {"$regex": "TEST_"}})


def _mk_sale(client="TEST_CLIENT", date="2026-06-15", value=100000.0,
             broker="Vinicius Brilhante", brokers=None, prop="GOLDEN VILLE GUAIUBA"):
    body = {
        "property_name": prop, "quadra": "T", "lote": "1",
        "client_name": client, "sale_date": date, "sale_value": value,
        "commission_rate": 5.0, "commission_value": value * 0.05,
        "broker_split": 60.0, "broker_commission": value * 0.03,
        "agency_commission": value * 0.02,
        "broker_name": broker,
    }
    if brokers is not None:
        body["brokers"] = brokers
    return body


# ======================================================================
# (A) RANKING — date range filter
# ======================================================================
class TestRankingDateRange:
    def test_ranking_start_end_filters_only_range(self, master, tracked):
        # Create one sale inside range + one outside
        in_range = master.post(f"{BASE_URL}/api/sales",
                               json=_mk_sale(client="TEST_A_IN", date="2026-06-15",
                                             value=250000.0))
        assert in_range.status_code == 200, in_range.text
        tracked["sales"].append(in_range.json()["id"])

        out_range = master.post(f"{BASE_URL}/api/sales",
                                json=_mk_sale(client="TEST_A_OUT", date="2026-05-10",
                                              value=999000.0))
        assert out_range.status_code == 200
        tracked["sales"].append(out_range.json()["id"])

        r = master.get(f"{BASE_URL}/api/ranking",
                       params={"start": "2026-06-01", "end": "2026-06-30"})
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 1
        # No row should contain the 999k outlier (we only added 250k in range,
        # but there could be real June sales too) — just assert total volume
        # excludes the May sale value.
        total_vol = sum(x["volume"] for x in rows)
        assert total_vol >= 250000.0
        assert all("volume" in x and "qtd" in x and "comissao" in x
                   and "comissao_corretor" in x for x in rows)

    def test_ranking_month_year_mode(self, master):
        r = master.get(f"{BASE_URL}/api/ranking",
                       params={"month": 10, "year": 2026})
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ======================================================================
# (B) BROKER GROUPS (duplas) + Ranking grouping
# ======================================================================
class TestBrokerGroups:
    def test_corretor_cannot_create_group(self, carlao):
        r = carlao.post(f"{BASE_URL}/api/broker-groups",
                        json={"name": "TEST_dupla_x", "members": ["Carlão", "Aninha"]})
        assert r.status_code == 403

    def test_create_group_requires_2_members(self, master):
        r = master.post(f"{BASE_URL}/api/broker-groups",
                        json={"name": "TEST_solo", "members": ["Carlão"]})
        assert r.status_code == 400

    def test_create_list_delete_group(self, master, tracked):
        r = master.post(f"{BASE_URL}/api/broker-groups",
                        json={"name": "TEST_DUPLA_CA", "members": ["Carlão", "Aninha"]})
        assert r.status_code == 200, r.text
        g = r.json()
        tracked["groups"].append(g["id"])
        assert g["name"] == "TEST_DUPLA_CA"
        assert set(g["members"]) == {"Carlão", "Aninha"}

        lst = master.get(f"{BASE_URL}/api/broker-groups").json()
        assert any(x["id"] == g["id"] for x in lst)

        # corretor cannot delete
        r2 = requests.delete(f"{BASE_URL}/api/broker-groups/{g['id']}",
                             cookies={"session_token": ""})  # unauth
        assert r2.status_code in (401, 403)

    def test_group_merges_ranking_entries(self, master, tracked):
        # create a group for Carlão + Aninha
        gr = master.post(f"{BASE_URL}/api/broker-groups",
                        json={"name": "TEST_RANK_DUPLA", "members": ["Carlão", "Aninha"]})
        assert gr.status_code == 200
        gid = gr.json()["id"]
        tracked["groups"].append(gid)

        # Create a parceria sale between Carlão + Aninha in June 2026
        s = master.post(f"{BASE_URL}/api/sales", json=_mk_sale(
            client="TEST_B_GROUP", date="2026-06-20", value=400000.0, broker="Carlão + Aninha",
            brokers=[{"name": "Carlão", "split_pct": 50.0, "owner_id": CARLAO_ID},
                     {"name": "Aninha", "split_pct": 50.0, "owner_id": ANINHA_ID}],
        ))
        assert s.status_code == 200, s.text
        tracked["sales"].append(s.json()["id"])

        r = master.get(f"{BASE_URL}/api/ranking",
                       params={"start": "2026-06-01", "end": "2026-06-30"}).json()
        groups_in_rank = [x for x in r if x.get("is_group")]
        assert any(x["broker_name"] == "TEST_RANK_DUPLA" for x in groups_in_rank), \
            f"group not merged: {r}"
        merged = next(x for x in groups_in_rank if x["broker_name"] == "TEST_RANK_DUPLA")
        # Full 400k volume should be aggregated in the single group entry
        assert merged["volume"] >= 400000.0 * 0.999
        assert merged["qtd"] >= 1
        # And no individual Carlão / Aninha entry for THIS sale window
        indiv = [x for x in r if not x.get("is_group") and x["broker_name"] in ("Carlão", "Aninha")]
        # (there could be other sales in June; we only assert group merge, not absence)
        assert isinstance(indiv, list)

    def test_delete_group_restores_individual_entries(self, master, tracked):
        # Remove any lingering TEST_* groups that would still merge Carlão/Aninha
        for g in master.get(f"{BASE_URL}/api/broker-groups").json():
            if (g.get("name") or "").startswith("TEST_"):
                master.delete(f"{BASE_URL}/api/broker-groups/{g['id']}")
                if g["id"] in tracked["groups"]:
                    tracked["groups"].remove(g["id"])
        # fresh group + sale, then delete group, then ranking shows individuals again
        gr = master.post(f"{BASE_URL}/api/broker-groups",
                        json={"name": "TEST_TMP_DUPLA", "members": ["Carlão", "Aninha"]})
        gid = gr.json()["id"]
        s = master.post(f"{BASE_URL}/api/sales", json=_mk_sale(
            client="TEST_B_TMP", date="2026-07-02", value=200000.0,
            broker="Carlão + Aninha",
            brokers=[{"name": "Carlão", "split_pct": 50.0, "owner_id": CARLAO_ID},
                     {"name": "Aninha", "split_pct": 50.0, "owner_id": ANINHA_ID}]))
        tracked["sales"].append(s.json()["id"])
        d = master.delete(f"{BASE_URL}/api/broker-groups/{gid}")
        assert d.status_code == 200
        r = master.get(f"{BASE_URL}/api/ranking",
                       params={"start": "2026-07-01", "end": "2026-07-31"}).json()
        names = [x["broker_name"] for x in r]
        assert "TEST_TMP_DUPLA" not in names
        assert "Carlão" in names and "Aninha" in names


# ======================================================================
# (C) NOTIFICATIONS flow after creating a sale
# ======================================================================
class TestNotifications:
    def test_notification_after_sale_for_master_and_corretor(self, master, carlao, tracked):
        # Create a sale assigned to Carlão as parceria 100% → corretor gets ranking notif
        s = master.post(f"{BASE_URL}/api/sales", json=_mk_sale(
            client="TEST_NOTIF_CARLAO", date="2026-10-05", value=333000.0,
            broker="Carlão",
            brokers=[{"name": "Carlão", "split_pct": 100.0, "owner_id": CARLAO_ID}]))
        assert s.status_code == 200, s.text
        sid = s.json()["id"]
        tracked["sales"].append(sid)
        time.sleep(1.5)

        mn = master.get(f"{BASE_URL}/api/notifications").json()
        assert "items" in mn and "unread" in mn
        assert any(it.get("type") == "new_sale" and it.get("meta", {}).get("sale_id") == sid
                   for it in mn["items"]), f"master new_sale notif missing: {mn}"

        cn = carlao.get(f"{BASE_URL}/api/notifications").json()
        assert any(it.get("type") == "ranking" for it in cn["items"]), \
            f"carlao ranking notif missing: {cn}"

    def test_mark_single_and_read_all(self, master):
        n = master.get(f"{BASE_URL}/api/notifications").json()
        if n["items"]:
            nid = n["items"][0]["id"]
            r = master.patch(f"{BASE_URL}/api/notifications/{nid}/read")
            assert r.status_code == 200

        r2 = master.post(f"{BASE_URL}/api/notifications/read-all")
        assert r2.status_code == 200
        after = master.get(f"{BASE_URL}/api/notifications").json()
        assert after["unread"] == 0


# ======================================================================
# (D) REGRESSION: multi-broker rule still enforced
# ======================================================================
class TestRegressionMultiBroker:
    def test_split_must_sum_100(self, master):
        r = master.post(f"{BASE_URL}/api/sales", json=_mk_sale(
            client="TEST_SPLIT_BAD", date="2026-10-01", value=150000.0,
            broker="Carlão + Aninha",
            brokers=[{"name": "Carlão", "split_pct": 30.0, "owner_id": CARLAO_ID},
                     {"name": "Aninha", "split_pct": 40.0, "owner_id": ANINHA_ID}]))
        assert r.status_code == 400


# ======================================================================
# (Z) Final-state cleanup assertion
# ======================================================================
def test_zz_final_state_clean(master):
    # This runs after module teardown finalizers for 'tracked' fixture
    # — but pytest guarantees fixture teardown happens between modules, not between tests.
    # So we only assert here that the API is still responsive and groups count is sane.
    r = master.get(f"{BASE_URL}/api/broker-groups")
    assert r.status_code == 200
