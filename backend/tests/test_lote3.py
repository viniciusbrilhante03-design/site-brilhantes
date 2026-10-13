"""Lote 3 features: (A) Audit log, (B) Duplicate warning on sale creation,
(C) Multi-level goal threshold notifications (50/75/90/100%),
(D) Overdue/due-soon installment commission notifications via cron."""
import os
import time
import uuid
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE}/api"

MASTER_TOKEN = "qa_session_vinicius_001"
CRON_SECRET = "b9f3c1a27e4d48f6a0c5d2e8b7146f93aa21c64d9e0f3b5c7d81a2e4f6097c3b1"
CORRETOR_EMAIL = "carlos.teste@brilhantes.com"
CORRETOR_PASSWORD = "12345678900"


@pytest.fixture(scope="module")
def master():
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {MASTER_TOKEN}"})
    return s


@pytest.fixture(scope="module")
def corretor():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": CORRETOR_EMAIL, "password": CORRETOR_PASSWORD})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def lot_name(master):
    lots = master.get(f"{API}/loteamentos").json()
    if lots:
        return lots[0]["name"]
    # create one
    r = master.post(f"{API}/loteamentos", json={"name": "Loteamento QA Lote3"})
    assert r.status_code in (200, 201)
    return "Loteamento QA Lote3"


def _sale_payload(lot, **kw):
    base = {
        "property_name": lot,
        "quadra": "55", "lote": "55",
        "client_name": "TEST_DupClient",
        "sale_value": 80000.0,
        "commission_rate": 5.0,
        "sale_date": "2026-10-21",
        "broker_name": "Carlos Teste",
        "brokers": [{"name": "Carlos Teste", "split_pct": 100.0}],
    }
    base.update(kw)
    return base


# ---------- (B) DUPLICATE WARNING ----------
class TestDuplicateSale:
    def test_duplicate_returns_409(self, corretor, lot_name):
        tag = uuid.uuid4().hex[:6]
        p = _sale_payload(lot_name, quadra=f"D{tag}", lote=f"L{tag}",
                          client_name=f"TEST_Dup_{tag}", broker_name="Carlos Teste")
        r1 = corretor.post(f"{API}/sales", json=p)
        assert r1.status_code in (200, 201), r1.text
        sid1 = r1.json()["id"]
        try:
            # second identical POST should 409
            r2 = corretor.post(f"{API}/sales", json=p)
            assert r2.status_code == 409, f"expected 409, got {r2.status_code}: {r2.text}"
            assert "igual" in (r2.json().get("detail", "").lower() or "")

            # With force=true -> 200/201 and persisted
            r3 = corretor.post(f"{API}/sales?force=true", json=p)
            assert r3.status_code in (200, 201), r3.text
            sid2 = r3.json()["id"]
            assert sid2 != sid1
            corretor.delete(f"{API}/sales/{sid2}")
        finally:
            corretor.delete(f"{API}/sales/{sid1}")

    def test_different_quadra_not_duplicate(self, corretor, lot_name):
        tag = uuid.uuid4().hex[:6]
        p1 = _sale_payload(lot_name, quadra=f"X{tag}", lote=f"Y{tag}",
                           client_name=f"TEST_NotDup_{tag}")
        p2 = {**p1, "quadra": f"X{tag}B"}  # different quadra -> not duplicate
        r1 = corretor.post(f"{API}/sales", json=p1); assert r1.status_code in (200, 201)
        r2 = corretor.post(f"{API}/sales", json=p2); assert r2.status_code in (200, 201)
        try:
            # second created normally, no 409
            assert r2.status_code != 409
        finally:
            corretor.delete(f"{API}/sales/{r1.json()['id']}")
            corretor.delete(f"{API}/sales/{r2.json()['id']}")


