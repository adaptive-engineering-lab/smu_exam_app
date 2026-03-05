import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Layout } from "../../components/Layout";
import { Badge, Button, Card, CardHeader, EmptyState, Input, PageHeader, Select } from "../../components/ui";
import { listUsers, createUser, deleteUser } from "../../api/users";
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

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [tab, setTab] = useState<RoleFilter>("all");
  const [form, setForm] = useState({ email: "", role: "student" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listUsers().then(setUsers).catch(() => toast.error("Failed to load users"));
  }, []);

  const visible = tab === "all" ? users : users.filter((u) => u.role === tab);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await createUser(form.email, form.role);
      setUsers((prev) => [...prev, user]);
      setForm({ email: "", role: "student" });
      toast.success("User created");
    } catch {
      toast.error("Failed to create user — email may already exist");
    } finally {
      setLoading(false);
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
              <Select
                label="Role"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              >
                <option value="student">Student</option>
                <option value="lecturer">Lecturer</option>
                <option value="admin">Admin</option>
              </Select>
              <Button type="submit" loading={loading} className="w-full">Create User</Button>
            </form>
          </Card>
        </div>

        {/* Users list */}
        <div className="lg:col-span-2">
          <Card padding={false}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                Users
                <span className="ml-2 text-sm font-normal text-slate-400">({visible.length})</span>
              </h2>
              <div className="flex gap-1">
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
                  <li key={u.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge color={ROLE_COLORS[u.role] ?? "slate"}>{u.role}</Badge>
                      <span className="text-sm text-slate-800 truncate">{u.email}</span>
                    </div>
                    <Button size="sm" variant="danger" onClick={() => handleDelete(u)}>Delete</Button>
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
