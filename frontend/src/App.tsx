import { Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";

import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ProtectedRoute } from "./components/ProtectedRoute";

import { SchoolsPage } from "./pages/admin/SchoolsPage";
import { DegreesPage } from "./pages/admin/DegreesPage";
import { CoursesPage } from "./pages/admin/CoursesPage";
import { UsersPage } from "./pages/admin/UsersPage";

import { ExamsPage } from "./pages/lecturer/ExamsPage";
import { ExamBuilderPage } from "./pages/lecturer/ExamBuilderPage";

import { StudentDashboard } from "./pages/student/StudentDashboard";
import { ExamPlayerPage } from "./pages/student/ExamPlayerPage";

const ADMIN = ["admin", "super_admin"];
const LECTURER = ["lecturer", "admin", "super_admin"];
const STUDENT = ["student", "admin", "super_admin"];

export function App() {
  return (
    <>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />

        {/* Admin */}
        <Route path="/admin/schools" element={<ProtectedRoute roles={ADMIN}><SchoolsPage /></ProtectedRoute>} />
        <Route path="/admin/degrees" element={<ProtectedRoute roles={ADMIN}><DegreesPage /></ProtectedRoute>} />
        <Route path="/admin/courses" element={<ProtectedRoute roles={ADMIN}><CoursesPage /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute roles={ADMIN}><UsersPage /></ProtectedRoute>} />

        {/* Lecturer */}
        <Route path="/lecturer/exams" element={<ProtectedRoute roles={LECTURER}><ExamsPage /></ProtectedRoute>} />
        <Route path="/lecturer/exams/:examId/build" element={<ProtectedRoute roles={LECTURER}><ExamBuilderPage /></ProtectedRoute>} />

        {/* Student */}
        <Route path="/student/dashboard" element={<ProtectedRoute roles={STUDENT}><StudentDashboard /></ProtectedRoute>} />
        <Route path="/student/attempt/:attemptId" element={<ProtectedRoute roles={STUDENT}><ExamPlayerPage /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
}
