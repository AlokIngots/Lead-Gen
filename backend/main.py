import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import leads, campaigns, events, import_leads, analytics, auth, templates, users, drip, notifications, duplicates, companies
from middleware.rate_limit import RateLimitMiddleware

load_dotenv()

app = FastAPI(
    title="Alok LMS API",
    description="Lead Management System for Alok India",
    version="0.1.0",
)

cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,https://lms.alokindia.co.in",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in cors_origins if o.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key"],
)

app.add_middleware(RateLimitMiddleware)


@app.get("/")
def root():
    return {"service": "alok-lms", "status": "ok"}


@app.get("/health")
def health():
    from database import engine
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": str(e)}


app.include_router(auth.router,         prefix="/auth",      tags=["auth"])
app.include_router(leads.router,        prefix="/leads",     tags=["leads"])
app.include_router(campaigns.router,    prefix="/campaigns", tags=["campaigns"])
app.include_router(events.router,       prefix="/events",    tags=["events"])
app.include_router(import_leads.router, prefix="/import",    tags=["import"])
app.include_router(analytics.router,    prefix="/analytics", tags=["analytics"])
app.include_router(templates.router,    prefix="/templates", tags=["templates"])
app.include_router(users.router,        prefix="/users",     tags=["users"])
app.include_router(drip.router,         prefix="/drip",      tags=["drip"])
app.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
app.include_router(duplicates.router,    prefix="/duplicates",    tags=["duplicates"])
app.include_router(companies.router,     prefix="/companies",     tags=["companies"])
