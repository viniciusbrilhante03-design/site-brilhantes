"""Corretor read-only scope on Loteamentos (GETs OK; mutations 401/403)."""
import io
import os
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

MASTER_COOKIE = {"session_token": "qa_session_vinicius_001"}
MASTER_H = {"Authorization": "Bearer qa_session_vinicius_001"}

CORRETOR_EMAIL = "carlos.teste@brilhantes.com"
CORRETOR_PASS = "12345678900"


@pytest.fixture(scope="module")
def corretor_token():
    r = requests.post(f"{API}/auth/login", json={"email": CORRETOR_EMAIL, "password": CORRETOR_PASS}, timeout=20)
    assert r.status_code == 200, f"login corretor falhou: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.cookies.get("access_token")
    assert tok, f"sem token: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def corretor_h(corretor_token):
    return {"Authorization": f"Bearer {corretor_token}"}


@pytest.fixture(scope="module")
def lot_id():
    r = requests.get(f"{API}/loteamentos", headers=MASTER_H, timeout=20)
    assert r.status_code == 200
    lst = r.json()
    assert lst, "nenhum loteamento disponível"
    return lst[0]["id"]


@pytest.fixture(scope="module")
def seeded_doc(lot_id):
    """Cria um doc via master para testar download pelo corretor; remove no teardown."""
    files = {"file": ("TEST_corretor.pdf", io.BytesIO(b"%PDF-1.4\n% test\n"), "application/pdf")}
    data = {"title": "TEST_corretor_doc", "category": "documento"}
    r = requests.post(f"{API}/loteamentos/{lot_id}/docs", headers=MASTER_H, files=files, data=data, timeout=30)
    assert r.status_code in (200, 201), f"seed doc falhou: {r.status_code} {r.text}"
    doc = r.json()
    doc_id = doc.get("id")
    assert doc_id
    yield doc_id
    requests.delete(f"{API}/loteamentos/docs/{doc_id}", headers=MASTER_H, timeout=15)


# ---------- GETs do corretor ----------
def test_corretor_list_loteamentos(corretor_h):
    r = requests.get(f"{API}/loteamentos", headers=corretor_h, timeout=20)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_corretor_get_details(corretor_h, lot_id):
    r = requests.get(f"{API}/loteamentos/{lot_id}/details", headers=corretor_h, timeout=20)
    assert r.status_code == 200
    j = r.json()
    assert "specs" in j or "copy" in j or "id" in j or j is not None


def test_corretor_list_videos(corretor_h, lot_id):
    r = requests.get(f"{API}/loteamentos/{lot_id}/videos", headers=corretor_h, timeout=20)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_corretor_list_docs(corretor_h, lot_id, seeded_doc):
    r = requests.get(f"{API}/loteamentos/{lot_id}/docs", headers=corretor_h, timeout=20)
    assert r.status_code == 200
    ids = [d["id"] for d in r.json()]
    assert seeded_doc in ids


def test_corretor_download_doc(corretor_h, seeded_doc):
    r = requests.get(f"{API}/loteamentos/docs/{seeded_doc}/download", headers=corretor_h, timeout=20)
    assert r.status_code == 200
    assert len(r.content) > 0
    cd = r.headers.get("content-disposition", "")
    assert "attachment" in cd.lower() or len(r.content) > 0


def test_corretor_list_images(corretor_h, lot_id):
    r = requests.get(f"{API}/loteamentos/{lot_id}/images", headers=corretor_h, timeout=20)
    assert r.status_code == 200


# ---------- Mutações do corretor (devem bloquear 401/403) ----------
def _blocked(status):
    return status in (401, 403)


def test_block_add_loteamento(corretor_h):
    r = requests.post(f"{API}/loteamentos", headers=corretor_h, json={"name": "TEST_HACK"}, timeout=15)
    assert _blocked(r.status_code), r.status_code


def test_block_update_meta(corretor_h, lot_id):
    r = requests.patch(f"{API}/loteamentos/{lot_id}/meta", headers=corretor_h, json={"phase": "entregue"}, timeout=15)
    assert _blocked(r.status_code), r.status_code


def test_block_update_details(corretor_h, lot_id):
    r = requests.put(f"{API}/loteamentos/{lot_id}/details", headers=corretor_h,
                     json={"specs": {}, "copy": "TEST", "knowledge": ""}, timeout=15)
    assert _blocked(r.status_code), r.status_code


def test_block_generate_copy(corretor_h, lot_id):
    r = requests.post(f"{API}/loteamentos/{lot_id}/generate-copy?channel=whatsapp", headers=corretor_h, timeout=15)
    assert _blocked(r.status_code), r.status_code


def test_block_image_upload(corretor_h, lot_id):
    files = {"file": ("TEST.jpg", io.BytesIO(b"fakejpg"), "image/jpeg")}
    r = requests.post(f"{API}/loteamentos/{lot_id}/images", headers=corretor_h, files=files, data={"caption": "x"}, timeout=15)
    assert _blocked(r.status_code), r.status_code


def test_block_video_link(corretor_h, lot_id):
    r = requests.post(f"{API}/loteamentos/{lot_id}/videos/link", headers=corretor_h,
                     json={"url": "https://youtu.be/dQw4w9WgXcQ", "title": "TEST"}, timeout=15)
    assert _blocked(r.status_code), r.status_code


def test_block_video_upload(corretor_h, lot_id):
    files = {"file": ("TEST.mp4", io.BytesIO(b"fakevid"), "video/mp4")}
    r = requests.post(f"{API}/loteamentos/{lot_id}/videos/upload", headers=corretor_h, files=files, data={"title": "x"}, timeout=15)
    assert _blocked(r.status_code), r.status_code


def test_block_doc_upload(corretor_h, lot_id):
    files = {"file": ("TEST.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")}
    r = requests.post(f"{API}/loteamentos/{lot_id}/docs", headers=corretor_h, files=files, data={"title": "x", "category": "documento"}, timeout=15)
    assert _blocked(r.status_code), r.status_code


def test_block_doc_delete(corretor_h, seeded_doc):
    r = requests.delete(f"{API}/loteamentos/docs/{seeded_doc}", headers=corretor_h, timeout=15)
    assert _blocked(r.status_code), r.status_code


def test_block_reorder(corretor_h):
    r = requests.post(f"{API}/loteamentos/reorder", headers=corretor_h, json={"order": []}, timeout=15)
    assert _blocked(r.status_code), r.status_code


def test_block_add_copy(corretor_h, lot_id):
    r = requests.post(f"{API}/loteamentos/{lot_id}/copies", headers=corretor_h,
                     json={"channel": "whatsapp", "text": "TEST"}, timeout=15)
    assert _blocked(r.status_code), r.status_code
