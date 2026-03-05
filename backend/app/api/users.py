from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user, require_admin
from app.models.user import User

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/students")
def list_students(db: Session = Depends(get_db), _=Depends(require_admin)):
    students = db.query(User).filter(User.role == "student").order_by(User.email).all()
    return [{"id": s.id, "email": s.email} for s in students]


@router.get("")
def list_users(role: str | None = None, db: Session = Depends(get_db), _=Depends(require_admin)):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    users = q.order_by(User.email).all()
    return [{"id": u.id, "email": u.email, "role": u.role} for u in users]


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user), _=Depends(require_admin)):
    if user_id == current_user.id:
        raise HTTPException(status_code=403, detail="Cannot delete your own account")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
