# Backend tests for P0 Commissions Report + broker CPF/birthdate + installment receipt
# iteration_13 — tests endpoints added in review request.
import os
import io
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

MASTER_HEADERS = {"Authorization": "Bearer qa_session_vinicius_001"}
CORRETOR_EMAIL = "carlos.teste@brilhantes.com"
CORRETOR_PASS = "12345678900"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def master():
    s = requests.Session()
    s.headers.update(MASTER_HEADERS)
    return s


@pytest.fixture(scope="module")
def corretor():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": CORRETOR_EMAIL, "password": CORRETOR_PASS})
    if r.status_code != 200:
        pytest.skip(f"Corretor login failed: {r.status_code} {r.text}")
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# ---------- /commissions/report ----------
class TestCommissionsReport:
    def test_report_master_shape(self, master):
        r = master.get(f"{API}/commissions/report", params={"year": 2026})
        assert r.status_code == 200, r.text
        data = r.json()
        assert set(["rows", "summary", "can_edit"]).issubset(data.keys())
        assert data["can_edit"] is True
        s = data["summary"]
        for k in ["vendas", "comissao_gerada", "recebida", "a_receber"]:
            assert k in s
        assert isinstance(data["rows"], list)

    def test_report_filter_status_pago(self, master):
        r = master.get(f"{API}/commissions/report", params={"status": "pago"})
        assert r.status_code == 200
        for row in r.json()["rows"]:
            assert row["status_key"] == "pago"

    def test_report_filter_loteamento(self, master):
        all_rows = master.get(f"{API}/commissions/report").json()["rows"]
        if not all_rows:
            pytest.skip("no rows")
        lot = all_rows[0]["Loteamento"]
        r = master.get(f"{API}/commissions/report", params={"loteamento": lot})
        assert r.status_code == 200
        for row in r.json()["rows"]:
            assert row["Loteamento"] == lot

    def test_report_filter_corretor(self, master):
        all_rows = master.get(f"{API}/commissions/report").json()["rows"]
        if not all_rows:
            pytest.skip("no rows")
        corr = next((r["Corretor"] for r in all_rows if r["Corretor"]), None)
        if not corr:
            pytest.skip("no corretor")
        r = master.get(f"{API}/commissions/report", params={"corretor": corr})
        assert r.status_code == 200
        # at least one row should match
        assert any(corr.lower() in (row["Corretor"] or "").lower() for row in r.json()["rows"])

    def test_report_filter_year_month(self, master):
        r = master.get(f"{API}/commissions/report", params={"year": 2026, "month": 1})
        assert r.status_code == 200
        for row in r.json()["rows"]:
            assert row["Data"].endswith("/2026") or row["Data"] == ""

    def test_report_scope_corretor(self, corretor):
        r = corretor.get(f"{API}/commissions/report")
        assert r.status_code == 200
        data = r.json()
        assert data["can_edit"] is False
        # all rows must be the corretor's; just ensure endpoint allowed
        assert isinstance(data["rows"], list)


# ---------- Export ----------
class TestReportExport:
    def test_xlsx(self, master):
        r = master.get(f"{API}/commissions/report/xlsx", params={"year": 2026})
        assert r.status_code == 200
        assert "spreadsheet" in r.headers.get("content-type", "")
        assert len(r.content) > 100

    def test_xlsx_columns_filter(self, master):
        cols = "Data||Loteamento||Comissão"
        r = master.get(f"{API}/commissions/report/xlsx", params={"columns": cols})
        assert r.status_code == 200
        # Parse xlsx header
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(r.content))
            ws = wb.active
            header = [c.value for c in ws[1]]
            assert header == ["Data", "Loteamento", "Comissão"]
        except ImportError:
            pass

    def test_pdf(self, master):
        r = master.get(f"{API}/commissions/report/pdf", params={"year": 2026})
        assert r.status_code == 200
        assert "pdf" in r.headers.get("content-type", "").lower()
        assert r.content[:4] == b"%PDF"


