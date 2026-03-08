from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_admin
from app.core.supabase_client import create_admin_client
from app.models.user import User
from app.schemas.auth import ChangePasswordRequest, RegisterRequest, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])

ALLOWED_ROLES = {"admin", "lecturer", "student"}


@router.post("/register", response_model=UserResponse, status_code=201)
def register(
    payload: RegisterRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> User:
    if payload.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")

    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    sb = create_admin_client()
    try:
        result = sb.auth.admin.create_user(
            {
                "email": payload.email,
                "password": payload.password,
                "email_confirm": True,
                "app_metadata": {"role": payload.role},
                "user_metadata": {"name": payload.name},
            }
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    user = User(
        id=result.user.id,
        email=payload.email,
        name=payload.name,
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/change-password", status_code=200)
def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
):
    sb = create_admin_client()
    try:
        sb.auth.admin.update_user_by_id(current_user.id, {"password": body.new_password})
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": "Password changed successfully"}
