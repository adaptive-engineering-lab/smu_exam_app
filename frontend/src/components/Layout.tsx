import { Link, useLocation, useNavigate } from "react-router-dom";
import { getRole } from "./ProtectedRoute";
import { Badge } from "./ui";

interface Props {
  children: React.ReactNode;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  lecturer: "Lecturer",
  student: "Student",
};

const ROLE_COLORS: Record<string, "indigo" | "sky" | "emerald" | "amber"> = {
  super_admin: "indigo",
  admin: "sky",
  lecturer: "emerald",
  student: "amber",
};

const NAV_LINKS = [
  { label: "Schools",  to: "/admin/schools",     roles: ["admin", "super_admin"] },
  { label: "Degrees",  to: "/admin/degrees",     roles: ["admin", "super_admin"] },
  { label: "Courses",  to: "/admin/courses",     roles: ["admin", "super_admin"] },
  { label: "Users",    to: "/admin/users",       roles: ["admin", "super_admin"] },
  { label: "Exams",    to: "/lecturer/exams",    roles: ["lecturer", "admin", "super_admin"] },
  { label: "My Exams", to: "/student/dashboard", roles: ["student"] },
];

export function Layout({ children }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const role = getRole() ?? "";

  function logout() {
    localStorage.removeItem("access_token");
    navigate("/login");
  }

  const visible = NAV_LINKS.filter((l) => l.roles.includes(role));

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">

          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <span className="font-semibold text-slate-900 text-sm">SMU Exam Platform</span>
          </div>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-0.5">
            {visible.map((l) => {
              const active = location.pathname.startsWith(l.to);
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                    ${active
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>

          {/* Role badge + logout */}
          <div className="flex items-center gap-3">
            {role && (
              <Badge color={ROLE_COLORS[role] ?? "slate"}>
                {ROLE_LABELS[role] ?? role}
              </Badge>
            )}
            <button
              onClick={logout}
              className="text-sm font-medium text-slate-500 hover:text-red-600 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        {children}
      </main>
    </div>
  );
}