# ---------- (A) AUDIT ----------
class TestAudit:
    def test_audit_requires_master(self, corretor):
        r = corretor.get(f"{API}/audit")
        assert r.status_code in (401, 403)

    def test_audit_entries_created_edited_deleted(self, master, corretor, lot_name):
        tag = uuid.uuid4().hex[:6]
        # CREATE
        p = _sale_payload(lot_name, quadra=f"A{tag}", lote=f"A{tag}",
                          client_name=f"TEST_Audit_{tag}")
        r = corretor.post(f"{API}/sales", json=p); assert r.status_code in (200, 201)
        sale_id = r.json()["id"]

        try:
            time.sleep(0.5)
            audit = master.get(f"{API}/audit").json()
            top = audit[0]
            assert top["action"] == "create"
            assert top["sale_id"] == sale_id
            assert top.get("by")  # author populated
            assert top.get("at")  # timestamp populated

            # UPDATE
            upd = {**p, "sale_value": 90000.0}
            r2 = corretor.put(f"{API}/sales/{sale_id}", json=upd)
            assert r2.status_code == 200, r2.text
            time.sleep(0.5)
            audit = master.get(f"{API}/audit").json()
            # Latest should be an update for this sale
            assert any(a["action"] == "update" and a["sale_id"] == sale_id for a in audit[:5])

            # TRANSFER (master only)
            brs = master.get(f"{API}/corretores").json()
            other = next((b for b in brs if (b.get("war_name") or b.get("full_name")) and
                          (b.get("war_name") or b.get("full_name")) != "Carlos Teste"), None)
            if other:
                tgt = other.get("war_name") or other.get("full_name")
                rt = master.post(f"{API}/sales/{sale_id}/transfer", json={"broker_name": tgt})
                assert rt.status_code == 200, rt.text
                time.sleep(0.5)
                audit = master.get(f"{API}/audit").json()
                assert any(a["action"] == "transfer" and a["sale_id"] == sale_id for a in audit[:5])
        finally:
            # DELETE
            dr = master.delete(f"{API}/sales/{sale_id}")
            assert dr.status_code == 200
            time.sleep(0.5)
            audit = master.get(f"{API}/audit").json()
            assert any(a["action"] == "delete" and a["sale_id"] == sale_id for a in audit[:10])


