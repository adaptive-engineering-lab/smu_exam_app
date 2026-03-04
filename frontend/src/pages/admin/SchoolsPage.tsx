import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Layout } from "../../components/Layout";
import { Button, Card, CardHeader, EmptyState, Input, PageHeader } from "../../components/ui";
import { createSchool, listSchools } from "../../api/schools";
import type { School } from "../../api/types";

export function SchoolsPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    listSchools()
      .then(setSchools)
      .catch(() => toast.error("Failed to load schools"))
      .finally(() => setFetching(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const school = await createSchool(name.trim());
      setSchools((prev) => [...prev, school]);
      setName("");
      toast.success("School created");
    } catch {
      toast.error("Failed to create school");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <PageHeader title="Schools" subtitle="Manage all schools in the platform" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Create form */}
        <Card className="lg:col-span-1 self-start">
          <CardHeader title="Add School" />
          <form onSubmit={handleCreate} className="space-y-4">
            <Input
              label="School name"
              placeholder="e.g. Faculty of Medicine"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Button type="submit" loading={loading} className="w-full">
              Create School
            </Button>
          </form>
        </Card>

        {/* List */}
        <div className="lg:col-span-2">
          <Card padding={false}>
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">
                All Schools
                <span className="ml-2 text-sm font-normal text-slate-400">({schools.length})</span>
              </h2>
            </div>
            {fetching ? (
              <p className="text-slate-400 text-sm px-5 py-6">Loading…</p>
            ) : schools.length === 0 ? (
              <EmptyState icon="🏫" title="No schools yet" description="Add your first school using the form." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {schools.map((s) => (
                  <li key={s.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                    <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 font-bold text-sm shrink-0">
                      {s.name[0].toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-slate-800">{s.name}</span>
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
