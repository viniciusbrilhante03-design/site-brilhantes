#!/usr/bin/env python3
"""Import MongoDB backup data into Supabase/Postgres."""
import json
import os
import sys
import psycopg2
from psycopg2.extras import execute_values, Json
from datetime import datetime

def parse_dt(val):
    if not val:
        return None
    if isinstance(val, datetime):
        return val
    if isinstance(val, str):
        # Handle ISO format with optional microseconds and timezone
        s = val.strip()
        if s.endswith('Z'):
            s = s[:-1] + '+00:00'
        try:
            return datetime.fromisoformat(s)
        except Exception:
            try:
                return datetime.strptime(val[:26], '%Y-%m-%dT%H:%M:%S.%f')
            except Exception:
                try:
                    return datetime.strptime(val[:19], '%Y-%m-%dT%H:%M:%S')
                except Exception:
                    return None
    return None

def get_val(item, key, default=None):
    v = item.get(key, default)
    return v if v is not None else default

def to_bool(v, default=False):
    if v is None:
        return default
    if isinstance(v, bool):
        return v
    return bool(v)

def to_float(v, default=0.0):
    if v is None:
        return default
    try:
        return float(v)
    except (ValueError, TypeError):
        return default

def to_int(v, default=0):
    if v is None:
        return default
    try:
        return int(v)
    except (ValueError, TypeError):
        return default

def to_jsonb(v, default=None):
    if v is None:
        return Json(default if default is not None else {})
    if isinstance(v, (dict, list)):
        return Json(v)
    return Json(default if default is not None else {})

def import_users(cur, items):
    rows = []
    for item in items:
        rows.append((
            item.get('user_id', ''),
            item.get('email', ''),
            item.get('name', ''),
            item.get('picture', ''),
            item.get('role', 'user'),
            to_bool(item.get('active', True)),
            to_bool(item.get('manual', False)),
            item.get('cpf', ''),
            item.get('creci', ''),
            item.get('phone', ''),
            item.get('war_name', ''),
            to_bool(item.get('ranking_opt_out', False)),
            to_int(item.get('token_version', 0)),
            parse_dt(item.get('created_at')),
        ))
    if rows:
        execute_values(cur, """
            INSERT INTO users (user_id, email, name, picture, role, active, manual,
              cpf, creci, phone, war_name, ranking_opt_out, token_version, created_at)
            VALUES %s
            ON CONFLICT (user_id) DO UPDATE SET
              email=EXCLUDED.email, name=EXCLUDED.name, picture=EXCLUDED.picture,
              role=EXCLUDED.role, active=EXCLUDED.active, manual=EXCLUDED.manual,
              cpf=EXCLUDED.cpf, creci=EXCLUDED.creci, phone=EXCLUDED.phone,
              war_name=EXCLUDED.war_name, ranking_opt_out=EXCLUDED.ranking_opt_out,
              token_version=EXCLUDED.token_version
        """, rows)
    return len(rows)

def import_brokers(cur, items):
    rows = []
    for item in items:
        rows.append((
            item.get('id', ''),
            item.get('user_id', ''),
            item.get('war_name', ''),
            item.get('full_name', ''),
            item.get('phone', ''),
            item.get('creci', ''),
            item.get('email', ''),
            item.get('photo', ''),
            to_bool(item.get('active', True)),
            parse_dt(item.get('created_at')),
        ))
    if rows:
        execute_values(cur, """
            INSERT INTO brokers (id, user_id, war_name, full_name, phone, creci, email,
              photo, active, created_at)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET
              war_name=EXCLUDED.war_name, full_name=EXCLUDED.full_name, phone=EXCLUDED.phone,
              creci=EXCLUDED.creci, email=EXCLUDED.email, photo=EXCLUDED.photo, active=EXCLUDED.active
        """, rows)
    return len(rows)

