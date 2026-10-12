"""Backend tests for BUG 1 (metas visibility) and BUG 2 regression (extract-one still works)."""
import os
import io
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or \
           open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()

MASTER_TOKEN = "qa_session_vinicius_001"
HEADERS = {"Authorization": f"Bearer {MASTER_TOKEN}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def created_ids():
    ids = []
    yield ids
    # Cleanup
    for gid in ids:
        try:
            requests.delete(f"{BASE_URL}/api/goals/{gid}", headers=HEADERS, timeout=20)
        except Exception:
            pass


class TestGoalsVisibilityBug:
    """BUG 1 — GET /api/goals with no month should return ALL goals of the year."""

    def test_cleanup_existing_goals(self, created_ids):
        """Ensure baseline: delete pre-existing goals for 2026 to start clean."""
        r = requests.get(f"{BASE_URL}/api/goals?year=2026", headers=HEADERS, timeout=30)
        assert r.status_code == 200
        for g in r.json():
            requests.delete(f"{BASE_URL}/api/goals/{g['id']}", headers=HEADERS, timeout=20)
        r2 = requests.get(f"{BASE_URL}/api/goals?year=2026", headers=HEADERS, timeout=30)
        assert r2.status_code == 200
        assert r2.json() == []

    def test_create_monthly_goal(self, created_ids):
        payload = {"scope": "company", "metric": "vgv", "target": 5000000, "month": 6, "year": 2026}
        r = requests.post(f"{BASE_URL}/api/goals", headers=HEADERS, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        g = r.json()
        assert g["month"] == 6 and g["year"] == 2026 and g["scope"] == "company"
        assert g["metric"] == "vgv" and g["target"] == 5000000
        created_ids.append(g["id"])

    def test_create_annual_goal(self, created_ids):
        payload = {"scope": "company", "metric": "count", "target": 30, "month": None, "year": 2026}
        r = requests.post(f"{BASE_URL}/api/goals", headers=HEADERS, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        g = r.json()
        assert g["month"] is None and g["year"] == 2026 and g["metric"] == "count"
        created_ids.append(g["id"])

    def test_list_without_month_returns_both(self, created_ids):
        """CORE BUG CHECK: no month param => both monthly + annual goals returned."""
        r = requests.get(f"{BASE_URL}/api/goals?year=2026", headers=HEADERS, timeout=30)
        assert r.status_code == 200
        items = r.json()
        ids = {g["id"] for g in items}
        for gid in created_ids:
            assert gid in ids, f"Goal {gid} missing when no month filter is applied — bug not fixed!"
        months = sorted([g.get("month") for g in items if g["id"] in created_ids], key=lambda x: (x is not None, x))
        assert None in months and 6 in months

    def test_list_with_june_returns_both(self, created_ids):
        r = requests.get(f"{BASE_URL}/api/goals?year=2026&month=6", headers=HEADERS, timeout=30)
        assert r.status_code == 200
        items = r.json()
        ids = {g["id"] for g in items}
        for gid in created_ids:
            assert gid in ids

    def test_list_with_march_returns_only_annual(self, created_ids):
        r = requests.get(f"{BASE_URL}/api/goals?year=2026&month=3", headers=HEADERS, timeout=30)
        assert r.status_code == 200
        items = r.json()
        months = [g.get("month") for g in items if g["id"] in created_ids]
        assert None in months
        assert 6 not in months  # June monthly goal must be filtered out

    def test_goal_progress_fields(self, created_ids):
        r = requests.get(f"{BASE_URL}/api/goals?year=2026", headers=HEADERS, timeout=30)
        for g in r.json():
            assert "current" in g and "pct" in g and "label" in g
            assert isinstance(g["pct"], (int, float))
            assert g["label"] == "Imobiliária"

    def test_delete_all_created(self, created_ids):
        for gid in list(created_ids):
            r = requests.delete(f"{BASE_URL}/api/goals/{gid}", headers=HEADERS, timeout=20)
            assert r.status_code == 200
        created_ids.clear()
        # Verify final state is 0 goals for 2026
        r = requests.get(f"{BASE_URL}/api/goals?year=2026", headers=HEADERS, timeout=30)
        assert r.json() == []


class TestExtractOneRegression:
    """Ensure POST /api/sales/extract-one still responds."""

    def test_extract_one_endpoint_exists(self):
        # Send a tiny text file; endpoint may return extracted dict (possibly empty on non-image).
        files = {"file": ("test.txt", io.BytesIO(b"cliente: TESTE\nvalor: 100000"), "text/plain")}
        r = requests.post(
            f"{BASE_URL}/api/sales/extract-one",
            headers={"Authorization": f"Bearer {MASTER_TOKEN}"},
            files=files,
            timeout=120,
        )
        # Allow 200 or 400/422 (if content type not accepted); just must not be 404/500
        assert r.status_code not in (404, 500, 502, 503), f"Endpoint broken: {r.status_code} {r.text[:200]}"
