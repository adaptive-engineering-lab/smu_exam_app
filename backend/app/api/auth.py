from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.db import get_db
from app.core.security import create_access_token, get_password_hash, verify_password
from app.models.user import User
from app.schemas.auth import LoginRequest, OAuthTokenRequest, RegisterRequest, TokenResponse, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])

ALLOWED_ROLES = {"super_admin", "admin", "lecturer", "student"}


@router.post("/register", response_model=UserResponse, status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> User:
    if payload.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")

    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=payload.email,
        password_hash=get_password_hash(payload.password) if payload.password else None,
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


@router.post("/oauth/google", response_model=TokenResponse)
def oauth_google(body: OAuthTokenRequest, db: Session = Depends(get_db)) -> TokenResponse:
    try:
        payload = google_id_token.verify_oauth2_token(
            body.id_token, google_requests.Request(), settings.google_client_id
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    email = payload.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Email not found in Google token")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Account not registered — contact administrator")

    return TokenResponse(access_token=create_access_token(subject=user.id, role=user.role))


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
