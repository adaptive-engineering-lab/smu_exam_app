import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Layout } from "../../components/Layout";
import { Button, Card, CardHeader, EmptyState, Input, PageHeader, Select } from "../../components/ui";
import { listSchools } from "../../api/schools";
import { createDegree, listDegrees } from "../../api/degrees";
import type { Degree, School } from "../../api/types";

export function DegreesPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchool, setSelectedSchool] = useState("");
  const [degrees, setDegrees] = useState<Degree[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listSchools().then(setSchools).catch(() => toast.error("Failed to load schools"));
  }, []);

  useEffect(() => {
    if (!selectedSchool) { setDegrees([]); return; }
    listDegrees(selectedSchool).then(setDegrees).catch(() => toast.error("Failed to load degrees"));
  }, [selectedSchool]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !selectedSchool) return;
    setLoading(true);
    try {
      const deg = await createDegree(selectedSchool, name.trim());
      setDegrees((prev) => [...prev, deg]);
      setName("");
      toast.success("Degree created");
    } catch {
      toast.error("Failed to create degree");
    } finally {
      setLoading(false);
    }
  }

  const schoolName = schools.find((s) => s.id === selectedSchool)?.name;

  return (
    <Layout>
      <PageHeader title="Degrees" subtitle="Manage degree programmes within schools" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4 lg:col-span-1">
          <Card>
            <CardHeader title="Filter by School" />
            <Select
              label="School"
              placeholder="— select a school —"
              value={selectedSchool}
              onChange={(e) => setSelectedSchool(e.target.value)}
            >
              {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Card>

          {selectedSchool && (
            <Card>
              <CardHeader title="Add Degree" />
              <form onSubmit={handleCreate} className="space-y-4">
                <Input
                  label="Degree name"
                  placeholder="e.g. BSc Computer Science"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <Button type="submit" loading={loading} className="w-full">
                  Create Degree
                </Button>
              </form>
            </Card>
          )}
        </div>

        <div className="lg:col-span-2">
          <Card padding={false}>
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">
                {schoolName ? `Degrees — ${schoolName}` : "Degrees"}
                <span className="ml-2 text-sm font-normal text-slate-400">({degrees.length})</span>
              </h2>
            </div>
            {!selectedSchool ? (
              <EmptyState icon="🎓" title="Select a school" description="Choose a school to view and manage its degree programmes." />
            ) : degrees.length === 0 ? (
              <EmptyState icon="📋" title="No degrees yet" description="Add the first degree for this school." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {degrees.map((d) => (
                  <li key={d.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                    <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600 font-bold text-sm shrink-0">
                      {d.name[0].toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-slate-800">{d.name}</span>
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