def import_sales(cur, items):
    rows = []
    for item in items:
        rows.append((
            item.get('id', ''),
            item.get('user_id', ''),
            item.get('owner_id', ''),
            item.get('owner_name', ''),
            item.get('property_name', ''),
            item.get('quadra', ''),
            item.get('lote', ''),
            item.get('client_name', ''),
            item.get('client_phone', ''),
            item.get('client_email', ''),
            item.get('client_cpf', ''),
            item.get('client_birthdate', ''),
            to_bool(item.get('client_has_spouse', False)),
            to_jsonb(item.get('client_spouse'), None),
            item.get('client_origin', ''),
            item.get('client_origin_other', ''),
            item.get('client_notes', ''),
            item.get('client_id', ''),
            item.get('broker_name', ''),
            to_jsonb(item.get('broker_ids'), []),
            to_jsonb(item.get('brokers'), []),
            item.get('sale_date', ''),
            to_float(item.get('sale_value')),
            to_float(item.get('commission_rate')),
            to_float(item.get('commission_value')),
            item.get('commission_base', 'sale'),
            to_float(item.get('commission_gross')),
            to_float(item.get('commission_net')),
            to_bool(item.get('commission_received', False)),
            item.get('commission_received_at'),
            to_float(item.get('broker_split', 60.0)),
            to_float(item.get('broker_commission')),
            to_float(item.get('agency_commission')),
            to_float(item.get('financed_value')),
            to_jsonb(item.get('discounts'), []),
            to_float(item.get('entrada')),
            to_bool(item.get('parcelado', False)),
            to_jsonb(item.get('installments'), []),
            item.get('notes', ''),
            parse_dt(item.get('created_at')),
        ))
    if rows:
        execute_values(cur, """
            INSERT INTO sales (id, user_id, owner_id, owner_name, property_name, quadra, lote,
              client_name, client_phone, client_email, client_cpf, client_birthdate,
              client_has_spouse, client_spouse, client_origin, client_origin_other, client_notes,
              client_id, broker_name, broker_ids, brokers, sale_date, sale_value,
              commission_rate, commission_value, commission_base, commission_gross, commission_net,
              commission_received, commission_received_at, broker_split, broker_commission,
              agency_commission, financed_value, discounts, entrada, parcelado, installments,
              notes, created_at)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET
              property_name=EXCLUDED.property_name, client_name=EXCLUDED.client_name,
              sale_date=EXCLUDED.sale_date, sale_value=EXCLUDED.sale_value
        """, rows, page_size=100)
    return len(rows)

def import_sales_history(cur, items):
    rows = []
    for item in items:
        rows.append((
            item.get('id', ''),
            item.get('user_id', ''),
            item.get('owner_id', ''),
            item.get('owner_name', ''),
            item.get('property_name', ''),
            item.get('quadra', ''),
            item.get('lote', ''),
            item.get('client_name', ''),
            item.get('client_phone', ''),
            item.get('client_email', ''),
            item.get('client_cpf', ''),
            item.get('client_birthdate', ''),
            to_bool(item.get('client_has_spouse', False)),
            to_jsonb(item.get('client_spouse'), None),
            item.get('client_origin', ''),
            item.get('client_origin_other', ''),
            item.get('client_notes', ''),
            item.get('client_id', ''),
            item.get('broker_name', ''),
            to_jsonb(item.get('broker_ids'), []),
            to_jsonb(item.get('brokers'), []),
            item.get('sale_date', ''),
            to_float(item.get('sale_value')),
            to_float(item.get('commission_rate')),
            to_float(item.get('commission_value')),
            item.get('commission_base', 'sale'),
            to_float(item.get('commission_gross')),
            to_float(item.get('commission_net')),
            to_bool(item.get('commission_received', False)),
            item.get('commission_received_at'),
            to_float(item.get('broker_split', 60.0)),
            to_float(item.get('broker_commission')),
            to_float(item.get('agency_commission')),
            to_float(item.get('financed_value')),
            to_jsonb(item.get('discounts'), []),
            to_float(item.get('entrada')),
            to_bool(item.get('parcelado', False)),
            to_jsonb(item.get('installments'), []),
            item.get('notes', ''),
            parse_dt(item.get('deleted_at')),
            item.get('deleted_by', ''),
            item.get('deleted_by_name', ''),
            parse_dt(item.get('created_at')),
        ))
    if rows:
        execute_values(cur, """
            INSERT INTO sales_history (id, user_id, owner_id, owner_name, property_name, quadra, lote,
              client_name, client_phone, client_email, client_cpf, client_birthdate,
              client_has_spouse, client_spouse, client_origin, client_origin_other, client_notes,
              client_id, broker_name, broker_ids, brokers, sale_date, sale_value,
              commission_rate, commission_value, commission_base, commission_gross, commission_net,
              commission_received, commission_received_at, broker_split, broker_commission,
              agency_commission, financed_value, discounts, entrada, parcelado, installments,
              notes, deleted_at, deleted_by, deleted_by_name, created_at)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET
              property_name=EXCLUDED.property_name, client_name=EXCLUDED.client_name
        """, rows, page_size=100)
    return len(rows)

