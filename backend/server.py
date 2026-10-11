from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File
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
from calendar import monthrange
import pandas as pd

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


# ---------------- Models ----------------
class Installment(BaseModel):
    number: int
    due_date: str
    value: float
    received: bool = False
    received_date: Optional[str] = None


class SaleCreate(BaseModel):
    property_name: str  # nome do loteamento
    quadra: Optional[str] = ""
    lote: Optional[str] = ""
    client_name: Optional[str] = ""
    client_phone: Optional[str] = ""
    client_email: Optional[str] = ""
    broker_name: str
    sale_date: str  # YYYY-MM-DD
    sale_value: float
    commission_rate: float = 0.0
    commission_value: float = 0.0
    broker_split: float = 60.0  # % que vai para o corretor
    broker_commission: float = 0.0
    agency_commission: float = 0.0
    entrada: float = 0.0
    parcelado: bool = False
    installments: List[Installment] = []
    notes: Optional[str] = ""


class Sale(SaleCreate):
    id: str = Field(default_factory=lambda: f"sale_{uuid.uuid4().hex[:12]}")
    user_id: str
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


# ---------------- Auth ----------------
async def get_current_user(request: Request):
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado")

    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Sessão inválida")

    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Sessão expirada")

    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")
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

    email = data["email"]
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data.get("name"), "picture": data.get("picture")}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data.get("name"),
            "picture": data.get("picture"),
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
    return {"ok": True}


# ---------------- Sales ----------------
@api_router.get("/sales", response_model=List[Sale])
async def list_sales(month: Optional[int] = None, year: Optional[int] = None,
                     user: dict = Depends(get_current_user)):
    query = {"user_id": user["user_id"]}
    docs = await db.sales.find(query, {"_id": 0}).to_list(2000)
    results = []
    for d in docs:
        sd = d.get("sale_date", "")
        if year is not None and not sd.startswith(f"{year:04d}"):
            continue
        if month is not None:
            try:
                if int(sd[5:7]) != month:
                    continue
            except (ValueError, IndexError):
                continue
        results.append(d)
    results.sort(key=lambda x: x.get("sale_date", ""), reverse=True)
    return results


@api_router.post("/sales", response_model=Sale)
async def create_sale(data: SaleCreate, user: dict = Depends(get_current_user)):
    sale = Sale(**data.model_dump(), user_id=user["user_id"])
    await db.sales.insert_one(sale.model_dump())
    return sale


@api_router.put("/sales/{sale_id}", response_model=Sale)
async def update_sale(sale_id: str, data: SaleCreate, user: dict = Depends(get_current_user)):
    existing = await db.sales.find_one({"id": sale_id, "user_id": user["user_id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Venda não encontrada")
    updated = {**existing, **data.model_dump()}
    await db.sales.update_one({"id": sale_id}, {"$set": data.model_dump()})
    return updated


@api_router.delete("/sales/{sale_id}")
async def delete_sale(sale_id: str, user: dict = Depends(get_current_user)):
    res = await db.sales.delete_one({"id": sale_id, "user_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Venda não encontrada")
    return {"ok": True}


@api_router.patch("/sales/{sale_id}/installments/{number}")
async def toggle_installment(sale_id: str, number: int, user: dict = Depends(get_current_user)):
    sale = await db.sales.find_one({"id": sale_id, "user_id": user["user_id"]}, {"_id": 0})
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


@api_router.get("/stats")
async def stats(month: Optional[int] = None, year: Optional[int] = None,
                user: dict = Depends(get_current_user)):
    sales = await list_sales(month=month, year=year, user=user)
    total_vendido = sum(s.get("sale_value", 0) or 0 for s in sales)
    comissao_total = sum(s.get("commission_value", 0) or 0 for s in sales)
    comissao_corretor = sum(_broker_comm(s) for s in sales)
    comissao_imobiliaria = sum(_agency_comm(s) for s in sales)
    entrada_total = sum(s.get("entrada", 0) or 0 for s in sales)
    ja_entrou = sum(_received_amount(s) for s in sales)
    falta_entrar = sum(_pending_amount(s) for s in sales)
    return {
        "total_vendido": total_vendido,
        "comissao_total": comissao_total,
        "comissao_corretor": comissao_corretor,
        "comissao_imobiliaria": comissao_imobiliaria,
        "entrada_total": entrada_total,
        "ja_entrou": ja_entrou,
        "falta_entrar": falta_entrar,
        "qtd_vendas": len(sales),
    }


@api_router.get("/ranking")
async def ranking(month: Optional[int] = None, year: Optional[int] = None,
                  user: dict = Depends(get_current_user)):
    sales = await list_sales(month=month, year=year, user=user)
    by_broker = {}
    for s in sales:
        name = s.get("broker_name", "—") or "—"
        b = by_broker.setdefault(name, {
            "broker_name": name, "qtd": 0, "volume": 0.0,
            "comissao": 0.0, "comissao_corretor": 0.0, "photo": None,
        })
        b["qtd"] += 1
        b["volume"] += s.get("sale_value", 0) or 0
        b["comissao"] += s.get("commission_value", 0) or 0
        b["comissao_corretor"] += _broker_comm(s)

    brokers = await db.brokers.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(500)
    photo_map = {}
    for br in brokers:
        for key in (br.get("war_name"), br.get("full_name")):
            if key and br.get("photo"):
                photo_map[key.strip().lower()] = br["photo"]
    for entry in by_broker.values():
        entry["photo"] = photo_map.get(entry["broker_name"].strip().lower())
    return list(by_broker.values())


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
        sale_date=date, sale_value=sv, commission_rate=rate, commission_value=cval,
        broker_split=60.0, broker_commission=broker_comm, agency_commission=agency_comm,
        entrada=entrada, parcelado=parcelado, installments=installments, notes="", user_id=user_id,
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


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
