"""Tests for new features: brokers CRUD, ranking enrichment, commission split, import."""
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://controle-imoveis-1.preview.emergentagent.com").rstrip("/")
SESSION_TOKEN = "qa_session_vinicius_001"
HEADERS = {"Authorization": f"Bearer {SESSION_TOKEN}"}
JSON_HEADERS = {**HEADERS, "Content-Type": "application/json"}
API = f"{BASE_URL}/api"


# ----- Brokers CRUD -----
@pytest.fixture
def broker_id():
    r = requests.post(f"{API}/brokers", json={
        "war_name": "TEST_Aninha",
        "full_name": "TEST_Ana Paula Souza",
        "phone": "11999990000",
        "creci": "CRECI-12345",
        "email": "test_aninha@example.com",
        "photo": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    }, headers=JSON_HEADERS, timeout=30)
    assert r.status_code == 200, r.text
    bid = r.json()["id"]
    yield bid
    requests.delete(f"{API}/brokers/{bid}", headers=HEADERS, timeout=30)


def test_brokers_list(broker_id):
    r = requests.get(f"{API}/brokers", headers=HEADERS, timeout=30)
    assert r.status_code == 200
    ids = [b["id"] for b in r.json()]
    assert broker_id in ids


def test_broker_update(broker_id):
    r = requests.put(f"{API}/brokers/{broker_id}", json={
        "war_name": "TEST_Aninha",
        "full_name": "TEST_Ana Paula Souza Silva",
        "phone": "11999991111",
        "creci": "CRECI-54321",
        "email": "updated@example.com",
        "photo": "",
    }, headers=JSON_HEADERS, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert data["full_name"] == "TEST_Ana Paula Souza Silva"
    assert data["creci"] == "CRECI-54321"


def test_broker_delete_404_after():
    r = requests.post(f"{API}/brokers", json={"war_name": "TEST_Tmp"}, headers=JSON_HEADERS, timeout=30)
    bid = r.json()["id"]
    d = requests.delete(f"{API}/brokers/{bid}", headers=HEADERS, timeout=30)
    assert d.status_code == 200
    d2 = requests.delete(f"{API}/brokers/{bid}", headers=HEADERS, timeout=30)
    assert d2.status_code == 404


# ----- Commission split on create -----
def test_commission_split_persisted_and_stats():
    payload = {
        "property_name": "TEST_LotSplit",
        "quadra": "A", "lote": "10",
        "client_name": "TEST_Cliente",
        "client_phone": "11988887777",
        "client_email": "c@test.com",
        "broker_name": "TEST_CorretorSplit",
        "sale_date": "2026-05-20",
        "sale_value": 200000.0,
        "commission_rate": 5.0,
        "commission_value": 10000.0,
        "broker_split": 60.0,
        "broker_commission": 6000.0,
        "agency_commission": 4000.0,
        "entrada": 0, "parcelado": False, "installments": [],
    }
    r = requests.post(f"{API}/sales", json=payload, headers=JSON_HEADERS, timeout=30)
    assert r.status_code == 200
    sale = r.json()
    sid = sale["id"]
    try:
        assert sale["broker_commission"] == 6000.0
        assert sale["agency_commission"] == 4000.0
        assert sale["quadra"] == "A" and sale["lote"] == "10"
        assert sale["client_phone"] == "11988887777"
        # Stats consistency
        s = requests.get(f"{API}/stats?year=2026", headers=HEADERS, timeout=30).json()
        assert "comissao_corretor" in s and "comissao_imobiliaria" in s
        assert abs(s["comissao_corretor"] + s["comissao_imobiliaria"] - s["comissao_total"]) < 1.0
    finally:
        requests.delete(f"{API}/sales/{sid}", headers=HEADERS, timeout=30)


# ----- Ranking enrichment with photo -----
def test_ranking_photo_enrichment():
    # Create broker with photo matching a broker_name in a new sale
    photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    br = requests.post(f"{API}/brokers", json={
        "war_name": "TEST_RankPhoto", "photo": photo,
    }, headers=JSON_HEADERS, timeout=30).json()
    sale = requests.post(f"{API}/sales", json={
        "property_name": "TEST_RankLot", "broker_name": "TEST_RankPhoto",
        "sale_date": "2026-04-10", "sale_value": 100000.0,
        "commission_rate": 5.0, "commission_value": 5000.0,
        "broker_split": 60.0, "broker_commission": 3000.0, "agency_commission": 2000.0,
        "entrada": 0, "parcelado": False, "installments": [],
    }, headers=JSON_HEADERS, timeout=30).json()
    try:
        r = requests.get(f"{API}/ranking?year=2026", headers=HEADERS, timeout=30)
        assert r.status_code == 200
        entry = next((e for e in r.json() if e["broker_name"] == "TEST_RankPhoto"), None)
        assert entry is not None
        assert entry["photo"] == photo
        assert "comissao_corretor" in entry
        assert entry["qtd"] >= 1
    finally:
        requests.delete(f"{API}/sales/{sale['id']}", headers=HEADERS, timeout=30)
        requests.delete(f"{API}/brokers/{br['id']}", headers=HEADERS, timeout=30)


# ----- Import CSV with BRL formats -----
def test_import_csv_brl_and_date():
    csv = (
        "Loteamento,Quadra,Lote,Cliente,Numero,Email,Corretor,Data,Valor,Comissao %,Entrada,Parcelas\n"
        "TEST_ImpLot,Q1,L2,TEST_ClientImp,11999991234,ci@test.com,TEST_BrokImp,15/06/2026,\"R$ 180.000,00\",5,\"R$ 20.000,00\",3\n"
    )
    files = {"file": ("test.csv", csv.encode("utf-8"), "text/csv")}
    r = requests.post(f"{API}/sales/import", files=files, headers=HEADERS, timeout=60)
    assert r.status_code == 200, r.text
    assert r.json()["imported"] == 1
    # verify
    sales = requests.get(f"{API}/sales?year=2026", headers=HEADERS, timeout=30).json()
    imp = next((s for s in sales if s["property_name"] == "TEST_ImpLot"), None)
    assert imp is not None
    try:
        assert imp["sale_date"] == "2026-06-15"
        assert abs(imp["sale_value"] - 180000.0) < 0.01
        assert abs(imp["entrada"] - 20000.0) < 0.01
        assert imp["parcelado"] is True
        assert len(imp["installments"]) == 3
        assert imp["quadra"] == "Q1" and imp["lote"] == "L2"
    finally:
        requests.delete(f"{API}/sales/{imp['id']}", headers=HEADERS, timeout=30)


def test_import_invalid_format_returns_422():
    files = {"file": ("test.txt", b"garbage", "text/plain")}
    r = requests.post(f"{API}/sales/import", files=files, headers=HEADERS, timeout=30)
    assert r.status_code == 422
    assert "Formato" in r.json().get("detail", "") or "não" in r.json().get("detail", "").lower()


def test_import_empty_csv_returns_422():
    csv = "Loteamento,Valor\n,\n"
    files = {"file": ("empty.csv", csv.encode("utf-8"), "text/csv")}
    r = requests.post(f"{API}/sales/import", files=files, headers=HEADERS, timeout=30)
    assert r.status_code == 422
