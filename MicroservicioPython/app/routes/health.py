from fastapi import APIRouter, Depends
import requests
from ..config import get_settings

router = APIRouter()

@router.get("/health")
def health(settings: get_settings = Depends(get_settings)) -> dict[str, str]:
    api_status = "unknown"
    try:
        url = f"{settings.coingecko_api_base}/coins/list"
        resp = requests.get(url, params={"per_page": 1}, timeout=settings.external_timeout)
        api_status = "online" if resp.ok else f"error: {resp.status_code}"
    except Exception as exc:
        api_status = f"error: {exc.__class__.__name__}"
    return {"status": "ok", "coingecko": api_status}