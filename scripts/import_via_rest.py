#!/usr/bin/env python3
"""Import MongoDB backup data into Supabase via REST API."""
import json
import os
import sys
import time
import requests

def load_env():
    with open('.env') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ[k] = v

def get_supabase_config():
    url = os.environ.get('VITE_SUPABASE_URL', '').rstrip('/')
    key = os.environ.get('VITE_SUPABASE_ANON_KEY', '')
    if not url or not key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_ANON_KEY")
    return url, key

def to_jsonb(v, default=None):
    if v is None:
        return default if default is not None else {}
    return v

def parse_dt(val):
    if not val:
        return None
    return val

def import_table(base_url, headers, table_name, items, transform_fn, batch_size=50):
    total = len(items)
    imported = 0
    errors = 0

    for i in range(0, total, batch_size):
        batch = items[i:i+batch_size]
        rows = []
        for item in batch:
            row = transform_fn(item)
            if row:
                rows.append(row)

        if not rows:
            continue

        try:
            # Use upsert via POST with on-conflict handling
            # Supabase REST API supports upsert with headers
            upsert_headers = {**headers, 'Prefer': 'resolution=merge-duplicates'}
            resp = requests.post(
                f"{base_url}/rest/v1/{table_name}",
                headers=upsert_headers,
                json=rows,
                timeout=120
            )
            if resp.status_code in (200, 201):
                imported += len(rows)
            else:
                # Try smaller batches
                if batch_size > 10:
                    for j in range(0, len(rows), 10):
                        small_batch = rows[j:j+10]
                        try:
                            resp2 = requests.post(
                                f"{base_url}/rest/v1/{table_name}",
                                headers=upsert_headers,
                                json=small_batch,
                                timeout=120
                            )
                            if resp2.status_code in (200, 201):
                                imported += len(small_batch)
                            else:
                                errors += len(small_batch)
                                print(f"  ERROR batch {i+j}: {resp2.status_code} {resp2.text[:200]}")
                        except Exception as e2:
                            errors += len(small_batch)
                            print(f"  EXCEPTION small batch: {e2}")
                else:
                    errors += len(rows)
                    print(f"  ERROR batch {i}: {resp.status_code} {resp.text[:200]}")
        except Exception as e:
            errors += len(rows)
            print(f"  EXCEPTION batch {i}: {e}")

        pct = min(100, int((i + len(batch)) / total * 100))
        sys.stdout.write(f"\r  {table_name}: {pct}% ({imported} ok, {errors} err)")
        sys.stdout.flush()

    print()
    return imported, errors

def transform_user(item):
    return {
        'user_id': item.get('user_id', ''),
        'email': item.get('email', ''),
        'name': item.get('name', ''),
        'picture': item.get('picture', ''),
        'role': item.get('role', 'user'),
        'active': item.get('active', True),
        'manual': item.get('manual', False),
        'cpf': item.get('cpf', ''),
        'creci': item.get('creci', ''),
        'phone': item.get('phone', ''),
        'war_name': item.get('war_name', ''),
        'ranking_opt_out': item.get('ranking_opt_out', False),
        'token_version': item.get('token_version', 0),
        'created_at': parse_dt(item.get('created_at')),
    }

def transform_broker(item):
    return {
        'id': item.get('id', ''),
        'user_id': item.get('user_id', ''),
        'war_name': item.get('war_name', ''),
        'full_name': item.get('full_name', ''),
        'phone': item.get('phone', ''),
        'creci': item.get('creci', ''),
        'email': item.get('email', ''),
        'photo': item.get('photo', ''),
        'active': item.get('active', True),
        'created_at': parse_dt(item.get('created_at')),
    }

