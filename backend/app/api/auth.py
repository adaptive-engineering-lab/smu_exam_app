from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError, jwt as jose_jwt
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.core.security import get_password_hash, verify_password, create_access_token
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])

ALLOWED_ROLES = {"admin", "lecturer", "student"}


@router.post("/register", response_model=UserResponse, status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> User:
    if payload.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")

    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=payload.email,
        name=payload.name,
        password_hash=get_password_hash(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(subject=user.id, role=user.role)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/forgot-password", status_code=200)
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if user:
        token = jose_jwt.encode(
            {
                "sub": user.id,
                "purpose": "reset",
                "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
            },
            settings.secret_key,
            algorithm=settings.algorithm,
        )
        link = f"{settings.frontend_url}/reset-password?token={token}"
        try:
            from app.services.email import send_reset_email
            send_reset_email(user.email, link)
        except Exception:
            pass  # don't leak info on email failure
    return {"message": "If that email exists, a reset link has been sent."}


@router.post("/reset-password", status_code=200)
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    try:
        payload = jose_jwt.decode(body.token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(400, "Invalid or expired reset token")
    if payload.get("purpose") != "reset":
        raise HTTPException(400, "Invalid token type")
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(400, "User not found")
    user.password_hash = get_password_hash(body.new_password)
    db.commit()
    return {"message": "Password updated successfully"}


@router.post("/change-password", status_code=200)
def change_password(
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.password_hash or not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    current_user.password_hash = get_password_hash(body.new_password)
    db.commit()
    return {"message": "Password changed successfully"}
