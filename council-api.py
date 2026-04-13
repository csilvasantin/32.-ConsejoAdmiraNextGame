"""
Council API Bridge — Conecta el frontend SCUMM con los agentes del Consejo AdmiraNext.
Usa FastAPI + Anthropic SDK para que cada consejero responda como su persona.

Seguridad:
  - COUNCIL_API_TOKEN: token que el frontend debe enviar en header X-Council-Token
  - CORS restringido a orígenes autorizados
  - Rate limiting por IP (máx peticiones por ventana de tiempo)
  - Cloudflare Tunnel para HTTPS sin abrir puertos
"""

import sys
import os
import asyncio
import time
from typing import Optional
from collections import defaultdict

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"), override=True)

from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Add admiranext to path
sys.path.insert(0, os.path.expanduser("~/GitHub/admiranext"))

from admiranext.agents.base import CouncilAgent
from admiranext.agents.racional.leyendas import CEO, CTO, COO, CFO
from admiranext.agents.racional.coetaneos import (
    CEO_Coetaneo, CTO_Coetaneo, COO_Coetaneo, CFO_Coetaneo,
)
from admiranext.agents.creativo.leyendas import CCO, CDO, CXO, CSO
from admiranext.agents.creativo.coetaneos import (
    CCO_Coetaneo, CDO_Coetaneo, CXO_Coetaneo, CSO_Coetaneo,
)

import anthropic

# ── Config ──────────────────────────────────────────────────
COUNCIL_API_TOKEN = os.environ.get("COUNCIL_API_TOKEN", "")
ALLOWED_ORIGINS = [
    "https://csilvasantin.github.io",
    "http://localhost:8080",
    "http://localhost:3000",
    "http://127.0.0.1:8080",
]

# Rate limiting: max requests per IP per window
RATE_LIMIT_MAX = 10       # max requests
RATE_LIMIT_WINDOW = 300   # per 5 minutes

# ── App ──────────────────────────────────────────────────────
app = FastAPI(title="AdmiraNext Council API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type", "X-Council-Token"],
)

# ── Rate limiter ─────────────────────────────────────────────
_rate_store: dict = defaultdict(list)


def check_rate_limit(request: Request):
    """Simple in-memory rate limiter by IP."""
    # Cloudflare sends real IP in CF-Connecting-IP header
    ip = request.headers.get("cf-connecting-ip",
         request.headers.get("x-forwarded-for",
         request.client.host if request.client else "unknown"))
    now = time.time()
    # Clean old entries
    _rate_store[ip] = [t for t in _rate_store[ip] if now - t < RATE_LIMIT_WINDOW]
    if len(_rate_store[ip]) >= RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit: max {RATE_LIMIT_MAX} requests per {RATE_LIMIT_WINDOW}s. Try again later.",
        )
    _rate_store[ip].append(now)


def verify_token(request: Request):
    """Verify the API token from the X-Council-Token header."""
    if not COUNCIL_API_TOKEN:
        return  # No token configured = open access (local dev)
    token = request.headers.get("x-council-token", "")
    if token != COUNCIL_API_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid or missing API token")


# ── Shared Anthropic client ─────────────────────────────────
client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

# ── Agent registry ───────────────────────────────────────────
AGENTS = {
    "leyendas": {
        "racional": [CEO, CTO, COO, CFO],
        "creativo": [CCO, CDO, CXO, CSO],
    },
    "coetaneos": {
        "racional": [CEO_Coetaneo, CTO_Coetaneo, COO_Coetaneo, CFO_Coetaneo],
        "creativo": [CCO_Coetaneo, CDO_Coetaneo, CXO_Coetaneo, CSO_Coetaneo],
    },
}

# Cache instantiated agents
_agent_cache: dict = {}


def get_agent(cls) -> CouncilAgent:
    key = f"{cls.__module__}.{cls.__name__}"
    if key not in _agent_cache:
        _agent_cache[key] = cls(client=client)
    return _agent_cache[key]


# ── Models ───────────────────────────────────────────────────
class AskRequest(BaseModel):
    message: str
    generation: str = "leyendas"
    context: Optional[list] = None


