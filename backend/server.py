from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File, Header, BackgroundTasks
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import requests
import re
import math
import io
import base64
from calendar import monthrange
import pandas as pd
import bcrypt
import jwt
import httpx
import secrets
import hashlib
import hmac

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

# ---------------- Auth config & helpers ----------------
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change")
JWT_ALG = "HS256"
MASTER_EMAILS = set(e.strip().lower() for e in os.environ.get("MASTER_EMAILS", "").split(",") if e.strip())
EMAIL_BASE_URL = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip().rstrip("/") or "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
WEBHOOK_CRON_SECRET = os.environ.get("WEBHOOK_CRON_SECRET", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME") or "Brilhante's Imóveis"
FRONTEND_URL = os.environ.get("FRONTEND_URL", "").rstrip("/")


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode("utf-8"), h.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: str, ver: int = 0) -> str:
    payload = {"sub": user_id, "ver": ver, "type": "access",
               "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def _only_digits(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def _display(user: dict) -> str:
    return user.get("war_name") or user.get("name") or user.get("email") or "—"


def _scope_query(user: dict) -> dict:
    if user.get("role") == "master":
        return {}
    uid = user["user_id"]
    return {"$or": [{"owner_id": uid}, {"broker_ids": uid}]}


def _set_jwt_cookie(response: Response, token: str):
    response.set_cookie(key="access_token", value=token, httponly=True,
                        secure=True, samesite="none", path="/", max_age=7 * 24 * 60 * 60)


async def send_password_reset_email(to_email: str, token: str) -> bool:
    base = FRONTEND_URL
    link = f"{base}/reset-password?token={token}"
    if not EMAIL_KEY or EMAIL_KEY.startswith("{") or not base.startswith("https://"):
        logger.warning("Email não configurado; link de redefinição: %s", link)
        return False
    from html import escape
    brand = escape(EMAIL_FROM_NAME)
    html = (
        f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif">'
        f'<p>Recebemos um pedido para redefinir sua senha na {brand}.</p>'
        f'<p><a href="{escape(link)}">Redefinir minha senha</a></p>'
        f'<p>Este link expira em 1 hora e pode ser usado uma vez. Se você não solicitou, ignore este e-mail.</p>'
        f'<p style="font-size:12px;color:#888">Enviado por {brand}.</p></td></tr></table>'
    )
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            resp = await c.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                headers={"X-Email-Key": EMAIL_KEY},
                                json={"to": [to_email], "subject": f"Redefinir senha — {EMAIL_FROM_NAME}",
                                      "html": html, "from_name": EMAIL_FROM_NAME})
        resp.raise_for_status()
        return True
    except Exception as e:
        logger.error(f"Falha ao enviar e-mail de redefinição: {e}")
        return False


# ---------------- Models ----------------
class Installment(BaseModel):
    number: int
    due_date: str
    value: float
    received: bool = False
    received_date: Optional[str] = None


class SaleBroker(BaseModel):
    name: str
    split_pct: float = 100.0   # % do pool do corretor que vai para este parceiro
    owner_id: Optional[str] = None


class SaleCreate(BaseModel):
    property_name: str  # nome do loteamento
    quadra: Optional[str] = ""
    lote: Optional[str] = ""
    client_name: Optional[str] = ""
    client_phone: Optional[str] = ""
    client_email: Optional[str] = ""
    client_cpf: Optional[str] = ""
    client_birthdate: Optional[str] = ""
    broker_name: str
    brokers: List[SaleBroker] = []
    sale_date: str  # YYYY-MM-DD
    sale_value: float
    commission_rate: float = 0.0
    commission_value: float = 0.0
    broker_split: float = 60.0  # % que vai para o corretor
    broker_commission: float = 0.0
    agency_commission: float = 0.0
    commission_received: bool = False
    entrada: float = 0.0
    parcelado: bool = False
    installments: List[Installment] = []
    notes: Optional[str] = ""


class Sale(SaleCreate):
    id: str = Field(default_factory=lambda: f"sale_{uuid.uuid4().hex[:12]}")
    user_id: str
    owner_id: Optional[str] = None
    owner_name: Optional[str] = ""
    broker_ids: List[str] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class BrokerBase(BaseModel):
    war_name: Optional[str] = ""   # nome de guerra
    full_name: Optional[str] = ""
    phone: Optional[str] = ""
    creci: Optional[str] = ""
    email: Optional[str] = ""
    photo: Optional[str] = ""       # data URL (base64) ou URL
    active: bool = True


class Broker(BrokerBase):
    id: str = Field(default_factory=lambda: f"broker_{uuid.uuid4().hex[:12]}")
    user_id: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class CorretorProfile(BaseModel):
    name: Optional[str] = ""
    war_name: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    creci: Optional[str] = ""
    picture: Optional[str] = ""
    active: bool = True


class GoalCreate(BaseModel):
    scope: str                       # "company" | "broker"
    owner_id: Optional[str] = None   # obrigatório se scope == "broker"
    metric: str                      # "vgv" | "count"
    target: float
    month: Optional[int] = None      # None = ano inteiro
    year: int


class Goal(GoalCreate):
    id: str = Field(default_factory=lambda: f"goal_{uuid.uuid4().hex[:12]}")
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ---------------- Auth ----------------
async def _resolve_token(token: str):
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if session:
        expires_at = session["expires_at"]
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at >= datetime.now(timezone.utc):
            u = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
            if u:
                return u
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        if payload.get("type") == "access":
            u = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
            if u and payload.get("ver", 0) == u.get("token_version", 0):
                return u
    except jwt.PyJWTError:
        pass
    return None


async def get_current_user(request: Request):
    tokens = []
    if request.cookies.get("session_token"):
        tokens.append(request.cookies["session_token"])
    if request.cookies.get("access_token"):
        tokens.append(request.cookies["access_token"])
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        tokens.append(auth[7:])
    for t in tokens:
        u = await _resolve_token(t)
        if u:
            u.pop("password_hash", None)
            return u
    raise HTTPException(status_code=401, detail="Não autenticado")


async def require_master(user: dict = Depends(get_current_user)):
    if user.get("role") != "master":
        raise HTTPException(status_code=403, detail="Acesso restrito ao gestor")
    return user


@api_router.post("/auth/session")
async def process_session(request: Request, response: Response):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id ausente")

    resp = requests.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": session_id}, timeout=20)
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Falha na autenticação Google")
    data = resp.json()

    email = (data["email"] or "").lower()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data.get("name"), "picture": data.get("picture"), "role": "master"}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data.get("name"),
            "picture": data.get("picture"),
            "role": "master",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    session_token = data["session_token"]
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    response.set_cookie(
        key="session_token", value=session_token, httponly=True,
        secure=True, samesite="none", path="/", max_age=7 * 24 * 60 * 60,
    )
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return user


