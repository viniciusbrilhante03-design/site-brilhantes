"""Backend API tests for Brilhantes Imóveis sales app."""
import os
import pytest
import requests
from datetime import date

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://controle-imoveis-1.preview.emergentagent.com").rstrip("/")
SESSION_TOKEN = "qa_session_vinicius_001"
HEADERS = {"Authorization": f"Bearer {SESSION_TOKEN}", "Content-Type": "application/json"}
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def created_sale_id():
    """Create a sale for CRUD testing."""
    payload = {
        "property_name": "TEST_Apt 101",
        "client_name": "TEST_Cliente",
        "broker_name": "TEST_Broker",
        "sale_date": "2026-06-15",
        "sale_value": 500000.0,
        "commission_rate": 5.0,
        "commission_value": 25000.0,
        "entrada": 100000.0,
        "parcelado": True,
        "installments": [
            {"number": 1, "due_date": "2026-07-15", "value": 200000.0, "received": False},
            {"number": 2, "due_date": "2026-08-15", "value": 200000.0, "received": False},
        ],
        "notes": "test",
    }
    r = requests.post(f"{API}/sales", json=payload, headers=HEADERS, timeout=30)
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    yield sid
    # cleanup
    requests.delete(f"{API}/sales/{sid}", headers=HEADERS, timeout=30)


# ---------------- Auth ----------------
def test_auth_me_no_credentials():
    r = requests.get(f"{API}/auth/me", timeout=30)
    assert r.status_code == 401


def test_auth_me_with_bearer():
    r = requests.get(f"{API}/auth/me", headers=HEADERS, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert data["user_id"] == "user_owner_vinicius"
    assert data["email"] == "viniciusbrilhante03@gmail.com"


def test_auth_me_with_cookie():
    r = requests.get(f"{API}/auth/me", cookies={"session_token": SESSION_TOKEN}, timeout=30)
    assert r.status_code == 200


# ---------------- Sales listing ----------------
def test_list_sales_all():
    r = requests.get(f"{API}/sales", headers=HEADERS, timeout=30)
    assert r.status_code == 200
    sales = r.json()
    assert isinstance(sales, list)
    assert len(sales) >= 13  # seeded


def test_list_sales_year_filter():
    r = requests.get(f"{API}/sales?year=2026", headers=HEADERS, timeout=30)
    assert r.status_code == 200
    for s in r.json():
        assert s["sale_date"].startswith("2026")


def test_list_sales_month_year_filter():
    r = requests.get(f"{API}/sales?month=6&year=2026", headers=HEADERS, timeout=30)
    assert r.status_code == 200
    for s in r.json():
        assert s["sale_date"].startswith("2026-06")


# ---------------- CRUD ----------------
def test_create_sale_and_verify(created_sale_id):
    r = requests.get(f"{API}/sales", headers=HEADERS, timeout=30)
    ids = [s["id"] for s in r.json()]
    assert created_sale_id in ids


def test_update_sale(created_sale_id):
    payload = {
        "property_name": "TEST_Apt 101 Updated",
        "client_name": "TEST_Cliente",
        "broker_name": "TEST_Broker",
        "sale_date": "2026-06-15",
        "sale_value": 550000.0,
        "commission_rate": 5.0,
        "commission_value": 27500.0,
        "entrada": 100000.0,
        "parcelado": True,
        "installments": [
            {"number": 1, "due_date": "2026-07-15", "value": 225000.0, "received": False},
            {"number": 2, "due_date": "2026-08-15", "value": 225000.0, "received": False},
        ],
        "notes": "updated",
    }
    r = requests.put(f"{API}/sales/{created_sale_id}", json=payload, headers=HEADERS, timeout=30)
    assert r.status_code == 200
    assert r.json()["property_name"] == "TEST_Apt 101 Updated"
    # Verify persisted
    r2 = requests.get(f"{API}/sales?month=6&year=2026", headers=HEADERS, timeout=30)
    match = next((s for s in r2.json() if s["id"] == created_sale_id), None)
    assert match is not None
    assert match["sale_value"] == 550000.0


def test_installment_baixa_toggle(created_sale_id):
    r = requests.patch(f"{API}/sales/{created_sale_id}/installments/1", headers=HEADERS, timeout=30)
    assert r.status_code == 200
    sale = r.json()
    inst1 = next(i for i in sale["installments"] if i["number"] == 1)
    assert inst1["received"] is True
    assert inst1["received_date"] is not None
    # Toggle back
    r2 = requests.patch(f"{API}/sales/{created_sale_id}/installments/1", headers=HEADERS, timeout=30)
    sale2 = r2.json()
    inst1b = next(i for i in sale2["installments"] if i["number"] == 1)
    assert inst1b["received"] is False
    assert inst1b["received_date"] is None


def test_installment_not_found(created_sale_id):
    r = requests.patch(f"{API}/sales/{created_sale_id}/installments/99", headers=HEADERS, timeout=30)
    assert r.status_code == 404


def test_delete_sale_isolation():
    # create one, delete, verify 404
    payload = {
        "property_name": "TEST_ToDelete",
        "broker_name": "TEST_B",
        "sale_date": "2026-03-10",
        "sale_value": 100000.0,
        "commission_rate": 5.0,
        "commission_value": 5000.0,
        "entrada": 0,
        "parcelado": False,
        "installments": [],
    }
    r = requests.post(f"{API}/sales", json=payload, headers=HEADERS, timeout=30)
    sid = r.json()["id"]
    d = requests.delete(f"{API}/sales/{sid}", headers=HEADERS, timeout=30)
    assert d.status_code == 200
    # subsequent delete should 404
    d2 = requests.delete(f"{API}/sales/{sid}", headers=HEADERS, timeout=30)
    assert d2.status_code == 404


# ---------------- Stats ----------------
def test_stats_year():
    r = requests.get(f"{API}/stats?year=2026", headers=HEADERS, timeout=30)
    assert r.status_code == 200
    s = r.json()
    for k in ["total_vendido", "comissao_total", "entrada_total", "ja_entrou", "falta_entrar", "qtd_vendas"]:
        assert k in s
    assert s["qtd_vendas"] >= 13
    # Consistency: ja_entrou + falta_entrar should equal total_vendido (approx)
    assert abs((s["ja_entrou"] + s["falta_entrar"]) - s["total_vendido"]) < 1.0


# ---------------- Ranking ----------------
def test_ranking_year():
    r = requests.get(f"{API}/ranking?year=2026", headers=HEADERS, timeout=30)
    assert r.status_code == 200
    ranking = r.json()
    assert isinstance(ranking, list)
    assert len(ranking) > 0
    for b in ranking:
        assert "broker_name" in b
        assert "qtd" in b
        assert "volume" in b
        assert "comissao" in b


# ---------------- Monthly series ----------------
def test_monthly_series():
    r = requests.get(f"{API}/monthly-series?year=2026", headers=HEADERS, timeout=30)
    assert r.status_code == 200
    months = r.json()
    assert len(months) == 12
    for i, m in enumerate(months):
        assert m["month"] == i + 1
        assert "volume" in m
        assert "qtd" in m


def test_unauthorized_sales():
    r = requests.get(f"{API}/sales", timeout=30)
    assert r.status_code == 401