def transform_sale(item):
    return {
        'id': item.get('id', ''),
        'user_id': item.get('user_id', ''),
        'owner_id': item.get('owner_id', ''),
        'owner_name': item.get('owner_name', ''),
        'property_name': item.get('property_name', ''),
        'quadra': item.get('quadra', ''),
        'lote': item.get('lote', ''),
        'client_name': item.get('client_name', ''),
        'client_phone': item.get('client_phone', ''),
        'client_email': item.get('client_email', ''),
        'client_cpf': item.get('client_cpf', ''),
        'client_birthdate': item.get('client_birthdate', ''),
        'client_has_spouse': item.get('client_has_spouse', False),
        'client_spouse': to_jsonb(item.get('client_spouse'), None),
        'client_origin': item.get('client_origin', ''),
        'client_origin_other': item.get('client_origin_other', ''),
        'client_notes': item.get('client_notes', ''),
        'client_id': item.get('client_id', ''),
        'broker_name': item.get('broker_name', ''),
        'broker_ids': to_jsonb(item.get('broker_ids'), []),
        'brokers': to_jsonb(item.get('brokers'), []),
        'sale_date': item.get('sale_date', ''),
        'sale_value': item.get('sale_value', 0),
        'commission_rate': item.get('commission_rate', 0),
        'commission_value': item.get('commission_value', 0),
        'commission_base': item.get('commission_base', 'sale'),
        'commission_gross': item.get('commission_gross', 0),
        'commission_net': item.get('commission_net', 0),
        'commission_received': item.get('commission_received', False),
        'commission_received_at': item.get('commission_received_at'),
        'broker_split': item.get('broker_split', 60.0),
        'broker_commission': item.get('broker_commission', 0),
        'agency_commission': item.get('agency_commission', 0),
        'financed_value': item.get('financed_value', 0),
        'discounts': to_jsonb(item.get('discounts'), []),
        'entrada': item.get('entrada', 0),
        'parcelado': item.get('parcelado', False),
        'installments': to_jsonb(item.get('installments'), []),
        'notes': item.get('notes', ''),
        'created_at': parse_dt(item.get('created_at')),
    }

def transform_sales_history(item):
    row = transform_sale(item)
    row['deleted_at'] = item.get('deleted_at')
    row['deleted_by'] = item.get('deleted_by', '')
    row['deleted_by_name'] = item.get('deleted_by_name', '')
    return row

def transform_sale_audit(item):
    return {
        'id': item.get('id', ''),
        'action': item.get('action', ''),
        'sale_id': item.get('sale_id', ''),
        'property_name': item.get('property_name', ''),
        'quadra': item.get('quadra', ''),
        'lote': item.get('lote', ''),
        'client_name': item.get('client_name', ''),
        'broker_name': item.get('broker_name', ''),
        'sale_value': item.get('sale_value', 0),
        'detail': item.get('detail', ''),
        'by': item.get('by', ''),
        'by_id': item.get('by_id', ''),
        'at': parse_dt(item.get('at')),
    }

def transform_client(item):
    return {
        'id': item.get('id', ''),
        'name': item.get('name', ''),
        'name_key': item.get('name_key', ''),
        'phone': item.get('phone', ''),
        'email': item.get('email', ''),
        'cpf': item.get('cpf', ''),
        'cpf_key': item.get('cpf_key', ''),
        'birthdate': item.get('birthdate', ''),
        'has_spouse': item.get('has_spouse', False),
        'spouse': to_jsonb(item.get('spouse'), None),
        'origin': item.get('origin', ''),
        'origin_other': item.get('origin_other', ''),
        'notes': item.get('notes', ''),
        'created_at': parse_dt(item.get('created_at')),
        'updated_at': parse_dt(item.get('updated_at')),
    }

def transform_loteamento(item):
    lat_val = None
    lng_val = None
    specs = item.get('specs', {})
    if isinstance(specs, dict):
        loc = specs.get('localizacao', {})
        coords = loc.get('coords', '')
        if coords and ',' in coords:
            parts = coords.split(',')
            try:
                lat_val = float(parts[0].strip())
                lng_val = float(parts[1].strip())
            except (ValueError, IndexError):
                pass
    return {
        'id': item.get('id', ''),
        'name': item.get('name', ''),
        'name_lower': item.get('name_lower', ''),
        'ai_training': item.get('ai_training', ''),
        'copy': item.get('copy', ''),
        'copies': to_jsonb(item.get('copies'), []),
        'fields': to_jsonb(item.get('fields'), []),
        'specs': to_jsonb(item.get('specs'), {}),
        'lat': lat_val,
        'lng': lng_val,
        'details_updated_at': parse_dt(item.get('details_updated_at')),
        'created_at': parse_dt(item.get('created_at')),
    }

