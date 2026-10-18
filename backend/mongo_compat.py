"""
MongoDB compatibility layer on top of Supabase REST API (PostgREST).
Provides a Motor-like async interface so server.py endpoint code
needs minimal changes.
"""
import json
import os
import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional

import aiohttp

_session: Optional[aiohttp.ClientSession] = None
_base_url: str = ""
_api_key: str = ""

def _load_config():
    global _base_url, _api_key
    if not _base_url:
        _base_url = os.environ.get("VITE_SUPABASE_URL", "").rstrip("/")
        _api_key = os.environ.get("VITE_SUPABASE_ANON_KEY", "")
        if not _base_url or not _api_key:
            raise RuntimeError("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY")

async def get_session() -> aiohttp.ClientSession:
    global _session
    _load_config()
    # aiohttp sessions are bound to the event loop that created them.
    # If the loop changed (e.g. TestClient), recreate the session.
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if _session is not None and not _session.closed:
        try:
            if loop and _session._loop is not loop:
                await _session.close()
                _session = None
        except Exception:
            _session = None
    if _session is None or _session.closed:
        _session = aiohttp.ClientSession(
            headers={"apikey": _api_key, "Authorization": f"Bearer {_api_key}"},
            timeout=aiohttp.ClientTimeout(total=120),
        )
    return _session

async def close_session():
    global _session
    if _session and not _session.closed:
        await _session.close()
        _session = None

# ---- JSONB helpers ----

def _jsonb_parse(val: Any) -> Any:
    if val is None:
        return None
    if isinstance(val, (dict, list)):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            return val
    return val

# MongoDB field name mappings per table
_MONGO_MAPS: Dict[str, dict] = {
    "user_sessions": {"session_token": "token"},
    "login_attempts": {"count": "attempts"},
    "loteamentos": {"order": "sort_order"},
}

# Tables where all non-id fields are stored inside `usage` JSONB
_FLAT_JSONB_TABLES = {"app_settings"}

def _pg_field(table: str, field: str) -> str:
    return _MONGO_MAPS.get(table, {}).get(field, field)

def _mongo_field(table: str, field: str) -> str:
    mapping = _MONGO_MAPS.get(table, {})
    for m, p in mapping.items():
        if field == p:
            return m
    return field

# ---- Query translator: MongoDB query dict -> PostgREST filter params ----

def _build_filters(table: str, query: dict) -> List[str]:
    """Translate MongoDB query to PostgREST filter strings."""
    filters = []
    for key, val in query.items():
        if key == "$or":
            or_parts = []
            for cond in val:
                sub_filters = _build_filters(table, cond)
                or_parts.extend(sub_filters)
            if or_parts:
                filters.append(f"or={','.join(or_parts)}")
            continue
        if key == "$and":
            for cond in val:
                filters.extend(_build_filters(table, cond))
            continue
        if key.startswith("$"):
            continue

        field = _pg_field(table, key)

        if val is None:
            filters.append(f"{field}=is.null")
            continue

        if isinstance(val, dict):
            for op, opval in val.items():
                if op == "$gte":
                    filters.append(f"{field}=gte.{opval}")
                elif op == "$gt":
                    filters.append(f"{field}=gt.{opval}")
                elif op == "$lte":
                    filters.append(f"{field}=lte.{opval}")
                elif op == "$lt":
                    filters.append(f"{field}=lt.{opval}")
                elif op == "$ne":
                    if opval is None:
                        filters.append(f"{field}=not.is.null")
                    else:
                        filters.append(f"{field}=neq.{opval}")
                elif op == "$in":
                    vals = [str(v) for v in opval if v is not None]
                    if vals:
                        filters.append(f"{field}=in.({','.join(vals)})")
                elif op == "$nin":
                    vals = [str(v) for v in opval if v is not None]
                    if vals:
                        filters.append(f"{field}=not.in.({','.join(vals)})")
                elif op == "$regex":
                    filters.append(f"{field}=ilike.%{opval}%")
                elif op == "$exists":
                    if opval:
                        filters.append(f"{field}=not.is.null")
                    else:
                        filters.append(f"{field}=is.null")
        else:
            if val is True:
                filters.append(f"{field}=is.true")
            elif val is False:
                filters.append(f"{field}=is.false")
            elif isinstance(val, str):
                # For JSONB array fields, use cs (contains) for string match
                # But for regular text fields, use eq
                filters.append(f"{field}=eq.{val}")
            elif isinstance(val, (int, float)):
                filters.append(f"{field}=eq.{val}")
            else:
                filters.append(f"{field}=eq.{json.dumps(val)}")

    return filters


