import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getRole } from "../components/ProtectedRoute";

export function DashboardPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const role = getRole();
    if (role === "admin" || role === "super_admin") {
      navigate("/admin/schools", { replace: true });
    } else if (role === "lecturer") {
      navigate("/lecturer/exams", { replace: true });
    } else if (role === "student") {
      navigate("/student/dashboard", { replace: true });
    }
  }, [navigate]);

  return <div className="p-8 text-gray-500">Redirecting…</div>;
}
