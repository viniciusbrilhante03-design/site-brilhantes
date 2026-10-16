from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File, Form, Header, Query, BackgroundTasks
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
import unicodedata

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
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")


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


def _norm_name(s: str) -> str:
    """Normaliza nome para comparação: sem acento, minúsculo, espaços colapsados."""
    s = (s or "").strip().lower()
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).strip()


def _display(user: dict) -> str:
    return user.get("war_name") or user.get("name") or user.get("email") or "—"


def _scope_query(user: dict) -> dict:
    if user.get("role") == "master":
        return {}
    uid = user["user_id"]
    return {"$or": [{"owner_id": uid}, {"broker_ids": uid}]}


def _user_names(user: dict) -> set:
    return {n for n in [(user.get("war_name") or "").strip().lower(),
                        (user.get("name") or "").strip().lower()] if n}


def _sale_belongs(s: dict, user: dict, names: set = None) -> bool:
    uid = user["user_id"]
    if s.get("owner_id") == uid or uid in (s.get("broker_ids") or []):
        return True
    if names is None:
        names = _user_names(user)
    if (s.get("broker_name") or "").strip().lower() in names:
        return True
    for b in (s.get("brokers") or []):
        if b.get("owner_id") == uid or (b.get("name") or "").strip().lower() in names:
            return True
    return False


async def _scoped_sales(user: dict) -> list:
    """Vendas visíveis ao usuário: casa por owner_id/broker_ids E por nome do corretor (igual ao ranking)."""
    docs = await db.sales.find({}, {"_id": 0}).to_list(5000)
    if user.get("role") == "master":
        return [s for s in docs if s.get("status") != "cancelled"]
    names = _user_names(user)
    return [s for s in docs if s.get("status") != "cancelled" and _sale_belongs(s, user, names)]


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
    gross: float = 0.0
    discount: float = 0.0
    net: float = 0.0
    paid: float = 0.0
    status: str = "pendente"
    payments: List[dict] = []


class Discount(BaseModel):
    type: Optional[str] = ""     # nf | boleto | comercial | outras_taxas | outros_descontos
    value: float = 0.0
    reason: Optional[str] = ""
    notes: Optional[str] = ""


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
    financed_value: float = 0.0
    commission_base: str = "sale"       # "sale" (valor da venda) | "financed" (valor financiado)
    discounts: List[Discount] = []
    commission_gross: float = 0.0
    commission_net: float = 0.0
    broker_split: float = 60.0  # % que vai para o corretor
    broker_commission: float = 0.0
    agency_commission: float = 0.0
    commission_received: bool = False
    entrada: float = 0.0
    parcelado: bool = False
    installments: List[Installment] = []
    notes: Optional[str] = ""
    client_id: Optional[str] = ""
    client_has_spouse: bool = False
    client_spouse: Optional[dict] = None
    client_origin: Optional[str] = ""
    client_origin_other: Optional[str] = ""
    client_notes: Optional[str] = ""


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
    cpf: Optional[str] = ""
    birthdate: Optional[str] = ""   # YYYY-MM-DD
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
    cpf: Optional[str] = ""
    birthdate: Optional[str] = ""   # YYYY-MM-DD
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


class ClientSpouse(BaseModel):
    name: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    cpf: Optional[str] = ""
    birthdate: Optional[str] = ""


class ClientCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    cpf: Optional[str] = ""
    birthdate: Optional[str] = ""
    has_spouse: bool = False
    spouse: Optional[ClientSpouse] = None
    origin: Optional[str] = ""          # acao|lead|carteira|stand|indicacao|outro
    origin_other: Optional[str] = ""
    notes: Optional[str] = ""


class Client(ClientCreate):
    id: str = Field(default_factory=lambda: f"client_{uuid.uuid4().hex[:12]}")
    name_key: str = ""
    cpf_key: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


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
    return [d for d in docs if d.get("status") != "cancelled" and _match_period(d, month, year)]


@api_router.get("/sales", response_model=List[Sale])
async def list_sales(month: Optional[int] = None, year: Optional[int] = None,
                     user: dict = Depends(get_current_user)):
    docs = await _scoped_sales(user)
    results = [d for d in docs if _match_period(d, month, year)]
    results.sort(key=lambda x: x.get("sale_date", ""), reverse=True)
    return results


# ---------------- Object storage (vídeos e documentos de loteamento) ----------------
_STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
_STORAGE_URL = _STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
_EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
_APP_NS = "brilhantes"
_storage_key = None


