import json
import threading
import urllib.request

from fastapi import HTTPException
from jose import JWTError, jwt

from app.core.config import settings

# Simple in-memory JWKS cache (populated on first production request)
_jwks_cache: dict | None = None
_jwks_lock = threading.Lock()


def _get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache is not None:
        return _jwks_cache
    with _jwks_lock:
        if _jwks_cache is None:
            url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
            with urllib.request.urlopen(url, timeout=10) as resp:
                _jwks_cache = json.loads(resp.read())
    return _jwks_cache


def verify_supabase_token(token: str) -> dict:
    """Verify a Supabase-issued JWT.

    Tries HS256 first (test tokens and legacy API key JWTs), then falls back
    to ES256 via JWKS (production user auth tokens signed with ECC P-256).
    """
    # HS256 path — used by test suite and legacy JWT API keys
    if settings.supabase_jwt_secret:
        try:
            return jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
        except JWTError:
            pass

    # ES256 path — used for user auth tokens on projects with ECC signing keys
    if settings.supabase_url:
        try:
            jwks = _get_jwks()
            for key in jwks.get("keys", []):
                try:
                    return jwt.decode(
                        token,
                        key,
                        algorithms=["ES256"],
                        options={"verify_aud": False},
                    )
                except JWTError:
                    continue
        except Exception:
            pass

    raise HTTPException(status_code=401, detail="Could not validate credentials")
