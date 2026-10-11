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
    def test_corretor_sale_scoped(self, carlos_client, master_client):
        payload = {
            "property_name": "TEST_Loteamento Carlos",
            "broker_name": "Outro Qualquer",  # should be overridden
            "sale_date": "2026-01-15",
            "sale_value": 100000.0,
            "commission_rate": 5.0,
            "commission_value": 5000.0,
            "broker_split": 60.0,
        }
        r = carlos_client.post(f"{BASE_URL}/sales", json=payload)
        assert r.status_code == 200
        sale = r.json()
        assert sale["owner_id"]  # has owner
        assert sale["broker_name"] in ("Carlão", "Carlos Teste"), f"broker_name must be forced to corretor display: {sale['broker_name']}"
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
        # Pick a sale not owned by Carlos (one of 13 demo sales)
        all_sales = master_client.get(f"{BASE_URL}/sales").json()
        others = [s for s in all_sales if s.get("owner_id") != state["carlos_owner_id"]]
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
        sid = state["carlos_sale_id"]
        r = carlos_client.delete(f"{BASE_URL}/sales/{sid}")
        assert r.status_code == 200
        # Carlos sees it in his history
        h_carlos = carlos_client.get(f"{BASE_URL}/history").json()
        assert any(h["id"] == sid for h in h_carlos)
        entry = next(h for h in h_carlos if h["id"] == sid)
        assert entry.get("deleted_by_name")
        # Master sees it too
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


# -------- Cleanup ----------
@pytest.fixture(scope="module", autouse=True)
def _cleanup():
    yield
    from pymongo import MongoClient
    c = MongoClient("mongodb://localhost:27017")["test_database"]
    # Delete QA sales
    c.sales.delete_many({"property_name": {"$regex": "^TEST_"}})
    c.sales_history.delete_many({"property_name": {"$regex": "^TEST_"}})
    # Delete QA test corretores (teste+*@qa.brilhantes.com)
    c.users.delete_many({"email": {"$regex": "^teste\\+.*@qa\\.brilhantes\\.com$"}})
    c.login_attempts.delete_many({"email": {"$regex": "^teste\\+"}})
