from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user, require_admin

PROTECTED_ROLES = {"super_admin"}
ASSIGNABLE_ROLES = {"student", "lecturer", "admin"}
from app.models.user import User
from app.schemas.auth import SetPasswordRequest, UpdateUserRequest
from app.core.security import get_password_hash

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/students")
def list_students(db: Session = Depends(get_db), _=Depends(require_admin)):
    students = db.query(User).filter(User.role == "student").order_by(User.email).all()
    return [{"id": s.id, "email": s.email, "name": s.name} for s in students]


@router.get("")
def list_users(role: str | None = None, db: Session = Depends(get_db), _=Depends(require_admin)):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    users = q.order_by(User.email).all()
    return [{"id": u.id, "email": u.email, "name": u.name, "role": u.role} for u in users]


@router.patch("/{user_id}", status_code=200)
def update_user(user_id: str, body: UpdateUserRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user), _=Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    if user.role in PROTECTED_ROLES and current_user.role != "super_admin":
        raise HTTPException(403, "Only super_admin can edit a super_admin account")
    if body.role and body.role in PROTECTED_ROLES:
        raise HTTPException(403, "Cannot assign super_admin role")
    if body.role and user_id == current_user.id:
        raise HTTPException(403, "Cannot change your own role")
    if body.role and body.role not in ASSIGNABLE_ROLES:
        raise HTTPException(400, "Invalid role")
    if body.email and body.email != user.email:
        if db.query(User).filter(User.email == body.email).first():
            raise HTTPException(409, "Email already in use")
    if body.name is not None:
        user.name = body.name
    if body.email is not None:
        user.email = body.email
    if body.role is not None:
        user.role = body.role
    db.commit()
    return {"id": user.id, "email": user.email, "name": user.name, "role": user.role}


@router.patch("/{user_id}/password", status_code=200)
def set_user_password(user_id: str, body: SetPasswordRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user), _=Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role in PROTECTED_ROLES and current_user.role != "super_admin":
        raise HTTPException(403, "Only super_admin can reset a super_admin password")
    user.password_hash = get_password_hash(body.new_password)
    db.commit()
    return {"message": "Password updated"}


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user), _=Depends(require_admin)):
    if user_id == current_user.id:
        raise HTTPException(status_code=403, detail="Cannot delete your own account")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role in PROTECTED_ROLES and current_user.role != "super_admin":
        raise HTTPException(403, "Only super_admin can delete a super_admin account")
    db.delete(user)
    db.commit()
