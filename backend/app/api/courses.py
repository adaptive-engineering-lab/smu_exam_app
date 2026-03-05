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


@router.get("/{course_id}/enrollments")
def list_enrollments(course_id: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    rows = (
        db.query(User.id, User.email, User.name)
        .join(Enrollment, Enrollment.student_id == User.id)
        .filter(Enrollment.course_id == course_id)
        .order_by(User.email)
        .all()
    )
    return [{"id": r.id, "email": r.email, "name": r.name} for r in rows]


@router.post("/{course_id}/enroll-bulk")
def enroll_bulk(course_id: str, body: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    emails: list[str] = body.get("emails", [])
    enrolled, not_found, already_enrolled = [], [], []
    for email in emails:
        email = email.strip().lower()
        if not email:
            continue
        student = db.query(User).filter(User.email == email, User.role == "student").first()
        if not student:
            not_found.append(email)
            continue
        existing = db.query(Enrollment).filter(
            Enrollment.student_id == student.id,
            Enrollment.course_id == course_id,
        ).first()
        if existing:
            already_enrolled.append(email)
            continue
        db.add(Enrollment(student_id=student.id, course_id=course_id))
        enrolled.append(email)
    db.commit()
    return {"enrolled": enrolled, "not_found": not_found, "already_enrolled": already_enrolled}


@router.patch("/{course_id}/instructor", response_model=CourseResponse)
def assign_instructor(course_id: str, body: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Course not found")
    lecturer_id = body.get("lecturer_id")  # None = unassign
    if lecturer_id:
        lecturer = db.query(User).filter(User.id == lecturer_id, User.role == "lecturer").first()
        if not lecturer:
            raise HTTPException(404, "Lecturer not found")
    course.lecturer_id = lecturer_id
    db.commit()
    db.refresh(course)
    return course


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
