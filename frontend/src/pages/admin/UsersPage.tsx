import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Layout } from "../../components/Layout";
import { Badge, Button, Card, CardHeader, EmptyState, Input, PageHeader, Select } from "../../components/ui";
import { listUsers, createUser, deleteUser, setUserPassword, updateUser } from "../../api/users";
import { getRole } from "../../components/ProtectedRoute";
import type { User } from "../../api/types";

type RoleFilter = "all" | "student" | "lecturer" | "admin";

const ROLE_COLORS: Record<string, "amber" | "emerald" | "sky" | "indigo"> = {
  student: "amber",
  lecturer: "emerald",
  admin: "sky",
  super_admin: "indigo",
};

const TABS: { label: string; value: RoleFilter }[] = [
  { label: "All", value: "all" },
  { label: "Students", value: "student" },
  { label: "Lecturers", value: "lecturer" },
  { label: "Admins", value: "admin" },
];

function getCurrentUserId(): string | null {
  const token = localStorage.getItem("access_token");
  if (!token) return null;
  try { return JSON.parse(atob(token.split(".")[1])).sub ?? null; } catch { return null; }
}

export function UsersPage() {
  const currentRole = getRole();
  const currentUserId = getCurrentUserId();
  const [users, setUsers] = useState<User[]>([]);
  const [tab, setTab] = useState<RoleFilter>("all");
  const [form, setForm] = useState({ email: "", name: "", role: "student", password: "" });
  const [loading, setLoading] = useState(false);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState({ newPassword: "", confirm: "" });
  const [resetLoading, setResetLoading] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "" });
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    listUsers().then(setUsers).catch(() => toast.error("Failed to load users"));
  }, []);

  const [search, setSearch] = useState("");

  const visible = (tab === "all" ? users : users.filter((u) => u.role === tab)).filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return u.email.toLowerCase().includes(q) || (u.name ?? "").toLowerCase().includes(q);
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await createUser(form.email, form.role, form.name || undefined, form.password);
      setUsers((prev) => [...prev, user]);
      setForm({ email: "", name: "", role: "student", password: "" });
      toast.success("User created");
    } catch {
      toast.error("Failed to create user — email may already exist");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(userId: string) {
    if (resetPw.newPassword !== resetPw.confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setResetLoading(true);
    try {
      await setUserPassword(userId, resetPw.newPassword);
      toast.success("Password updated");
      setResetUserId(null);
      setResetPw({ newPassword: "", confirm: "" });
    } catch {
      toast.error("Failed to update password");
    } finally {
      setResetLoading(false);
    }
  }

  async function handleEditUser(userId: string) {
    setEditLoading(true);
    try {
      const updated = await updateUser(userId, {
        name: editForm.name || undefined,
        email: editForm.email || undefined,
        role: editForm.role || undefined,
      });
      setUsers((prev) => prev.map((u) => u.id === userId ? updated : u));
      toast.success("User updated");
      setEditUserId(null);
    } catch {
      toast.error("Failed to update user — email may already be in use");
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDelete(user: User) {
    if (!window.confirm(`Delete ${user.email}?`)) return;
    try {
      await deleteUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      toast.success("User deleted");
    } catch {
      toast.error("Failed to delete user");
    }
  }

  return (
    <Layout>
      <PageHeader title="Users" subtitle="Create and manage user accounts" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Create user form */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader title="Create User" />
            <form onSubmit={handleCreate} className="space-y-3">
              <Input
                label="Email"
                type="email"
                placeholder="user@example.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
              <Input
                label="Full name (optional)"
                placeholder="e.g. John Smith"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <Select
                label="Role"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value, password: "" }))}
              >
                <option value="student">Student</option>
                <option value="lecturer">Lecturer</option>
                <option value="admin">Admin</option>
              </Select>
              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                required
              />
              <Button type="submit" loading={loading} className="w-full">Create User</Button>
            </form>
          </Card>
        </div>

        {/* Users list */}
        <div className="lg:col-span-2">
          <Card padding={false}>
            <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
              <h2 className="text-base font-semibold text-slate-900 shrink-0">
                Users
                <span className="ml-2 text-sm font-normal text-slate-400">({visible.length})</span>
              </h2>
              <input
                type="text"
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex gap-1 shrink-0">
                {TABS.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setTab(t.value)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors
                      ${tab === t.value
                        ? "bg-indigo-600 text-white"
                        : "text-slate-500 hover:bg-slate-100"}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {visible.length === 0 ? (
              <EmptyState icon="👤" title="No users" description={tab === "all" ? "Create a user using the form on the left." : `No ${tab}s found.`} />
            ) : (
              <ul className="divide-y divide-slate-100">
                {visible.map((u) => (
                  <li key={u.id} className="px-5 py-3.5 hover:bg-slate-50 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <Badge color={ROLE_COLORS[u.role] ?? "slate"}>{u.role}</Badge>
                        <div className="min-w-0">
                          {u.name && <p className="text-sm font-medium text-slate-800">{u.name}</p>}
                          <p className="text-sm text-slate-500 break-all">{u.email}</p>
                        </div>
                      </div>
                      <div className="flex gap-1.5 flex-wrap shrink-0">
                        {(u.role !== "super_admin" || currentRole === "super_admin") && (<>
                          <Button size="sm" variant="secondary" onClick={() => {
                            setEditUserId(editUserId === u.id ? null : u.id);
                            setEditForm({ name: u.name ?? "", email: u.email, role: u.role });
                            setResetUserId(null);
                          }}>
                            Edit
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => {
                            setResetUserId(resetUserId === u.id ? null : u.id);
                            setResetPw({ newPassword: "", confirm: "" });
                            setEditUserId(null);
                          }}>
                            Reset PW
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => handleDelete(u)}>Delete</Button>
                        </>)}
                      </div>
                    </div>
                    {editUserId === u.id && (
                      <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                        <Input
                          label="Full name"
                          placeholder="e.g. John Smith"
                          value={editForm.name}
                          onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        />
                        <Input
                          label="Email"
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                        />
                        {u.id !== currentUserId && (
                          <Select
                            label="Role"
                            value={editForm.role}
                            onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                          >
                            <option value="student">Student</option>
                            <option value="lecturer">Lecturer</option>
                            <option value="admin">Admin</option>
                          </Select>
                        )}
                        <div className="flex gap-2">
                          <Button size="sm" loading={editLoading} onClick={() => handleEditUser(u.id)}>Save</Button>
                          <Button size="sm" variant="secondary" onClick={() => setEditUserId(null)}>Cancel</Button>
                        </div>
                      </div>
                    )}
                    {resetUserId === u.id && (
                      <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                        <Input
                          label="New password"
                          type="password"
                          placeholder="••••••••"
                          value={resetPw.newPassword}
                          onChange={(e) => setResetPw((p) => ({ ...p, newPassword: e.target.value }))}
                        />
                        <Input
                          label="Confirm password"
                          type="password"
                          placeholder="••••••••"
                          value={resetPw.confirm}
                          onChange={(e) => setResetPw((p) => ({ ...p, confirm: e.target.value }))}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" loading={resetLoading} onClick={() => handleResetPassword(u.id)}>
                            Save
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setResetUserId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </Layout>
  );
}