# ---------- PATCH /sales/{id}/commission ----------
class TestEditCommission:
    @pytest.fixture(scope="class")
    def sample_sale(self, master):
        rows = master.get(f"{API}/commissions/report").json()["rows"]
        if not rows:
            pytest.skip("no sales")
        return rows[0]["sale_id"]

    def test_master_patch_and_audit(self, master, sample_sale):
        # read original
        orig = requests.get(f"{API}/sales/{sample_sale}", headers=MASTER_HEADERS)
        # fallback: fetch via list
        orig_rate = None
        orig_discounts = None
        if orig.status_code == 200:
            o = orig.json()
            orig_rate = o.get("commission_rate", 0)
            orig_discounts = o.get("discounts", [])
        # patch with new rate 5 and discount 100
        r = master.patch(f"{API}/sales/{sample_sale}/commission",
                         json={"commission_rate": 5, "discount": 100})
        assert r.status_code == 200, r.text
        res = r.json()
        assert res.get("commission_rate") == 5
        # discounts should include nf_boleto with value 100
        ds = res.get("discounts") or []
        assert any(d.get("type") == "nf_boleto" and d.get("value") == 100 for d in ds)
        # commission_net must equal commission_value - 100
        if res.get("commission_value"):
            assert round(res["commission_value"] - res["commission_net"], 2) == 100.0
        # audit log present
        a = master.get(f"{API}/audit")
        assert a.status_code == 200
        logs = a.json() if isinstance(a.json(), list) else a.json().get("items", [])
        assert any(l.get("action") == "commission_edit" for l in logs[:50])
        # revert
        if orig_rate is not None:
            # strip nf_boleto discounts to restore
            master.patch(f"{API}/sales/{sample_sale}/commission",
                         json={"commission_rate": orig_rate, "discount": 0})

    def test_corretor_forbidden(self, corretor, sample_sale):
        r = corretor.patch(f"{API}/sales/{sample_sale}/commission",
                           json={"commission_rate": 10})
        assert r.status_code in (401, 403)


# ---------- Brokers CPF/birthdate ----------
class TestBrokerCpfBirthdate:
    def test_create_update_get(self, master):
        payload = {"name": "TEST_Corretor_RelReport", "cpf": "11122233344",
                   "birthdate": "1990-05-20", "role": "corretor"}
        r = master.post(f"{API}/brokers", json=payload)
        assert r.status_code in (200, 201), r.text
        b = r.json()
        bid = b.get("id")
        assert b.get("cpf") == "11122233344"
        assert b.get("birthdate") == "1990-05-20"
        # update
        r2 = master.put(f"{API}/brokers/{bid}",
                        json={**payload, "cpf": "99988877766", "birthdate": "1991-06-21"})
        assert r2.status_code == 200
        assert r2.json().get("cpf") == "99988877766"
        assert r2.json().get("birthdate") == "1991-06-21"
        # list and find
        lst = master.get(f"{API}/brokers").json()
        found = next((x for x in lst if x.get("id") == bid), None)
        assert found and found.get("cpf") == "99988877766"
        # cleanup
        master.delete(f"{API}/brokers/{bid}")


# ---------- Installment receipt ----------
class TestInstallmentReceipt:
    def test_baixa_with_receipt(self, master):
        # create a TEST_ sale with installments
        payload = {
            "property_name": "TEST_RelReport_Lot",
            "client_name": "TEST_Cliente_Receipt",
            "broker_name": "Carlão",
            "sale_date": "2026-01-15",
            "sale_value": 100000.0,
            "commission_rate": 6.0,
            "parcelado": True,
            "installments": [
                {"number": 1, "due_date": "2026-02-10", "value": 3000.0},
                {"number": 2, "due_date": "2026-03-10", "value": 3000.0},
            ],
        }
        r = master.post(f"{API}/sales?force=true&force_lot=true", json=payload)
        assert r.status_code in (200, 201), r.text
        sale_id = r.json()["id"]
        n = 1
        receipt_dataurl = "data:text/plain;base64,aGVsbG8="
        r = master.post(f"{API}/sales/{sale_id}/installments/{n}/baixa",
                        json={"amount": 1.0, "method": "pix", "kind": "repasse",
                              "receipt": receipt_dataurl, "receipt_name": "comp.txt"})
        assert r.status_code == 200, r.text
        updated = r.json()
        inst = next(i for i in updated["installments"] if i["number"] == n)
        pay = inst.get("payments", [])[-1]
        assert pay.get("receipt", "").startswith("data:")
        assert pay.get("receipt_name") == "comp.txt"
        # cleanup
        master.delete(f"{API}/sales/{sale_id}")