def _transform_row(table: str, row: dict) -> dict:
    """Transform a REST API row: parse JSONB, map PG field names to MongoDB names."""
    if not row:
        return row

    # For flat_jsonb tables (app_settings), merge usage into top-level
    if table in _FLAT_JSONB_TABLES and "usage" in row:
        usage = row.pop("usage") or {}
        if isinstance(usage, str):
            usage = _jsonb_parse(usage)
        if isinstance(usage, dict):
            row = {**row, **usage}
        else:
            row["usage"] = usage

    # Map PG column names back to MongoDB names
    result = {}
    for k, v in row.items():
        result[_mongo_field(table, k)] = v
    return result


def _clean_doc(table: str, doc: dict) -> dict:
    """Prepare a document for insert/update: map MongoDB field names to PG, handle flat_jsonb."""
    pg_doc = {}
    for k, v in doc.items():
        pg_key = _pg_field(table, k)
        pg_doc[pg_key] = v

    if table in _FLAT_JSONB_TABLES:
        # Merge all non-id fields into usage
        settings_id = pg_doc.pop("id", None)
        usage = {k: v for k, v in pg_doc.items()}
        result = {}
        if settings_id is not None:
            result["id"] = settings_id
        result["usage"] = usage
        return result

    return pg_doc


def _build_set_for_update(table: str, set_ops: dict) -> dict:
    """Build the update body from $set, handling dotted JSONB fields and flat_jsonb."""
    if table in _FLAT_JSONB_TABLES:
        # Merge all $set values into usage JSONB
        pg_set = {}
        for k, v in set_ops.items():
            pg_key = _pg_field(table, k)
            pg_set[pg_key] = v
        return {"usage": pg_set}

    result = {}
    for field, val in set_ops.items():
        pg_field = _pg_field(table, field.split(".")[0])

        # Skip dotted array element updates (handled by read-modify-write)
        if ".$" in field:
            continue

        # Handle nested JSONB updates (e.g., "specs.localizacao.cidade")
        if "." in field:
            # We need to read-modify-write for nested JSONB updates
            # Mark these for later handling
            result[f"__nested__{pg_field}"] = (field, val)
            continue

        result[pg_field] = val

    return result


# ---- Cursor (for .find().sort().to_list() chaining) ----

class Cursor:
    def __init__(self, table: str, query: dict, projection: Optional[dict] = None):
        self.table = table
        self.query = query or {}
        self.projection = projection
        self._sort: Optional[list] = None
        self._limit: int = 0

    def sort(self, field: str, direction: int = 1) -> "Cursor":
        if self._sort is None:
            self._sort = []
        pg_field = _pg_field(self.table, field)
        self._sort.append(f"{pg_field}.{'asc' if direction == 1 else 'desc'}")
        return self

    def limit(self, n: int) -> "Cursor":
        self._limit = n
        return self

    async def to_list(self, length: int = 0) -> List[dict]:
        session = await get_session()
        url = f"{_base_url}/rest/v1/{self.table}"
        params = []

        # Build filter params
        filters = _build_filters(self.table, self.query)
        for f in filters:
            params.append(("or", f[3:]) if f.startswith("or=") else (f.split("=")[0], f.split("=", 1)[1]))

        # Actually, PostgREST uses query params differently
        # Each filter is its own query param
        query_params = []
        for f in filters:
            if f.startswith("or="):
                query_params.append(("or", f[3:]))
            else:
                col, _, val = f.partition("=")
                query_params.append((col, val))

        # Sorting
        if self._sort:
            query_params.append(("order", ",".join(self._sort)))

        # Limit
        lim = self._limit or length
        if lim and lim > 0:
            query_params.append(("limit", str(lim)))

        # Projection
        if self.projection:
            includes = [k for k, v in self.projection.items() if v == 1 and k != "_id"]
            if includes:
                pg_includes = [_pg_field(self.table, k) for k in includes]
                query_params.append(("select", ",".join(pg_includes)))

        async with session.get(url, params=query_params) as resp:
            if resp.status != 200:
                text = await resp.text()
                raise RuntimeError(f"REST API error {resp.status}: {text}")
            rows = await resp.json()

        return [_transform_row(self.table, r) for r in rows]


