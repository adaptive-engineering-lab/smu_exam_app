from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.models.user import User
from app.schemas.course import CourseCreate, CourseResponse, EnrollRequest
from app.schemas.enrollment import EnrollmentResponse

router = APIRouter(prefix="/courses", tags=["courses"])


@router.post("", response_model=CourseResponse, status_code=201)
def create_course(body: CourseCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    existing = db.query(Course).filter(Course.code == body.code).first()
    if existing:
        raise HTTPException(409, "Course code already exists")
    course = Course(**body.model_dump())
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


@router.get("/by-degree/{degree_id}", response_model=list[CourseResponse])
def list_courses(degree_id: str, db: Session = Depends(get_db)):
    return db.query(Course).filter(Course.degree_id == degree_id).order_by(Course.name).all()


@router.post("/{course_id}/enroll", response_model=EnrollmentResponse, status_code=201)
def enroll_student(course_id: str, body: EnrollRequest, db: Session = Depends(get_db), _=Depends(require_admin)):
    student = db.query(User).filter(User.id == body.student_id, User.role == "student").first()
    if not student:
        raise HTTPException(404, "Student not found")
    existing = db.query(Enrollment).filter(
        Enrollment.student_id == body.student_id,
        Enrollment.course_id == course_id,
    ).first()
    if existing:
        raise HTTPException(409, "Student already enrolled")
    enrollment = Enrollment(student_id=body.student_id, course_id=course_id)
    db.add(enrollment)
    db.commit()
    db.refresh(enrollment)
    return enrollment
