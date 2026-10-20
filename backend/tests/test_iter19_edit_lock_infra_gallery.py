# Iteration 19: sale edit lock (60d), infra outros persistence, gallery reorder, ai-extract + specs-merge
import os, io, base64, time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
MASTER = {"Authorization": "Bearer qa_session_vinicius_001"}
LOCKED_SALE = "sale_9398a1f3da62"
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")


@pytest.fixture(scope="module")
def corretor():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "carlos.teste@brilhantes.com", "password": "12345678900"})
    if r.status_code != 200:
        pytest.skip(f"corretor login failed {r.status_code}")
    tok = r.json().get("token") or r.json().get("access_token") or r.cookies.get("access_token")
    s = requests.Session()
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    s.cookies.update(r.cookies)
    return s


@pytest.fixture(scope="module")
def lot():
    r = requests.get(f"{BASE_URL}/api/loteamentos", headers=MASTER)
    assert r.status_code == 200
    lots = r.json()
    assert lots
    return lots[0]


def _sale_body(s):
    keys = ["property_name", "client_name", "sale_value", "commission_pct", "sale_date", "status", "broker_name", "lot", "block", "notes"]
    return {k: s[k] for k in s if k not in ("id", "_id", "created_at", "owner_id", "owner_name", "broker_ids")}


# Sale edit lock
class TestSaleEditLock:
    def test_locked_sale_403(self, corretor):
        sales = corretor.get(f"{BASE_URL}/api/sales").json()
        s = next((x for x in sales if x["id"] == LOCKED_SALE), None)
        assert s, "locked sale not visible to corretor"
        r = corretor.put(f"{BASE_URL}/api/sales/{LOCKED_SALE}", json=_sale_body(s))
        assert r.status_code == 403
        assert "Prazo" in r.json().get("detail", "")

    def test_recent_sale_200(self, corretor):
        sales = corretor.get(f"{BASE_URL}/api/sales").json()
        s = next((x for x in sales if x["id"] != LOCKED_SALE and x.get("created_at", "") > "2026-08"), None)
        if not s:
            pytest.skip("no recent sale")
        body = _sale_body(s)
        orig = body.get("notes", "")
        body["notes"] = "TEST_iter19"
        r = corretor.put(f"{BASE_URL}/api/sales/{s['id']}", json=body)
        assert r.status_code == 200, r.text
        assert r.json()["notes"] == "TEST_iter19"
        body["notes"] = orig
        corretor.put(f"{BASE_URL}/api/sales/{s['id']}", json=body)

    def test_master_can_edit_locked(self):
        s = requests.get(f"{BASE_URL}/api/sales", headers=MASTER).json()
        s = next(x for x in s if x["id"] == LOCKED_SALE)
        r = requests.put(f"{BASE_URL}/api/sales/{LOCKED_SALE}", json=_sale_body(s), headers=MASTER)
        assert r.status_code == 200, r.text


# Gallery reorder
class TestGalleryReorder:
    def test_reorder(self, lot):
        lid = lot["id"]
        imgs = requests.get(f"{BASE_URL}/api/loteamentos/{lid}/images", headers=MASTER).json()
        created = []
        while len(imgs) < 2:
            r = requests.post(f"{BASE_URL}/api/loteamentos/{lid}/images", headers=MASTER,
                              files={"file": ("t.png", PNG, "image/png")}, data={"type": "foto", "caption": "TEST_img"})
            assert r.status_code == 200, r.text
            created.append(r.json()["id"])
            imgs = requests.get(f"{BASE_URL}/api/loteamentos/{lid}/images", headers=MASTER).json()
        ids = [i["id"] for i in imgs]
        rev = list(reversed(ids))
        r = requests.post(f"{BASE_URL}/api/loteamentos/{lid}/images/reorder", json={"ids": rev}, headers=MASTER)
        assert r.status_code == 200
        after = [i["id"] for i in requests.get(f"{BASE_URL}/api/loteamentos/{lid}/images", headers=MASTER).json()]
        assert after == rev
        requests.post(f"{BASE_URL}/api/loteamentos/{lid}/images/reorder", json={"ids": ids}, headers=MASTER)

    def test_reorder_corretor_forbidden(self, corretor, lot):
        r = corretor.post(f"{BASE_URL}/api/loteamentos/{lot['id']}/images/reorder", json={"ids": []})
        assert r.status_code in (401, 403)


# specs-merge with outros list + book_text knowledge
class TestSpecsMerge:
    def test_merge_outros_and_book(self, lot):
        lid = lot["id"]
        r = requests.patch(f"{BASE_URL}/api/loteamentos/{lid}/specs-merge", headers=MASTER,
                           json={"specs_partial": {"infraestrutura": {"outros": ["TEST_outro_merge"]}},
                                 "book_text": "TEST book content", "book_title": "TEST_book.txt"})
        assert r.status_code == 200
        d = requests.get(f"{BASE_URL}/api/loteamentos/{lid}/details", headers=MASTER).json()
        assert "TEST_outro_merge" in (d["specs"]["infraestrutura"].get("outros") or [])
        kn = [k for k in d.get("knowledge") or [] if k["title"] == "Arquivo: TEST_book.txt"]
        assert kn
        # cleanup (direct DB)
        from pymongo import MongoClient
        from dotenv import dotenv_values
        env = dotenv_values("/app/backend/.env")
        db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
        db.loteamentos.update_one({"id": lid}, {"$pull": {"specs.infraestrutura.outros": {"$regex": "^TEST_"},
                                                           "knowledge": {"title": {"$regex": "^Arquivo: TEST_"}}}})


# AI extract on a txt book
class TestAIExtract:
    def test_ai_extract_txt(self, lot):
        txt = ("Loteamento TEST Jardim. Área total 120.000 m². 300 lotes em 15 quadras. Lotes de 250 a 400 m². Condomínio fechado. "
               "Infraestrutura: água, energia elétrica, ruas em asfalto, guarita, academia ao ar livre, piscina. "
               "Obra em andamento 70%, entrega dezembro 2027. Cidade: Itajaí - SC, bairro Cordeiros, 5 km do centro, 8 km da praia. "
               "Valores a partir de R$ 95.000, entrada mínima 10%, até 120 parcelas, correção IPCA, juros 0,5% a.m., balões semestrais de R$ 5.000. "
               "Liberação para construir após 30% pago. Restrições: recuo frontal 4m, máximo 2 pavimentos.") * 3
        r = requests.post(f"{BASE_URL}/api/loteamentos/{lot['id']}/ai-extract", headers=MASTER,
                          files={"file": ("TEST_book.txt", txt.encode(), "text/plain")}, timeout=180)
        assert r.status_code == 200, r.text
        d = r.json()
        sg = d["suggestions"]
        print({k: sg.get(k) for k in sg})
        for sec in ("tecnicos", "infraestrutura", "obra", "localizacao", "comercial"):
            assert sec in sg, sec
        assert sg.get("resumo")
        assert d["book_text"]
        assert d["filename"] == "TEST_book.txt"
