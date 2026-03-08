from fastapi import HTTPException
from jose import JWTError, jwt

from app.core.config import settings


def verify_supabase_token(token: str) -> dict:
    """Decode and verify a Supabase-issued JWT. Returns the full payload."""
    try:
        return jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