def _init_storage(force: bool = False):
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    resp = requests.post(f"{_STORAGE_URL}/init", json={"emergent_key": _EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _put_object(path: str, data: bytes, content_type: str) -> dict:
    try:
        key = _init_storage()
        r = requests.put(f"{_STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=180)
        if r.status_code == 404:
            key = _init_storage(force=True)
            r = requests.put(f"{_STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=180)
        r.raise_for_status()
        return r.json()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"storage put failed: {type(e).__name__}: {str(e)[:150]}")
        raise HTTPException(status_code=502, detail="Falha ao enviar o arquivo ao armazenamento.")


def _get_object(path: str):
    key = _init_storage()
    r = requests.get(f"{_STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=120)
    if r.status_code == 404:
        key = _init_storage(force=True)
        r = requests.get(f"{_STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=120)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")


def _parse_latlng(text):
    if not text:
        return None, None
    s = str(text)
    for pat in (r"@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)",
                r"!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)",
                r"[?&]q=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)",
                r"(-?\d{1,2}\.\d{3,}),\s*(-?\d{1,3}\.\d{3,})"):
        m = re.search(pat, s)
        if m:
            try:
                return float(m.group(1)), float(m.group(2))
            except Exception:
                continue
    return None, None


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
    imgs = await db.lot_images.find({}, {"_id": 0, "id": 1, "lot_id": 1, "created_at": 1}).sort("created_at", 1).to_list(5000)
    cover = {}
    for im in imgs:
        cover.setdefault(im["lot_id"], im["id"])
    for d in docs:
        d.setdefault("phase", "em_vendas")
        d["cidade"] = ((d.get("specs") or {}).get("localizacao") or {}).get("cidade") or ""
        d["cover"] = cover.get(d.get("id"))
        d["lat"] = d.get("lat")
        d["lng"] = d.get("lng")
        d["visible_tabs"] = d.get("visible_tabs")
    docs.sort(key=lambda d: (d.get("order", 9999), (d.get("name") or "").lower()))
    return docs


@api_router.post("/loteamentos/reorder")
async def reorder_loteamentos(request: Request, user: dict = Depends(require_master)):
    body = await request.json()
    ids = body.get("ids") or []
    for i, lid in enumerate(ids):
        await db.loteamentos.update_one({"id": lid}, {"$set": {"order": i}})
    return {"ok": True}


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


@api_router.patch("/loteamentos/{lot_id}/meta")
async def update_loteamento_meta(lot_id: str, request: Request, user: dict = Depends(require_master)):
    body = await request.json()
    upd = {}
    if body.get("phase") in ("em_vendas", "lancamento", "entregue"):
        upd["phase"] = body["phase"]
    if isinstance(body.get("order"), int):
        upd["order"] = body["order"]
    if isinstance(body.get("visible_tabs"), list):
        allowed = {"galeria", "videos", "mapa", "docs", "copys", "ia"}
        upd["visible_tabs"] = [t for t in body["visible_tabs"] if t in allowed]
    if upd:
        await db.loteamentos.update_one({"id": lot_id}, {"$set": upd})
    return {"ok": True}


# ---------------- Loteamento: campos técnicos + IA Especialista (Fase 7) ----------------
_openai_client = None
_openai_key_cached = None


def _get_openai(api_key=None):
    global _openai_client, _openai_key_cached
    key = api_key or OPENAI_API_KEY
    if _openai_client is None or _openai_key_cached != key:
        from openai import AsyncOpenAI
        _openai_client = AsyncOpenAI(api_key=key)
        _openai_key_cached = key
    return _openai_client


def _cur_month():
    return datetime.now(timezone.utc).strftime("%Y-%m")


async def _ai_settings():
    return await db.app_settings.find_one({"id": "ai"}, {"_id": 0}) or {}


async def _ai_key():
    s = await _ai_settings()
    return ((s.get("openai_key") or OPENAI_API_KEY) or "").strip()


async def _ai_model():
    s = await _ai_settings()
    return s.get("model") or OPENAI_MODEL


async def _check_ai_limit():
    s = await _ai_settings()
    limit = int(s.get("monthly_limit") or 0)
    if limit <= 0:
        return
    usage = s.get("usage") or {}
    if usage.get("month") == _cur_month() and int(usage.get("requests") or 0) >= limit:
        raise HTTPException(status_code=429, detail=f"Limite mensal de uso da IA atingido ({limit} solicitações). Ajuste em Configurações da IA.")


async def _record_ai_usage(comp):
    try:
        toks = int(getattr(getattr(comp, "usage", None), "total_tokens", 0) or 0)
    except Exception:
        toks = 0
    s = await _ai_settings()
    usage = s.get("usage") or {}
    if usage.get("month") != _cur_month():
        usage = {"month": _cur_month(), "requests": 0, "tokens": 0}
    usage["requests"] = int(usage.get("requests") or 0) + 1
    usage["tokens"] = int(usage.get("tokens") or 0) + toks
    await db.app_settings.update_one({"id": "ai"}, {"$set": {"usage": usage}}, upsert=True)


@api_router.get("/settings/ai")
async def get_ai_settings(user: dict = Depends(require_master)):
    s = await _ai_settings()
    key = (s.get("openai_key") or OPENAI_API_KEY) or ""
    usage = s.get("usage") or {}
    if usage.get("month") != _cur_month():
        usage = {"month": _cur_month(), "requests": 0, "tokens": 0}
    return {
        "has_key": bool(key),
        "key_source": "custom" if s.get("openai_key") else ("env" if OPENAI_API_KEY else "none"),
        "key_masked": ("…" + key[-4:]) if key else "",
        "model": s.get("model") or OPENAI_MODEL,
        "monthly_limit": int(s.get("monthly_limit") or 0),
        "usage": usage,
    }


@api_router.put("/settings/ai")
async def update_ai_settings(request: Request, user: dict = Depends(require_master)):
    body = await request.json()
    upd = {}
    k = (body.get("openai_key") or "").strip()
    if k:
        upd["openai_key"] = k
    if body.get("model"):
        upd["model"] = str(body["model"]).strip()
    if "monthly_limit" in body:
        try:
            upd["monthly_limit"] = max(0, int(body.get("monthly_limit") or 0))
        except Exception:
            upd["monthly_limit"] = 0
    if body.get("reset_usage"):
        upd["usage"] = {"month": _cur_month(), "requests": 0, "tokens": 0}
    if upd:
        await db.app_settings.update_one({"id": "ai"}, {"$set": upd}, upsert=True)
    return await get_ai_settings(user)


def _lot_knowledge_text(doc: dict) -> str:
    out = []
    for k in (doc.get("knowledge") or []):
        t = k.get("type")
        if t == "qa" and (k.get("question") or k.get("answer")):
            out.append(f"P: {k.get('question','')} | R: {k.get('answer','')}")
        elif t == "link" and k.get("content"):
            out.append(f"Link ({k.get('title') or 'site'}): {k['content']}")
        elif k.get("content"):
            out.append(f"{k.get('title') or 'Nota'}: {k['content']}")
    return "\n".join(f"- {x}" for x in out)


_LOT_STATUS = {"nao_iniciada": "Não iniciada", "em_andamento": "Em andamento",
               "fase_final": "Fase final", "concluida": "Concluída", "entregue": "Entregue"}
_LOT_TIPO = {"aberto": "Loteamento aberto", "fechado": "Loteamento fechado"}
_LOT_CORRECAO = {"sem": "Sem correção", "ipca": "IPCA", "igpm": "IGP-M"}
_COPY_CHANNELS = {
    "stories": "Formato Instagram Stories: muito curto (até ~45 palavras), impactante, com emojis e uma chamada para ação (ex.: 'chama no direct'). Pode terminar com 2-3 hashtags curtas.",
    "feed": "Formato legenda de feed do Instagram: texto médio (até ~120 palavras), com storytelling leve, bullets usando ✅ para os diferenciais e 4-6 hashtags no final.",
    "whatsapp": "Formato mensagem de WhatsApp: tom pessoal e direto (até ~110 palavras), com quebras de linha, emojis moderados.",
}
_LOT_PERIOD = {"mensal": "Mensal", "anual": "Anual"}


def _lot_specs_to_text(doc: dict) -> str:
    s = doc.get("specs") or {}
    out = []

    t = s.get("tecnicos") or {}
    tech = []
    for key, lbl, suf in [("metragem_min", "Metragem mínima", ""), ("metragem_max", "Metragem máxima", ""),
                          ("area_total", "Área total do empreendimento", ""), ("qtd_lotes", "Quantidade de lotes", ""),
                          ("qtd_quadras", "Quantidade de quadras", "")]:
        if t.get(key):
            tech.append(f"{lbl}: {t[key]}")
    tipo = t.get("tipo")
    if isinstance(tipo, str) and tipo:
        tech.append(f"Tipo: {_LOT_TIPO.get(tipo, tipo)}")
    if t.get("liberacao_pct"):
        tech.append(f"Liberação de construção: {t['liberacao_pct']}% do lote pago")
    if t.get("prazo_construcao"):
        tech.append(f"Prazo para construção: {t['prazo_construcao']}")
    if t.get("restricoes"):
        tech.append(f"Restrições/padrão construtivo: {t['restricoes']}")
    if tech:
        out.append("DADOS TÉCNICOS:\n" + "\n".join(f"- {x}" for x in tech))

    infra = s.get("infraestrutura") or {}
    items = [i for i in (infra.get("items") or []) if i and i.lower() != "outro"]
    if infra.get("outro"):
        items.append(infra["outro"])
    if items:
        out.append("INFRAESTRUTURA:\n" + ", ".join(items))

    o = s.get("obra") or {}
    status = o.get("status")
    if isinstance(status, str) and status:
        obra = [f"Status: {_LOT_STATUS.get(status, status)}"]
        if o.get("percentual"):
            obra.append(f"Percentual: {o['percentual']}%")
        if o.get("previsao"):
            obra.append(f"Previsão de entrega: {o['previsao']}")
        if o.get("data_entrega"):
            obra.append(f"Data de entrega: {o['data_entrega']}")
        if o.get("observacao"):
            obra.append(f"Obs: {o['observacao']}")
        out.append("STATUS DA OBRA:\n" + "\n".join(f"- {x}" for x in obra))

    loc = s.get("localizacao") or {}
    locl = []
    for key, lbl in [("cidade", "Cidade"), ("estado", "Estado"), ("bairro", "Bairro/localidade"),
                     ("endereco", "Endereço/referência"), ("maps", "Google Maps"), ("dist_centro", "Distância do centro"),
                     ("dist_praia", "Distância da praia"), ("dist_pontos", "Distância de pontos relevantes"),
                     ("acessos", "Principais acessos/rodovias")]:
        if loc.get(key):
            locl.append(f"{lbl}: {loc[key]}")
    if locl:
        out.append("LOCALIZAÇÃO:\n" + "\n".join(f"- {x}" for x in locl))

    c = s.get("comercial") or {}
    com = []
    if c.get("valor_a_partir"):
        ref = f" (referente a {c['valor_ref']})" if c.get("valor_ref") else ""
        com.append(f"Valor a partir de R$ {c['valor_a_partir']}{ref}")
    if c.get("entrada_minima"):
        com.append(f"Entrada mínima: {c['entrada_minima']}")
    if c.get("max_parcelas"):
        com.append(f"Quantidade máxima de parcelas: {c['max_parcelas']}")
    if c.get("valor_parcela_inicial"):
        com.append(f"Valor inicial da parcela: {c['valor_parcela_inicial']}")
    com.append(f"Financiamento: {c.get('financiamento') or 'Próprio do loteamento'}")
    corr_key = c.get("correcao")
    if isinstance(corr_key, str) and corr_key:
        corr = c.get("correcao_outro") if corr_key == "outro" else _LOT_CORRECAO.get(corr_key, corr_key)
        if corr:
            per = ""
            per_key = c.get("periodicidade")
            if isinstance(per_key, str) and per_key:
                per = c.get("periodicidade_outra") if per_key == "outra" else _LOT_PERIOD.get(per_key, per_key)
            com.append(f"Correção monetária: {corr}" + (f" ({per})" if per else ""))
    if c.get("juros") == "sem":
        com.append("Juros: Sem juros")
    elif c.get("juros") == "com":
        j = "Com juros"
        if c.get("juros_pct"):
            j += f" ({c['juros_pct']}%)"
        if c.get("juros_tipo") == "embutidos":
            j += " — embutidos (Tabela Price)"
        elif c.get("juros_tipo") == "nao_embutidos":
            j += " — não embutidos (Tabela SAC)"
        com.append(j)
    if c.get("balao") == "possui":
        bal = []
        for key, lbl in [("baloes_qtd", "Quantidade"), ("baloes_periodicidade", "Periodicidade"),
                         ("baloes_valor", "Valor/percentual"), ("baloes_vencimentos", "Vencimentos")]:
            if c.get(key):
                bal.append(f"{lbl}: {c[key]}")
        com.append("Balão: Possui" + (f" ({'; '.join(bal)})" if bal else ""))
    elif c.get("balao") == "nao":
        com.append("Balão: Não possui")
    if c.get("condicoes_especiais"):
        com.append(f"Condições especiais: {c['condicoes_especiais']}")
    if c.get("diferenciais"):
        com.append(f"Diferenciais: {c['diferenciais']}")
    if com:
        out.append("INFORMAÇÕES COMERCIAIS:\n" + "\n".join(f"- {x}" for x in com))

    # campos técnicos livres antigos (compat)
    for f in (doc.get("fields") or []):
        if f.get("value"):
            out.append(f"{f.get('label')}: {f['value']}")
    return "\n\n".join(out).strip()


class LotField(BaseModel):
    id: Optional[str] = ""
    label: str = ""
    value: Optional[str] = ""


class LoteamentoDetails(BaseModel):
    fields: List[LotField] = []
    copy: Optional[str] = ""
    ai_training: Optional[str] = ""
    specs: Optional[dict] = None


class AiAsk(BaseModel):
    message: str
    history: List[dict] = []


@api_router.get("/loteamentos/{lot_id}/details")
async def get_loteamento_details(lot_id: str, user: dict = Depends(get_current_user)):
    doc = await db.loteamentos.find_one({"id": lot_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Loteamento não encontrado")
    doc.setdefault("fields", [])
    doc.setdefault("copy", "")
    doc.setdefault("ai_training", "")
    doc.setdefault("specs", {})
    doc.setdefault("copies", [])
    doc.setdefault("knowledge", [])
    doc.setdefault("questions", [])
    doc.setdefault("visible_tabs", ["galeria", "videos", "mapa", "docs", "copys", "ia"])
    return doc


@api_router.put("/loteamentos/{lot_id}/details")
async def update_loteamento_details(lot_id: str, data: LoteamentoDetails, user: dict = Depends(require_master)):
    existing = await db.loteamentos.find_one({"id": lot_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Loteamento não encontrado")
    fields = []
    for f in (data.fields or []):
        label = (f.label or "").strip()
        if not label:
            continue
        fields.append({"id": f.id or f"fld_{uuid.uuid4().hex[:8]}",
                       "label": label, "value": (f.value or "").strip()})
    upd = {"fields": fields, "copy": (data.copy or "").strip(),
           "ai_training": (data.ai_training or "").strip(),
           "specs": data.specs or {},
           "details_updated_at": datetime.now(timezone.utc).isoformat()}
    loc = (data.specs or {}).get("localizacao") or {}
    lat, lng = _parse_latlng(loc.get("coords"))
    if lat is None:
        lat, lng = _parse_latlng(loc.get("maps"))
    upd["lat"] = lat
    upd["lng"] = lng
    await db.loteamentos.update_one({"id": lot_id}, {"$set": upd})
    return {**existing, **upd}


@api_router.post("/loteamentos/{lot_id}/ai")
async def ask_loteamento_ai(lot_id: str, data: AiAsk, user: dict = Depends(get_current_user)):
    _aikey = await _ai_key()
    if not _aikey:
        raise HTTPException(status_code=400, detail="IA não configurada. Peça ao gestor para cadastrar a chave da OpenAI.")
    await _check_ai_limit()
    if not (data.message or "").strip():
        raise HTTPException(status_code=400, detail="Digite uma pergunta")
    doc = await db.loteamentos.find_one({"id": lot_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Loteamento não encontrado")
    ctx = _lot_specs_to_text(doc)
    gal = await _lot_gallery_text(lot_id)
    if gal:
        ctx = (ctx + "\n\nGALERIA (diferenciais visuais):\n" + gal).strip()
    kn = _lot_knowledge_text(doc)
    if kn:
        ctx = (ctx + "\n\nBASE DE CONHECIMENTO:\n" + kn).strip()
    ctx = ctx or "(nenhuma informação cadastrada)"
    system = (
        f"Você é um assistente especialista no loteamento '{doc.get('name')}' da Brilhante's Imóveis. "
        "Responda SEMPRE em português, de forma clara e objetiva, para ajudar o corretor a atender o cliente. "
        "Use SOMENTE os dados e as informações de treino fornecidos abaixo. "
        "Se a informação não estiver nos dados, diga claramente que ela não foi informada e sugira confirmar com o gestor. "
        "Nunca invente preço, metragem, disponibilidade, prazos, documentação ou condições comerciais."
        f"\n\nINFORMAÇÕES DO LOTEAMENTO:\n{ctx}"
    )
    if doc.get("ai_training"):
        system += f"\n\nINFORMAÇÕES EXTRAS (treino do gestor):\n{doc['ai_training']}"
    if doc.get("copy"):
        system += f"\n\nTEXTO DE DIVULGAÇÃO (copy):\n{doc['copy']}"
    history = [m for m in (data.history or [])
               if m.get("role") in ("user", "assistant") and (m.get("content") or "").strip()][-12:]
    messages = [{"role": "system", "content": system}]
    messages += [{"role": m["role"], "content": m["content"]} for m in history]
    messages.append({"role": "user", "content": data.message.strip()})
    try:
        comp = await _get_openai(_aikey).chat.completions.create(
            model=await _ai_model(), messages=messages, temperature=0.2, max_tokens=700)
        await _record_ai_usage(comp)
        answer = comp.choices[0].message.content or "Não consegui gerar uma resposta."
    except Exception as e:
        logger.warning(f"openai request failed: {type(e).__name__}: {str(e)[:150]}")
        raise HTTPException(status_code=502, detail="Serviço de IA indisponível no momento.")
    low = (answer or "").lower()
    if user.get("role") == "corretor" and any(s in low for s in ["não foi inform", "nao foi inform", "não está cadastr", "confirmar com o gestor", "não informad", "nao informad"]):
        qitem = {"id": f"q_{uuid.uuid4().hex[:10]}", "question": data.message.strip(), "asked_by": _display(user),
                 "answer": answer, "status": "open", "created_at": datetime.now(timezone.utc).isoformat()}
        await db.loteamentos.update_one({"id": lot_id}, {"$push": {"questions": qitem}})
        masters = await db.users.find({"role": "master"}, {"_id": 0, "user_id": 1}).to_list(50)
        for m in masters:
            await _notify(m["user_id"], "lot_question", f"❓ {_display(user)} perguntou sobre '{doc.get('name')}': {data.message.strip()[:80]}", {"lot_id": lot_id})
    return {"answer": answer}


@api_router.post("/loteamentos/{lot_id}/generate-copy")
async def generate_lot_copy(lot_id: str, channel: str = "whatsapp", user: dict = Depends(require_master)):
    _aikey = await _ai_key()
    if not _aikey:
        raise HTTPException(status_code=400, detail="IA não configurada. Peça ao gestor para cadastrar a chave da OpenAI.")
    await _check_ai_limit()
    doc = await db.loteamentos.find_one({"id": lot_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Loteamento não encontrado")
    ctx = _lot_specs_to_text(doc)
    gal = await _lot_gallery_text(lot_id)
    if gal:
        ctx = (ctx + "\n\nGALERIA (diferenciais visuais):\n" + gal).strip()
    training = doc.get("ai_training") or ""
    if not ctx.strip() and not training.strip():
        raise HTTPException(status_code=400, detail="Cadastre as informações do loteamento antes de gerar a copy.")
    fmt = _COPY_CHANNELS.get(channel, _COPY_CHANNELS["whatsapp"])
    system = (
        "Você é redator de marketing imobiliário da Brilhante's Imóveis. Gere um texto de divulgação em português do "
        f"Brasil sobre o loteamento. {fmt} Destaque infraestrutura, localização, diferenciais visuais e condições de "
        "pagamento quando existirem. Use SOMENTE os dados fornecidos — nunca invente valores, metragens ou condições. "
        "Responda apenas com o texto da copy, sem títulos nem aspas."
    )
    user_msg = f"Loteamento: {doc.get('name')}\n\nDADOS:\n{ctx}"
    if training:
        user_msg += f"\n\nINFORMAÇÕES EXTRAS:\n{training}"
    if channel == "whatsapp":
        contato = _display(user)
        if user.get("phone"):
            contato += f" - {user['phone']}"
        user_msg += f"\n\nFinalize com o contato do corretor para o cliente chamar: {contato}"
    try:
        comp = await _get_openai(_aikey).chat.completions.create(
            model=await _ai_model(),
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user_msg}],
            temperature=0.75, max_tokens=500)
        await _record_ai_usage(comp)
        copy = (comp.choices[0].message.content or "").strip()
    except Exception as e:
        logger.warning(f"openai copy failed: {type(e).__name__}: {str(e)[:150]}")
        raise HTTPException(status_code=502, detail="Serviço de IA indisponível no momento.")
    return {"copy": copy, "channel": channel}


# ---------------- Galeria do loteamento (fotos / plantas) ----------------
_LOT_IMG_TYPES = {"foto", "planta"}


async def _lot_gallery_text(lot_id: str) -> str:
    imgs = await db.lot_images.find({"lot_id": lot_id}, {"_id": 0, "data": 0}).sort("created_at", 1).to_list(100)
    parts = []
    for i in imgs:
        t = "Planta" if i.get("type") == "planta" else "Foto"
        cap = (i.get("caption") or "").strip()
        parts.append(f"- {t}: {cap}" if cap else f"- {t} (sem descrição)")
    return "\n".join(parts)


class LotImageMeta(BaseModel):
    id: str
    lot_id: str
    type: str = "foto"
    caption: str = ""
    content_type: str = ""
    created_at: str = ""


@api_router.get("/loteamentos/{lot_id}/images", response_model=List[LotImageMeta])
async def list_lot_images(lot_id: str, user: dict = Depends(get_current_user)):
    docs = await db.lot_images.find({"lot_id": lot_id}, {"_id": 0, "data": 0}).sort("created_at", 1).to_list(100)
    return [LotImageMeta(**{k: d.get(k, "") for k in ("id", "lot_id", "type", "caption", "content_type", "created_at")}) for d in docs]


@api_router.post("/loteamentos/{lot_id}/images", response_model=LotImageMeta)
async def upload_lot_image(lot_id: str, file: UploadFile = File(...), type: str = Form("foto"),
                           caption: str = Form(""), user: dict = Depends(require_master)):
    lot = await db.loteamentos.find_one({"id": lot_id}, {"_id": 0})
    if not lot:
        raise HTTPException(status_code=404, detail="Loteamento não encontrado")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Imagem muito grande (máx. 10 MB).")
    ctype = file.content_type or "image/jpeg"
    if not ctype.startswith("image/"):
        raise HTTPException(status_code=422, detail="Envie um arquivo de imagem (foto ou planta).")
    doc = {
        "id": f"img_{uuid.uuid4().hex[:12]}", "lot_id": lot_id,
        "type": type if type in _LOT_IMG_TYPES else "foto", "caption": (caption or "").strip(),
        "filename": file.filename or "imagem", "content_type": ctype,
        "data": base64.b64encode(content).decode("ascii"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.lot_images.insert_one(doc)
    return LotImageMeta(**{k: doc[k] for k in ("id", "lot_id", "type", "caption", "content_type", "created_at")})


@api_router.get("/loteamentos/images/{img_id}/raw")
async def get_lot_image_raw(img_id: str, user: dict = Depends(get_current_user)):
    img = await db.lot_images.find_one({"id": img_id}, {"_id": 0})
    if not img:
        raise HTTPException(status_code=404, detail="Imagem não encontrada")
    return Response(content=base64.b64decode(img["data"]), media_type=img.get("content_type", "image/jpeg"))


@api_router.patch("/loteamentos/images/{img_id}")
async def update_lot_image(img_id: str, request: Request, user: dict = Depends(require_master)):
    body = await request.json()
    upd = {}
    if "caption" in body:
        upd["caption"] = (body.get("caption") or "").strip()
    if body.get("type") in _LOT_IMG_TYPES:
        upd["type"] = body["type"]
    if upd:
        await db.lot_images.update_one({"id": img_id}, {"$set": upd})
    return {"ok": True}


@api_router.delete("/loteamentos/images/{img_id}")
async def delete_lot_image(img_id: str, user: dict = Depends(require_master)):
    res = await db.lot_images.delete_one({"id": img_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Imagem não encontrada")
    return {"ok": True}


# ---------------- Vídeos do loteamento (links YouTube/URL + upload de arquivo) ----------------
_YT_RE = re.compile(r"(?:youtu\.be/|youtube\.com/(?:watch\?v=|embed/|shorts/|v/))([\w-]{6,})")


def _video_meta(d: dict) -> dict:
    return {k: d.get(k, "") for k in ("id", "lot_id", "title", "kind", "url", "youtube_id", "content_type", "filename", "created_at")}


@api_router.get("/loteamentos/{lot_id}/videos")
async def list_lot_videos(lot_id: str, user: dict = Depends(get_current_user)):
    docs = await db.lot_videos.find({"lot_id": lot_id, "is_deleted": {"$ne": True}}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return [_video_meta(d) for d in docs]


@api_router.post("/loteamentos/{lot_id}/videos/link")
async def add_lot_video_link(lot_id: str, request: Request, user: dict = Depends(require_master)):
    body = await request.json()
    url = (body.get("url") or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="Informe a URL do vídeo")
    m = _YT_RE.search(url)
    doc = {"id": f"vid_{uuid.uuid4().hex[:10]}", "lot_id": lot_id, "title": (body.get("title") or "").strip(),
           "kind": "youtube" if m else "url", "url": url, "youtube_id": m.group(1) if m else "",
           "content_type": "", "filename": "", "created_at": datetime.now(timezone.utc).isoformat(), "is_deleted": False}
    await db.lot_videos.insert_one(doc)
    return _video_meta(doc)


@api_router.post("/loteamentos/{lot_id}/videos/upload")
async def upload_lot_video(lot_id: str, file: UploadFile = File(...), title: str = Form(""), user: dict = Depends(require_master)):
    content = await file.read()
    if len(content) > 200 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Vídeo muito grande (máx. 200 MB).")
    ext = (file.filename or "video.mp4").rsplit(".", 1)[-1].lower()
    path = f"{_APP_NS}/videos/{lot_id}/{uuid.uuid4().hex}.{ext}"
    res = _put_object(path, content, file.content_type or "video/mp4")
    doc = {"id": f"vid_{uuid.uuid4().hex[:10]}", "lot_id": lot_id, "title": (title or file.filename or "").strip(),
           "kind": "file", "url": "", "youtube_id": "", "storage_path": res["path"],
           "content_type": file.content_type or "video/mp4", "filename": file.filename or "video",
           "created_at": datetime.now(timezone.utc).isoformat(), "is_deleted": False}
    await db.lot_videos.insert_one(doc)
    return _video_meta(doc)


@api_router.get("/loteamentos/videos/{vid}/raw")
async def stream_lot_video(vid: str, user: dict = Depends(get_current_user)):
    d = await db.lot_videos.find_one({"id": vid, "is_deleted": {"$ne": True}}, {"_id": 0})
    if not d or not d.get("storage_path"):
        raise HTTPException(status_code=404, detail="Vídeo não encontrado")
    data, ct = _get_object(d["storage_path"])
    return Response(content=data, media_type=d.get("content_type") or ct)


@api_router.delete("/loteamentos/videos/{vid}")
async def delete_lot_video(vid: str, user: dict = Depends(require_master)):
    await db.lot_videos.update_one({"id": vid}, {"$set": {"is_deleted": True}})
    return {"ok": True}


# ---------------- Documentos do loteamento (PDF / tabela de preço p/ corretor baixar) ----------------
_DOC_CATS = {"documento", "tabela_preco"}


def _doc_meta(d: dict) -> dict:
    return {k: d.get(k, "") for k in ("id", "lot_id", "title", "category", "content_type", "filename", "size", "created_at")}


@api_router.get("/loteamentos/{lot_id}/docs")
async def list_lot_docs(lot_id: str, user: dict = Depends(get_current_user)):
    docs = await db.lot_docs.find({"lot_id": lot_id, "is_deleted": {"$ne": True}}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return [_doc_meta(d) for d in docs]


@api_router.post("/loteamentos/{lot_id}/docs")
async def upload_lot_doc(lot_id: str, file: UploadFile = File(...), title: str = Form(""),
                         category: str = Form("documento"), user: dict = Depends(require_master)):
    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Arquivo muito grande (máx. 50 MB).")
    ext = (file.filename or "arquivo.pdf").rsplit(".", 1)[-1].lower()
    path = f"{_APP_NS}/docs/{lot_id}/{uuid.uuid4().hex}.{ext}"
    res = _put_object(path, content, file.content_type or "application/pdf")
    doc = {"id": f"doc_{uuid.uuid4().hex[:10]}", "lot_id": lot_id,
           "title": (title or file.filename or "Documento").strip(),
           "category": category if category in _DOC_CATS else "documento",
           "storage_path": res["path"], "content_type": file.content_type or "application/pdf",
           "filename": file.filename or "arquivo.pdf", "size": res.get("size") or len(content),
           "created_at": datetime.now(timezone.utc).isoformat(), "is_deleted": False}
    await db.lot_docs.insert_one(doc)
    return _doc_meta(doc)


@api_router.get("/loteamentos/docs/{doc_id}/download")
async def download_lot_doc(doc_id: str, user: dict = Depends(get_current_user)):
    d = await db.lot_docs.find_one({"id": doc_id, "is_deleted": {"$ne": True}}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    data, ct = _get_object(d["storage_path"])
    fn = d.get("filename") or "arquivo"
    return Response(content=data, media_type=d.get("content_type") or ct,
                    headers={"Content-Disposition": f'attachment; filename="{fn}"'})


@api_router.delete("/loteamentos/docs/{doc_id}")
async def delete_lot_doc(doc_id: str, user: dict = Depends(require_master)):
    await db.lot_docs.update_one({"id": doc_id}, {"$set": {"is_deleted": True}})
    return {"ok": True}


# ---------------- Copys por categoria + Base de conhecimento IA + Perguntas ----------------
class CopyItem(BaseModel):
    category: str = "Geral"
    text: str = ""


@api_router.post("/loteamentos/{lot_id}/copies")
async def add_copy(lot_id: str, data: CopyItem, user: dict = Depends(require_master)):
    item = {"id": f"cp_{uuid.uuid4().hex[:8]}", "category": (data.category or "Geral").strip(), "text": (data.text or "").strip()}
    await db.loteamentos.update_one({"id": lot_id}, {"$push": {"copies": item}})
    return item


@api_router.put("/loteamentos/{lot_id}/copies/{cid}")
async def update_copy(lot_id: str, cid: str, data: CopyItem, user: dict = Depends(require_master)):
    await db.loteamentos.update_one({"id": lot_id, "copies.id": cid},
                                    {"$set": {"copies.$.category": (data.category or "Geral").strip(), "copies.$.text": (data.text or "").strip()}})
    return {"ok": True}


@api_router.delete("/loteamentos/{lot_id}/copies/{cid}")
async def delete_copy(lot_id: str, cid: str, user: dict = Depends(require_master)):
    await db.loteamentos.update_one({"id": lot_id}, {"$pull": {"copies": {"id": cid}}})
    return {"ok": True}


@api_router.post("/loteamentos/{lot_id}/copies/generate")
async def generate_copy_cat(lot_id: str, request: Request, user: dict = Depends(require_master)):
    _aikey = await _ai_key()
    if not _aikey:
        raise HTTPException(status_code=400, detail="IA não configurada.")
    await _check_ai_limit()
    body = await request.json()
    category = (body.get("category") or "Geral").strip()
    channel = body.get("channel") or "whatsapp"
    doc = await db.loteamentos.find_one({"id": lot_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Loteamento não encontrado")
    ctx = _lot_specs_to_text(doc)
    kn = _lot_knowledge_text(doc)
    if kn:
        ctx = (ctx + "\n\nBASE DE CONHECIMENTO:\n" + kn).strip()
    if not ctx.strip():
        raise HTTPException(status_code=400, detail="Cadastre as informações do loteamento antes de gerar a copy.")
    fmt = _COPY_CHANNELS.get(channel, _COPY_CHANNELS["whatsapp"])
    system = ("Você é redator de marketing imobiliário da Brilhante's Imóveis. " + fmt +
              f" Foque na categoria '{category}'. Use SOMENTE os dados fornecidos, nunca invente valores ou condições. Responda só com o texto.")
    try:
        comp = await _get_openai(_aikey).chat.completions.create(
            model=await _ai_model(), messages=[{"role": "system", "content": system},
                                          {"role": "user", "content": f"Loteamento: {doc.get('name')}\n\n{ctx}"}],
            temperature=0.75, max_tokens=500)
        await _record_ai_usage(comp)
        text = (comp.choices[0].message.content or "").strip()
    except Exception as e:
        logger.warning(f"copy cat failed: {type(e).__name__}: {str(e)[:120]}")
        raise HTTPException(status_code=502, detail="Serviço de IA indisponível no momento.")
    return {"text": text}


class KnowledgeItem(BaseModel):
    type: str = "texto"
    title: str = ""
    content: str = ""
    question: str = ""
    answer: str = ""


@api_router.post("/loteamentos/{lot_id}/knowledge")
async def add_knowledge(lot_id: str, data: KnowledgeItem, user: dict = Depends(require_master)):
    item = {"id": f"kn_{uuid.uuid4().hex[:8]}", "type": data.type if data.type in ("texto", "link", "qa") else "texto",
            "title": (data.title or "").strip(), "content": (data.content or "").strip(),
            "question": (data.question or "").strip(), "answer": (data.answer or "").strip(),
            "created_at": datetime.now(timezone.utc).isoformat()}
    await db.loteamentos.update_one({"id": lot_id}, {"$push": {"knowledge": item}})
    return item


@api_router.delete("/loteamentos/{lot_id}/knowledge/{kid}")
async def delete_knowledge(lot_id: str, kid: str, user: dict = Depends(require_master)):
    await db.loteamentos.update_one({"id": lot_id}, {"$pull": {"knowledge": {"id": kid}}})
    return {"ok": True}


@api_router.get("/loteamentos/{lot_id}/questions")
async def list_questions(lot_id: str, user: dict = Depends(require_master)):
    doc = await db.loteamentos.find_one({"id": lot_id}, {"_id": 0, "questions": 1})
    return [q for q in ((doc or {}).get("questions") or []) if q.get("status") == "open"]


@api_router.post("/loteamentos/{lot_id}/questions/{qid}/answer")
async def answer_question(lot_id: str, qid: str, request: Request, user: dict = Depends(require_master)):
    body = await request.json()
    ans = (body.get("answer") or "").strip()
    if not ans:
        raise HTTPException(status_code=400, detail="Informe a resposta")
    doc = await db.loteamentos.find_one({"id": lot_id}, {"_id": 0, "questions": 1})
    q = next((x for x in ((doc or {}).get("questions") or []) if x.get("id") == qid), None)
    if not q:
        raise HTTPException(status_code=404, detail="Pergunta não encontrada")
    kn = {"id": f"kn_{uuid.uuid4().hex[:8]}", "type": "qa", "title": "", "content": "",
          "question": q.get("question", ""), "answer": ans, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.loteamentos.update_one({"id": lot_id}, {"$push": {"knowledge": kn}})
    await db.loteamentos.update_one({"id": lot_id, "questions.id": qid}, {"$set": {"questions.$.status": "answered"}})
    return {"ok": True}


async def _process_lot_reminder():
    try:
        masters = await db.users.find({"role": "master"}, {"_id": 0}).to_list(50)
        for m in masters:
            await _notify(m["user_id"], "lot_reminder",
                          "🗂️ Dia de revisar os loteamentos! Atualize as tabelas e informações técnicas para a IA responder certinho aos corretores.")
    except Exception as e:
        logger.warning(f"lot reminder cron failed: {e}")


@api_router.post("/cron/lot-reminder")
async def cron_lot_reminder(background_tasks: BackgroundTasks,
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
    background_tasks.add_task(_process_lot_reminder)
    return {"ok": True}


# ---------------- Agenda / Compromissos ----------------
APPT_TYPES = {"visita", "plantao", "ligacao", "outro"}


class AppointmentCreate(BaseModel):
    title: str
    type: str = "visita"           # visita | plantao | ligacao | outro
    when: str                      # "YYYY-MM-DDTHH:MM"
    client_name: Optional[str] = ""
    notes: Optional[str] = ""
    done: bool = False


def _appt_scope(user: dict) -> dict:
    if user.get("role") == "master":
        return {}
    return {"owner_id": user["user_id"]}


@api_router.get("/appointments")
async def list_appointments(start: Optional[str] = None, end: Optional[str] = None,
                            user: dict = Depends(get_current_user)):
    docs = await db.appointments.find(_appt_scope(user), {"_id": 0}).to_list(2000)
    if start:
        docs = [d for d in docs if (d.get("when") or "")[:10] >= start]
    if end:
        docs = [d for d in docs if (d.get("when") or "")[:10] <= end]
    docs.sort(key=lambda d: d.get("when", ""))
    return docs


@api_router.post("/appointments")
async def create_appointment(data: AppointmentCreate, user: dict = Depends(get_current_user)):
    if not (data.title or "").strip():
        raise HTTPException(status_code=400, detail="Informe o título do compromisso")
    if not (data.when or "").strip():
        raise HTTPException(status_code=400, detail="Informe a data/hora do compromisso")
    typ = data.type if data.type in APPT_TYPES else "outro"
    doc = {
        "id": f"appt_{uuid.uuid4().hex[:12]}",
        "owner_id": user["user_id"], "owner_name": _display(user),
        "title": data.title.strip(), "type": typ, "when": data.when.strip(),
        "client_name": (data.client_name or "").strip(), "notes": (data.notes or "").strip(),
        "done": bool(data.done), "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.appointments.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/appointments/{appt_id}")
async def update_appointment(appt_id: str, data: AppointmentCreate, user: dict = Depends(get_current_user)):
    existing = await db.appointments.find_one({"id": appt_id, **_appt_scope(user)}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Compromisso não encontrado")
    typ = data.type if data.type in APPT_TYPES else "outro"
    upd = {"title": (data.title or "").strip(), "type": typ, "when": (data.when or "").strip(),
           "client_name": (data.client_name or "").strip(), "notes": (data.notes or "").strip(),
           "done": bool(data.done)}
    await db.appointments.update_one({"id": appt_id}, {"$set": upd})
    return {**existing, **upd}


@api_router.patch("/appointments/{appt_id}/done")
async def toggle_appointment_done(appt_id: str, request: Request, user: dict = Depends(get_current_user)):
    existing = await db.appointments.find_one({"id": appt_id, **_appt_scope(user)}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Compromisso não encontrado")
    body = await request.json()
    await db.appointments.update_one({"id": appt_id}, {"$set": {"done": bool(body.get("done", True))}})
    return {"ok": True}


@api_router.delete("/appointments/{appt_id}")
async def delete_appointment(appt_id: str, user: dict = Depends(get_current_user)):
    res = await db.appointments.delete_one({"id": appt_id, **_appt_scope(user)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Compromisso não encontrado")
    return {"ok": True}


async def _process_appointments():
    try:
        now = _br_now()
        today = now.date().isoformat()
        masters = await db.users.find({"role": "master"}, {"_id": 0}).to_list(50)
        master_ids = [m["user_id"] for m in masters]
        TLABEL = {"visita": "Visita", "plantao": "Plantão", "ligacao": "Retorno de ligação", "outro": "Compromisso"}
        appts = await db.appointments.find({"done": {"$ne": True}}, {"_id": 0}).to_list(3000)
        for a in appts:
            when = a.get("when") or ""
            if when[:10] != today or a.get("notified_today"):
                continue
            hora = when[11:16] or ""
            cli = f" com {a['client_name']}" if a.get("client_name") else ""
            msg = f"🗓️ Hoje {hora}: {TLABEL.get(a.get('type'), 'Compromisso')} — {a.get('title')}{cli}."
            targets = list(dict.fromkeys([a.get("owner_id")] + master_ids))
            for t in targets:
                await _notify(t, "appointment", msg, {"appt_id": a.get("id")})
            await db.appointments.update_one({"id": a.get("id")}, {"$set": {"notified_today": True}})
    except Exception as e:
        logger.warning(f"appointments cron failed: {e}")


@api_router.post("/cron/appointments")
async def cron_appointments(background_tasks: BackgroundTasks,
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
    background_tasks.add_task(_process_appointments)
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


async def _audit(action: str, sale: dict, user: dict, detail: str = ""):
    await db.sale_audit.insert_one({
        "id": f"aud_{uuid.uuid4().hex[:10]}", "action": action,
        "sale_id": sale.get("id"), "property_name": sale.get("property_name"),
        "quadra": sale.get("quadra"), "lote": sale.get("lote"),
        "client_name": sale.get("client_name"), "broker_name": sale.get("broker_name"),
        "sale_value": sale.get("sale_value"), "detail": detail,
        "by": _display(user), "by_id": user.get("user_id"),
        "at": datetime.now(timezone.utc).isoformat(),
    })


async def _find_duplicate(payload: dict):
    def nz(x):
        return (str(x) if x is not None else "").strip().lower()
    docs = await db.sales.find({"sale_date": payload.get("sale_date")}, {"_id": 0}).to_list(2000)
    for d in docs:
        if (nz(d.get("property_name")) == nz(payload.get("property_name"))
                and nz(d.get("quadra")) == nz(payload.get("quadra"))
                and nz(d.get("lote")) == nz(payload.get("lote"))
                and nz(d.get("client_name")) == nz(payload.get("client_name"))
                and nz(d.get("broker_name")) == nz(payload.get("broker_name"))):
            return d
    return None


async def _lot_already_sold(prop, quadra, lote):
    if not (prop and (quadra or "").strip() and (lote or "").strip()):
        return None
    pn = _norm_name(prop)
    q = (quadra or "").strip().lower()
    l = (lote or "").strip().lower()
    docs = await db.sales.find({}, {"_id": 0}).to_list(5000)
    for s in docs:
        if s.get("status") == "cancelled":
            continue
        if (_norm_name(s.get("property_name")) == pn
                and (s.get("quadra") or "").strip().lower() == q
                and (s.get("lote") or "").strip().lower() == l):
            return s
    return None


async def _resolve_or_create_client(payload: dict) -> str:
    name = (payload.get("client_name") or "").strip()
    if not name:
        return payload.get("client_id") or ""
    cid = payload.get("client_id")
    if cid and await db.clients.find_one({"id": cid}, {"_id": 0}):
        return cid
    cpf = _only_digits(payload.get("client_cpf"))
    nk = _norm_name(name)
    found = None
    if cpf:
        found = await db.clients.find_one({"cpf_key": cpf}, {"_id": 0})
    if not found:
        found = await db.clients.find_one({"name_key": nk}, {"_id": 0})
    if found:
        upd = {}
        for fs, fc in [("client_phone", "phone"), ("client_email", "email"), ("client_birthdate", "birthdate")]:
            if payload.get(fs) and not found.get(fc):
                upd[fc] = payload[fs]
        if cpf and not found.get("cpf"):
            upd["cpf"] = payload.get("client_cpf")
            upd["cpf_key"] = cpf
        if payload.get("client_notes") and not found.get("notes"):
            upd["notes"] = payload["client_notes"]
        if payload.get("client_origin") and not found.get("origin"):
            upd["origin"] = payload["client_origin"]
            upd["origin_other"] = payload.get("client_origin_other") or ""
        if payload.get("client_has_spouse") and not found.get("has_spouse"):
            upd["has_spouse"] = True
            upd["spouse"] = payload.get("client_spouse") or {}
        if upd:
            await db.clients.update_one({"id": found["id"]}, {"$set": upd})
        return found["id"]
    c = Client(name=name, phone=payload.get("client_phone") or "", email=payload.get("client_email") or "",
               cpf=payload.get("client_cpf") or "", birthdate=payload.get("client_birthdate") or "",
               has_spouse=bool(payload.get("client_has_spouse")), spouse=payload.get("client_spouse"),
               origin=payload.get("client_origin") or "", origin_other=payload.get("client_origin_other") or "",
               notes=payload.get("client_notes") or "", name_key=nk, cpf_key=cpf)
    await db.clients.insert_one(c.model_dump())
    return c.id


def _compute_commission(payload: dict) -> dict:
    """Valida valores e calcula comissão bruta/líquida conforme a base escolhida."""
    sv = payload.get("sale_value") or 0
    fv = payload.get("financed_value") or 0
    base = payload.get("commission_base") or "sale"
    if base == "financed" and not (sv > 0 and fv > 0):
        raise HTTPException(status_code=400, detail="Preencha o valor da venda e o valor financiado.")
    if fv and sv and fv > sv:
        raise HTTPException(status_code=400, detail="O valor financiado não pode ser maior que o valor da venda.")
    base_value = fv if base == "financed" else sv
    rate = payload.get("commission_rate") or 0
    gross = round(base_value * rate / 100.0, 2) if rate > 0 else (payload.get("commission_value") or 0)
    disc = sum((d.get("value") or 0) for d in (payload.get("discounts") or []))
    payload["commission_gross"] = gross
    payload["commission_value"] = gross
    payload["commission_net"] = round(gross - disc, 2)
    return payload


@api_router.post("/sales", response_model=Sale)
async def create_sale(data: SaleCreate, force: bool = False, force_lot: bool = False,
                      lot_reason: str = "", user: dict = Depends(get_current_user)):
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
    if not force:
        dup = await _find_duplicate(payload)
        if dup:
            raise HTTPException(status_code=409, detail="Já existe uma venda igual (mesmo cliente, loteamento, quadra, lote, data e corretor). Deseja salvar mesmo assim?")
    if not force_lot:
        sold = await _lot_already_sold(payload["property_name"], payload.get("quadra"), payload.get("lote"))
        if sold:
            if user.get("role") == "corretor":
                raise HTTPException(status_code=409, detail={"code": "lot_sold", "message": "Este lote já consta como vendido. Fale com o gestor."})
            raise HTTPException(status_code=409, detail={"code": "lot_sold_master", "message": "Este lote já consta como vendido. Deseja registrar mesmo assim?"})
    payload["client_id"] = await _resolve_or_create_client(payload)
    _compute_commission(payload)
    sale = Sale(**payload, user_id=user["user_id"], owner_id=owner_id,
                owner_name=owner_name, broker_ids=broker_ids)
    await db.sales.insert_one(sale.model_dump())
    await _audit("create", sale.model_dump(), user)
    if force_lot and user.get("role") == "master":
        await _audit("lot_override", sale.model_dump(), user,
                     detail=lot_reason or "Registro de lote já vendido autorizado pelo gestor")
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
    _compute_commission(payload)
    await db.sales.update_one({"id": sale_id}, {"$set": {**payload, **extra}})
    await _audit("update", {**existing, **payload, **extra}, user)
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
    await _audit("delete", sale, user)
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


def _inst_net(inst):
    net = inst.get("net")
    if net:
        return net
    g = inst.get("gross") or inst.get("value") or 0
    return round(g - (inst.get("discount") or 0), 2)


def _recompute_inst(inst):
    net = _inst_net(inst)
    paid = round(sum((p.get("amount") or 0) for p in (inst.get("payments") or []) if (p.get("kind") or "repasse") == "repasse"), 2)
    inst["net"] = net
    inst["paid"] = paid
    saldo = round(net - paid, 2)
    today = (datetime.now(timezone.utc) - timedelta(hours=3)).date().isoformat()
    if paid <= 0:
        inst["status"] = "vencida" if (inst.get("due_date") and inst["due_date"] < today) else "pendente"
    elif saldo > 0.009:
        inst["status"] = "parcial"
    else:
        inst["status"] = "pago"
    inst["received"] = inst["status"] == "pago"
    return saldo


@api_router.post("/sales/{sale_id}/installments/{number}/baixa")
async def baixa_installment(sale_id: str, number: int, request: Request, user: dict = Depends(get_current_user)):
    sale = await db.sales.find_one({"id": sale_id, **_scope_query(user)}, {"_id": 0})
    if not sale:
        raise HTTPException(status_code=404, detail="Venda não encontrada")
    body = await request.json()
    insts = sale.get("installments", [])
    target = next((i for i in insts if i["number"] == number), None)
    if not target:
        raise HTTPException(status_code=404, detail="Parcela não encontrada")
    now = datetime.now(timezone.utc)
    today = (now - timedelta(hours=3)).date().isoformat()
    pay = {
        "amount": float(body.get("amount") or 0), "date": body.get("date") or today,
        "method": body.get("method") or "", "discount": float(body.get("discount") or 0),
        "reason": body.get("reason") or "", "notes": body.get("notes") or "",
        "kind": body.get("kind") or "repasse", "receipt": body.get("receipt") or "",
        "receipt_name": body.get("receipt_name") or "",
        "by": _display(user), "at": now.isoformat(),
    }
    if pay["amount"] <= 0:
        raise HTTPException(status_code=400, detail="Informe o valor pago.")
    target.setdefault("payments", []).append(pay)
    if pay["discount"]:
        target["discount"] = round((target.get("discount") or 0) + pay["discount"], 2)
    _recompute_inst(target)
    await db.sales.update_one({"id": sale_id}, {"$set": {"installments": insts}})
    await _audit("baixa", sale, user,
                 detail=f"Parcela {number}: {pay['kind']} R$ {pay['amount']:.2f} ({pay['method'] or 's/ forma'})")
    return await db.sales.find_one({"id": sale_id}, {"_id": 0})


@api_router.patch("/sales/{sale_id}/commission")
async def edit_commission(sale_id: str, request: Request, user: dict = Depends(require_master)):
    """Edição inline do % e do desconto NF/boleto no Relatório de Comissões (com auditoria)."""
    sale = await db.sales.find_one({"id": sale_id}, {"_id": 0})
    if not sale:
        raise HTTPException(status_code=404, detail="Venda não encontrada")
    body = await request.json()
    old_rate = sale.get("commission_rate") or 0
    old_disc = sum((d.get("value") or 0) for d in (sale.get("discounts") or [])
                   if (d.get("type") or "") in ("nf", "boleto", "nf_boleto"))
    payload = dict(sale)
    if body.get("commission_rate") is not None:
        payload["commission_rate"] = float(body.get("commission_rate") or 0)
    new_disc = old_disc
    if body.get("discount") is not None:
        new_disc = float(body.get("discount") or 0)
        others = [d for d in (sale.get("discounts") or []) if (d.get("type") or "") not in ("nf", "boleto", "nf_boleto")]
        if new_disc > 0:
            others.append({"type": "nf_boleto", "value": new_disc,
                           "reason": "Desc. NF/boleto", "notes": "Editado no relatório"})
        payload["discounts"] = others
    _compute_commission(payload)
    upd = {
        "commission_rate": payload.get("commission_rate", 0),
        "discounts": payload.get("discounts", []),
        "commission_gross": payload.get("commission_gross", 0),
        "commission_value": payload.get("commission_value", 0),
        "commission_net": payload.get("commission_net", 0),
    }
    await db.sales.update_one({"id": sale_id}, {"$set": upd})
    await _audit("commission_edit", {**sale, **upd}, user,
                 detail=f"% {old_rate}→{upd['commission_rate']} · Desc. NF/boleto R$ {old_disc:.2f}→R$ {new_disc:.2f}")
    return await db.sales.find_one({"id": sale_id}, {"_id": 0})


@api_router.patch("/sales/{sale_id}/cancel")
async def cancel_sale(sale_id: str, request: Request, user: dict = Depends(require_master)):
    sale = await db.sales.find_one({"id": sale_id}, {"_id": 0})
    if not sale:
        raise HTTPException(status_code=404, detail="Venda não encontrada")
    body = await request.json()
    reason = (body.get("reason") or "").strip()
    await db.sales.update_one({"id": sale_id}, {"$set": {
        "status": "cancelled", "cancelled_at": datetime.now(timezone.utc).isoformat(), "cancel_reason": reason}})
    await _audit("cancel", sale, user, detail=reason or "Venda cancelada/distrato")
    return {"ok": True}


def _sale_comm_frac(s: dict, user: dict) -> float:
    """Fração da comissão da venda que pertence ao usuário (corretor) — 1.0 para gestor."""
    if user.get("role") != "corretor":
        return 1.0
    cv = s.get("commission_value") or 0
    if cv <= 0:
        return 0.0
    return min((_broker_pool(s) * _partner_share(s, user)) / cv, 1.0)


@api_router.get("/commissions/extrato")
async def commissions_extrato(month: Optional[int] = None, year: Optional[int] = None,
                              user: dict = Depends(get_current_user)):
    sales = await list_sales(month=month, year=year, user=user)
    today = (datetime.now(timezone.utc) - timedelta(hours=3)).date().isoformat()
    vgv = gerada = recebida = a_receber = vencida = 0.0
    proximos, lancamentos = [], []
    for s in sales:
        frac = _sale_comm_frac(s, user)
        vgv += (s.get("sale_value", 0) or 0) * (_partner_share(s, user) if user.get("role") == "corretor" else 1.0)
        insts = s.get("installments") or []
        if not insts:
            cv = (s.get("commission_value", 0) or 0) * frac
            gerada += cv
            if s.get("commission_received"):
                recebida += cv
            else:
                a_receber += cv
            continue
        for inst in insts:
            _recompute_inst(inst)
            net = (inst.get("net") or 0) * frac
            paid = (inst.get("paid") or 0) * frac
            saldo = round(net - paid, 2)
            gerada += net
            recebida += paid
            a_receber += saldo
            if inst.get("status") == "vencida":
                vencida += saldo
            if inst.get("status") != "pago":
                proximos.append({"sale_id": s.get("id"), "property_name": s.get("property_name"),
                                 "quadra": s.get("quadra"), "lote": s.get("lote"), "client_name": s.get("client_name"),
                                 "broker_name": s.get("broker_name"), "number": inst.get("number"),
                                 "due_date": inst.get("due_date"), "net": net, "paid": paid, "saldo": saldo,
                                 "status": inst.get("status")})
        lancamentos.append({"sale_id": s.get("id"), "property_name": s.get("property_name"),
                            "quadra": s.get("quadra"), "lote": s.get("lote"), "broker_name": s.get("broker_name"),
                            "sale_date": s.get("sale_date"),
                            "status": "pago" if all(i.get("status") == "pago" for i in insts) else
                                      ("parcial" if any(i.get("paid") for i in insts) else "pendente")})
    proximos.sort(key=lambda p: p.get("due_date") or "")
    return {"vendas": len(sales), "vgv": round(vgv, 2), "comissao_gerada": round(gerada, 2),
            "comissao_recebida": round(recebida, 2), "comissao_a_receber": round(a_receber, 2),
            "comissao_vencida": round(vencida, 2), "proximos": proximos[:50], "lancamentos": lancamentos,
            "proximo_recebimento": proximos[0] if proximos else None}


@api_router.get("/commissions/agenda")
async def commissions_agenda(user: dict = Depends(get_current_user)):
    sales = await list_sales(user=user)
    items = []
    for s in sales:
        frac = _sale_comm_frac(s, user)
        for inst in (s.get("installments") or []):
            _recompute_inst(inst)
            if inst.get("status") == "pago":
                continue
            items.append({"sale_id": s.get("id"), "property_name": s.get("property_name"),
                          "quadra": s.get("quadra"), "lote": s.get("lote"), "client_name": s.get("client_name"),
                          "broker_name": s.get("broker_name"), "number": inst.get("number"),
                          "due_date": inst.get("due_date"), "saldo": round((inst.get("net") or 0) * frac - (inst.get("paid") or 0) * frac, 2),
                          "status": inst.get("status")})
    items.sort(key=lambda p: p.get("due_date") or "")
    return items


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
    await _audit("transfer", {**sale, **upd}, user,
                 detail=f"De {sale.get('broker_name')} para {new_name}")
    if oid:
        await _notify(oid, "new_sale",
                      f"Uma venda foi transferida para você: {sale.get('property_name')}.",
                      {"sale_id": sale_id})
    return {**sale, **upd}


@api_router.post("/sales/bulk-delete")
async def bulk_delete_sales(request: Request, user: dict = Depends(require_master)):
    body = await request.json()
    ids = body.get("ids") or []
    n = 0
    for sid in ids:
        sale = await db.sales.find_one({"id": sid}, {"_id": 0})
        if not sale:
            continue
        sale["deleted_at"] = datetime.now(timezone.utc).isoformat()
        sale["deleted_by"] = user["user_id"]
        sale["deleted_by_name"] = _display(user)
        await db.sales_history.insert_one(sale)
        await db.sales.delete_one({"id": sid})
        await _audit("delete", sale, user, detail="Exclusão em lote")
        n += 1
    return {"ok": True, "deleted": n}


@api_router.post("/sales/bulk-transfer")
async def bulk_transfer_sales(request: Request, user: dict = Depends(require_master)):
    body = await request.json()
    ids = body.get("ids") or []
    new_name = (body.get("broker_name") or "").strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Informe o corretor de destino")
    corr = await _resolve_corretor_by_name(new_name)
    oid = corr["user_id"] if corr else None
    n = 0
    for sid in ids:
        sale = await db.sales.find_one({"id": sid}, {"_id": 0})
        if not sale:
            continue
        upd = {"brokers": [{"name": new_name, "split_pct": 100.0, "owner_id": oid}],
               "broker_name": new_name, "owner_id": oid or user["user_id"],
               "owner_name": new_name, "broker_ids": [oid] if oid else []}
        await db.sales.update_one({"id": sid}, {"$set": upd})
        await _audit("transfer", {**sale, **upd}, user, detail=f"De {sale.get('broker_name')} para {new_name} (em lote)")
        n += 1
    if oid and n:
        await _notify(oid, "new_sale", f"{n} venda(s) foram transferidas para você.", {})
    return {"ok": True, "transferred": n}


@api_router.get("/audit")
async def list_audit(user: dict = Depends(require_master)):
    docs = await db.sale_audit.find({}, {"_id": 0}).to_list(1000)
    docs.sort(key=lambda d: d.get("at", ""), reverse=True)
    return docs[:200]


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


def _partner_share(s: dict, user: dict) -> float:
    uid = user["user_id"]
    names = _user_names(user)
    brokers = s.get("brokers") or []
    if not brokers:
        owns = s.get("owner_id") == uid or (s.get("broker_name") or "").strip().lower() in names
        return 1.0 if owns else 0.0
    total = sum((b.get("split_pct") or 0) for b in brokers) or 100.0
    mine = sum((b.get("split_pct") or 0) for b in brokers
               if b.get("owner_id") == uid or (b.get("name") or "").strip().lower() in names)
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
            return _partner_share(s, user)
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
    optout_users = await db.users.find({"ranking_opt_out": True}, {"_id": 0, "war_name": 1, "name": 1}).to_list(1000)
    optout = set()
    for ou in optout_users:
        for k in (ou.get("war_name"), ou.get("name")):
            if k:
                optout.add(k.strip().lower())
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
            if name.strip().lower() in optout:
                continue
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


@api_router.get("/ranking/loteamentos")
async def ranking_loteamentos(month: Optional[int] = None, year: Optional[int] = None,
                              start: Optional[str] = None, end: Optional[str] = None,
                              user: dict = Depends(get_current_user)):
    if start or end:
        docs = await db.sales.find({}, {"_id": 0}).to_list(5000)
        sales = [s for s in docs if _in_range(s, start, end)]
    else:
        sales = await _company_sales(month, year)
    agg = {}
    for s in sales:
        name = (s.get("property_name") or "—").strip() or "—"
        a = agg.setdefault(name, {"loteamento": name, "qtd": 0, "volume": 0.0})
        a["qtd"] += 1
        a["volume"] += s.get("sale_value", 0) or 0
    return sorted(agg.values(), key=lambda x: x["volume"], reverse=True)


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
        if s.get("status") == "cancelled":
            continue
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
                mt = "VGV" if g.get("metric") == "vgv" else "vendas"
                crossed = [lv for lv in (100, 90, 75, 50) if prog["pct"] >= lv and lv not in notified]
                if crossed:
                    level = crossed[0]
                    phrases = {
                        100: f"🎯 Meta de {mt} batida! Parabéns! 🎉",
                        90: f"Você está a {prog['pct']}% da meta de {mt}. Falta pouco! 🔥",
                        75: f"Já são {prog['pct']}% da meta de {mt}. Continue firme! 💪",
                        50: f"Metade da meta de {mt} alcançada ({prog['pct']}%)! 🚀",
                    }
                    await _notify(oid, "goal", phrases[level])
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
    docs = await _scoped_sales(user)
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
    if user.get("role") == "master":
        seen = {_norm_name(c["name"]) for c in out}
        for rc in await db.clients.find({}, {"_id": 0}).to_list(5000):
            if _norm_name(rc.get("name")) not in seen:
                out.append({"name": rc.get("name"), "phone": rc.get("phone", ""), "email": rc.get("email", ""),
                            "birthdate": rc.get("birthdate", ""), "broker": "", "qtd": 0, "volume": 0.0,
                            "last_date": "", "purchases": [], "client_id": rc.get("id")})
    return out


@api_router.post("/clients")
async def create_client(data: ClientCreate, force: bool = False, user: dict = Depends(get_current_user)):
    name = (data.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Informe o nome do cliente")
    cpf = _only_digits(data.cpf)
    nk = _norm_name(name)
    if not force:
        dup = None
        if cpf:
            dup = await db.clients.find_one({"cpf_key": cpf}, {"_id": 0})
        if not dup:
            dup = await db.clients.find_one({"name_key": nk}, {"_id": 0})
        if not dup and (data.phone or "").strip():
            dup = await db.clients.find_one({"phone": data.phone.strip()}, {"_id": 0})
        if dup:
            raise HTTPException(status_code=409, detail={"code": "client_dup",
                                "message": f"Cliente parecido já existe: {dup['name']}.", "client": dup})
    c = Client(**data.model_dump(), name_key=nk, cpf_key=cpf)
    await db.clients.insert_one(c.model_dump())
    return c


@api_router.put("/clients/{client_id}")
async def update_client(client_id: str, data: ClientCreate, user: dict = Depends(get_current_user)):
    existing = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    upd = data.model_dump()
    upd["name_key"] = _norm_name(data.name)
    upd["cpf_key"] = _only_digits(data.cpf)
    upd["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.clients.update_one({"id": client_id}, {"$set": upd})
    return {**existing, **upd}


@api_router.get("/clients/search")
async def search_clients(q: str = "", user: dict = Depends(get_current_user)):
    qq = _norm_name(q)
    digits = _only_digits(q)
    docs = await db.clients.find({}, {"_id": 0}).to_list(5000)
    out = []
    for c in docs:
        if ((qq and qq in (c.get("name_key") or ""))
                or (digits and digits in (c.get("cpf_key") or ""))
                or (digits and digits in _only_digits(c.get("phone")))):
            out.append(c)
    return out[:20]


@api_router.get("/clients/duplicates")
async def client_duplicates(user: dict = Depends(require_master)):
    docs = await db.clients.find({}, {"_id": 0}).to_list(5000)
    groups = {}
    for c in docs:
        groups.setdefault(c.get("cpf_key") or c.get("name_key"), []).append(c)
    return [{"key": k, "clients": v} for k, v in groups.items() if k and len(v) > 1]


@api_router.post("/clients/merge")
async def merge_clients(request: Request, user: dict = Depends(require_master)):
    body = await request.json()
    keep = body.get("keep_id")
    drops = body.get("merge_ids") or []
    kc = await db.clients.find_one({"id": keep}, {"_id": 0})
    if not kc:
        raise HTTPException(status_code=404, detail="Cliente principal não encontrado")
    for did in drops:
        if did == keep:
            continue
        dc = await db.clients.find_one({"id": did}, {"_id": 0})
        if not dc:
            continue
        upd = {}
        for f in ["phone", "email", "cpf", "birthdate", "notes", "origin", "origin_other"]:
            if dc.get(f) and not kc.get(f):
                upd[f] = dc[f]
                kc[f] = dc[f]
        if upd.get("cpf"):
            upd["cpf_key"] = _only_digits(upd["cpf"])
        if upd:
            await db.clients.update_one({"id": keep}, {"$set": upd})
        await db.sales.update_many({"client_id": did}, {"$set": {"client_id": keep}})
        await db.clients.delete_one({"id": did})
        await _audit("client_merge", {"id": keep, "client_name": kc.get("name")}, user,
                     detail=f"Mesclou '{dc.get('name')}' em '{kc.get('name')}'")
    return {"ok": True}


@api_router.get("/loteamentos/duplicates")
async def lot_duplicates(user: dict = Depends(require_master)):
    lots = await db.loteamentos.find({}, {"_id": 0}).to_list(3000)
    sales = await db.sales.find({}, {"_id": 0}).to_list(5000)
    names = {l.get("name") for l in lots if l.get("name")}
    names |= {s.get("property_name") for s in sales if s.get("property_name")}
    groups = {}
    for n in names:
        groups.setdefault(_norm_name(n), set()).add(n)
    return [{"key": k, "names": sorted(v)} for k, v in groups.items() if len(v) > 1]


@api_router.post("/loteamentos/merge")
async def merge_loteamentos(request: Request, user: dict = Depends(require_master)):
    body = await request.json()
    keep = (body.get("keep") or "").strip()
    drops = body.get("drop") or []
    if not keep:
        raise HTTPException(status_code=400, detail="Informe o nome oficial do loteamento")
    await _ensure_loteamento(keep)
    for name in drops:
        if (name or "").strip() == keep:
            continue
        r = await db.sales.update_many({"property_name": name}, {"$set": {"property_name": keep}})
        await db.loteamentos.delete_many({"name": name})
        await _audit("loteamento_merge", {"property_name": keep}, user,
                     detail=f"Mesclou '{name}' em '{keep}' ({r.modified_count} venda(s))")
    return {"ok": True}


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


async def _process_installments():
    try:
        now = _br_now()
        today_iso = now.date().isoformat()
        soon_iso = (now.date() + timedelta(days=3)).isoformat()
        masters = await db.users.find({"role": "master"}, {"_id": 0}).to_list(50)
        master_ids = [m["user_id"] for m in masters]
        sales = await db.sales.find({"parcelado": True}, {"_id": 0}).to_list(5000)
        for s in sales:
            insts = s.get("installments") or []
            changed = False
            owner_ids = set(s.get("broker_ids") or [])
            if s.get("owner_id"):
                owner_ids.add(s["owner_id"])
            targets = list(dict.fromkeys(list(owner_ids) + master_ids))
            lot = s.get("property_name") or "loteamento"
            for inst in insts:
                if inst.get("received"):
                    continue
                due = inst.get("due_date") or ""
                val = _fmt_brl(inst.get("value", 0))
                if due and due < today_iso and not inst.get("notified_overdue"):
                    for t in targets:
                        await _notify(t, "installment",
                                      f"⚠️ Parcela de comissão vencida: {lot} — venceu em {_fmt_date(due)} ({val}).",
                                      {"sale_id": s.get("id")})
                    inst["notified_overdue"] = True
                    changed = True
                elif due and today_iso <= due <= soon_iso and not inst.get("notified_due_soon"):
                    for t in targets:
                        await _notify(t, "installment",
                                      f"⏰ Parcela de comissão vence em {_fmt_date(due)}: {lot} ({val}).",
                                      {"sale_id": s.get("id")})
                    inst["notified_due_soon"] = True
                    changed = True
            if changed:
                await db.sales.update_one({"id": s.get("id")}, {"$set": {"installments": insts}})
    except Exception as e:
        logger.warning(f"installments cron failed: {e}")


@api_router.post("/cron/installments")
async def cron_installments(background_tasks: BackgroundTasks,
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
    background_tasks.add_task(_process_installments)
    return {"ok": True}


# ---------------- Goals (metas) ----------------
async def _goal_progress(g: dict, all_sales: list):
    gsales = [s for s in all_sales if s.get("status") != "cancelled" and _match_period(s, g.get("month"), g["year"])]
    if g.get("scope") == "company":
        cur = (sum(s.get("sale_value", 0) or 0 for s in gsales)
               if g.get("metric") == "vgv" else len(gsales))
        label = "Imobiliária"
    else:
        oid = g.get("owner_id")
        u = await db.users.find_one({"user_id": oid}, {"_id": 0})
        guser = u or {"user_id": oid, "war_name": "", "name": ""}
        vol, cnt = 0.0, 0
        for s in gsales:
            share = _partner_share(s, guser)
            if share > 0:
                vol += (s.get("sale_value", 0) or 0) * share
                cnt += 1
        cur = vol if g.get("metric") == "vgv" else cnt
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
        my_names = _user_names(user)
        my_email = (user.get("email") or "").strip().lower()
        owner_cache, visible = {}, []
        for g in goals:
            if g.get("scope") == "company":
                visible.append(g)
                continue
            oid = g.get("owner_id")
            if oid == uid:
                visible.append(g)
                continue
            ou = owner_cache.get(oid)
            if ou is None:
                ou = await db.users.find_one({"user_id": oid}, {"_id": 0}) or {}
                owner_cache[oid] = ou
            o_email = (ou.get("email") or "").strip().lower()
            if (my_names & _user_names(ou)) or (my_email and my_email == o_email):
                visible.append(g)
        goals = visible
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
    "cpf": "client_cpf", "cpf cliente": "client_cpf", "cpf do cliente": "client_cpf",
    "cnpj/cpf": "client_cpf", "cpf/cnpj": "client_cpf", "documento": "client_cpf", "doc": "client_cpf",
    "data de nascimento": "client_birthdate", "data nascimento": "client_birthdate",
    "nascimento": "client_birthdate", "dt nascimento": "client_birthdate", "dt. nascimento": "client_birthdate",
    "data nasc": "client_birthdate", "data nasc.": "client_birthdate", "data de nasc": "client_birthdate",
    "data de nasc.": "client_birthdate", "dt nasc": "client_birthdate", "dt. nasc": "client_birthdate",
    "aniversario": "client_birthdate", "nascimento cliente": "client_birthdate",
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


def parse_date_opt(v):
    """Igual a parse_date, mas devolve '' quando vazio (para data de nascimento)."""
    s = _clean(v)
    if not s:
        return ""
    out = parse_date(s)
    return out


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
        client_email=_clean(d.get("client_email")),
        client_cpf=_only_digits(_clean(d.get("client_cpf"))), client_birthdate=parse_date_opt(d.get("client_birthdate")),
        broker_name=_clean(d.get("broker_name")) or "—",
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


def _parse_ai_obj(raw: str) -> dict:
    import json
    s = (raw or "").strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z]*\n?", "", s)
        s = re.sub(r"\n?```$", "", s).strip()
    m = re.search(r"\{.*\}", s, re.DOTALL)
    if m:
        s = m.group(0)
    try:
        data = json.loads(s)
    except (ValueError, TypeError):
        return {}
    return data if isinstance(data, dict) else {}


IMPORT_FIELDS = ["property_name", "quadra", "lote", "client_name", "client_phone", "client_email",
                 "client_cpf", "client_birthdate", "broker_name", "sale_date", "sale_value",
                 "commission_rate", "commission_value", "num_parcelas"]
IMPORT_FIELD_LABELS = {
    "property_name": "Loteamento", "quadra": "Quadra", "lote": "Lote", "client_name": "Cliente",
    "client_phone": "Telefone", "client_email": "E-mail", "client_cpf": "CPF",
    "client_birthdate": "Data de nascimento", "broker_name": "Corretor", "sale_date": "Data da venda",
    "sale_value": "Valor da venda", "commission_rate": "Comissão %", "commission_value": "Comissão R$",
    "num_parcelas": "Nº de parcelas",
}


async def _ai_suggest_mapping(headers: list) -> dict:
    headers = [h for h in headers if str(h).strip()]
    if not headers:
        return {}
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        key = os.environ.get("EMERGENT_LLM_KEY")
        if not key:
            return {}
        chat = LlmChat(api_key=key, session_id=f"map_{uuid.uuid4().hex[:8]}",
                       system_message="Você mapeia cabeçalhos de planilhas de vendas de loteamentos para campos canônicos. Responda APENAS com JSON.").with_model("gemini", "gemini-2.5-flash")
        prompt = (
            "Para cada cabeçalho de coluna abaixo, diga a qual campo canônico ele corresponde. "
            f"Campos possíveis: {', '.join(IMPORT_FIELDS)}, ou \"ignorar\" se não corresponder a nenhum. "
            "Responda APENAS com um objeto JSON no formato {\"cabeçalho\": \"campo\"}.\n\nCABEÇALHOS:\n"
            + "\n".join(f"- {h}" for h in headers)
        )
        resp = await chat.send_message(UserMessage(text=prompt))
        raw = resp if isinstance(resp, str) else getattr(resp, "content", str(resp))
        obj = _parse_ai_obj(raw)
        return {str(k): v for k, v in obj.items() if v in IMPORT_FIELDS}
    except Exception as e:
        logger.warning(f"ai mapping failed: {type(e).__name__}")
        return {}


def _read_headers(content: bytes, fname: str) -> list:
    try:
        if fname.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content), sheet_name=0, nrows=0)
            return [str(c) for c in df.columns]
        if fname.endswith(".csv"):
            try:
                txt = content.decode("utf-8")
            except UnicodeDecodeError:
                txt = content.decode("latin-1", errors="ignore")
            first = txt.splitlines()[0] if txt.strip() else ""
            sep = ";" if first.count(";") > first.count(",") else ","
            return [h.strip().strip('"') for h in first.split(sep) if h.strip()]
    except Exception:
        return []
    return []


AI_IMPORT_PROMPT = (
    "Extraia TODAS as vendas e responda APENAS com um array JSON "
    "(sem texto extra, sem markdown). Cada item deve ter os campos: property_name (loteamento), "
    "quadra, lote, client_name, client_phone, client_email, "
    "client_cpf (CPF do cliente — pode aparecer como CPF, CNPJ/CPF, CPF/CNPJ, Documento, 'CPF do cliente'; "
    "retorne apenas os dígitos, sem pontos ou traços), "
    "client_birthdate (data de nascimento do cliente — pode aparecer como 'Data de Nascimento', 'Nascimento', "
    "'Dt. Nascimento', 'Data Nasc.'; converta para YYYY-MM-DD), "
    "broker_name (corretor), "
    "sale_date (converta qualquer formato para YYYY-MM-DD), sale_value (número puro, sem R$), "
    "commission_rate (número ou null), commission_value (número ou null), num_parcelas (inteiro ou null). "
    "NUNCA ignore client_cpf nem client_birthdate quando existirem no arquivo. "
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
    column_mapping = {}
    if fname.endswith(IMAGE_EXTS):
        rows = await _ai_extract_sales_from_image(content)
    else:
        text = _extract_text_for_ai(content, fname)
        if not text.strip():
            raise HTTPException(status_code=422, detail="Não foi possível ler conteúdo do arquivo.")
        if len(text) > 60000:
            text = text[:60000]
        rows = await _ai_extract_sales(text)
        headers = _read_headers(content, fname)
        if headers:
            suggested = await _ai_suggest_mapping(headers)
            column_mapping = {h: {"field": f, "label": IMPORT_FIELD_LABELS.get(f, f)} for h, f in suggested.items()}
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
            "client_cpf": _only_digits(_clean(d.get("client_cpf"))),
            "client_birthdate": parse_date_opt(d.get("client_birthdate")),
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
    return {
        "rows": out, "total": len(out), "duplicates": sum(1 for r in out if r["is_duplicate"]),
        "column_mapping": column_mapping,
        "mapping": {
            "cpf": any(r.get("client_cpf") for r in out),
            "birthdate": any(r.get("client_birthdate") for r in out),
        },
    }


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
            client_cpf=_only_digits(_clean(d.get("client_cpf"))), client_birthdate=parse_date_opt(d.get("client_birthdate")),
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


EXPORT_COLUMNS = ["Data", "Loteamento", "Quadra", "Lote", "Cliente", "Corretor",
                  "Valor da venda", "Comissão %", "Comissão total", "Comissão corretor",
                  "Comissão imobiliária", "Entrada", "Já recebido", "A receber", "Status"]
MONEY_COLS = {"Valor da venda", "Comissão total", "Comissão corretor",
              "Comissão imobiliária", "Entrada", "Já recebido", "A receber"}


def _select_columns(param):
    if not param:
        return list(EXPORT_COLUMNS)
    wanted = [c.strip() for c in param.split("||") if c.strip()]
    cols = [c for c in EXPORT_COLUMNS if c in wanted]
    return cols or list(EXPORT_COLUMNS)


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
                      columns: Optional[str] = None,
                      user: dict = Depends(get_current_user)):
    sales = await list_sales(month=month, year=year, user=user)
    rows = _export_rows(sales)
    cols = _select_columns(columns)
    df = pd.DataFrame(rows, columns=EXPORT_COLUMNS)[cols]
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
                     columns: Optional[str] = None,
                     user: dict = Depends(get_current_user)):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    sales = await list_sales(month=month, year=year, user=user)
    rows = _export_rows(sales)
    cols = _select_columns(columns)

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

    headers_cells = [Paragraph(h, head) for h in cols]
    data = [headers_cells]
    for r in rows:
        line = []
        for c in cols:
            v = r.get(c, "")
            txt = _fmt_brl(v) if c in MONEY_COLS else (str(v) if v not in (None, "") else "—")
            line.append(Paragraph(txt, cell))
        data.append(line)
    totals = []
    for i, c in enumerate(cols):
        if c in MONEY_COLS:
            totals.append(Paragraph(f"<b>{_fmt_brl(sum((r.get(c) or 0) for r in rows))}</b>", cell))
        elif i == 0:
            totals.append(Paragraph("<b>TOTAIS</b>", cell))
        else:
            totals.append("")
    data.append(totals)

    table = Table(data, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F382C")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d1d5db")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#f3f6f5")]),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#efe7d4")),
    ]))
    elements.append(table)
    doc.build(elements)
    buf.seek(0)
    fname = f"relatorio-brilhantes-{year}{('-' + str(month).zfill(2)) if month else ''}.pdf"
    return Response(
        content=buf.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


# ---------------- Relatório de Comissões (consolidado) ----------------
REPORT_COLUMNS = ["Data", "Loteamento", "Quadra", "Lote", "Corretor", "Valor",
                  "%", "Comissão", "Desc. NF/boleto", "Líquido", "Parcelas",
                  "Pago", "Saldo", "Status"]
REPORT_MONEY_COLS = {"Valor", "Comissão", "Desc. NF/boleto", "Líquido", "Pago", "Saldo"}
_STATUS_LABEL = {"pendente": "Pendente", "parcial": "Parcial", "pago": "Paga"}


def _report_status(insts, received):
    if insts:
        if all(i.get("status") == "pago" for i in insts):
            return "pago"
        if any((i.get("paid") or 0) > 0 for i in insts):
            return "parcial"
        return "pendente"
    return "pago" if received else "pendente"


def _report_row(s: dict, user: dict) -> dict:
    frac = _sale_comm_frac(s, user)
    pshare = _partner_share(s, user) if user.get("role") == "corretor" else 1.0
    gross = round((s.get("commission_value") or 0) * frac, 2)
    insts = s.get("installments") or []
    for i in insts:
        _recompute_inst(i)
    if insts:
        net = round(sum((i.get("net") or 0) for i in insts) * frac, 2)
        paid = round(sum((i.get("paid") or 0) for i in insts) * frac, 2)
        done = sum(1 for i in insts if i.get("status") == "pago")
        parc = f"{done}/{len(insts)}"
    else:
        full_net = s.get("commission_net")
        if not full_net:
            full_net = (s.get("commission_value") or 0) - sum((d.get("value") or 0) for d in (s.get("discounts") or []))
        net = round(full_net * frac, 2)
        paid = net if s.get("commission_received") else 0.0
        parc = "À vista"
    disc = round(gross - net, 2)
    saldo = round(net - paid, 2)
    st = _report_status(insts, s.get("commission_received"))
    return {
        "sale_id": s.get("id"),
        "Data": _fmt_date(s.get("sale_date")),
        "Loteamento": s.get("property_name", ""),
        "Quadra": s.get("quadra", ""),
        "Lote": s.get("lote", ""),
        "Corretor": s.get("broker_name", ""),
        "Valor": round((s.get("sale_value") or 0) * pshare, 2),
        "%": s.get("commission_rate", 0) or 0,
        "Comissão": gross,
        "Desc. NF/boleto": disc,
        "Líquido": net,
        "Parcelas": parc,
        "Pago": paid,
        "Saldo": saldo,
        "Status": _STATUS_LABEL.get(st, "Pendente"),
        "status_key": st,
        "can_edit": user.get("role") != "corretor",
        "discount_total": round(sum((d.get("value") or 0) for d in (s.get("discounts") or [])), 2),
    }


def _sale_has_corretor(s: dict, name: str) -> bool:
    nm = (name or "").strip().lower()
    if not nm:
        return True
    if (s.get("broker_name") or "").strip().lower() == nm:
        return True
    return any((b.get("name") or "").strip().lower() == nm for b in (s.get("brokers") or []))


async def _report_sales(user, month, year, start, end):
    if start or end:
        docs = await _scoped_sales(user)
        sales = [d for d in docs
                 if (not start or (d.get("sale_date") or "") >= start)
                 and (not end or (d.get("sale_date") or "") <= end)]
        sales.sort(key=lambda x: x.get("sale_date", ""), reverse=True)
        return sales
    return await list_sales(month=month, year=year, user=user)


async def _build_report(user, month, year, start, end, loteamento, corretor, status):
    sales = await _report_sales(user, month, year, start, end)
    lot = _norm_name(loteamento) if loteamento else ""
    rows = []
    for s in sales:
        if lot and _norm_name(s.get("property_name")) != lot:
            continue
        if corretor and not _sale_has_corretor(s, corretor):
            continue
        row = _report_row(s, user)
        if status and row["status_key"] != status:
            continue
        rows.append(row)
    summary = {
        "vendas": len(rows),
        "comissao_gerada": round(sum(r["Comissão"] for r in rows), 2),
        "recebida": round(sum(r["Pago"] for r in rows), 2),
        "a_receber": round(sum(r["Saldo"] for r in rows), 2),
    }
    return rows, summary


@api_router.get("/commissions/report")
async def commissions_report(month: Optional[int] = None, year: Optional[int] = None,
                             start: Optional[str] = None, end: Optional[str] = None,
                             loteamento: Optional[str] = None, corretor: Optional[str] = None,
                             status: Optional[str] = None, user: dict = Depends(get_current_user)):
    rows, summary = await _build_report(user, month, year, start, end, loteamento, corretor, status)
    return {"rows": rows, "summary": summary, "can_edit": user.get("role") != "corretor"}


def _report_cols(param):
    if not param:
        return list(REPORT_COLUMNS)
    wanted = [c.strip() for c in param.split("||") if c.strip()]
    cols = [c for c in REPORT_COLUMNS if c in wanted]
    return cols or list(REPORT_COLUMNS)


@api_router.get("/commissions/report/xlsx")
async def commissions_report_xlsx(month: Optional[int] = None, year: Optional[int] = None,
                                  start: Optional[str] = None, end: Optional[str] = None,
                                  loteamento: Optional[str] = None, corretor: Optional[str] = None,
                                  status: Optional[str] = None, columns: Optional[str] = None,
                                  user: dict = Depends(get_current_user)):
    rows, _ = await _build_report(user, month, year, start, end, loteamento, corretor, status)
    cols = _report_cols(columns)
    df = pd.DataFrame(rows, columns=REPORT_COLUMNS)[cols] if rows else pd.DataFrame(columns=cols)
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Comissões")
    buf.seek(0)
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="relatorio-comissoes-brilhantes.xlsx"'},
    )


@api_router.get("/commissions/report/pdf")
async def commissions_report_pdf(month: Optional[int] = None, year: Optional[int] = None,
                                 start: Optional[str] = None, end: Optional[str] = None,
                                 loteamento: Optional[str] = None, corretor: Optional[str] = None,
                                 status: Optional[str] = None, columns: Optional[str] = None,
                                 user: dict = Depends(get_current_user)):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    rows, summary = await _build_report(user, month, year, start, end, loteamento, corretor, status)
    cols = _report_cols(columns)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4),
                            leftMargin=10 * mm, rightMargin=10 * mm,
                            topMargin=10 * mm, bottomMargin=10 * mm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("t", parent=styles["Title"], textColor=colors.HexColor("#0F382C"), fontSize=16)
    sub_style = ParagraphStyle("s", parent=styles["Normal"], textColor=colors.HexColor("#6b7280"), fontSize=9)
    cell = ParagraphStyle("c", parent=styles["Normal"], fontSize=6.5, leading=8)
    head = ParagraphStyle("h", parent=styles["Normal"], fontSize=6.5, leading=8, textColor=colors.white)

    logo_path = ROOT_DIR.parent / "frontend" / "public" / "logo-light.jpg"
    elements = []
    if logo_path.exists():
        elements.append(Image(str(logo_path), width=20 * mm, height=20 * mm))
        elements.append(Spacer(1, 2 * mm))
    elements += [
        Paragraph("Brilhante's Imóveis — Relatório de Comissões", title_style),
        Paragraph(f"{summary['vendas']} venda(s) &nbsp;·&nbsp; Comissão gerada {_fmt_brl(summary['comissao_gerada'])} "
                  f"&nbsp;·&nbsp; Recebida {_fmt_brl(summary['recebida'])} "
                  f"&nbsp;·&nbsp; A receber {_fmt_brl(summary['a_receber'])}", sub_style),
        Spacer(1, 6 * mm),
    ]
    data = [[Paragraph(h, head) for h in cols]]
    for r in rows:
        line = []
        for c in cols:
            v = r.get(c, "")
            if c in REPORT_MONEY_COLS:
                txt = _fmt_brl(v)
            elif c == "%":
                txt = f"{v}%" if v else "—"
            else:
                txt = str(v) if v not in (None, "") else "—"
            line.append(Paragraph(txt, cell))
        data.append(line)
    totals = []
    for i, c in enumerate(cols):
        if c in REPORT_MONEY_COLS:
            totals.append(Paragraph(f"<b>{_fmt_brl(sum((r.get(c) or 0) for r in rows))}</b>", cell))
        elif i == 0:
            totals.append(Paragraph("<b>TOTAIS</b>", cell))
        else:
            totals.append("")
    data.append(totals)

    table = Table(data, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F382C")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d1d5db")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#f3f6f5")]),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#efe7d4")),
    ]))
    elements.append(table)
    doc.build(elements)
    buf.seek(0)
    return Response(
        content=buf.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="relatorio-comissoes-brilhantes.pdf"'},
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
        "cpf": data.cpf or "", "birthdate": data.birthdate or "",
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
           "cpf": data.cpf or "", "birthdate": data.birthdate or "",
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


@api_router.patch("/corretores/{owner_id}/ranking")
async def toggle_corretor_ranking(owner_id: str, request: Request, user: dict = Depends(require_master)):
    body = await request.json()
    opt_out = not bool(body.get("participate", True))
    await db.users.update_one({"user_id": owner_id, "role": "corretor"},
                              {"$set": {"ranking_opt_out": opt_out}})
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
