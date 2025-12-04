"""API v1 router."""

from fastapi import APIRouter

from app.api.v1.endpoints import health
from app.api.v1.endpoints.agents import balance

api_router = APIRouter()

api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(balance.router, prefix="/agents/balance", tags=["balance"])