# ---------- (C) MULTI-LEVEL GOAL NOTIFICATIONS ----------
class TestGoalNotifications:
    def test_goal_thresholds_50_75_90_100(self, master, corretor, lot_name):
        # Find Carlos user_id from /corretores
        brs = master.get(f"{API}/corretores").json()
        carlos = next((b for b in brs if (b.get("email") or "").lower() == CORRETOR_EMAIL), None)
        if not carlos:
            pytest.skip("Carlos corretor not found")
        oid = carlos["user_id"]

        # Create a tiny broker VGV goal to easily cross thresholds
        target = 100000.0  # small target
        goal = master.post(f"{API}/goals", json={
            "scope": "broker", "owner_id": oid, "metric": "vgv",
            "target": target, "month": 10, "year": 2026,
        })
        assert goal.status_code in (200, 201), goal.text
        goal_id = goal.json()["id"]

        created_sales = []
        try:
            # Sale 1: 55k -> 55% (crosses 50%)
            p1 = _sale_payload(lot_name, quadra="G1", lote=uuid.uuid4().hex[:4],
                               client_name="TEST_Goal_50", sale_value=55000.0,
                               sale_date="2026-10-05")
            r = corretor.post(f"{API}/sales", json=p1); assert r.status_code in (200, 201)
            created_sales.append(r.json()["id"])
            time.sleep(1.0)

            notes = corretor.get(f"{API}/notifications").json().get("items", [])
            goal_notes = [n for n in notes if n.get("type") == "goal"]
            assert any("Metade" in n.get("message", "") or "50" in n.get("message", "")
                       for n in goal_notes), f"50% notification missing: {[n['message'] for n in goal_notes[:5]]}"

            # Sale 2: another 25k -> 80% (crosses 75%)
            p2 = _sale_payload(lot_name, quadra="G2", lote=uuid.uuid4().hex[:4],
                               client_name="TEST_Goal_75", sale_value=25000.0,
                               sale_date="2026-10-06")
            r = corretor.post(f"{API}/sales", json=p2); assert r.status_code in (200, 201)
            created_sales.append(r.json()["id"])
            time.sleep(1.0)
            notes = corretor.get(f"{API}/notifications").json().get("items", [])
            goal_notes = [n.get("message", "") for n in notes if n.get("type") == "goal"]
            assert any("75" in m or "firme" in m.lower() for m in goal_notes), \
                f"75% notification missing: {goal_notes[:5]}"

            # Sale 3: another 15k -> 95% (crosses 90%)
            p3 = _sale_payload(lot_name, quadra="G3", lote=uuid.uuid4().hex[:4],
                               client_name="TEST_Goal_90", sale_value=15000.0,
                               sale_date="2026-10-07")
            r = corretor.post(f"{API}/sales", json=p3); assert r.status_code in (200, 201)
            created_sales.append(r.json()["id"])
            time.sleep(1.0)
            notes = corretor.get(f"{API}/notifications").json().get("items", [])
            goal_notes = [n.get("message", "") for n in notes if n.get("type") == "goal"]
            assert any("90" in m or "Falta pouco" in m for m in goal_notes), \
                f"90% notification missing: {goal_notes[:5]}"

            # Sale 4: another 20k -> 115% (crosses 100%)
            p4 = _sale_payload(lot_name, quadra="G4", lote=uuid.uuid4().hex[:4],
                               client_name="TEST_Goal_100", sale_value=20000.0,
                               sale_date="2026-10-08")
            r = corretor.post(f"{API}/sales", json=p4); assert r.status_code in (200, 201)
            created_sales.append(r.json()["id"])
            time.sleep(1.0)
            notes = corretor.get(f"{API}/notifications").json().get("items", [])
            goal_notes = [n.get("message", "") for n in notes if n.get("type") == "goal"]
            assert any("batida" in m.lower() or "100" in m or "🎯" in m for m in goal_notes), \
                f"100% notification missing: {goal_notes[:5]}"
        finally:
            for sid in created_sales:
                master.delete(f"{API}/sales/{sid}")
            master.delete(f"{API}/goals/{goal_id}")


# ---------- (D) OVERDUE INSTALLMENT NOTIFICATIONS ----------
class TestInstallmentCron:
    def test_cron_requires_secret(self):
        r = requests.post(f"{API}/cron/installments")
        assert r.status_code == 401

    def test_cron_with_secret_ok(self):
        r = requests.post(f"{API}/cron/installments",
                          headers={"Authorization": f"Bearer {CRON_SECRET}"})
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_overdue_installment_generates_notification(self, master, corretor, lot_name):
        # Create a parcelado sale with one overdue installment
        tag = uuid.uuid4().hex[:5]
        p = _sale_payload(lot_name,
                          quadra=f"P{tag}", lote=f"P{tag}",
                          client_name=f"TEST_Overdue_{tag}",
                          sale_value=50000.0, sale_date="2026-01-10",
                          parcelado=True,
                          installments=[
                              {"number": 1, "due_date": "2025-01-15",
                               "value": 500.0, "received": False},
                          ])
        r = corretor.post(f"{API}/sales", json=p)
        assert r.status_code in (200, 201), r.text
        sale_id = r.json()["id"]
        try:
            # Baseline master notif count of 'installment' type
            def _count(sess, msg_contains):
                items = sess.get(f"{API}/notifications").json().get("items", [])
                return sum(1 for n in items
                           if n.get("type") == "installment"
                           and msg_contains in n.get("message", "")
                           and (n.get("data") or {}).get("sale_id") == sale_id)

            # Trigger cron
            cr = requests.post(f"{API}/cron/installments",
                               headers={"Authorization": f"Bearer {CRON_SECRET}"})
            assert cr.status_code == 200
            time.sleep(2.0)  # background task

            assert _count(master, "vencida") >= 1, "Master did not receive overdue installment notification"
            assert _count(corretor, "vencida") >= 1, "Corretor did not receive overdue installment notification"
        finally:
            master.delete(f"{API}/sales/{sale_id}")
