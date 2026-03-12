import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getMe } from "../api/auth";
import { supabase } from "../lib/supabase";
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
  const [userName, setUserName] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getMe().then((u) => setUserName(u.name ?? u.email)).catch(() => {});
  }, []);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    }
    if (mobileOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [mobileOpen]);

  function logout() {
    supabase.auth.signOut();
    navigate("/login");
  }

  const visible = NAV_LINKS.filter((l) => l.roles.includes(role));

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30" ref={menuRef}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">

          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <span className="font-semibold text-slate-900 text-sm">SMU Exam Platform</span>
          </div>

          {/* Nav links — desktop */}
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

          {/* Right side */}
          <div className="flex items-center gap-2 sm:gap-3">
            {role && (
              <div className="flex items-center gap-2">
                {userName && (
                  <span className="text-sm font-medium text-slate-700 hidden sm:block">{userName}</span>
                )}
                <Badge color={ROLE_COLORS[role] ?? "slate"}>
                  {ROLE_LABELS[role] ?? role}
                </Badge>
              </div>
            )}
            <Link
              to="/settings"
              className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors hidden sm:block"
            >
              Settings
            </Link>
            <button
              onClick={logout}
              className="text-sm font-medium text-slate-500 hover:text-red-600 transition-colors hidden sm:flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
              </svg>
              Logout
            </button>

            {/* Hamburger — mobile only */}
            <button
              className="md:hidden p-1.5 rounded-md text-slate-500 hover:bg-slate-100 transition-colors"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile nav dropdown */}
        {mobileOpen && (
          <div className="md:hidden border-t border-slate-100 bg-white">
            <nav className="max-w-6xl mx-auto px-4 py-2 flex flex-col">
              {visible.map((l) => {
                const active = location.pathname.startsWith(l.to);
                return (
                  <Link
                    key={l.to}
                    to={l.to}
                    onClick={() => setMobileOpen(false)}
                    className={`px-3 py-2.5 rounded-md text-sm font-medium transition-colors
                      ${active
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-slate-700 hover:bg-slate-100"
                      }`}
                  >
                    {l.label}
                  </Link>
                );
              })}
              <div className="mt-1 pt-2 border-t border-slate-100 flex items-center justify-between px-3 py-2">
                <Link
                  to="/settings"
                  onClick={() => setMobileOpen(false)}
                  className="text-sm text-slate-500 hover:text-slate-900"
                >
                  Settings
                </Link>
                <button
                  onClick={logout}
                  className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
                  </svg>
                  Logout
                </button>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}
