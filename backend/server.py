from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
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
    property_name: str
    client_name: Optional[str] = ""
    broker_name: str
    sale_date: str  # YYYY-MM-DD
    sale_value: float
    commission_rate: float = 0.0
    commission_value: float = 0.0
    entrada: float = 0.0
    parcelado: bool = False
    installments: List[Installment] = []
    notes: Optional[str] = ""


class Sale(SaleCreate):
    id: str = Field(default_factory=lambda: f"sale_{uuid.uuid4().hex[:12]}")
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


@api_router.get("/stats")
async def stats(month: Optional[int] = None, year: Optional[int] = None,
                user: dict = Depends(get_current_user)):
    sales = await list_sales(month=month, year=year, user=user)
    total_vendido = sum(s.get("sale_value", 0) or 0 for s in sales)
    comissao_total = sum(s.get("commission_value", 0) or 0 for s in sales)
    entrada_total = sum(s.get("entrada", 0) or 0 for s in sales)
    ja_entrou = sum(_received_amount(s) for s in sales)
    falta_entrar = sum(_pending_amount(s) for s in sales)
    return {
        "total_vendido": total_vendido,
        "comissao_total": comissao_total,
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
        b = by_broker.setdefault(name, {"broker_name": name, "qtd": 0, "volume": 0.0, "comissao": 0.0})
        b["qtd"] += 1
        b["volume"] += s.get("sale_value", 0) or 0
        b["comissao"] += s.get("commission_value", 0) or 0
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