def transform_lot_image(item):
    # Skip base64 data for now - it's too large for REST API
    return {
        'id': item.get('id', ''),
        'lot_id': item.get('lot_id', ''),
        'type': item.get('type', ''),
        'filename': item.get('filename', ''),
        'content_type': item.get('content_type', ''),
        'caption': item.get('caption', ''),
        'data': None,  # Skip large base64 data
        'created_at': parse_dt(item.get('created_at')),
    }

def transform_lot_doc(item):
    return {
        'id': item.get('id', ''),
        'lot_id': item.get('lot_id', ''),
        'title': item.get('title', ''),
        'category': item.get('category', ''),
        'filename': item.get('filename', ''),
        'content_type': item.get('content_type', ''),
        'size': item.get('size', 0),
        'storage_path': item.get('storage_path', ''),
        'is_deleted': item.get('is_deleted', False),
        'created_at': parse_dt(item.get('created_at')),
    }

def transform_goal(item):
    return {
        'id': item.get('id', ''),
        'scope': item.get('scope', 'company'),
        'owner_id': item.get('owner_id', ''),
        'metric': item.get('metric', 'vgv'),
        'target': item.get('target', 0),
        'month': item.get('month'),
        'year': item.get('year', 0),
        'created_at': parse_dt(item.get('created_at')),
    }

def transform_broker_group(item):
    return {
        'id': item.get('id', ''),
        'name': item.get('name', ''),
        'members': to_jsonb(item.get('members'), []),
        'created_at': parse_dt(item.get('created_at')),
    }

def transform_app_setting(item):
    usage = {}
    for k, v in item.items():
        if k not in ('id', 'user_id', '_id'):
            usage[k] = v
    return {
        'id': item.get('id', 'app_settings_default'),
        'usage': usage,
    }

def transform_notification(item):
    return {
        'id': item.get('id', ''),
        'user_id': item.get('user_id', ''),
        'type': item.get('type', ''),
        'message': item.get('message', ''),
        'read': item.get('read', False),
        'meta': to_jsonb(item.get('meta'), {}),
        'created_at': parse_dt(item.get('created_at')),
    }

def main():
    load_env()
    base_url, api_key = get_supabase_config()

    headers = {
        'apikey': api_key,
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
    }

    # Load backup
    print("Loading backup...")
    with open('data/backup-brilhantes.json') as f:
        backup = json.load(f)
    colls = backup.get('collections', backup)

    import_plan = [
        ('users', 'users', transform_user, 28),
        ('brokers', 'brokers', transform_broker, 3),
        ('clients', 'clients', transform_client, 5),
        ('goals', 'goals', transform_goal, 7),
        ('broker_groups', 'broker_groups', transform_broker_group, 1),
        ('app_settings', 'app_settings', transform_app_setting, 1),
        ('loteamentos', 'loteamentos', transform_loteamento, 31),
        ('lot_docs', 'lot_docs', transform_lot_doc, 3),
        ('lot_images', 'lot_images', transform_lot_image, 2),
        ('sales', 'sales', transform_sale, 392),
        ('sales_history', 'sales_history', transform_sales_history, 57),
        ('sale_audit', 'sale_audit', transform_sale_audit, 126),
        ('notifications', 'notifications', transform_notification, 959),
    ]

    total_imported = 0
    total_errors = 0

    for coll_name, table_name, transform_fn, expected in import_plan:
        items = colls.get(coll_name, [])
        if not items:
            print(f"\n{coll_name}: 0 items (skipped)")
            continue

        print(f"\n{table_name} ({len(items)} items)...")
        batch_size = 50 if len(items) > 100 else 25
        imported, errors = import_table(base_url, headers, table_name, items, transform_fn, batch_size)
        total_imported += imported
        total_errors += errors
        print(f"  Result: {imported} imported, {errors} errors")

    print(f"\n{'='*50}")
    print(f"TOTAL: {total_imported} items imported, {total_errors} errors")

if __name__ == '__main__':
    main()
