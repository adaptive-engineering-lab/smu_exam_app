import { Navigate } from "react-router-dom";

interface Props {
  children: React.ReactNode;
  roles?: string[];
}

function getRole(): string | null {
  const token = localStorage.getItem("access_token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.role ?? null;
  } catch {
    return null;
  }
}

export function ProtectedRoute({ children, roles }: Props) {
  const token = localStorage.getItem("access_token");
  if (!token) return <Navigate to="/login" replace />;
  if (roles) {
    const role = getRole();
    if (!role || !roles.includes(role)) return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export { getRole };
