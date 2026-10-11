"""Tests for Export (xlsx/pdf), Attachments, and translation-bug verbatim behavior."""
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://controle-imoveis-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
SESSION_TOKEN = "qa_session_vinicius_001"
HEADERS = {"Authorization": f"Bearer {SESSION_TOKEN}"}
JSON_HEADERS = {**HEADERS, "Content-Type": "application/json"}


# ----- Translation bug: verbatim property_name -----
def test_sale_property_name_verbatim_no_translation():
    payload = {
        "property_name": "GOLDEN VILLE GUAIUBA",
        "quadra": "A", "lote": "1",
        "client_name": "TEST_Verbatim",
        "broker_name": "TEST_Broker",
        "sale_date": "2026-07-15",
        "sale_value": 150000.0,
        "commission_rate": 5.0, "commission_value": 7500.0,
        "broker_split": 60.0, "broker_commission": 4500.0, "agency_commission": 3000.0,
        "entrada": 0, "parcelado": False, "installments": [],
    }
    r = requests.post(f"{API}/sales", json=payload, headers=JSON_HEADERS, timeout=30)
    assert r.status_code == 200, r.text
    sale = r.json()
    sid = sale["id"]
    try:
        assert sale["property_name"] == "GOLDEN VILLE GUAIUBA"
        assert "VILA DOURADA" not in sale["property_name"]
        # GET back and verify
        sales = requests.get(f"{API}/sales?year=2026", headers=HEADERS, timeout=30).json()
        got = next((s for s in sales if s["id"] == sid), None)
        assert got is not None
        assert got["property_name"] == "GOLDEN VILLE GUAIUBA"
    finally:
        requests.delete(f"{API}/sales/{sid}", headers=HEADERS, timeout=30)


# ----- Export XLSX -----
def test_export_xlsx_year():
    r = requests.get(f"{API}/export/xlsx?year=2026", headers=HEADERS, timeout=60)
    assert r.status_code == 200
    assert "spreadsheet" in r.headers.get("content-type", "").lower() or \
           "openxmlformats" in r.headers.get("content-type", "")
    assert len(r.content) > 0
    # xlsx files are zip files starting with PK
    assert r.content[:2] == b"PK"


def test_export_xlsx_month_year():
    r = requests.get(f"{API}/export/xlsx?month=6&year=2026", headers=HEADERS, timeout=60)
    assert r.status_code == 200
    assert len(r.content) > 0
    assert r.content[:2] == b"PK"


# ----- Export PDF -----
def test_export_pdf_year():
    r = requests.get(f"{API}/export/pdf?year=2026", headers=HEADERS, timeout=60)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert r.content[:4] == b"%PDF"


def test_export_pdf_month_year():
    r = requests.get(f"{API}/export/pdf?month=6&year=2026", headers=HEADERS, timeout=60)
    assert r.status_code == 200
    assert r.content[:4] == b"%PDF"


# ----- Attachments full flow -----
@pytest.fixture
def sale_id():
    r = requests.post(f"{API}/sales", json={
        "property_name": "TEST_AttachLot",
        "broker_name": "TEST_Broker",
        "sale_date": "2026-07-20",
        "sale_value": 100000.0,
        "commission_rate": 5.0, "commission_value": 5000.0,
        "broker_split": 60.0, "broker_commission": 3000.0, "agency_commission": 2000.0,
        "entrada": 0, "parcelado": False, "installments": [],
    }, headers=JSON_HEADERS, timeout=30)
    assert r.status_code == 200
    sid = r.json()["id"]
    yield sid
    requests.delete(f"{API}/sales/{sid}", headers=HEADERS, timeout=30)


def test_attachment_full_flow(sale_id):
    content = b"Hello verbatim content TEST_ATTACHMENT 12345"
    # Upload
    files = {"file": ("test_doc.txt", content, "text/plain")}
    r = requests.post(f"{API}/sales/{sale_id}/attachments", files=files, headers=HEADERS, timeout=30)
    assert r.status_code == 200, r.text
    meta = r.json()
    assert meta["sale_id"] == sale_id
    assert meta["filename"] == "test_doc.txt"
    assert meta["content_type"].startswith("text/plain")
    assert meta["size"] == len(content)
    assert "id" in meta and "created_at" in meta
    assert "data" not in meta
    att_id = meta["id"]

    # List - no data field
    r = requests.get(f"{API}/sales/{sale_id}/attachments", headers=HEADERS, timeout=30)
    assert r.status_code == 200
    lst = r.json()
    assert len(lst) == 1
    assert lst[0]["id"] == att_id
    assert "data" not in lst[0]

    # Download - same content
    r = requests.get(f"{API}/attachments/{att_id}/download", headers=HEADERS, timeout=30)
    assert r.status_code == 200
    assert r.content == content
    assert "attachment" in r.headers.get("content-disposition", "").lower()
    assert "test_doc.txt" in r.headers.get("content-disposition", "")

    # Delete
    r = requests.delete(f"{API}/attachments/{att_id}", headers=HEADERS, timeout=30)
    assert r.status_code == 200

    # List empty
    r = requests.get(f"{API}/sales/{sale_id}/attachments", headers=HEADERS, timeout=30)
    assert r.status_code == 200
    assert r.json() == []

    # Delete again -> 404
    r = requests.delete(f"{API}/attachments/{att_id}", headers=HEADERS, timeout=30)
    assert r.status_code == 404


def test_attachment_upload_requires_valid_sale():
    files = {"file": ("x.txt", b"abc", "text/plain")}
    r = requests.post(f"{API}/sales/nonexistent_sale/attachments", files=files, headers=HEADERS, timeout=30)
    assert r.status_code == 404