def import_sale_audit(cur, items):
    rows = []
    for item in items:
        rows.append((
            item.get('id', ''),
            item.get('action', ''),
            item.get('sale_id', ''),
            item.get('property_name', ''),
            item.get('quadra', ''),
            item.get('lote', ''),
            item.get('client_name', ''),
            item.get('broker_name', ''),
            to_float(item.get('sale_value')),
            item.get('detail', ''),
            item.get('by', ''),
            item.get('by_id', ''),
            parse_dt(item.get('at')),
        ))
    if rows:
        execute_values(cur, """
            INSERT INTO sale_audit (id, action, sale_id, property_name, quadra, lote,
              client_name, broker_name, sale_value, detail, by, by_id, at)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET action=EXCLUDED.action
        """, rows, page_size=100)
    return len(rows)

def import_clients(cur, items):
    rows = []
    for item in items:
        rows.append((
            item.get('id', ''),
            item.get('name', ''),
            item.get('name_key', ''),
            item.get('phone', ''),
            item.get('email', ''),
            item.get('cpf', ''),
            item.get('cpf_key', ''),
            item.get('birthdate', ''),
            to_bool(item.get('has_spouse', False)),
            to_jsonb(item.get('spouse'), None),
            item.get('origin', ''),
            item.get('origin_other', ''),
            item.get('notes', ''),
            parse_dt(item.get('created_at')),
            parse_dt(item.get('updated_at')),
        ))
    if rows:
        execute_values(cur, """
            INSERT INTO clients (id, name, name_key, phone, email, cpf, cpf_key, birthdate,
              has_spouse, spouse, origin, origin_other, notes, created_at, updated_at)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET
              name=EXCLUDED.name, name_key=EXCLUDED.name_key, phone=EXCLUDED.phone,
              email=EXCLUDED.email, cpf=EXCLUDED.cpf
        """, rows)
    return len(rows)

def import_loteamentos(cur, items):
    rows = []
    for item in items:
        lat_val = None
        lng_val = None
        loc = item.get('specs', {}).get('localizacao', {}) if isinstance(item.get('specs'), dict) else {}
        coords = loc.get('coords', '')
        if coords and ',' in coords:
            parts = coords.split(',')
            try:
                lat_val = float(parts[0].strip())
                lng_val = float(parts[1].strip())
            except (ValueError, IndexError):
                pass
        rows.append((
            item.get('id', ''),
            item.get('name', ''),
            item.get('name_lower', ''),
            item.get('ai_training', ''),
            item.get('copy', ''),
            to_jsonb(item.get('copies'), []),
            to_jsonb(item.get('fields'), []),
            to_jsonb(item.get('specs'), {}),
            lat_val,
            lng_val,
            parse_dt(item.get('details_updated_at')),
            parse_dt(item.get('created_at')),
        ))
    if rows:
        execute_values(cur, """
            INSERT INTO loteamentos (id, name, name_lower, ai_training, copy, copies, fields,
              specs, lat, lng, details_updated_at, created_at)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET
              name=EXCLUDED.name, name_lower=EXCLUDED.name_lower, ai_training=EXCLUDED.ai_training,
              copy=EXCLUDED.copy, copies=EXCLUDED.copies, fields=EXCLUDED.fields, specs=EXCLUDED.specs
        """, rows)
    return len(rows)

def import_lot_images(cur, items):
    rows = []
    for item in items:
        rows.append((
            item.get('id', ''),
            item.get('lot_id', ''),
            item.get('type', ''),
            item.get('filename', ''),
            item.get('content_type', ''),
            item.get('caption', ''),
            item.get('data', ''),
            parse_dt(item.get('created_at')),
        ))
    if rows:
        execute_values(cur, """
            INSERT INTO lot_images (id, lot_id, type, filename, content_type, caption, data, created_at)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET caption=EXCLUDED.caption
        """, rows)
    return len(rows)