class Collection:
    """Motor-like collection wrapper around Supabase REST API."""

    def __init__(self, table: str):
        self.table = table

    async def find_one(self, query: dict, projection: Optional[dict] = None) -> Optional[dict]:
        session = await get_session()
        url = f"{_base_url}/rest/v1/{self.table}"

        query_params = []
        filters = _build_filters(self.table, query)
        for f in filters:
            if f.startswith("or="):
                query_params.append(("or", f[3:]))
            else:
                col, _, val = f.partition("=")
                query_params.append((col, val))

        query_params.append(("limit", "1"))

        if projection:
            includes = [k for k, v in projection.items() if v == 1 and k != "_id"]
            if includes:
                pg_includes = [_pg_field(self.table, k) for k in includes]
                query_params.append(("select", ",".join(pg_includes)))

        async with session.get(url, params=query_params) as resp:
            if resp.status != 200:
                text = await resp.text()
                raise RuntimeError(f"REST API error {resp.status}: {text}")
            rows = await resp.json()

        if not rows:
            return None
        return _transform_row(self.table, rows[0])

    def find(self, query: dict = None, projection: Optional[dict] = None) -> Cursor:
        return Cursor(self.table, query or {}, projection)

    async def count_documents(self, query: dict) -> int:
        session = await get_session()
        url = f"{_base_url}/rest/v1/{self.table}"

        query_params = []
        filters = _build_filters(self.table, query)
        for f in filters:
            if f.startswith("or="):
                query_params.append(("or", f[3:]))
            else:
                col, _, val = f.partition("=")
                query_params.append((col, val))

        headers = {"Prefer": "count=exact", "Range": "0-0"}
        async with session.get(url, params=query_params, headers=headers) as resp:
            range_header = resp.headers.get("content-range", "")
            if "/" in range_header:
                return int(range_header.split("/")[-1])
            return 0

    async def distinct(self, field: str, query: dict = None) -> List[Any]:
        pg_field = _pg_field(self.table, field)
        session = await get_session()
        url = f"{_base_url}/rest/v1/{self.table}"

        query_params = [("select", pg_field)]
        if query:
            filters = _build_filters(self.table, query)
            for f in filters:
                if f.startswith("or="):
                    query_params.append(("or", f[3:]))
                else:
                    col, _, val = f.partition("=")
                    query_params.append((col, val))

        async with session.get(url, params=query_params) as resp:
            if resp.status != 200:
                return []
            rows = await resp.json()

        vals = [r.get(pg_field) for r in rows if r.get(pg_field) is not None]
        # Deduplicate
        seen = set()
        result = []
        for v in vals:
            key = json.dumps(v, default=str) if not isinstance(v, (str, int, float, bool)) else v
            if key not in seen:
                seen.add(key)
                result.append(v)
        return result

    async def insert_one(self, doc: dict) -> dict:
        pg_doc = _clean_doc(self.table, doc)
        session = await get_session()
        url = f"{_base_url}/rest/v1/{self.table}"

        headers = {"Prefer": "return=minimal"}
        async with session.post(url, json=pg_doc, headers=headers) as resp:
            if resp.status not in (200, 201):
                text = await resp.text()
                raise RuntimeError(f"Insert error {resp.status}: {text}")
        return doc

    async def insert_many(self, docs: List[dict]):
        for doc in docs:
            await self.insert_one(doc)

    async def update_one(self, query: dict, update: dict, upsert: bool = False):
        await self._update(query, update, upsert=upsert, many=False)

    async def update_many(self, query: dict, update: dict):
        await self._update(query, update, many=True)

    async def _update(self, query: dict, update: dict, upsert: bool = False, many: bool = False):
        set_ops = update.get("$set", {})
        unset_ops = update.get("$unset", {})
        inc_ops = update.get("$inc", {})
        push_ops = update.get("$push", {})
        pull_ops = update.get("$pull", {})

        # Handle $push/$pull via read-modify-write
        if push_ops or pull_ops:
            await self._array_update(query, push_ops, pull_ops)

        # Handle regular $set
        if set_ops:
            # Separate regular updates from nested/dotted JSONB updates
            nested_updates = {}
            regular_set = {}
            for field, val in set_ops.items():
                if ".$" in field:
                    # Array element update - needs read-modify-write
                    await self._array_element_update(query, {field: val})
                    continue
                if "." in field:
                    pg_field = _pg_field(self.table, field.split(".")[0])
                    nested_updates[field] = val
                    continue
                regular_set[_pg_field(self.table, field)] = val

            if regular_set:
                body = _build_set_for_update(self.table, regular_set) if self.table in _FLAT_JSONB_TABLES else regular_set
                await self._patch(query, body, many)

            if nested_updates:
                await self._nested_update(query, nested_updates)

        # Handle $inc
        for field, val in (inc_ops or {}).items():
            pg_field = _pg_field(self.table, field)
            # Read current value, add, write back
            doc = await self.find_one(query, {pg_field: 1})
            if doc:
                current = doc.get(_mongo_field(self.table, pg_field), 0) or 0
                new_val = current + val
                await self._patch(query, {pg_field: new_val}, many)

        # Handle $unset
        if unset_ops:
            unset_body = {}
            for field in unset_ops:
                pg_field = _pg_field(self.table, field.split(".")[0])
                if "." in field and pg_field not in _FLAT_JSONB_TABLES:
                    # Delete key from JSONB - needs read-modify-write
                    await self._nested_unset(query, field)
                else:
                    unset_body[pg_field] = None
            if unset_body:
                await self._patch(query, unset_body, many)

        # Handle upsert
        if upsert:
            count = await self.count_documents(query)
            if count == 0:
                # Build insert from query + set values
                doc = dict(query)
                doc.update(set_ops)
                # Remove MongoDB operators from query
                for k in list(doc.keys()):
                    if k.startswith("$"):
                        doc.pop(k)
                try:
                    await self.insert_one(doc)
                except Exception:
                    pass

    async def _patch(self, query: dict, body: dict, many: bool = False):
        """Send a PATCH to PostgREST to update matching rows."""
        session = await get_session()
        url = f"{_base_url}/rest/v1/{self.table}"

        query_params = []
        filters = _build_filters(self.table, query)
        for f in filters:
            if f.startswith("or="):
                query_params.append(("or", f[3:]))
            else:
                col, _, val = f.partition("=")
                query_params.append((col, val))

        if not many:
            query_params.append(("limit", "1"))

        headers = {"Prefer": "return=minimal"}
        async with session.patch(url, json=body, params=query_params, headers=headers) as resp:
            if resp.status not in (200, 204):
                text = await resp.text()
                raise RuntimeError(f"Update error {resp.status}: {text}")

    async def _nested_update(self, query: dict, nested_updates: dict):
        """Handle dotted JSONB field updates like specs.localizacao.cidade via read-modify-write."""
        # Group by top-level field
        by_field = {}
        for field, val in nested_updates.items():
            parts = field.split(".")
            pg_field = _pg_field(self.table, parts[0])
            if pg_field not in by_field:
                by_field[pg_field] = {}
            # Set nested value in the dict
            current = by_field[pg_field]
            for p in parts[1:-1]:
                if p not in current:
                    current[p] = {}
                current = current[p]
            current[parts[-1]] = val

        # Read-modify-write for each field
        for pg_field, changes in by_field.items():
            doc = await self.find_one(query, {_mongo_field(self.table, pg_field): 1})
            if not doc:
                continue
            current = doc.get(_mongo_field(self.table, pg_field), {}) or {}
            if isinstance(current, str):
                current = _jsonb_parse(current) or {}
            # Deep merge changes into current
            def deep_merge(base, updates):
                for k, v in updates.items():
                    if isinstance(v, dict) and isinstance(base.get(k), dict):
                        deep_merge(base[k], v)
                    else:
                        base[k] = v
                return base
            merged = deep_merge(dict(current) if isinstance(current, dict) else {}, changes)
            await self._patch(query, {pg_field: merged})

    async def _nested_unset(self, query: dict, field: str):
        """Remove a key from a JSONB object."""
        parts = field.split(".")
        pg_field = _pg_field(self.table, parts[0])
        key = parts[-1]
        doc = await self.find_one(query, {_mongo_field(self.table, pg_field): 1})
        if not doc:
            return
        current = doc.get(_mongo_field(self.table, pg_field), {}) or {}
        if isinstance(current, str):
            current = _jsonb_parse(current) or {}
        if isinstance(current, dict):
            # Navigate to parent and delete key
            d = current
            for p in parts[1:-1]:
                if isinstance(d, dict) and p in d:
                    d = d[p]
                else:
                    return
            d.pop(key, None)
            await self._patch(query, {pg_field: current})

    async def _array_update(self, query: dict, push_ops: dict, pull_ops: dict):
        """Handle $push and $pull on JSONB arrays via read-modify-write."""
        fields = set()
        for f in push_ops:
            fields.add(_pg_field(self.table, f.split(".")[0]))
        for f in pull_ops:
            fields.add(_pg_field(self.table, f.split(".")[0]))

        select_fields = ",".join(list(fields))
        docs = await self.find(query, {f: 1 for f in [_mongo_field(self.table, fld) for fld in fields]})

        for doc in docs:
            updates = {}
            for field, val in push_ops.items():
                pg_field = _pg_field(self.table, field.split(".")[0])
                current = doc.get(_mongo_field(self.table, pg_field)) or []
                if isinstance(current, list):
                    current = list(current)
                    current.append(val)
                    updates[pg_field] = current
            for field, condition in pull_ops.items():
                pg_field = _pg_field(self.table, field.split(".")[0])
                current = doc.get(_mongo_field(self.table, pg_field)) or []
                if isinstance(current, list):
                    if isinstance(condition, dict):
                        new_list = []
                        for item in current:
                            if isinstance(item, dict):
                                if not all(item.get(k) == v for k, v in condition.items()):
                                    new_list.append(item)
                            else:
                                new_list.append(item)
                        updates[pg_field] = new_list
                    else:
                        updates[pg_field] = [x for x in current if x != condition]

            if updates:
                # Update by primary key
                pk = doc.get("id") or doc.get("user_id")
                if pk:
                    pk_field = "id" if "id" in doc else "user_id"
                    await self._patch({pk_field: pk}, updates)

    async def _array_element_update(self, query: dict, updates: dict):
        """Handle array element updates like 'copies.$.category' via read-modify-write."""
        fields = set()
        for f in updates:
            pg_field = _pg_field(self.table, f.split(".$")[0])
            fields.add(pg_field)

        docs = await self.find(query, {f: 1 for f in [_mongo_field(self.table, fld) for fld in fields]})

        for doc in docs:
            updates_body = {}
            for field, val in updates.items():
                parts = field.split(".$.", 1)
                pg_field = _pg_field(self.table, parts[0])
                sub_field = parts[1] if len(parts) > 1 else None
                current = doc.get(_mongo_field(self.table, pg_field)) or []
                if not isinstance(current, list):
                    continue

                # Extract query filter for matching array elements
                query_filter = {}
                for qk, qv in query.items():
                    if qk.startswith(parts[0] + ".") and qk != parts[0]:
                        query_filter[qk.split(".", 1)[1]] = qv

                updated = False
                for item in current:
                    if isinstance(item, dict):
                        matches = all(item.get(k) == v for k, v in query_filter.items()) if query_filter else True
                        if matches and sub_field:
                            item[sub_field] = val
                            updated = True

                if updated:
                    updates_body[pg_field] = current

            if updates_body:
                pk = doc.get("id") or doc.get("user_id")
                if pk:
                    pk_field = "id" if "id" in doc else "user_id"
                    await self._patch({pk_field: pk}, updates_body)

    async def delete_one(self, query: dict):
        session = await get_session()
        url = f"{_base_url}/rest/v1/{self.table}"

        query_params = []
        filters = _build_filters(self.table, query)
        for f in filters:
            if f.startswith("or="):
                query_params.append(("or", f[3:]))
            else:
                col, _, val = f.partition("=")
                query_params.append((col, val))
        query_params.append(("limit", "1"))

        async with session.delete(url, params=query_params) as resp:
            if resp.status not in (200, 204):
                text = await resp.text()
                raise RuntimeError(f"Delete error {resp.status}: {text}")

    async def delete_many(self, query: dict):
        session = await get_session()
        url = f"{_base_url}/rest/v1/{self.table}"

        query_params = []
        filters = _build_filters(self.table, query)
        for f in filters:
            if f.startswith("or="):
                query_params.append(("or", f[3:]))
            else:
                col, _, val = f.partition("=")
                query_params.append((col, val))

        async with session.delete(url, params=query_params) as resp:
            if resp.status not in (200, 204):
                text = await resp.text()
                raise RuntimeError(f"Delete error {resp.status}: {text}")

    async def find_one_and_update(self, query: dict, update: dict,
                                   projection: Optional[dict] = None,
                                   return_document: bool = False) -> Optional[dict]:
        """Find a document, update it, and return the updated document."""
        # First find the doc
        doc = await self.find_one(query)
        if not doc:
            return None

        # Apply the update
        await self._update(query, update)

        # Return the updated doc
        return await self.find_one(query, projection)


class Database:
    """Motor-like database wrapper."""

    def __getattr__(self, name: str) -> Collection:
        return Collection(name)

    def __getitem__(self, key: str) -> Collection:
        return Collection(key)


db = Database()
