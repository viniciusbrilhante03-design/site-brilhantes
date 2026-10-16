"""
P1 tests: Loteamento videos/docs/coords/reorder + Sales bulk-delete/transfer.
IMPORTANT: creates its own TEST_ sales; cleans up at the end.
"""
import io
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
MASTER_TOKEN = "qa_session_vinicius_001"
CORRETOR_EMAIL = "carlos.teste@brilhantes.com"
CORRETOR_PASS = "12345678900"


@pytest.fixture(scope="module")
def master():
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {MASTER_TOKEN}"})
    r = s.get(f"{BASE_URL}/api/auth/me", timeout=15)
    assert r.status_code == 200, f"Master auth failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def corretor():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": CORRETOR_EMAIL, "password": CORRETOR_PASS}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Corretor login failed: {r.status_code} {r.text}")
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def lot(master):
    # pick first existing loteamento (demo has several)
    r = master.get(f"{BASE_URL}/api/loteamentos", timeout=15)
    assert r.status_code == 200
    docs = r.json()
    assert docs, "No loteamentos found"
    return docs[0]


# ---------- Videos ----------
class TestVideos:
    def test_add_youtube_link(self, master, lot):
        r = master.post(
            f"{BASE_URL}/api/loteamentos/{lot['id']}/videos/link",
            json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "title": "TEST_yt"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["kind"] == "youtube"
        assert d["youtube_id"] == "dQw4w9WgXcQ"
        pytest.yt_vid_id = d["id"]

    def test_add_url_link(self, master, lot):
        r = master.post(
            f"{BASE_URL}/api/loteamentos/{lot['id']}/videos/link",
            json={"url": "https://vimeo.com/12345", "title": "TEST_url"},
            timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["kind"] == "url"
        assert d["youtube_id"] == ""
        pytest.url_vid_id = d["id"]

    def test_list_videos(self, master, lot):
        r = master.get(f"{BASE_URL}/api/loteamentos/{lot['id']}/videos", timeout=15)
        assert r.status_code == 200
        ids = [v["id"] for v in r.json()]
        assert pytest.yt_vid_id in ids
        assert pytest.url_vid_id in ids

    def test_add_link_requires_url(self, master, lot):
        r = master.post(f"{BASE_URL}/api/loteamentos/{lot['id']}/videos/link",
                        json={"url": ""}, timeout=15)
        assert r.status_code == 400

    def test_corretor_can_list(self, corretor, lot):
        r = corretor.get(f"{BASE_URL}/api/loteamentos/{lot['id']}/videos", timeout=15)
        assert r.status_code == 200

    def test_corretor_cannot_add_link(self, corretor, lot):
        r = corretor.post(f"{BASE_URL}/api/loteamentos/{lot['id']}/videos/link",
                          json={"url": "https://youtu.be/abc12345"}, timeout=15)
        assert r.status_code in (401, 403)

    def test_delete_videos(self, master, lot):
        for vid in (pytest.yt_vid_id, pytest.url_vid_id):
            r = master.delete(f"{BASE_URL}/api/loteamentos/videos/{vid}", timeout=15)
            assert r.status_code == 200
        r = master.get(f"{BASE_URL}/api/loteamentos/{lot['id']}/videos", timeout=15)
        ids = [v["id"] for v in r.json()]
        assert pytest.yt_vid_id not in ids
        assert pytest.url_vid_id not in ids


# ---------- Documentos ----------
class TestDocs:
    def test_upload_doc_tabela(self, master, lot):
        files = {"file": ("TEST_tabela.pdf", io.BytesIO(b"%PDF-1.4 test content"), "application/pdf")}
        data = {"title": "TEST_tabela", "category": "tabela_preco"}
        r = master.post(f"{BASE_URL}/api/loteamentos/{lot['id']}/docs", files=files, data=data, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["category"] == "tabela_preco"
        assert d["filename"] == "TEST_tabela.pdf"
        pytest.doc_id = d["id"]

    def test_list_docs(self, master, lot):
        r = master.get(f"{BASE_URL}/api/loteamentos/{lot['id']}/docs", timeout=15)
        assert r.status_code == 200
        assert any(d["id"] == pytest.doc_id for d in r.json())

    def test_corretor_can_download(self, corretor):
        r = corretor.get(f"{BASE_URL}/api/loteamentos/docs/{pytest.doc_id}/download", timeout=30)
        assert r.status_code == 200
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower()
        assert "TEST_tabela.pdf" in cd
        assert r.content.startswith(b"%PDF")

    def test_corretor_cannot_upload(self, corretor, lot):
        files = {"file": ("x.pdf", io.BytesIO(b"xx"), "application/pdf")}
        r = corretor.post(f"{BASE_URL}/api/loteamentos/{lot['id']}/docs",
                          files=files, data={"category": "documento"}, timeout=15)
        assert r.status_code in (401, 403)

    def test_invalid_category_falls_back(self, master, lot):
        files = {"file": ("TEST_bad.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")}
        r = master.post(f"{BASE_URL}/api/loteamentos/{lot['id']}/docs",
                        files=files, data={"category": "lixo"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["category"] == "documento"
        # cleanup
        master.delete(f"{BASE_URL}/api/loteamentos/docs/{r.json()['id']}", timeout=15)

    def test_delete_doc(self, master, lot):
        r = master.delete(f"{BASE_URL}/api/loteamentos/docs/{pytest.doc_id}", timeout=15)
        assert r.status_code == 200
        r = master.get(f"{BASE_URL}/api/loteamentos/{lot['id']}/docs", timeout=15)
        assert not any(d["id"] == pytest.doc_id for d in r.json())


# ---------- Coords & Reorder ----------
class TestCoordsReorder:
    def test_save_coords_lat_lng(self, master, lot):
        payload = {"specs": {"localizacao": {"coords": "-27.5954,-48.5480"}}}
        r = master.put(f"{BASE_URL}/api/loteamentos/{lot['id']}/details",
                       json=payload, timeout=15)
        assert r.status_code == 200, r.text
        # verify persisted via listing
        docs = master.get(f"{BASE_URL}/api/loteamentos", timeout=15).json()
        d = next(x for x in docs if x["id"] == lot["id"])
        assert abs(d["lat"] - (-27.5954)) < 1e-4
        assert abs(d["lng"] - (-48.5480)) < 1e-4

    def test_save_coords_from_gmaps_link(self, master, lot):
        link = "https://www.google.com/maps/@-23.5505,-46.6333,15z"
        payload = {"specs": {"localizacao": {"coords": "", "maps": link}}}
        r = master.put(f"{BASE_URL}/api/loteamentos/{lot['id']}/details",
                       json=payload, timeout=15)
        assert r.status_code == 200
        docs = master.get(f"{BASE_URL}/api/loteamentos", timeout=15).json()
        d = next(x for x in docs if x["id"] == lot["id"])
        assert abs(d["lat"] - (-23.5505)) < 1e-3
        assert abs(d["lng"] - (-46.6333)) < 1e-3

    def test_reorder_master(self, master):
        docs = master.get(f"{BASE_URL}/api/loteamentos", timeout=15).json()
        assert len(docs) >= 2
        ids = [d["id"] for d in docs]
        reversed_ids = list(reversed(ids))
        r = master.post(f"{BASE_URL}/api/loteamentos/reorder",
                        json={"ids": reversed_ids}, timeout=15)
        assert r.status_code == 200
        after = master.get(f"{BASE_URL}/api/loteamentos", timeout=15).json()
        assert [d["id"] for d in after] == reversed_ids
        # restore
        master.post(f"{BASE_URL}/api/loteamentos/reorder", json={"ids": ids}, timeout=15)

    def test_reorder_corretor_forbidden(self, corretor):
        r = corretor.post(f"{BASE_URL}/api/loteamentos/reorder",
                          json={"ids": []}, timeout=15)
        assert r.status_code in (401, 403)


# ---------- Sales bulk ----------
@pytest.fixture(scope="module")
def test_sale_ids(master):
    """Create 2 test sales, yield ids, cleanup leftovers at end."""
    created = []
    for i in range(2):
        payload = {
            "property_name": f"TEST_bulk_lot_{i}",
            "sale_value": 10000 + i,
            "broker_name": "TEST_BrokerBulk",
            "sale_date": "2026-01-15",
            "client_name": f"TEST_Cli_{i}",
        }
        r = master.post(f"{BASE_URL}/api/sales", json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text
        created.append(r.json()["id"])
    yield created
    # cleanup: remove any still existing
    for sid in created:
        try:
            master.delete(f"{BASE_URL}/api/sales/{sid}", timeout=10)
        except Exception:
            pass


class TestBulk:
    def test_bulk_transfer_requires_broker(self, master, test_sale_ids):
        r = master.post(f"{BASE_URL}/api/sales/bulk-transfer",
                        json={"ids": test_sale_ids, "broker_name": ""}, timeout=15)
        assert r.status_code == 400

    def test_bulk_transfer_corretor_forbidden(self, corretor, test_sale_ids):
        r = corretor.post(f"{BASE_URL}/api/sales/bulk-transfer",
                          json={"ids": test_sale_ids, "broker_name": "x"}, timeout=15)
        assert r.status_code in (401, 403)

    def test_bulk_transfer_ok(self, master, test_sale_ids):
        # transfer only the first one
        sid = test_sale_ids[0]
        r = master.post(f"{BASE_URL}/api/sales/bulk-transfer",
                        json={"ids": [sid], "broker_name": "TEST_NewOwner"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["transferred"] == 1
        # verify persisted via listing
        all_sales = master.get(f"{BASE_URL}/api/sales", timeout=15).json()
        sale = next((s for s in all_sales if s["id"] == sid), None)
        if sale:
            assert sale["broker_name"] == "TEST_NewOwner"

    def test_bulk_delete_corretor_forbidden(self, corretor, test_sale_ids):
        r = corretor.post(f"{BASE_URL}/api/sales/bulk-delete",
                          json={"ids": test_sale_ids}, timeout=15)
        assert r.status_code in (401, 403)

    def test_bulk_delete_ok(self, master, test_sale_ids):
        r = master.post(f"{BASE_URL}/api/sales/bulk-delete",
                        json={"ids": test_sale_ids}, timeout=20)
        assert r.status_code == 200
        assert r.json()["deleted"] >= 1
        # verify both gone via listing (GET /api/sales/{id} not supported)
        all_sales = master.get(f"{BASE_URL}/api/sales", timeout=15).json()
        existing_ids = {s["id"] for s in all_sales}
        for sid in test_sale_ids:
            assert sid not in existing_ids
