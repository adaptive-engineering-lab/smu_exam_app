from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import verify_supabase_token
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)) -> User:
    payload = verify_supabase_token(token)
    user_id: str | None = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Could not validate credentials")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role not in {"admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="Admin role required")
    return user


def require_lecturer(user: User = Depends(get_current_user)) -> User:
    if user.role not in {"lecturer", "admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="Lecturer role required")
    return user


def require_student(user: User = Depends(get_current_user)) -> User:
    if user.role not in {"student", "admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="Student role required")
    return user
