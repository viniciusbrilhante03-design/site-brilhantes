"""Test POST/PUT/GET /api/corretores persist cpf and birthdate."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://controle-imoveis-1.preview.emergentagent.com').rstrip('/')
TOKEN = "qa_session_vinicius_001"
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


@pytest.fixture
def created_uid():
    """Create corretor and yield; cleanup after."""
    payload = {
        "name": "TEST CPF Birthdate",
        "war_name": "TESTCPF",
        "email": "test_cpf_bd@example.com",
        "cpf": "123.456.789-00",
        "birthdate": "1990-05-15",
        "phone": "11999999999",
        "creci": "9999-F",
        "active": True,
    }
    r = requests.post(f"{BASE_URL}/api/corretores", json=payload, headers=HEADERS)
    assert r.status_code == 200, f"create failed: {r.status_code} {r.text}"
    uid = r.json()["user_id"]
    yield uid, payload
    requests.delete(f"{BASE_URL}/api/corretores/{uid}", headers=HEADERS)


def test_create_persists_cpf_birthdate(created_uid):
    uid, payload = created_uid
    r = requests.get(f"{BASE_URL}/api/corretores", headers=HEADERS)
    assert r.status_code == 200
    item = next((c for c in r.json() if c["user_id"] == uid), None)
    assert item is not None, "corretor not in list"
    assert item.get("cpf") == payload["cpf"]
    assert item.get("birthdate") == payload["birthdate"]


def test_update_persists_cpf_birthdate(created_uid):
    uid, _ = created_uid
    new_payload = {
        "name": "TEST CPF Birthdate Updated",
        "war_name": "TESTCPF",
        "email": "test_cpf_bd@example.com",
        "cpf": "987.654.321-11",
        "birthdate": "1985-12-01",
        "phone": "11999999999",
        "creci": "9999-F",
        "active": True,
    }
    r = requests.put(f"{BASE_URL}/api/corretores/{uid}", json=new_payload, headers=HEADERS)
    assert r.status_code == 200, f"update failed: {r.text}"
    r = requests.get(f"{BASE_URL}/api/corretores", headers=HEADERS)
    item = next((c for c in r.json() if c["user_id"] == uid), None)
    assert item.get("cpf") == new_payload["cpf"]
    assert item.get("birthdate") == new_payload["birthdate"]
