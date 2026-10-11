"""Multi-user auth tests: corretor registration, login, isolation, history, master endpoints."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
MASTER_TOKEN = "qa_session_vinicius_001"
CARLOS_EMAIL = "carlos.teste@brilhantes.com"
CARLOS_PWD = "12345678900"

# Shared state across tests (ordered via names)
state = {}


def _rand_email():
    return f"teste+{uuid.uuid4().hex[:8]}@qa.brilhantes.com"


@pytest.fixture(scope="module")
def master_client():
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {MASTER_TOKEN}"})
    return s


@pytest.fixture(scope="module")
def carlos_client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/auth/login", json={"email": CARLOS_EMAIL, "password": CARLOS_PWD})
    assert r.status_code == 200, r.text
    # also store token header fallback
    return s


# -------- Register / Login ----------
class TestAuthFlows:
    def test_register_corretor_sets_cookie_and_role(self):
        s = requests.Session()
        email = _rand_email()
        cpf = "11122233300"
        r = s.post(f"{BASE_URL}/auth/register", json={
            "name": "QA Teste", "war_name": "QA", "email": email,
            "cpf": "111.222.333-00", "creci": "123", "phone": "11999",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["role"] == "corretor"
        assert data["active"] is True
        assert data["cpf"] == cpf
        assert "access_token" in s.cookies
        # me works via cookie
        me = s.get(f"{BASE_URL}/auth/me")
        assert me.status_code == 200
        assert me.json()["email"] == email
        state["temp_user"] = {"email": email, "cpf": cpf, "user_id": data["user_id"], "session": s}

    def test_register_duplicate_email_400(self):
        email = state["temp_user"]["email"]
        r = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "x", "email": email, "cpf": "99988877766",
        })
        assert r.status_code == 400

    def test_login_with_cpf_password(self):
        email = state["temp_user"]["email"]
        cpf = state["temp_user"]["cpf"]
        r = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": cpf})
        assert r.status_code == 200
        assert r.cookies.get("access_token")

    def test_login_wrong_password_401(self):
        email = state["temp_user"]["email"]
        r = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": "wrong"})
        assert r.status_code == 401

    def test_login_lockout_after_5_fails(self):
        # Use a fresh account to avoid locking shared accounts
        s = requests.Session()
        email = _rand_email()
        s.post(f"{BASE_URL}/auth/register", json={
            "name": "Lockme", "email": email, "cpf": "55566677788",
        })
        statuses = []
        for _ in range(10):
            rr = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": "bad"})
            statuses.append(rr.status_code)
            if rr.status_code == 429:
                break
        assert 429 in statuses, f"Expected 429 lockout; got {statuses}"
        state["locked_email"] = email

    def test_master_me_with_bearer(self, master_client):
        r = master_client.get(f"{BASE_URL}/auth/me")
        assert r.status_code == 200
        d = r.json()
        assert d["role"] == "master"
        assert d["email"] == "viniciusbrilhante03@gmail.com"

    def test_carlos_me(self, carlos_client):
        r = carlos_client.get(f"{BASE_URL}/auth/me")
        assert r.status_code == 200
        assert r.json()["role"] == "corretor"


# -------- Change / Reset password ----------
class TestChangeAndReset:
    def test_change_password(self):
        s = requests.Session()
        email = _rand_email()
        cpf = "77788899900"
        s.post(f"{BASE_URL}/auth/register", json={"name": "Chg", "email": email, "cpf": cpf})
        r = s.post(f"{BASE_URL}/auth/change-password",
                   json={"current_password": cpf, "new_password": "novaSenha123"})
        assert r.status_code == 200
        # old password no longer works
        r_old = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": cpf})
        assert r_old.status_code == 401
        r_new = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": "novaSenha123"})
        assert r_new.status_code == 200

    def test_forgot_password_generic_response(self):
        r1 = requests.post(f"{BASE_URL}/auth/forgot-password", json={"email": CARLOS_EMAIL})
        r2 = requests.post(f"{BASE_URL}/auth/forgot-password", json={"email": "nao+existe@qa.io"})
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json() == r2.json()

    def test_reset_password_invalid_token_400(self):
        r = requests.post(f"{BASE_URL}/auth/reset-password",
                          json={"token": "invalid-token", "new_password": "abcd1234"})
        assert r.status_code == 400


# -------- Isolation (owner_id) ----------
class TestIsolation:
    def _existing_loteamento(self, client):
        lots = client.get(f"{BASE_URL}/loteamentos").json()
        assert lots, "need at least one pre-registered loteamento"
        return lots[0]["name"]

    def test_corretor_sale_scoped(self, carlos_client, master_client):
        lot_name = self._existing_loteamento(master_client)
        payload = {
            "property_name": lot_name,
            "broker_name": "Outro Qualquer",  # should be overridden to Carlos
            "sale_date": "2026-01-15",
            "sale_value": 100000.0,
            "commission_rate": 5.0,
            "commission_value": 5000.0,
            "broker_split": 60.0,
        }
        r = carlos_client.post(f"{BASE_URL}/sales", json=payload)
        assert r.status_code == 200, r.text
        sale = r.json()
        assert sale["owner_id"]
        assert sale["broker_name"] not in ("Outro Qualquer",), "broker_name must be forced to the logged-in corretor"
        state["carlos_sale_id"] = sale["id"]
        state["carlos_owner_id"] = sale["owner_id"]

        # Carlos sees only his own
        mine = carlos_client.get(f"{BASE_URL}/sales").json()
        assert all(s.get("owner_id") == sale["owner_id"] for s in mine)
        assert any(s["id"] == sale["id"] for s in mine)

        # Master sees all (including Carlos's)
        all_sales = master_client.get(f"{BASE_URL}/sales").json()
        assert any(s["id"] == sale["id"] for s in all_sales)
        assert len(all_sales) >= len(mine)

    def test_stats_vgv_geral(self, carlos_client):
        r = carlos_client.get(f"{BASE_URL}/stats?year=2026")
        assert r.status_code == 200
        d = r.json()
        assert "vgv_geral" in d and "qtd_geral" in d
        assert d["vgv_geral"] >= d["total_vendido"]
        assert d["qtd_geral"] >= d["qtd_vendas"]

    def test_ranking_is_company_wide(self, carlos_client, master_client):
        r1 = carlos_client.get(f"{BASE_URL}/ranking?year=2026").json()
        r2 = master_client.get(f"{BASE_URL}/ranking?year=2026").json()
        names1 = {x["broker_name"] for x in r1}
        names2 = {x["broker_name"] for x in r2}
        assert names1 == names2

    def test_corretor_cannot_edit_other_sale(self, carlos_client, master_client):
        me = carlos_client.get(f"{BASE_URL}/auth/me").json()
        my_owner = me.get("user_id") or me.get("id")
        all_sales = master_client.get(f"{BASE_URL}/sales").json()
        others = [s for s in all_sales if s.get("owner_id") != my_owner]
        assert others, "need at least one other sale"
        other_id = others[0]["id"]
        r = carlos_client.put(f"{BASE_URL}/sales/{other_id}", json={
            "property_name": "hack", "broker_name": "x", "sale_date": "2026-01-01",
            "sale_value": 1.0,
        })
        assert r.status_code == 404
        r2 = carlos_client.delete(f"{BASE_URL}/sales/{other_id}")
        assert r2.status_code == 404


# -------- History on delete ----------
class TestHistoryAndMaster:
    def test_delete_sale_creates_history(self, carlos_client, master_client):
        # Create a sale with Carlos first (self-contained; loadscope separates classes)
        lots = master_client.get(f"{BASE_URL}/loteamentos").json()
        lot_name = lots[0]["name"]
        r_c = carlos_client.post(f"{BASE_URL}/sales", json={
            "property_name": lot_name,
            "broker_name": "x", "sale_date": "2026-02-10",
            "sale_value": 50000.0, "commission_rate": 5.0,
            "commission_value": 2500.0, "broker_split": 60.0,
        })
        assert r_c.status_code == 200, r_c.text
        sid = r_c.json()["id"]
        r = carlos_client.delete(f"{BASE_URL}/sales/{sid}")
        assert r.status_code == 200
        h_carlos = carlos_client.get(f"{BASE_URL}/history").json()
        assert any(h["id"] == sid for h in h_carlos)
        entry = next(h for h in h_carlos if h["id"] == sid)
        assert entry.get("deleted_by_name")
        h_master = master_client.get(f"{BASE_URL}/history").json()
        assert any(h["id"] == sid for h in h_master)
        assert len(h_master) >= len(h_carlos)

    def test_corretores_master_only(self, carlos_client, master_client):
        r_c = carlos_client.get(f"{BASE_URL}/corretores")
        assert r_c.status_code == 403
        r_m = master_client.get(f"{BASE_URL}/corretores")
        assert r_m.status_code == 200
        corretores = r_m.json()
        for c in corretores:
            assert "qtd_vendas" in c and "volume" in c and "comissao_corretor" in c

    def test_toggle_active_blocks_login(self, master_client):
        # Create a disposable corretor
        s = requests.Session()
        email = _rand_email()
        cpf = "22233344455"
        reg = s.post(f"{BASE_URL}/auth/register", json={"name": "ToDisable", "email": email, "cpf": cpf}).json()
        uid = reg["user_id"]
        # Deactivate
        r = master_client.patch(f"{BASE_URL}/corretores/{uid}/active", json={"active": False})
        assert r.status_code == 200
        # Login should 403
        r_login = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": cpf})
        assert r_login.status_code == 403
        # Reactivate for cleanup
        master_client.patch(f"{BASE_URL}/corretores/{uid}/active", json={"active": True})


# -------- Loteamentos + master sale ownership binding ----------
class TestLoteamentosAndOwnership:
    def test_corretor_cannot_create_loteamento(self, carlos_client):
        r = carlos_client.post(f"{BASE_URL}/loteamentos", json={"name": "QA_LotCorretor"})
        assert r.status_code == 403

    def test_master_creates_loteamento_and_lists(self, master_client):
        name = f"QA_Lot_{uuid.uuid4().hex[:6]}"
        r = master_client.post(f"{BASE_URL}/loteamentos", json={"name": name})
        assert r.status_code == 200, r.text
        lots = master_client.get(f"{BASE_URL}/loteamentos").json()
        assert any(l["name"] == name for l in lots)
        state["qa_lot"] = name

    def test_corretor_sale_with_unregistered_loteamento_400(self, carlos_client):
        r = carlos_client.post(f"{BASE_URL}/sales", json={
            "property_name": f"QA_UnknownLot_{uuid.uuid4().hex[:6]}",
            "broker_name": "x", "sale_date": "2026-03-01",
            "sale_value": 1000.0, "commission_rate": 5.0, "commission_value": 50.0,
        })
        assert r.status_code == 400, r.text

    def test_master_sale_autoregisters_loteamento(self, master_client):
        new_lot = f"QA_AutoLot_{uuid.uuid4().hex[:6]}"
        r = master_client.post(f"{BASE_URL}/sales", json={
            "property_name": new_lot, "broker_name": "Carlão",
            "sale_date": "2026-03-02", "sale_value": 10000.0,
            "commission_rate": 5.0, "commission_value": 500.0,
        })
        assert r.status_code == 200, r.text
        state["autolot_sale_id"] = r.json()["id"]
        lots = master_client.get(f"{BASE_URL}/loteamentos").json()
        assert any(l["name"] == new_lot for l in lots), "master-created lot must auto-register"

    def test_master_sale_binds_owner_to_broker_name(self, master_client, carlos_client):
        # Fetch carlos's war_name from /auth/me and have master create a sale under it
        me = carlos_client.get(f"{BASE_URL}/auth/me").json()
        carlos_owner = me.get("user_id") or me.get("id")
        war_name = me.get("war_name") or me.get("name")
        lots = master_client.get(f"{BASE_URL}/loteamentos").json()
        lot_name = lots[0]["name"]
        r = master_client.post(f"{BASE_URL}/sales", json={
            "property_name": lot_name, "broker_name": war_name,
            "sale_date": "2026-03-03", "sale_value": 2000.0,
            "commission_rate": 5.0, "commission_value": 100.0,
        })
        assert r.status_code == 200, r.text
        sale = r.json()
        assert sale["owner_id"] == carlos_owner, f"owner_id mismatch: {sale.get('owner_id')} vs {carlos_owner}"
        # Carlos must now see it in /sales
        mine = carlos_client.get(f"{BASE_URL}/sales").json()
        assert any(s["id"] == sale["id"] for s in mine)
        state["master_bound_sale_id"] = sale["id"]
@pytest.fixture(scope="module", autouse=True)
def _cleanup():
    yield
    from pymongo import MongoClient
    c = MongoClient("mongodb://localhost:27017")["test_database"]
    # Delete QA sales
    c.sales.delete_many({"property_name": {"$regex": "^TEST_"}})
    c.sales.delete_many({"property_name": {"$regex": "^QA_"}})
    c.sales_history.delete_many({"property_name": {"$regex": "^TEST_"}})
    c.sales_history.delete_many({"property_name": {"$regex": "^QA_"}})
    c.loteamentos.delete_many({"name": {"$regex": "^QA_"}})
    # Delete QA test corretores (teste+*@qa.brilhantes.com)
    c.users.delete_many({"email": {"$regex": "^teste\\+.*@qa\\.brilhantes\\.com$"}})
    c.login_attempts.delete_many({"email": {"$regex": "^teste\\+"}})
