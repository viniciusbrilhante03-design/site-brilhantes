"""
Fase 9 — Verificação E2E das novas features do Brilhante's Imóveis.
Cobre: appointments CRUD + done, ranking opt-out toggle, export com colunas (xlsx/pdf),
loteamento details (specs), copy por canal, galeria (upload/list/raw/delete),
IA especialista, import-ai preview com column_mapping, birthdays c/ telefone.
"""
import io
import os
import uuid
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://controle-imoveis-1.preview.emergentagent.com").rstrip("/")
MASTER_TOKEN = "qa_session_vinicius_001"
LOT_ID = "lot_9715a2786e"  # Casa Praia Grande


@pytest.fixture(scope="module")
def master():
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {MASTER_TOKEN}"})
    return s


@pytest.fixture(scope="module")
def corretor():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": "carlos.teste@brilhantes.com", "password": "12345678900"})
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.cookies.get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# -------- Appointments --------
class TestAppointments:
    appt_id = None

    def test_create_appointment_corretor(self, corretor):
        r = corretor.post(f"{BASE}/api/appointments", json={
            "title": "TEST_Visita Lote 10", "type": "visita",
            "when": "2026-02-01T10:00", "client_name": "Fulano", "notes": "TEST_notes"
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == "TEST_Visita Lote 10"
        assert d["type"] == "visita"
        assert d["done"] is False
        TestAppointments.appt_id = d["id"]

    def test_list_appointments(self, corretor):
        r = corretor.get(f"{BASE}/api/appointments")
        assert r.status_code == 200
        ids = [a["id"] for a in r.json()]
        assert TestAppointments.appt_id in ids

    def test_master_sees_all(self, master):
        r = master.get(f"{BASE}/api/appointments")
        assert r.status_code == 200
        ids = [a["id"] for a in r.json()]
        assert TestAppointments.appt_id in ids

    def test_toggle_done(self, corretor):
        r = corretor.patch(f"{BASE}/api/appointments/{TestAppointments.appt_id}/done",
                           json={"done": True})
        assert r.status_code == 200
        # verify
        r2 = corretor.get(f"{BASE}/api/appointments")
        appt = next(a for a in r2.json() if a["id"] == TestAppointments.appt_id)
        assert appt["done"] is True

    def test_delete_appointment(self, corretor):
        r = corretor.delete(f"{BASE}/api/appointments/{TestAppointments.appt_id}")
        assert r.status_code == 200
        # verify
        r2 = corretor.get(f"{BASE}/api/appointments")
        ids = [a["id"] for a in r2.json()]
        assert TestAppointments.appt_id not in ids


# -------- Ranking opt-out --------
class TestRankingToggle:
    def test_toggle_corretor_ranking(self, master):
        # find a corretor
        r = master.get(f"{BASE}/api/corretores")
        assert r.status_code == 200
        corrs = [c for c in r.json() if c.get("email") == "carlos.teste@brilhantes.com"]
        assert corrs, "carlos.teste corretor not found"
        uid = corrs[0]["user_id"]
        # opt out
        r1 = master.patch(f"{BASE}/api/corretores/{uid}/ranking", json={"participate": False})
        assert r1.status_code == 200
        # verify removed from /api/ranking
        rk = master.get(f"{BASE}/api/ranking").json()
        names = {(x.get("name") or "").lower() for x in rk}
        assert "carlão" not in names and "carlos teste" not in names
        # re-add
        r2 = master.patch(f"{BASE}/api/corretores/{uid}/ranking", json={"participate": True})
        assert r2.status_code == 200


# -------- Export com colunas --------
class TestExport:
    def test_xlsx_all_cols(self, master):
        r = master.get(f"{BASE}/api/export/xlsx", params={"year": 2026})
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        assert len(r.content) > 500

    def test_xlsx_filtered_cols(self, master):
        cols = "Data||Loteamento||Valor da venda"
        r = master.get(f"{BASE}/api/export/xlsx", params={"year": 2026, "columns": cols})
        assert r.status_code == 200
        # inspect xlsx header row
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(r.content))
        ws = wb.active
        headers = [c.value for c in ws[1]]
        assert headers == ["Data", "Loteamento", "Valor da venda"]

    def test_pdf_filtered_cols(self, master):
        r = master.get(f"{BASE}/api/export/pdf",
                       params={"year": 2026, "columns": "Data||Cliente||Status"})
        assert r.status_code == 200
        assert r.headers.get("content-type") == "application/pdf"
        assert r.content[:4] == b"%PDF"


# -------- Loteamento details / specs --------
class TestLotDetails:
    original = None

    def test_get_details(self, master):
        r = master.get(f"{BASE}/api/loteamentos/{LOT_ID}/details")
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == LOT_ID
        assert "specs" in d
        TestLotDetails.original = d

    def test_put_structured_specs(self, master):
        payload = {
            "fields": [{"id": "", "label": "Observação", "value": "TEST_val"}],
            "copy": "", "ai_training": TestLotDetails.original.get("ai_training") or "",
            "specs": {
                "tecnicos": {"tipo": "fechado", "metragem_min": "250 m²", "liberacao_pct": "30"},
                "infraestrutura": {"items": ["Água", "Energia elétrica", "Portaria", "Área de lazer", "Piscina"], "outro": ""},
                "obra": {"status": "fase_final", "previsao": "dez/2026"},
                "comercial": {
                    "correcao": "ipca",
                    "juros": "com", "juros_pct": "1.2", "juros_tipo": "nao_embutidos",
                    "balao": "possui", "baloes_qtd": "2", "baloes_valor": "5000"
                }
            }
        }
        r = master.put(f"{BASE}/api/loteamentos/{LOT_ID}/details", json=payload)
        assert r.status_code == 200
        # verify persistence
        r2 = master.get(f"{BASE}/api/loteamentos/{LOT_ID}/details")
        d = r2.json()
        assert d["specs"]["tecnicos"]["tipo"] == "fechado"
        assert "Piscina" in d["specs"]["infraestrutura"]["items"]
        assert d["specs"]["obra"]["status"] == "fase_final"
        assert d["specs"]["comercial"]["juros"] == "com"
        assert d["specs"]["comercial"]["balao"] == "possui"
        assert d.get("details_updated_at")

    def test_put_requires_master(self, corretor):
        r = corretor.put(f"{BASE}/api/loteamentos/{LOT_ID}/details",
                         json={"fields": [], "copy": "", "ai_training": "", "specs": {}})
        assert r.status_code in (401, 403)


# -------- Copy por canal (OpenAI) --------
class TestCopy:
    results = {}

    @pytest.mark.parametrize("channel", ["stories", "feed", "whatsapp"])
    def test_generate_copy(self, master, channel):
        r = master.post(f"{BASE}/api/loteamentos/{LOT_ID}/generate-copy",
                        params={"channel": channel}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["channel"] == channel
        assert isinstance(d["copy"], str) and len(d["copy"]) > 20
        TestCopy.results[channel] = d["copy"]

    def test_copies_are_distinct(self, master):
        s = TestCopy.results.get("stories", "")
        f = TestCopy.results.get("feed", "")
        w = TestCopy.results.get("whatsapp", "")
        if s and f and w:
            assert not (s == f == w), "Copies iguais entre canais"


# -------- Galeria --------
class TestGallery:
    img_id = None

    def test_upload_image(self, master):
        # 1x1 PNG
        png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
               b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf"
               b"\xc0\x00\x00\x00\x03\x00\x01\xd7c~\x9c\x00\x00\x00\x00IEND\xaeB`\x82")
        files = {"file": (f"TEST_{uuid.uuid4().hex[:6]}.png", png, "image/png")}
        data = {"type": "foto", "caption": "TEST_frente"}
        r = master.post(f"{BASE}/api/loteamentos/{LOT_ID}/images", files=files, data=data)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["type"] == "foto"
        assert d["caption"] == "TEST_frente"
        TestGallery.img_id = d["id"]

    def test_list_images(self, master):
        r = master.get(f"{BASE}/api/loteamentos/{LOT_ID}/images")
        assert r.status_code == 200
        ids = [i["id"] for i in r.json()]
        assert TestGallery.img_id in ids

    def test_raw_image(self, master):
        r = master.get(f"{BASE}/api/loteamentos/images/{TestGallery.img_id}/raw")
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/")

    def test_delete_image(self, master):
        r = master.delete(f"{BASE}/api/loteamentos/images/{TestGallery.img_id}")
        assert r.status_code == 200
        r2 = master.delete(f"{BASE}/api/loteamentos/images/{TestGallery.img_id}")
        assert r2.status_code == 404


# -------- IA especialista --------
class TestAI:
    def test_ai_responds(self, corretor):
        r = corretor.post(f"{BASE}/api/loteamentos/{LOT_ID}/ai",
                          json={"message": "Qual a metragem mínima dos lotes?", "history": []},
                          timeout=60)
        assert r.status_code == 200, r.text
        assert isinstance(r.json().get("answer"), str)
        assert len(r.json()["answer"]) > 5

    def test_ai_refuses_unknown(self, corretor):
        r = corretor.post(f"{BASE}/api/loteamentos/{LOT_ID}/ai",
                          json={"message": "Qual o nome do síndico?", "history": []},
                          timeout=60)
        assert r.status_code == 200
        ans = r.json()["answer"].lower()
        # Should mention it's not informed / ask gestor
        assert any(k in ans for k in ["não foi informad", "nao foi informad", "gestor",
                                       "não dispon", "nao dispon", "não consta", "nao consta"])


# -------- Import AI preview com column_mapping --------
class TestImportAI:
    def test_preview_returns_column_mapping(self, master):
        csv = (
            "Loteamento,Quadra,Lote,Cliente,Valor,Corretor,Data\n"
            "Casa Praia Grande,A,99,TEST_Cliente Preview,100000,Carlão,2026-01-10\n"
        )
        files = {"file": ("TEST_preview.csv", csv.encode("utf-8"), "text/csv")}
        r = master.post(f"{BASE}/api/sales/import-ai/preview", files=files, timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "rows" in d and "column_mapping" in d
        assert isinstance(d["column_mapping"], dict)
        # should map Cliente -> client_name at least
        mapped_fields = {v.get("field") for v in d["column_mapping"].values()}
        assert "client_name" in mapped_fields or "property_name" in mapped_fields


# -------- Birthdays com telefone (p/ WhatsApp UI) --------
class TestBirthdays:
    def test_birthdays_structure(self, master):
        import datetime as dt
        now = dt.date.today()
        r = master.get(f"{BASE}/api/clients/birthdays", params={"month": now.month})
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # each entry (if any) must contain name field; phone optional
        for b in data:
            assert "name" in b