def import_lot_docs(cur, items):
    rows = []
    for item in items:
        rows.append((
            item.get('id', ''),
            item.get('lot_id', ''),
            item.get('title', ''),
            item.get('category', ''),
            item.get('filename', ''),
            item.get('content_type', ''),
            to_int(item.get('size', 0)),
            item.get('storage_path', ''),
            to_bool(item.get('is_deleted', False)),
            parse_dt(item.get('created_at')),
        ))
    if rows:
        execute_values(cur, """
            INSERT INTO lot_docs (id, lot_id, title, category, filename, content_type, size,
              storage_path, is_deleted, created_at)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, category=EXCLUDED.category
        """, rows)
    return len(rows)

def import_goals(cur, items):
    rows = []
    for item in items:
        rows.append((
            item.get('id', ''),
            item.get('scope', 'company'),
            item.get('owner_id', ''),
            item.get('metric', 'vgv'),
            to_float(item.get('target')),
            item.get('month'),
            to_int(item.get('year')),
            parse_dt(item.get('created_at')),
        ))
    if rows:
        execute_values(cur, """
            INSERT INTO goals (id, scope, owner_id, metric, target, month, year, created_at)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET target=EXCLUDED.target
        """, rows)
    return len(rows)

def import_broker_groups(cur, items):
    rows = []
    for item in items:
        rows.append((
            item.get('id', ''),
            item.get('name', ''),
            to_jsonb(item.get('members'), []),
            parse_dt(item.get('created_at')),
        ))
    if rows:
        execute_values(cur, """
            INSERT INTO broker_groups (id, name, members, created_at)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, members=EXCLUDED.members
        """, rows)
    return len(rows)

def import_app_settings(cur, items):
    rows = []
    for item in items:
        usage = {}
        for k, v in item.items():
            if k not in ('id', 'user_id', '_id'):
                usage[k] = v
        rows.append((
            item.get('id', 'app_settings_' + (item.get('user_id', 'default'))),
            to_jsonb(usage, {}),
        ))
    if rows:
        execute_values(cur, """
            INSERT INTO app_settings (id, usage)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET usage=EXCLUDED.usage
        """, rows)
    return len(rows)

def import_notifications(cur, items):
    rows = []
    for item in items:
        rows.append((
            item.get('id', ''),
            item.get('user_id', ''),
            item.get('type', ''),
            item.get('message', ''),
            to_bool(item.get('read', False)),
            to_jsonb(item.get('meta'), {}),
            parse_dt(item.get('created_at')),
        ))
    # Insert in batches of 500
    for i in range(0, len(rows), 500):
        batch = rows[i:i+500]
        execute_values(cur, """
            INSERT INTO notifications (id, user_id, type, message, read, meta, created_at)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET read=EXCLUDED.read
        """, batch)
    return len(rows)

def main():
    backup_path = os.environ.get('BACKUP_PATH', 'data/backup-brilhantes.json')
    db_url = os.environ['SUPABASE_DB_URL']

    print(f"Loading backup from {backup_path}...")
    with open(backup_path) as f:
        backup = json.load(f)

    colls = backup.get('collections', backup)
    if not colls and 'collections' in backup:
        colls = backup['collections']

    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cur = conn.cursor()

    importers = [
        ('users', import_users),
        ('brokers', import_brokers),
        ('sales', import_sales),
        ('sales_history', import_sales_history),
        ('sale_audit', import_sale_audit),
        ('clients', import_clients),
        ('loteamentos', import_loteamentos),
        ('lot_images', import_lot_images),
        ('lot_docs', import_lot_docs),
        ('goals', import_goals),
        ('broker_groups', import_broker_groups),
        ('app_settings', import_app_settings),
        ('notifications', import_notifications),
    ]

    total = 0
    for name, fn in importers:
        items = colls.get(name, [])
        if not items:
            print(f"  {name}: 0 items (skipped)")
            continue
        count = fn(cur, items)
        total += count
        print(f"  {name}: {count} items imported")

    conn.commit()
    cur.close()
    conn.close()
    print(f"\nTotal: {total} items imported successfully!")

if __name__ == '__main__':
    main()