class AgentReply(BaseModel):
    name: str
    role: str
    persona: str
    side: str
    icon: str
    content: str


class AskResponse(BaseModel):
    racional: list
    creativo: list


# Icon map matching the SCUMM frontend
ICONS = {
    "CEO": "🏛️", "CTO": "⚙️", "COO": "📋", "CFO": "💰",
    "CCO": "💡", "CDO": "🎨", "CXO": "🌐", "CSO": "📖",
}

# ── Max message length ───────────────────────────────────────
MAX_MESSAGE_LENGTH = 1000


def agent_ask(agent: CouncilAgent, message: str, context: Optional[list]) -> str:
    """Call Claude with the agent's persona for a conversational response."""
    messages = []

    if context:
        for msg in context[-6:]:
            messages.append({
                "role": msg.get("role", "user"),
                "content": str(msg.get("content", ""))[:MAX_MESSAGE_LENGTH],
            })

    messages.append({"role": "user", "content": message[:MAX_MESSAGE_LENGTH]})

    conv_system = (
        agent.system_prompt + "\n\n"
        "INSTRUCCIONES DE CONVERSACIÓN:\n"
        "- Respondes directamente a la pregunta o comentario del usuario.\n"
        "- Sé conciso: máximo 2-3 frases.\n"
        "- Mantén tu personalidad y perspectiva única.\n"
        "- Si hay otros consejeros en la conversación, puedes referirte a ellos.\n"
        "- Usa tu experiencia y filosofía para dar respuestas genuinas.\n"
    )

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=300,
        system=conv_system,
        messages=messages,
    )
    return response.content[0].text


# ── Endpoints ────────────────────────────────────────────────
@app.post("/api/council/ask", response_model=AskResponse)
async def council_ask(
    req: AskRequest,
    _rate=Depends(check_rate_limit),
    _auth=Depends(verify_token),
):
    """Send a message to the council. All 8 agents respond in batches."""
    gen = req.generation if req.generation in AGENTS else "leyendas"
    group = AGENTS[gen]

    loop = asyncio.get_event_loop()

    async def run_agent(cls):
        agent = get_agent(cls)
        content = await loop.run_in_executor(
            None, agent_ask, agent, req.message, req.context
        )
        return AgentReply(
            name=agent.name,
            role=agent.role,
            persona=agent.persona,
            side=agent.side,
            icon=ICONS.get(agent.name, "🎯"),
            content=content,
        )

    all_agents = list(group["racional"]) + list(group["creativo"])
    all_replies = []
    BATCH_SIZE = 4
    BATCH_DELAY = 65  # seconds between batches (5 req/min limit)

    for i in range(0, len(all_agents), BATCH_SIZE):
        batch = all_agents[i:i + BATCH_SIZE]
        tasks = [run_agent(cls) for cls in batch]
        batch_replies = await asyncio.gather(*tasks)
        all_replies.extend(batch_replies)
        if i + BATCH_SIZE < len(all_agents):
            await asyncio.sleep(BATCH_DELAY)

    racional_replies = [r for r in all_replies if r.side == "racional"]
    creativo_replies = [r for r in all_replies if r.side == "creativo"]

    return AskResponse(racional=racional_replies, creativo=creativo_replies)


@app.get("/api/council/health")
async def health():
    return {
        "status": "ok",
        "agents": 16,
        "security": {
            "token_required": bool(COUNCIL_API_TOKEN),
            "cors_origins": ALLOWED_ORIGINS,
            "rate_limit": f"{RATE_LIMIT_MAX} req / {RATE_LIMIT_WINDOW}s",
        },
    }


# ── Run ──────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    print("🏛️  AdmiraNext Council API v2.0 — http://localhost:8420")
    print(f"🔐 Token required: {bool(COUNCIL_API_TOKEN)}")
    print(f"🌐 Allowed origins: {ALLOWED_ORIGINS}")
    print(f"⏱️  Rate limit: {RATE_LIMIT_MAX} req / {RATE_LIMIT_WINDOW}s")
    uvicorn.run(app, host="0.0.0.0", port=8420)