@api_router.get("/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    return user


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


class CorretorRegister(BaseModel):
    name: str
    war_name: Optional[str] = ""
    email: str
    cpf: str
    creci: Optional[str] = ""
    phone: Optional[str] = ""


@api_router.post("/auth/register")
async def register(data: CorretorRegister, response: Response):
    email = (data.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=422, detail="E-mail inválido")
    cpf = _only_digits(data.cpf)
    if len(cpf) < 6:
        raise HTTPException(status_code=400, detail="CPF inválido")
    if not (data.name or data.war_name):
        raise HTTPException(status_code=400, detail="Informe o nome")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id, "email": email, "name": data.name,
        "war_name": data.war_name or "", "cpf": cpf, "creci": data.creci or "",
        "phone": data.phone or "", "role": "corretor", "active": True,
        "password_hash": hash_password(cpf), "token_version": 0,
        "picture": "", "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    _set_jwt_cookie(response, create_access_token(user_id, 0))
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return doc


@api_router.post("/auth/login")
async def login(request: Request, response: Response):
    body = await request.json()
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    ip = request.client.host if request.client else "?"
    identifier = f"{ip}:{email}"
    rec = await db.login_attempts.find_one({"identifier": identifier})
    if rec and rec.get("locked_until"):
        if datetime.fromisoformat(rec["locked_until"]) > datetime.now(timezone.utc):
            raise HTTPException(status_code=429, detail="Muitas tentativas. Tente novamente em alguns minutos.")
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(password, user["password_hash"]):
        count = (rec.get("count", 0) if rec else 0) + 1
        upd = {"identifier": identifier, "email": email, "count": count,
               "updated_at": datetime.now(timezone.utc).isoformat()}
        if count >= 5:
            upd["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
            upd["count"] = 0
        await db.login_attempts.update_one({"identifier": identifier}, {"$set": upd}, upsert=True)
        raise HTTPException(status_code=401, detail="E-mail ou senha inválidos")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Conta inativa. Fale com o gestor.")
    await db.login_attempts.delete_many({"email": email})
    _set_jwt_cookie(response, create_access_token(user["user_id"], user.get("token_version", 0)))
    user.pop("password_hash", None)
    user.pop("_id", None)
    return user


@api_router.post("/auth/change-password")
async def change_password(request: Request, user: dict = Depends(get_current_user)):
    if user.get("role") != "corretor":
        raise HTTPException(status_code=400, detail="O gestor acessa via Google.")
    body = await request.json()
    full = await db.users.find_one({"user_id": user["user_id"]})
    if not verify_password(body.get("current_password") or "", full.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Senha atual incorreta")
    new = body.get("new_password") or ""
    if len(new) < 4:
        raise HTTPException(status_code=400, detail="A nova senha deve ter ao menos 4 caracteres")
    await db.users.update_one({"user_id": user["user_id"]},
                              {"$set": {"password_hash": hash_password(new)},
                               "$inc": {"token_version": 1}})
    return {"ok": True}


@api_router.post("/auth/forgot-password")
async def forgot_password(request: Request):
    body = await request.json()
    email = (body.get("email") or "").strip().lower()
    generic = {"message": "Se este e-mail estiver cadastrado, enviaremos um link de redefinição."}
    await db.password_reset_requests.insert_one({"email": email, "created_at": datetime.now(timezone.utc).isoformat()})
    recent = await db.password_reset_requests.count_documents({
        "email": email,
        "created_at": {"$gte": (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()},
    })
    if recent > 5:
        return generic
    user = await db.users.find_one({"email": email})
    if not user:
        return generic
    token = secrets.token_urlsafe(32)
    await db.password_reset_tokens.insert_one({
        "token_hash": hashlib.sha256(token.encode()).hexdigest(),
        "user_id": user["user_id"], "email": email,
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=1), "used": False,
    })
    await send_password_reset_email(user["email"], token)
    return generic


@api_router.post("/auth/reset-password")
async def reset_password(request: Request):
    body = await request.json()
    token = body.get("token") or ""
    new = body.get("new_password") or ""
    if len(new) < 4:
        raise HTTPException(status_code=400, detail="A nova senha deve ter ao menos 4 caracteres")
    h = hashlib.sha256(token.encode()).hexdigest()
    rec = await db.password_reset_tokens.find_one_and_update(
        {"token_hash": h, "used": False, "expires_at": {"$gt": datetime.now(timezone.utc)}},
        {"$set": {"used": True}})
    if not rec:
        raise HTTPException(status_code=400, detail="Link inválido ou expirado")
    await db.users.update_one({"user_id": rec["user_id"]},
                              {"$set": {"password_hash": hash_password(new)},
                               "$inc": {"token_version": 1}})
    await db.password_reset_tokens.delete_many({"user_id": rec["user_id"], "used": False})
    await db.login_attempts.delete_many({"email": rec["email"]})
    return {"ok": True}


# ---------------- Sales ----------------
def _match_period(d, month, year):
    sd = d.get("sale_date", "")
    if year is not None and not sd.startswith(f"{year:04d}"):
        return False
    if month is not None:
        try:
            if int(sd[5:7]) != month:
                return False
        except (ValueError, IndexError):
            return False
    return True


async def _company_sales(month, year):
    docs = await db.sales.find({}, {"_id": 0}).to_list(5000)
    return [d for d in docs if _match_period(d, month, year)]


@api_router.get("/sales", response_model=List[Sale])
async def list_sales(month: Optional[int] = None, year: Optional[int] = None,
                     user: dict = Depends(get_current_user)):
    docs = await db.sales.find(_scope_query(user), {"_id": 0}).to_list(5000)
    results = [d for d in docs if _match_period(d, month, year)]
    results.sort(key=lambda x: x.get("sale_date", ""), reverse=True)
    return results


# ---------------- Loteamentos ----------------
async def _ensure_loteamento(name: str):
    name = (name or "").strip()
    if not name:
        return
    if not await db.loteamentos.find_one({"name_lower": name.lower()}):
        await db.loteamentos.insert_one({
            "id": f"lot_{uuid.uuid4().hex[:10]}", "name": name,
            "name_lower": name.lower(), "created_at": datetime.now(timezone.utc).isoformat(),
        })


async def _loteamento_exists(name: str) -> bool:
    return bool(await db.loteamentos.find_one({"name_lower": (name or "").strip().lower()}))


async def _resolve_corretor_by_name(name: str):
    nm = (name or "").strip().lower()
    if not nm:
        return None
    corretores = await db.users.find({"role": "corretor"}, {"_id": 0}).to_list(1000)
    for u in corretores:
        if (u.get("war_name") or "").strip().lower() == nm or (u.get("name") or "").strip().lower() == nm:
            return u
    return None


@api_router.get("/loteamentos")
async def list_loteamentos(user: dict = Depends(get_current_user)):
    docs = await db.loteamentos.find({}, {"_id": 0}).to_list(3000)
    docs.sort(key=lambda d: (d.get("name") or "").lower())
    return docs


@api_router.post("/loteamentos")
async def add_loteamento(request: Request, user: dict = Depends(require_master)):
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Informe o nome do loteamento")
    await _ensure_loteamento(name)
    return await db.loteamentos.find_one({"name_lower": name.lower()}, {"_id": 0})


@api_router.delete("/loteamentos/{lot_id}")
async def delete_loteamento(lot_id: str, user: dict = Depends(require_master)):
    await db.loteamentos.delete_one({"id": lot_id})
    return {"ok": True}


async def _normalize_brokers(payload: dict):
    """Resolve a lista de corretores (parceria) -> nomes, %, owner_ids."""
    raw = payload.get("brokers") or []
    if not raw:
        nm = (payload.get("broker_name") or "").strip()
        raw = [{"name": nm, "split_pct": 100.0}] if nm else []
    resolved, ids = [], []
    for b in raw:
        nm = ((b.get("name") if isinstance(b, dict) else "") or "").strip()
        if not nm:
            continue
        pct = b.get("split_pct", 0) if isinstance(b, dict) else 0
        corr = await _resolve_corretor_by_name(nm)
        oid = corr["user_id"] if corr else None
        resolved.append({"name": nm, "split_pct": float(pct or 0), "owner_id": oid})
        if oid:
            ids.append(oid)
    if len(resolved) == 1:
        resolved[0]["split_pct"] = 100.0
    elif len(resolved) > 1:
        total = sum(r["split_pct"] for r in resolved)
        if abs(total - 100.0) > 0.01:
            raise HTTPException(status_code=400,
                                detail=f"A divisão da comissão entre os corretores deve somar 100% (atual: {round(total)}%).")
    return resolved, ids


@api_router.post("/sales", response_model=Sale)
async def create_sale(data: SaleCreate, user: dict = Depends(get_current_user)):
    payload = data.model_dump()
    if user.get("role") == "corretor":
        if not await _loteamento_exists(payload["property_name"]):
            raise HTTPException(status_code=400, detail="Loteamento não cadastrado. Peça ao gestor para cadastrá-lo.")
        payload["brokers"] = [{"name": _display(user), "split_pct": 100.0, "owner_id": user["user_id"]}]
        payload["broker_name"] = _display(user)
        owner_id, owner_name, broker_ids = user["user_id"], _display(user), [user["user_id"]]
    else:
        await _ensure_loteamento(payload["property_name"])
        resolved, broker_ids = await _normalize_brokers(payload)
        payload["brokers"] = resolved
        if resolved:
            payload["broker_name"] = " + ".join(r["name"] for r in resolved)
            owner_id = resolved[0]["owner_id"] or user["user_id"]
            owner_name = resolved[0]["name"]
        else:
            owner_id, owner_name = user["user_id"], _display(user)
    sale = Sale(**payload, user_id=user["user_id"], owner_id=owner_id,
                owner_name=owner_name, broker_ids=broker_ids)
    await db.sales.insert_one(sale.model_dump())
    await _post_sale_notifications(sale.model_dump())
    return sale


@api_router.put("/sales/{sale_id}", response_model=Sale)
async def update_sale(sale_id: str, data: SaleCreate, user: dict = Depends(get_current_user)):
    existing = await db.sales.find_one({"id": sale_id, **_scope_query(user)}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Venda não encontrada")
    payload = data.model_dump()
    extra = {}
    if user.get("role") == "corretor":
        payload["brokers"] = existing.get("brokers") or [{
            "name": existing.get("broker_name") or _display(user),
            "split_pct": 100.0, "owner_id": existing.get("owner_id")}]
        payload["broker_name"] = existing.get("broker_name") or _display(user)
    else:
        await _ensure_loteamento(payload["property_name"])
        resolved, broker_ids = await _normalize_brokers(payload)
        payload["brokers"] = resolved
        if resolved:
            payload["broker_name"] = " + ".join(r["name"] for r in resolved)
            extra = {"owner_id": resolved[0]["owner_id"] or existing.get("owner_id"),
                     "owner_name": resolved[0]["name"], "broker_ids": broker_ids}
        else:
            extra = {"broker_ids": []}
    await db.sales.update_one({"id": sale_id}, {"$set": {**payload, **extra}})
    return {**existing, **payload, **extra}


@api_router.delete("/sales/{sale_id}")
async def delete_sale(sale_id: str, user: dict = Depends(get_current_user)):
    sale = await db.sales.find_one({"id": sale_id, **_scope_query(user)}, {"_id": 0})
    if not sale:
        raise HTTPException(status_code=404, detail="Venda não encontrada")
    sale["deleted_at"] = datetime.now(timezone.utc).isoformat()
    sale["deleted_by"] = user["user_id"]
    sale["deleted_by_name"] = _display(user)
    await db.sales_history.insert_one(sale)
    await db.sales.delete_one({"id": sale_id})
    return {"ok": True}


@api_router.patch("/sales/{sale_id}/installments/{number}")
async def toggle_installment(sale_id: str, number: int, user: dict = Depends(get_current_user)):
    sale = await db.sales.find_one({"id": sale_id, **_scope_query(user)}, {"_id": 0})
    if not sale:
        raise HTTPException(status_code=404, detail="Venda não encontrada")
    installments = sale.get("installments", [])
    found = False
    for inst in installments:
        if inst["number"] == number:
            inst["received"] = not inst.get("received", False)
            inst["received_date"] = datetime.now(timezone.utc).date().isoformat() if inst["received"] else None
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="Parcela não encontrada")
    await db.sales.update_one({"id": sale_id}, {"$set": {"installments": installments}})
    return await db.sales.find_one({"id": sale_id}, {"_id": 0})


@api_router.post("/sales/{sale_id}/transfer")
async def transfer_sale(sale_id: str, request: Request, user: dict = Depends(require_master)):
    body = await request.json()
    new_name = (body.get("broker_name") or "").strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Informe o corretor de destino")
    sale = await db.sales.find_one({"id": sale_id}, {"_id": 0})
    if not sale:
        raise HTTPException(status_code=404, detail="Venda não encontrada")
    corr = await _resolve_corretor_by_name(new_name)
    oid = corr["user_id"] if corr else None
    upd = {
        "brokers": [{"name": new_name, "split_pct": 100.0, "owner_id": oid}],
        "broker_name": new_name,
        "owner_id": oid or user["user_id"],
        "owner_name": new_name,
        "broker_ids": [oid] if oid else [],
    }
    await db.sales.update_one({"id": sale_id}, {"$set": upd})
    await db.sale_audit.insert_one({
        "id": f"aud_{uuid.uuid4().hex[:10]}", "sale_id": sale_id, "action": "transfer",
        "from_broker": sale.get("broker_name"), "to_broker": new_name,
        "by": _display(user), "at": datetime.now(timezone.utc).isoformat(),
    })
    if oid:
        await _notify(oid, "new_sale",
                      f"Uma venda foi transferida para você: {sale.get('property_name')}.",
                      {"sale_id": sale_id})
    return {**sale, **upd}


# ---------------- Brokers (corretores) ----------------
@api_router.get("/brokers")
async def list_brokers(user: dict = Depends(get_current_user)):
    docs = await db.brokers.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(500)
    docs.sort(key=lambda b: (b.get("war_name") or b.get("full_name") or "").lower())
    return docs


@api_router.post("/brokers", response_model=Broker)
async def create_broker(data: BrokerBase, user: dict = Depends(get_current_user)):
    broker = Broker(**data.model_dump(), user_id=user["user_id"])
    await db.brokers.insert_one(broker.model_dump())
    return broker


@api_router.put("/brokers/{broker_id}", response_model=Broker)
async def update_broker(broker_id: str, data: BrokerBase, user: dict = Depends(get_current_user)):
    existing = await db.brokers.find_one({"id": broker_id, "user_id": user["user_id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Corretor não encontrado")
    await db.brokers.update_one({"id": broker_id}, {"$set": data.model_dump()})
    return {**existing, **data.model_dump()}


@api_router.delete("/brokers/{broker_id}")
async def delete_broker(broker_id: str, user: dict = Depends(get_current_user)):
    res = await db.brokers.delete_one({"id": broker_id, "user_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Corretor não encontrado")
    return {"ok": True}


# ---------------- Stats & Ranking ----------------
def _received_amount(sale: dict) -> float:
    total = sale.get("entrada", 0) or 0
    for inst in sale.get("installments", []):
        if inst.get("received"):
            total += inst.get("value", 0) or 0
    return total


def _pending_amount(sale: dict) -> float:
    total = 0
    for inst in sale.get("installments", []):
        if not inst.get("received"):
            total += inst.get("value", 0) or 0
    if not sale.get("installments"):
        # no installments defined: remaining = sale_value - entrada
        remaining = (sale.get("sale_value", 0) or 0) - (sale.get("entrada", 0) or 0)
        total = max(remaining, 0)
    return total


def _broker_comm(sale: dict) -> float:
    bc = sale.get("broker_commission")
    ac = sale.get("agency_commission")
    if bc is not None and (bc or ac):
        return bc or 0
    split = sale.get("broker_split", 60) or 60
    return (sale.get("commission_value", 0) or 0) * split / 100


def _agency_comm(sale: dict) -> float:
    return (sale.get("commission_value", 0) or 0) - _broker_comm(sale)


def _comm_received(s: dict) -> float:
    insts = s.get("installments", [])
    cv = s.get("commission_value", 0) or 0
    if insts:
        return sum(i.get("value", 0) or 0 for i in insts if i.get("received"))
    return cv if s.get("commission_received") else 0.0


def _comm_pending(s: dict) -> float:
    cv = s.get("commission_value", 0) or 0
    return max(cv - _comm_received(s), 0)


def _comm_overdue(s: dict) -> float:
    today = (datetime.now(timezone.utc) - timedelta(hours=3)).date().isoformat()
    return sum((i.get("value", 0) or 0) for i in s.get("installments", [])
               if not i.get("received") and (i.get("due_date") or "") < today)


def _broker_pool(s: dict) -> float:
    """Comissão total destinada aos corretores (antes de dividir entre parceiros)."""
    return _broker_comm(s)


def _partner_share(s: dict, uid: str) -> float:
    brokers = s.get("brokers") or []
    if not brokers:
        return 1.0 if s.get("owner_id") == uid else 0.0
    total = sum((b.get("split_pct") or 0) for b in brokers) or 100.0
    mine = sum((b.get("split_pct") or 0) for b in brokers if b.get("owner_id") == uid)
    return (mine / total) if total else 0.0


def _received_fraction(s: dict) -> float:
    cv = s.get("commission_value", 0) or 0
    if cv <= 0:
        return 1.0 if s.get("commission_received") else 0.0
    return min(_comm_received(s) / cv, 1.0)


def _overdue_fraction(s: dict) -> float:
    cv = s.get("commission_value", 0) or 0
    if cv <= 0:
        return 0.0
    return min(_comm_overdue(s) / cv, 1.0)


@api_router.get("/stats")
async def stats(month: Optional[int] = None, year: Optional[int] = None,
                user: dict = Depends(get_current_user)):
    sales = await list_sales(month=month, year=year, user=user)
    company = await _company_sales(month, year)
    vgv_geral = sum(s.get("sale_value", 0) or 0 for s in company)
    qtd = len(sales)

    if user.get("role") == "corretor":
        uid = user["user_id"]
        def sh(s):
            return _partner_share(s, uid)
        total_vendido = sum((s.get("sale_value", 0) or 0) * sh(s) for s in sales)
        comissao_total = sum((s.get("commission_value", 0) or 0) * sh(s) for s in sales)
        comissao_corretor = sum(_broker_pool(s) * sh(s) for s in sales)
        comissao_imobiliaria = 0.0
        entrada_total = sum((s.get("entrada", 0) or 0) * sh(s) for s in sales)
        ja_entrou = sum(_broker_pool(s) * sh(s) * _received_fraction(s) for s in sales)
        falta_entrar = sum(_broker_pool(s) * sh(s) * (1 - _received_fraction(s)) for s in sales)
        comissao_vencida = sum(_broker_pool(s) * sh(s) * _overdue_fraction(s) for s in sales)
    else:
        total_vendido = sum(s.get("sale_value", 0) or 0 for s in sales)
        comissao_total = sum(s.get("commission_value", 0) or 0 for s in sales)
        comissao_corretor = sum(_broker_comm(s) for s in sales)
        comissao_imobiliaria = sum(_agency_comm(s) for s in sales)
        entrada_total = sum(s.get("entrada", 0) or 0 for s in sales)
        ja_entrou = sum(_comm_received(s) for s in sales)
        falta_entrar = sum(_comm_pending(s) for s in sales)
        comissao_vencida = sum(_comm_overdue(s) for s in sales)

    ticket_medio = (total_vendido / qtd) if qtd else 0
    return {
        "total_vendido": total_vendido,
        "comissao_total": comissao_total,
        "comissao_corretor": comissao_corretor,
        "comissao_imobiliaria": comissao_imobiliaria,
        "entrada_total": entrada_total,
        "comissao_recebida": ja_entrou,
        "comissao_a_receber": falta_entrar,
        "comissao_vencida": comissao_vencida,
        "ticket_medio": ticket_medio,
        "ja_entrou": ja_entrou,
        "falta_entrar": falta_entrar,
        "qtd_vendas": qtd,
        "vgv_geral": (None if user.get("role") == "corretor" else vgv_geral),
        "qtd_geral": (None if user.get("role") == "corretor" else len(company)),
    }


def _in_range(s: dict, start: Optional[str], end: Optional[str]) -> bool:
    sd = s.get("sale_date", "") or ""
    if start and sd < start:
        return False
    if end and sd > end:
        return False
    return True


@api_router.get("/ranking")
async def ranking(month: Optional[int] = None, year: Optional[int] = None,
                  start: Optional[str] = None, end: Optional[str] = None,
                  user: dict = Depends(get_current_user)):
    if start or end:
        docs = await db.sales.find({}, {"_id": 0}).to_list(5000)
        sales = [s for s in docs if _in_range(s, start, end)]
    else:
        sales = await _company_sales(month, year)

    groups = await db.broker_groups.find({}, {"_id": 0}).to_list(500)
    name_to_group, group_label, group_members = {}, {}, {}
    for g in groups:
        group_label[g["id"]] = g.get("name") or "Dupla"
        group_members[g["id"]] = g.get("members", [])
        for m in g.get("members", []):
            name_to_group[(m or "").strip().lower()] = g["id"]

    by_broker = {}
    for s in sales:
        brokers = s.get("brokers") or [{
            "name": s.get("broker_name", "—") or "—", "split_pct": 100.0,
            "owner_id": s.get("owner_id")}]
        total = sum((b.get("split_pct") or 0) for b in brokers) or 100.0
        sv = s.get("sale_value", 0) or 0
        cv = s.get("commission_value", 0) or 0
        pool = _broker_pool(s)
        for b in brokers:
            name = (b.get("name") or "—")
            gid = name_to_group.get(name.strip().lower())
            key = f"grp:{gid}" if gid else name
            display = group_label.get(gid) if gid else name
            share = ((b.get("split_pct") or 0) / total) if total else 0
            bk = by_broker.setdefault(key, {
                "broker_name": display, "qtd": 0, "volume": 0.0,
                "comissao": 0.0, "comissao_corretor": 0.0, "photo": None,
                "is_group": bool(gid), "members": group_members.get(gid, []) if gid else [],
            })
            bk["qtd"] += share
            bk["volume"] += sv * share
            bk["comissao"] += cv * share
            bk["comissao_corretor"] += pool * share

    brokers = await db.brokers.find({}, {"_id": 0}).to_list(1000)
    photo_map = {}
    for br in brokers:
        for key in (br.get("war_name"), br.get("full_name")):
            if key and br.get("photo"):
                photo_map[key.strip().lower()] = br["photo"]
    corretores = await db.users.find({"role": "corretor"}, {"_id": 0}).to_list(1000)
    for c in corretores:
        for key in (c.get("war_name"), c.get("name")):
            if key and c.get("picture"):
                photo_map[key.strip().lower()] = c["picture"]
    for entry in by_broker.values():
        if entry["is_group"]:
            for m in entry["members"]:
                p = photo_map.get((m or "").strip().lower())
                if p:
                    entry["photo"] = p
                    break
        else:
            entry["photo"] = photo_map.get(entry["broker_name"].strip().lower())
    return list(by_broker.values())


# ---------------- Broker groups (duplas no ranking) ----------------
class BrokerGroupCreate(BaseModel):
    name: str
    members: List[str] = []


@api_router.get("/broker-groups")
async def list_broker_groups(user: dict = Depends(get_current_user)):
    docs = await db.broker_groups.find({}, {"_id": 0}).to_list(500)
    docs.sort(key=lambda g: (g.get("name") or "").lower())
    return docs


@api_router.post("/broker-groups")
async def create_broker_group(data: BrokerGroupCreate, user: dict = Depends(require_master)):
    if not (data.name or "").strip():
        raise HTTPException(status_code=400, detail="Informe o nome da dupla/grupo")
    members = [m.strip() for m in (data.members or []) if (m or "").strip()]
    if len(members) < 2:
        raise HTTPException(status_code=400, detail="Selecione ao menos 2 corretores para agrupar")
    doc = {"id": f"grp_{uuid.uuid4().hex[:10]}", "name": data.name.strip(),
           "members": members, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.broker_groups.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/broker-groups/{gid}")
async def update_broker_group(gid: str, data: BrokerGroupCreate, user: dict = Depends(require_master)):
    existing = await db.broker_groups.find_one({"id": gid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    members = [m.strip() for m in (data.members or []) if (m or "").strip()]
    if len(members) < 2:
        raise HTTPException(status_code=400, detail="Selecione ao menos 2 corretores para agrupar")
    upd = {"name": data.name.strip(), "members": members}
    await db.broker_groups.update_one({"id": gid}, {"$set": upd})
    return {**existing, **upd}


@api_router.delete("/broker-groups/{gid}")
async def delete_broker_group(gid: str, user: dict = Depends(require_master)):
    res = await db.broker_groups.delete_one({"id": gid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    return {"ok": True}


# ---------------- Notifications (notificações) ----------------
async def _notify(user_id: str, ntype: str, message: str, meta: dict = None):
    if not user_id:
        return
    await db.notifications.insert_one({
        "id": f"ntf_{uuid.uuid4().hex[:12]}", "user_id": user_id, "type": ntype,
        "message": message, "read": False, "meta": meta or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


def _rank_from_sales(sales):
    vol = {}
    for s in sales:
        brokers = s.get("brokers") or []
        if brokers:
            total = sum((b.get("split_pct") or 0) for b in brokers) or 100.0
            for b in brokers:
                oid = b.get("owner_id")
                if oid:
                    vol[oid] = vol.get(oid, 0) + (s.get("sale_value", 0) or 0) * ((b.get("split_pct") or 0) / total)
        else:
            oid = s.get("owner_id")
            if oid:
                vol[oid] = vol.get(oid, 0) + (s.get("sale_value", 0) or 0)
    order = sorted(vol.items(), key=lambda kv: kv[1], reverse=True)
    return {oid: i + 1 for i, (oid, _) in enumerate(order)}


def _owner_display(u):
    return (u.get("war_name") or u.get("name") or "Corretor") if u else "Corretor"


async def _post_sale_notifications(sale: dict):
    try:
        property_name = sale.get("property_name") or "loteamento"
        seller = sale.get("broker_name") or "Corretor"
        sale_msg = f"{seller} vendeu 1 lote no {property_name}."

        masters = await db.users.find({"role": "master"}, {"_id": 0}).to_list(50)
        corretores = await db.users.find({"role": "corretor"}, {"_id": 0}).to_list(1000)

        seller_ids = set(sale.get("broker_ids") or [])
        if sale.get("owner_id"):
            seller_ids.add(sale["owner_id"])

        # Nova venda -> gestor(es) + todos os corretores (menos quem vendeu)
        for m in masters:
            await _notify(m["user_id"], "new_sale", sale_msg, {"sale_id": sale.get("id")})
        for c in corretores:
            if c["user_id"] not in seller_ids:
                await _notify(c["user_id"], "new_sale", sale_msg, {"sale_id": sale.get("id")})

        sd = sale.get("sale_date", "") or ""
        try:
            month, year = int(sd[5:7]), int(sd[0:4])
        except (ValueError, IndexError):
            month = year = None
        mlabel = MESES_PT[month - 1] if month else "ano"

        company = await _company_sales(month, year)
        cur_ranks = _rank_from_sales(company)
        prev_ranks = _rank_from_sales([s for s in company if s.get("id") != sale.get("id")])
        all_sales = await db.sales.find({}, {"_id": 0}).to_list(5000)

        for oid in seller_ids:
            u = await db.users.find_one({"user_id": oid}, {"_id": 0})
            if not u or u.get("role") != "corretor":
                continue
            cur = cur_ranks.get(oid)
            prev = prev_ranks.get(oid)
            rose = cur is not None and (prev is None or cur < prev)
            if rose:
                await _notify(oid, "ranking", f"Você subiu para {cur}º no ranking de {mlabel}! 🚀")
                others_msg = f"{_owner_display(u)} subiu para {cur}º no ranking de {mlabel}."
                for m in masters:
                    await _notify(m["user_id"], "ranking", others_msg)
                for c in corretores:
                    if c["user_id"] != oid:
                        await _notify(c["user_id"], "ranking", others_msg)

            goals = await db.goals.find({"scope": "broker", "owner_id": oid}, {"_id": 0}).to_list(100)
            for g in goals:
                prog = await _goal_progress(g, all_sales)
                notified = set(g.get("notified_levels", []))
                level = None
                if prog["pct"] >= 100 and 100 not in notified:
                    level = 100
                elif prog["pct"] >= 90 and 90 not in notified:
                    level = 90
                if level:
                    mt = "VGV" if g.get("metric") == "vgv" else "vendas"
                    txt = (f"🎯 Meta de {mt} batida! Parabéns!" if level == 100
                           else f"Você está a {prog['pct']}% da sua meta de {mt}. Falta pouco!")
                    await _notify(oid, "goal", txt)
                    notified.add(level)
                    await db.goals.update_one({"id": g["id"]}, {"$set": {"notified_levels": list(notified)}})
    except Exception as e:
        logger.warning(f"notification generation failed: {e}")


@api_router.get("/notifications")
async def list_notifications(user: dict = Depends(get_current_user)):
    docs = await db.notifications.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(200)
    docs.sort(key=lambda d: d.get("created_at", ""), reverse=True)
    unread = sum(1 for d in docs if not d.get("read"))
    return {"items": docs[:50], "unread": unread}


@api_router.post("/notifications/read-all")
async def read_all_notifications(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["user_id"], "read": False}, {"$set": {"read": True}})
    return {"ok": True}


@api_router.patch("/notifications/{nid}/read")
async def read_notification(nid: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one({"id": nid, "user_id": user["user_id"]}, {"$set": {"read": True}})
    return {"ok": True}


@api_router.get("/monthly-series")
async def monthly_series(year: int, user: dict = Depends(get_current_user)):
    sales = await list_sales(year=year, user=user)
    months = [{"month": m, "volume": 0.0, "qtd": 0} for m in range(1, 13)]
    for s in sales:
        try:
            m = int(s.get("sale_date", "")[5:7])
            months[m - 1]["volume"] += s.get("sale_value", 0) or 0
            months[m - 1]["qtd"] += 1
        except (ValueError, IndexError):
            continue
    return months


# ---------------- Clients (clientes) ----------------
@api_router.get("/clients")
async def list_clients(user: dict = Depends(get_current_user)):
    docs = await db.sales.find(_scope_query(user), {"_id": 0}).to_list(5000)
    clients = {}
    for s in docs:
        nm = (s.get("client_name") or "").strip()
        if not nm:
            continue
        key = nm.lower()
        c = clients.setdefault(key, {
            "name": nm, "phone": "", "email": "", "birthdate": "", "broker": "",
            "qtd": 0, "volume": 0.0, "last_date": "", "purchases": [],
        })
        if s.get("client_phone") and not c["phone"]:
            c["phone"] = s["client_phone"]
        if s.get("client_email") and not c["email"]:
            c["email"] = s["client_email"]
        if s.get("client_birthdate") and not c["birthdate"]:
            c["birthdate"] = s["client_birthdate"]
        c["qtd"] += 1
        c["volume"] += s.get("sale_value", 0) or 0
        sd = s.get("sale_date", "") or ""
        if sd > c["last_date"]:
            c["last_date"] = sd
        c["purchases"].append({
            "id": s.get("id"), "property_name": s.get("property_name", ""),
            "quadra": s.get("quadra", ""), "lote": s.get("lote", ""),
            "sale_date": sd, "sale_value": s.get("sale_value", 0) or 0,
            "broker_name": s.get("broker_name", ""),
        })
    out = list(clients.values())
    for c in out:
        c["purchases"].sort(key=lambda p: p.get("sale_date", ""), reverse=True)
        c["broker"] = c["purchases"][0]["broker_name"] if c["purchases"] else ""
    out.sort(key=lambda c: c["name"].lower())
    return out


def _parse_mmdd(bd):
    bd = (bd or "").strip()
    if not bd:
        return None
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", bd)
    if m:
        return int(m.group(2)), int(m.group(3))
    m = re.match(r"^(\d{1,2})/(\d{1,2})(?:/\d{2,4})?$", bd)
    if m:
        return int(m.group(2)), int(m.group(1))
    return None


def _br_now():
    return datetime.now(timezone.utc) - timedelta(hours=3)


@api_router.get("/clients/birthdays")
async def clients_birthdays(month: Optional[int] = None, user: dict = Depends(get_current_user)):
    m = month or _br_now().month
    clients = await list_clients(user=user)
    out = []
    for c in clients:
        mmdd = _parse_mmdd(c.get("birthdate"))
        if not mmdd:
            continue
        bmonth, bday = mmdd
        if bmonth != m:
            continue
        out.append({**c, "bmonth": bmonth, "bday": bday})
    out.sort(key=lambda c: (c["bday"], c["name"].lower()))
    return out


async def _process_birthdays():
    try:
        now = _br_now()
        today_m, today_d = now.month, now.day
        masters = await db.users.find({"role": "master"}, {"_id": 0}).to_list(50)
        sales = await db.sales.find({}, {"_id": 0}).to_list(5000)
        agg = {}
        for s in sales:
            nm = (s.get("client_name") or "").strip()
            if not nm:
                continue
            c = agg.setdefault(nm.lower(), {"name": nm, "birthdate": "", "last_date": "", "broker_name": ""})
            if s.get("client_birthdate") and not c["birthdate"]:
                c["birthdate"] = s["client_birthdate"]
            sd = s.get("sale_date", "") or ""
            if sd >= c["last_date"]:
                c["last_date"] = sd
                c["broker_name"] = s.get("broker_name") or c["broker_name"]
        for c in agg.values():
            mmdd = _parse_mmdd(c["birthdate"])
            if not mmdd or mmdd[0] != today_m:
                continue
            bmonth, bday = mmdd
            corr = await _resolve_corretor_by_name((c["broker_name"] or "").split(" + ")[0])
            targets = [m["user_id"] for m in masters]
            if corr:
                targets.append(corr["user_id"])
            if bday == today_d:
                for t in targets:
                    await _notify(t, "birthday", f"🎂 Hoje é aniversário de {c['name']}! Que tal ligar para parabenizar?")
            if today_d == 1:
                for t in targets:
                    await _notify(t, "birthday", f"🎉 Aniversariante do mês: {c['name']} (dia {bday:02d}).")
    except Exception as e:
        logger.warning(f"birthday cron failed: {e}")


@api_router.post("/cron/birthdays")
async def cron_birthdays(background_tasks: BackgroundTasks,
                         authorization: Optional[str] = Header(None),
                         x_webhook_id: Optional[str] = Header(None)):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not WEBHOOK_CRON_SECRET or not token or not hmac.compare_digest(token, WEBHOOK_CRON_SECRET):
        raise HTTPException(status_code=401, detail="unauthorized")
    run_id = x_webhook_id or ""
    if run_id:
        if await db.cron_runs.find_one({"run_id": run_id}):
            return {"ok": True, "duplicate": True}
        await db.cron_runs.insert_one({"run_id": run_id, "at": datetime.now(timezone.utc).isoformat()})
    background_tasks.add_task(_process_birthdays)
    return {"ok": True}


# ---------------- Goals (metas) ----------------
async def _goal_progress(g: dict, all_sales: list):
    gsales = [s for s in all_sales if _match_period(s, g.get("month"), g["year"])]
    if g.get("scope") == "company":
        cur = (sum(s.get("sale_value", 0) or 0 for s in gsales)
               if g.get("metric") == "vgv" else len(gsales))
        label = "Imobiliária"
    else:
        oid = g.get("owner_id")
        vol, cnt = 0.0, 0
        for s in gsales:
            share = _partner_share(s, oid)
            if share > 0:
                vol += (s.get("sale_value", 0) or 0) * share
                cnt += 1
        cur = vol if g.get("metric") == "vgv" else cnt
        u = await db.users.find_one({"user_id": oid}, {"_id": 0})
        label = (u.get("war_name") or u.get("name")) if u else "Corretor"
    tgt = g.get("target") or 0
    pct = round(min(cur / tgt * 100, 100), 1) if tgt else 0
    return {**g, "current": cur, "pct": pct, "label": label}


@api_router.get("/goals")
async def list_goals(month: Optional[int] = None, year: Optional[int] = None,
                     user: dict = Depends(get_current_user)):
    yr = year or datetime.now(timezone.utc).year
    goals = await db.goals.find({"year": yr}, {"_id": 0}).to_list(500)
    if month is not None:
        goals = [g for g in goals if g.get("month") in (None, month)]
    if user.get("role") == "corretor":
        uid = user["user_id"]
        goals = [g for g in goals if g.get("scope") == "company" or g.get("owner_id") == uid]
    all_sales = await db.sales.find({}, {"_id": 0}).to_list(5000)
    out = [await _goal_progress(g, all_sales) for g in goals]
    out.sort(key=lambda g: (g.get("scope") != "company", g.get("label", "")))
    return out


@api_router.post("/goals", response_model=Goal)
async def create_goal(data: GoalCreate, user: dict = Depends(require_master)):
    if data.scope not in ("company", "broker"):
        raise HTTPException(status_code=400, detail="Escopo inválido")
    if data.metric not in ("vgv", "count"):
        raise HTTPException(status_code=400, detail="Métrica inválida")
    if data.scope == "broker" and not data.owner_id:
        raise HTTPException(status_code=400, detail="Selecione o corretor da meta")
    if (data.target or 0) <= 0:
        raise HTTPException(status_code=400, detail="Informe um alvo maior que zero")
    goal = Goal(**data.model_dump())
    await db.goals.insert_one(goal.model_dump())
    return goal


@api_router.put("/goals/{goal_id}", response_model=Goal)
async def update_goal(goal_id: str, data: GoalCreate, user: dict = Depends(require_master)):
    existing = await db.goals.find_one({"id": goal_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Meta não encontrada")
    upd = data.model_dump()
    await db.goals.update_one({"id": goal_id}, {"$set": upd})
    return {**existing, **upd}


@api_router.delete("/goals/{goal_id}")
async def delete_goal(goal_id: str, user: dict = Depends(require_master)):
    res = await db.goals.delete_one({"id": goal_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Meta não encontrada")
    return {"ok": True}


# ---------------- Import (Excel / CSV / PDF) ----------------
COLMAP = {
    "loteamento": "property_name", "imovel": "property_name", "empreendimento": "property_name", "lote amento": "property_name",
    "quadra": "quadra", "qd": "quadra",
    "lote": "lote", "lt": "lote",
    "cliente": "client_name", "nome": "client_name", "nome do cliente": "client_name", "comprador": "client_name",
    "telefone": "client_phone", "numero": "client_phone", "numero cliente": "client_phone",
    "numero do cliente": "client_phone", "celular": "client_phone", "fone": "client_phone", "contato": "client_phone",
    "email": "client_email", "e-mail": "client_email",
    "corretor": "broker_name", "vendedor": "broker_name", "corretora": "broker_name",
    "data": "sale_date", "data da venda": "sale_date", "data venda": "sale_date",
    "valor": "sale_value", "valor da venda": "sale_value", "valor venda": "sale_value", "preco": "sale_value",
    "comissao": "commission_rate", "comissao %": "commission_rate", "% comissao": "commission_rate",
    "percentual": "commission_rate", "percentual de comissao": "commission_rate",
    "valor comissao": "commission_value", "comissao total": "commission_value", "valor da comissao": "commission_value",
    "entrada": "entrada", "valor entrada": "entrada", "valor de entrada": "entrada",
    "parcelas": "num_parcelas", "numero de parcelas": "num_parcelas", "n parcelas": "num_parcelas",
    "qtd parcelas": "num_parcelas",
}


def _norm(s):
    s = str(s or "").strip().lower()
    import unicodedata
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s)


def _clean(v):
    if v is None:
        return ""
    if isinstance(v, float) and math.isnan(v):
        return ""
    return str(v).strip()


def parse_brl(v):
    s = _clean(v)
    if not s:
        return 0.0
    s = re.sub(r"[^0-9,.-]", "", s)
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_date(v):
    s = _clean(v)
    today = datetime.now(timezone.utc).date().isoformat()
    if not s:
        return today
    s = s.split(" ")[0]
    try:
        if "/" in s:
            d, m, y = s.split("/")
            if len(y) == 2:
                y = "20" + y
            return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
        if "-" in s:
            p = s.split("-")
            if len(p[0]) == 4:
                return f"{int(p[0]):04d}-{int(p[1]):02d}-{int(p[2]):02d}"
            d, m, y = p
            if len(y) == 2:
                y = "20" + y
            return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
    except (ValueError, IndexError):
        return today
    return today


def _add_months(iso, n):
    y, m, d = [int(x) for x in iso.split("-")]
    idx = m - 1 + n
    y += idx // 12
    m2 = idx % 12 + 1
    day = min(d, monthrange(y, m2)[1])
    return f"{y:04d}-{m2:02d}-{day:02d}"


def rows_from_df(df):
    mapping = {c: COLMAP.get(_norm(c)) for c in df.columns}
    out = []
    for _, row in df.iterrows():
        d = {}
        for c, target in mapping.items():
            if target:
                d[target] = row[c]
        out.append(d)
    return out


def rows_from_pdf(content):
    import pdfplumber
    rows = []
    header = None
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables() or []:
                if not table or len(table) < 2:
                    continue
                if header is None:
                    header = [COLMAP.get(_norm(h)) for h in table[0]]
                    body = table[1:]
                else:
                    body = table
                for r in body:
                    d = {}
                    for i, cell in enumerate(r):
                        if i < len(header) and header[i]:
                            d[header[i]] = cell
                    if d:
                        rows.append(d)
    return rows


def build_sale_from_row(d, user_id):
    prop = _clean(d.get("property_name"))
    sv = parse_brl(d.get("sale_value"))
    if not prop and not sv:
        return None
    rate = parse_brl(d.get("commission_rate"))
    cval = parse_brl(d.get("commission_value"))
    if not cval and rate:
        cval = round(sv * rate / 100, 2)
    broker_comm = round(cval * 0.6, 2)
    agency_comm = round(cval - broker_comm, 2)
    entrada = parse_brl(d.get("entrada"))
    n = int(parse_brl(d.get("num_parcelas")) or 0)
    date = parse_date(d.get("sale_date"))
    parcelado = n > 1
    installments = []
    if parcelado:
        remaining = max(sv - entrada, 0)
        per = round(remaining / n, 2)
        acc = 0.0
        for i in range(n):
            val = per if i < n - 1 else round(remaining - acc, 2)
            acc += per
            installments.append({
                "number": i + 1, "due_date": _add_months(date, i + 1),
                "value": val, "received": False, "received_date": None,
            })
    return Sale(
        property_name=prop, quadra=_clean(d.get("quadra")), lote=_clean(d.get("lote")),
        client_name=_clean(d.get("client_name")), client_phone=_clean(d.get("client_phone")),
        client_email=_clean(d.get("client_email")), broker_name=_clean(d.get("broker_name")) or "—",
        brokers=[{"name": _clean(d.get("broker_name")) or "—", "split_pct": 100.0, "owner_id": None}],
        sale_date=date, sale_value=sv, commission_rate=rate, commission_value=cval,
        broker_split=60.0, broker_commission=broker_comm, agency_commission=agency_comm,
        entrada=entrada, parcelado=parcelado, installments=installments, notes="",
        user_id=user_id, owner_id=user_id,
    )


@api_router.post("/sales/import")
async def import_sales(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    content = await file.read()
    name = (file.filename or "").lower()
    try:
        if name.endswith(".csv"):
            rows = rows_from_df(pd.read_csv(io.BytesIO(content)))
        elif name.endswith((".xlsx", ".xls")):
            rows = rows_from_df(pd.read_excel(io.BytesIO(content)))
        elif name.endswith(".pdf"):
            rows = rows_from_pdf(content)
        else:
            raise HTTPException(status_code=422, detail="Formato não suportado. Envie .xlsx, .csv ou .pdf.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Não foi possível ler o arquivo: {e}")

    sales = [s for s in (build_sale_from_row(d, user["user_id"]) for d in rows) if s]
    if not sales:
        raise HTTPException(
            status_code=422,
            detail="Nenhuma venda válida encontrada. Verifique as colunas: Loteamento, Quadra, Lote, Cliente, Corretor, Data, Valor, Comissão %, Entrada, Parcelas.",
        )
    await db.sales.insert_many([s.model_dump() for s in sales])
    return {"imported": len(sales)}


# ---------------- Import inteligente (IA / Gemini) ----------------
AI_IMPORT_SYSTEM = (
    "Você é um assistente especialista em extrair vendas de imóveis/loteamentos de relatórios "
    "de construtoras (planilhas ou PDFs). Você entende português do Brasil, valores em Real (R$) "
    "e datas em formato brasileiro. Sempre responda APENAS com JSON válido, sem comentários."
)


def _extract_text_for_ai(content: bytes, filename: str) -> str:
    name = (filename or "").lower()
    if name.endswith(".csv"):
        try:
            return content.decode("utf-8")
        except UnicodeDecodeError:
            return content.decode("latin-1", errors="ignore")
    if name.endswith((".xlsx", ".xls")):
        sheets = pd.read_excel(io.BytesIO(content), sheet_name=None)
        return "\n\n".join(f"# Planilha: {s}\n{df.to_csv(index=False)}" for s, df in sheets.items())
    if name.endswith(".pdf"):
        import pdfplumber
        out = []
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                out.append(page.extract_text() or "")
                for t in page.extract_tables() or []:
                    out.append("\n".join(" | ".join((c or "") for c in row) for row in t))
        return "\n".join(out)
    raise HTTPException(status_code=422, detail="Formato não suportado. Envie .xlsx, .csv ou .pdf.")


def _parse_ai_json(raw: str):
    import json
    s = (raw or "").strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z]*\n?", "", s)
        s = re.sub(r"\n?```$", "", s).strip()
    m = re.search(r"\[.*\]", s, re.DOTALL)
    if m:
        s = m.group(0)
    try:
        data = json.loads(s)
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="A IA não retornou dados válidos. Tente novamente ou revise o arquivo.")
    return data if isinstance(data, list) else []


AI_IMPORT_PROMPT = (
    "Extraia TODAS as vendas e responda APENAS com um array JSON "
    "(sem texto extra, sem markdown). Cada item deve ter os campos: property_name (loteamento), "
    "quadra, lote, client_name, client_phone, client_email, broker_name (corretor), "
    "sale_date (converta qualquer formato para YYYY-MM-DD), sale_value (número puro, sem R$), "
    "commission_rate (número ou null), commission_value (número ou null), num_parcelas (inteiro ou null). "
    "Use null quando o dado não existir. Ignore linhas de cabeçalho/total/rodapé."
)
IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif", ".gif", ".bmp")


async def _ai_extract_sales(text: str):
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="Chave de IA não configurada.")
    chat = LlmChat(api_key=key, session_id=f"import_{uuid.uuid4().hex[:8]}",
                   system_message=AI_IMPORT_SYSTEM).with_model("gemini", "gemini-2.5-flash")
    resp = await chat.send_message(UserMessage(text=AI_IMPORT_PROMPT + "\n\nRELATÓRIO:\n" + text))
    raw = resp if isinstance(resp, str) else getattr(resp, "content", str(resp))
    return _parse_ai_json(raw)


async def _ai_extract_sales_from_image(content: bytes):
    import base64
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="Chave de IA não configurada.")
    b64 = base64.b64encode(content).decode()
    chat = LlmChat(api_key=key, session_id=f"import_img_{uuid.uuid4().hex[:8]}",
                   system_message=AI_IMPORT_SYSTEM).with_model("gemini", "gemini-2.5-flash")
    msg = UserMessage(text=AI_IMPORT_PROMPT + "\n\nO relatório está na imagem (foto) anexada. Leia a tabela da foto.",
                      file_contents=[ImageContent(image_base64=b64)])
    resp = await chat.send_message(msg)
    raw = resp if isinstance(resp, str) else getattr(resp, "content", str(resp))
    return _parse_ai_json(raw)


def _dup_key(d: dict) -> str:
    return "|".join([
        _norm(d.get("client_name")), _norm(d.get("property_name")),
        _norm(str(d.get("quadra") or "")), _norm(str(d.get("lote") or "")),
        (d.get("sale_date") or ""), str(d.get("sale_value") or ""),
        _norm(d.get("broker_name")),
    ])


@api_router.post("/sales/import-ai/preview")
async def import_ai_preview(file: UploadFile = File(...), user: dict = Depends(require_master)):
    content = await file.read()
    fname = (file.filename or "").lower()
    if fname.endswith(IMAGE_EXTS):
        rows = await _ai_extract_sales_from_image(content)
    else:
        text = _extract_text_for_ai(content, fname)
        if not text.strip():
            raise HTTPException(status_code=422, detail="Não foi possível ler conteúdo do arquivo.")
        if len(text) > 60000:
            text = text[:60000]
        rows = await _ai_extract_sales(text)
    existing = await db.sales.find({}, {"_id": 0}).to_list(5000)
    existing_keys = {_dup_key(s): s.get("id") for s in existing}
    lot_set = {(l.get("name") or "").strip().lower() for l in await db.loteamentos.find({}, {"_id": 0}).to_list(3000)}
    corr_names = set()
    for c in await db.users.find({"role": "corretor"}, {"_id": 0}).to_list(1000):
        for k in (c.get("war_name"), c.get("name")):
            if k:
                corr_names.add(k.strip().lower())
    out = []
    for d in rows:
        sv = parse_brl(d.get("sale_value"))
        rate = parse_brl(d.get("commission_rate"))
        cval = parse_brl(d.get("commission_value"))
        if not cval and rate:
            cval = round(sv * rate / 100, 2)
        item = {
            "property_name": _clean(d.get("property_name")), "quadra": _clean(d.get("quadra")),
            "lote": _clean(d.get("lote")), "client_name": _clean(d.get("client_name")),
            "client_phone": _clean(d.get("client_phone")), "client_email": _clean(d.get("client_email")),
            "broker_name": _clean(d.get("broker_name")), "sale_date": parse_date(d.get("sale_date")),
            "sale_value": sv, "commission_rate": rate, "commission_value": cval,
            "num_parcelas": int(parse_brl(d.get("num_parcelas")) or 0),
        }
        k = _dup_key(item)
        item["is_duplicate"] = k in existing_keys
        item["duplicate_of"] = existing_keys.get(k)
        item["new_loteamento"] = bool(item["property_name"]) and item["property_name"].lower() not in lot_set
        item["new_corretor"] = bool(item["broker_name"]) and item["broker_name"].lower() not in corr_names
        out.append(item)
    return {"rows": out, "total": len(out), "duplicates": sum(1 for r in out if r["is_duplicate"])}


class AIImportConfirm(BaseModel):
    rows: List[dict] = []


@api_router.post("/sales/import-ai/confirm")
async def import_ai_confirm(data: AIImportConfirm, user: dict = Depends(require_master)):
    created, new_brokers, new_lots = 0, 0, 0
    for d in data.rows:
        prop = _clean(d.get("property_name"))
        sv = parse_brl(d.get("sale_value"))
        if not prop and not sv:
            continue
        if prop and not await _loteamento_exists(prop):
            await _ensure_loteamento(prop)
            new_lots += 1
        broker = _clean(d.get("broker_name"))
        owner_id, owner_name = user["user_id"], _display(user)
        if broker:
            corr = await _resolve_corretor_by_name(broker)
            if not corr:
                uid = f"user_{uuid.uuid4().hex[:12]}"
                await db.users.insert_one({
                    "user_id": uid, "email": "", "name": "", "war_name": broker, "phone": "",
                    "creci": "", "picture": "", "role": "corretor", "active": True, "token_version": 0,
                    "manual": True, "created_at": datetime.now(timezone.utc).isoformat(),
                })
                corr = {"user_id": uid, "war_name": broker}
                new_brokers += 1
            owner_id = corr["user_id"]
            owner_name = corr.get("war_name") or corr.get("name") or broker
        rate = parse_brl(d.get("commission_rate"))
        cval = parse_brl(d.get("commission_value"))
        if not cval and rate:
            cval = round(sv * rate / 100, 2)
        n = int(parse_brl(d.get("num_parcelas")) or 0)
        sd = parse_date(d.get("sale_date"))
        parcelado = n > 1
        installments = []
        if parcelado and cval:
            per = round(cval / n, 2)
            acc = 0.0
            for i in range(n):
                val = per if i < n - 1 else round(cval - acc, 2)
                acc += per
                installments.append({"number": i + 1, "due_date": _add_months(sd, i + 1),
                                     "value": val, "received": False, "received_date": None})
        bc = round(cval * 0.6, 2)
        sale = Sale(
            property_name=prop, quadra=_clean(d.get("quadra")), lote=_clean(d.get("lote")),
            client_name=_clean(d.get("client_name")), client_phone=_clean(d.get("client_phone")),
            client_email=_clean(d.get("client_email")), broker_name=broker or owner_name,
            brokers=[{"name": broker or owner_name, "split_pct": 100.0, "owner_id": owner_id}],
            sale_date=sd, sale_value=sv, commission_rate=rate, commission_value=cval,
            broker_split=60.0, broker_commission=bc, agency_commission=round(cval - bc, 2),
            parcelado=parcelado, installments=installments, user_id=user["user_id"],
            owner_id=owner_id, owner_name=owner_name, broker_ids=[owner_id],
        )
        await db.sales.insert_one(sale.model_dump())
        created += 1
    return {"imported": created, "new_corretores": new_brokers, "new_loteamentos": new_lots}


def _normalize_extracted(d: dict) -> dict:
    sv = parse_brl(d.get("sale_value"))
    rate = parse_brl(d.get("commission_rate"))
    cval = parse_brl(d.get("commission_value"))
    if not cval and rate:
        cval = round(sv * rate / 100, 2)
    return {
        "property_name": _clean(d.get("property_name")), "quadra": _clean(d.get("quadra")),
        "lote": _clean(d.get("lote")), "client_name": _clean(d.get("client_name")),
        "client_phone": _clean(d.get("client_phone")), "client_email": _clean(d.get("client_email")),
        "broker_name": _clean(d.get("broker_name")), "sale_date": parse_date(d.get("sale_date")),
        "sale_value": sv, "commission_rate": rate, "commission_value": cval,
        "num_parcelas": int(parse_brl(d.get("num_parcelas")) or 0),
    }


@api_router.post("/sales/extract-one")
async def extract_one(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    content = await file.read()
    fname = (file.filename or "").lower()
    if fname.endswith(IMAGE_EXTS):
        rows = await _ai_extract_sales_from_image(content)
    else:
        text = _extract_text_for_ai(content, fname)
        if not text.strip():
            raise HTTPException(status_code=422, detail="Não foi possível ler o arquivo.")
        if len(text) > 60000:
            text = text[:60000]
        rows = await _ai_extract_sales(text)
    if not rows:
        raise HTTPException(status_code=422, detail="Não consegui extrair dados do arquivo. Tente uma foto mais nítida.")
    return {"extracted": _normalize_extracted(rows[0])}


# ---------------- Export (Excel / PDF) ----------------
MESES_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
            "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]


def _fmt_brl(v):
    s = f"{(v or 0):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return "R$ " + s


def _fmt_date(iso):
    try:
        y, m, d = iso.split("-")
        return f"{d}/{m}/{y}"
    except (ValueError, AttributeError):
        return iso or ""


def _period_label(month, year):
    if month:
        return f"{MESES_PT[month - 1]} de {year}"
    return f"Ano de {year}"


def _export_rows(sales):
    rows = []
    for s in sales:
        bc = _broker_comm(s)
        ac = _agency_comm(s)
        pend = _pending_amount(s)
        recv = _received_amount(s)
        status = "À vista" if not s.get("parcelado") else (
            "Quitado" if pend <= 0 else "A receber")
        rows.append({
            "Data": _fmt_date(s.get("sale_date")),
            "Loteamento": s.get("property_name", ""),
            "Quadra": s.get("quadra", ""),
            "Lote": s.get("lote", ""),
            "Cliente": s.get("client_name", ""),
            "Corretor": s.get("broker_name", ""),
            "Valor da venda": s.get("sale_value", 0) or 0,
            "Comissão %": s.get("commission_rate", 0) or 0,
            "Comissão total": s.get("commission_value", 0) or 0,
            "Comissão corretor": bc,
            "Comissão imobiliária": ac,
            "Entrada": s.get("entrada", 0) or 0,
            "Já recebido": recv,
            "A receber": pend,
            "Status": status,
        })
    return rows


@api_router.get("/export/xlsx")
async def export_xlsx(month: Optional[int] = None, year: Optional[int] = None,
                      user: dict = Depends(get_current_user)):
    sales = await list_sales(month=month, year=year, user=user)
    rows = _export_rows(sales)
    df = pd.DataFrame(rows)
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Vendas")
    buf.seek(0)
    fname = f"vendas-brilhantes-{year}{('-' + str(month).zfill(2)) if month else ''}.xlsx"
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@api_router.get("/export/pdf")
async def export_pdf(month: Optional[int] = None, year: Optional[int] = None,
                     user: dict = Depends(get_current_user)):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    sales = await list_sales(month=month, year=year, user=user)
    rows = _export_rows(sales)

    total_vendido = sum(r["Valor da venda"] for r in rows)
    total_com = sum(r["Comissão total"] for r in rows)
    total_corr = sum(r["Comissão corretor"] for r in rows)
    total_imob = sum(r["Comissão imobiliária"] for r in rows)
    total_recv = sum(r["Já recebido"] for r in rows)
    total_pend = sum(r["A receber"] for r in rows)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4),
                            leftMargin=12 * mm, rightMargin=12 * mm,
                            topMargin=12 * mm, bottomMargin=12 * mm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("t", parent=styles["Title"], textColor=colors.HexColor("#0F382C"), fontSize=18)
    sub_style = ParagraphStyle("s", parent=styles["Normal"], textColor=colors.HexColor("#6b7280"), fontSize=10)
    cell = ParagraphStyle("c", parent=styles["Normal"], fontSize=7, leading=9)
    head = ParagraphStyle("h", parent=styles["Normal"], fontSize=7, leading=9, textColor=colors.white)

    logo_path = ROOT_DIR.parent / "frontend" / "public" / "logo-light.jpg"
    elements = []
    if logo_path.exists():
        elements.append(Image(str(logo_path), width=24 * mm, height=24 * mm))
        elements.append(Spacer(1, 3 * mm))
    elements += [
        Paragraph("Brilhante's Imóveis — Relatório de Vendas", title_style),
        Paragraph(f"Período: {_period_label(month, year)} &nbsp;·&nbsp; {len(rows)} venda(s)", sub_style),
        Spacer(1, 8 * mm),
    ]

    headers = ["Data", "Loteamento", "Qd/Lt", "Cliente", "Corretor", "Valor",
               "Com.", "Corretor", "Imob.", "Entrada", "Recebido", "A receber", "Status"]
    data = [[Paragraph(h, head) for h in headers]]
    for r in rows:
        ql = " / ".join([str(r["Quadra"]), str(r["Lote"])]) if (r["Quadra"] or r["Lote"]) else "—"
        data.append([
            Paragraph(r["Data"], cell), Paragraph(str(r["Loteamento"]), cell),
            Paragraph(ql, cell), Paragraph(str(r["Cliente"]) or "—", cell),
            Paragraph(str(r["Corretor"]), cell), Paragraph(_fmt_brl(r["Valor da venda"]), cell),
            Paragraph(_fmt_brl(r["Comissão total"]), cell), Paragraph(_fmt_brl(r["Comissão corretor"]), cell),
            Paragraph(_fmt_brl(r["Comissão imobiliária"]), cell), Paragraph(_fmt_brl(r["Entrada"]), cell),
            Paragraph(_fmt_brl(r["Já recebido"]), cell), Paragraph(_fmt_brl(r["A receber"]), cell),
            Paragraph(r["Status"], cell),
        ])
    data.append([
        Paragraph("<b>TOTAIS</b>", cell), "", "", "", "",
        Paragraph(f"<b>{_fmt_brl(total_vendido)}</b>", cell),
        Paragraph(f"<b>{_fmt_brl(total_com)}</b>", cell),
        Paragraph(f"<b>{_fmt_brl(total_corr)}</b>", cell),
        Paragraph(f"<b>{_fmt_brl(total_imob)}</b>", cell), "",
        Paragraph(f"<b>{_fmt_brl(total_recv)}</b>", cell),
        Paragraph(f"<b>{_fmt_brl(total_pend)}</b>", cell), "",
    ])

    table = Table(data, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F382C")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d1d5db")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#f3f6f5")]),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#efe7d4")),
        ("SPAN", (0, -1), (4, -1)),
    ]))
    elements.append(table)
    doc.build(elements)
    buf.seek(0)
    fname = f"relatorio-brilhantes-{year}{('-' + str(month).zfill(2)) if month else ''}.pdf"
    return Response(
        content=buf.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


# ---------------- Attachments (anexos por venda) ----------------
class AttachmentMeta(BaseModel):
    id: str
    sale_id: str
    filename: str
    content_type: str
    size: int
    created_at: str


@api_router.post("/sales/{sale_id}/attachments", response_model=AttachmentMeta)
async def upload_attachment(sale_id: str, file: UploadFile = File(...),
                            user: dict = Depends(get_current_user)):
    sale = await db.sales.find_one({"id": sale_id, "user_id": user["user_id"]}, {"_id": 0})
    if not sale:
        raise HTTPException(status_code=404, detail="Venda não encontrada")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Arquivo muito grande (máx. 10 MB).")
    att = {
        "id": f"att_{uuid.uuid4().hex[:12]}",
        "sale_id": sale_id,
        "user_id": user["user_id"],
        "filename": file.filename or "arquivo",
        "content_type": file.content_type or "application/octet-stream",
        "size": len(content),
        "data": base64.b64encode(content).decode("ascii"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.attachments.insert_one(att)
    return AttachmentMeta(**{k: att[k] for k in ("id", "sale_id", "filename", "content_type", "size", "created_at")})


@api_router.get("/sales/{sale_id}/attachments", response_model=List[AttachmentMeta])
async def list_attachments(sale_id: str, user: dict = Depends(get_current_user)):
    docs = await db.attachments.find(
        {"sale_id": sale_id, "user_id": user["user_id"]},
        {"_id": 0, "data": 0},
    ).to_list(100)
    return docs


@api_router.get("/attachments/{att_id}/download")
async def download_attachment(att_id: str, user: dict = Depends(get_current_user)):
    att = await db.attachments.find_one({"id": att_id, "user_id": user["user_id"]}, {"_id": 0})
    if not att:
        raise HTTPException(status_code=404, detail="Anexo não encontrado")
    content = base64.b64decode(att["data"])
    return Response(
        content=content, media_type=att["content_type"],
        headers={"Content-Disposition": f'attachment; filename="{att["filename"]}"'},
    )


@api_router.delete("/attachments/{att_id}")
async def delete_attachment(att_id: str, user: dict = Depends(get_current_user)):
    res = await db.attachments.delete_one({"id": att_id, "user_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Anexo não encontrado")
    return {"ok": True}


@api_router.get("/corretores")
async def list_corretores(user: dict = Depends(require_master)):
    users = await db.users.find({"role": "corretor"}, {"_id": 0}).to_list(500)
    sales = await db.sales.find({}, {"_id": 0}).to_list(5000)
    agg = {}
    for s in sales:
        sv = s.get("sale_value", 0) or 0
        pool = _broker_pool(s)
        brokers = s.get("brokers") or []
        if brokers:
            total = sum((b.get("split_pct") or 0) for b in brokers) or 100.0
            for b in brokers:
                oid = b.get("owner_id")
                if not oid:
                    continue
                share = ((b.get("split_pct") or 0) / total) if total else 0
                a = agg.setdefault(oid, {"qtd": 0, "volume": 0.0, "comm": 0.0})
                a["qtd"] += share
                a["volume"] += sv * share
                a["comm"] += pool * share
        else:
            oid = s.get("owner_id")
            if oid:
                a = agg.setdefault(oid, {"qtd": 0, "volume": 0.0, "comm": 0.0})
                a["qtd"] += 1
                a["volume"] += sv
                a["comm"] += pool
    out = []
    for u in users:
        has_login = bool(u.pop("password_hash", None))
        a = agg.get(u["user_id"], {"qtd": 0, "volume": 0.0, "comm": 0.0})
        out.append({
            **u,
            "has_login": has_login,
            "qtd_vendas": a["qtd"],
            "volume": a["volume"],
            "comissao_corretor": a["comm"],
        })
    out.sort(key=lambda x: x.get("volume", 0), reverse=True)
    return out


@api_router.post("/corretores")
async def create_corretor(data: CorretorProfile, user: dict = Depends(require_master)):
    if not (data.name or data.war_name):
        raise HTTPException(status_code=400, detail="Informe o nome do corretor")
    email = (data.email or "").strip().lower()
    if email and await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")
    uid = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": uid, "email": email, "name": data.name or "", "war_name": data.war_name or "",
        "phone": data.phone or "", "creci": data.creci or "", "picture": data.picture or "",
        "role": "corretor", "active": data.active, "token_version": 0, "manual": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/corretores/{owner_id}")
async def update_corretor(owner_id: str, data: CorretorProfile, user: dict = Depends(require_master)):
    existing = await db.users.find_one({"user_id": owner_id, "role": "corretor"}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Corretor não encontrado")
    email = (data.email or "").strip().lower()
    if email and email != existing.get("email"):
        if await db.users.find_one({"email": email, "user_id": {"$ne": owner_id}}):
            raise HTTPException(status_code=400, detail="E-mail já cadastrado por outro usuário")
    upd = {"name": data.name or "", "war_name": data.war_name or "", "email": email,
           "phone": data.phone or "", "creci": data.creci or "", "picture": data.picture or "",
           "active": data.active}
    await db.users.update_one({"user_id": owner_id}, {"$set": upd})
    return {"ok": True}


@api_router.delete("/corretores/{owner_id}")
async def delete_corretor(owner_id: str, user: dict = Depends(require_master)):
    res = await db.users.delete_one({"user_id": owner_id, "role": "corretor"})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Corretor não encontrado")
    return {"ok": True}


@api_router.get("/corretores/{owner_id}/sales")
async def corretor_sales(owner_id: str, user: dict = Depends(require_master)):
    docs = await db.sales.find(
        {"$or": [{"owner_id": owner_id}, {"broker_ids": owner_id}]}, {"_id": 0}).to_list(2000)
    docs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return docs


@api_router.patch("/corretores/{owner_id}/active")
async def toggle_corretor_active(owner_id: str, request: Request, user: dict = Depends(require_master)):
    body = await request.json()
    await db.users.update_one({"user_id": owner_id, "role": "corretor"},
                              {"$set": {"active": bool(body.get("active", True))}})
    return {"ok": True}


@api_router.get("/history")
async def history(user: dict = Depends(get_current_user)):
    q = {} if user.get("role") == "master" else {"deleted_by": user["user_id"]}
    docs = await db.sales_history.find(q, {"_id": 0}).to_list(500)
    docs.sort(key=lambda d: d.get("deleted_at", ""), reverse=True)
    return docs


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup():
    try:
        await db.login_attempts.create_index("identifier")
        await db.login_attempts.create_index("email")
        await db.password_reset_tokens.create_index("token_hash", unique=True)
        await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
        await db.password_reset_requests.create_index("created_at", expireAfterSeconds=900)
    except Exception as e:
        logger.warning(f"index setup: {e}")
    if MASTER_EMAILS:
        await db.users.update_many({"email": {"$in": list(MASTER_EMAILS)}},
                                   {"$set": {"role": "master"}})
    try:
        for n in await db.sales.distinct("property_name"):
            await _ensure_loteamento(n)
    except Exception as e:
        logger.warning(f"loteamento backfill: {e}")
    # Unify legacy manual brokers into corretor users
    try:
        for b in await db.brokers.find({}, {"_id": 0}).to_list(1000):
            if not (b.get("war_name") or b.get("full_name")):
                continue
            match = await _resolve_corretor_by_name(b.get("war_name")) or await _resolve_corretor_by_name(b.get("full_name"))
            if match:
                if b.get("photo") and not match.get("picture"):
                    await db.users.update_one({"user_id": match["user_id"]}, {"$set": {"picture": b["photo"]}})
                continue
            email = (b.get("email") or "").strip().lower()
            if email and await db.users.find_one({"email": email}):
                email = ""
            await db.users.insert_one({
                "user_id": f"user_{uuid.uuid4().hex[:12]}", "email": email,
                "name": b.get("full_name") or "", "war_name": b.get("war_name") or "",
                "phone": b.get("phone") or "", "creci": b.get("creci") or "",
                "picture": b.get("photo") or "", "role": "corretor", "active": True,
                "token_version": 0, "manual": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
    except Exception as e:
        logger.warning(f"broker migration: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
