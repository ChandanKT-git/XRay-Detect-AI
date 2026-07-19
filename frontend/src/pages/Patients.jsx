import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { apiClient, useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Users as UsersIcon, ArrowUpRight, Plus } from "lucide-react";
import { SeverityBadge } from "@/components/StatusBadge";

export default function Patients() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("mine");

  useEffect(() => {
    setLoading(true);
    apiClient
      .get("/patients", { params: { all_users: scope === "all" } })
      .then((r) => setItems(r.data))
      .finally(() => setLoading(false));
  }, [scope]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((p) =>
      [p.patient_name, p.patient_id, p.last_finding]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [items, q]);

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1400px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">Patients</h1>
          <p className="text-muted-foreground mt-2">
            Every patient you've scanned, grouped by ID (or name if no ID was supplied).
          </p>
        </div>
        <Button asChild data-testid="patients-new-scan">
          <Link to="/upload"><Plus className="w-4 h-4" /> New scan</Link>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by patient name, ID or finding…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9 h-11"
            data-testid="patients-search"
          />
        </div>
        {user?.role === "admin" && (
          <Tabs value={scope} onValueChange={setScope}>
            <TabsList>
              <TabsTrigger value="mine" data-testid="patients-scope-mine">Mine</TabsTrigger>
              <TabsTrigger value="all" data-testid="patients-scope-all">All clinicians</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      {loading && (
        <Card className="p-12 text-center text-sm text-muted-foreground border-border">Loading…</Card>
      )}

      {!loading && filtered.length === 0 && (
        <Card className="p-16 text-center border-border">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3">
            <UsersIcon className="w-5 h-5" />
          </div>
          <div className="font-display font-semibold">No patients yet</div>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Upload a scan to start building patient histories.</p>
          <Button asChild>
            <Link to="/upload"><Plus className="w-4 h-4" /> Upload</Link>
          </Button>
        </Card>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="patients-grid">
          {filtered.map((p) => {
            const initials = (p.patient_name || "?")
              .split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
            return (
              <Link
                key={p.identifier}
                to={`/patients/${encodeURIComponent(p.identifier)}`}
                className="group"
                data-testid={`patient-card-${p.identifier}`}
              >
                <Card className="p-5 border-border hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-200 h-full">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-11 h-11 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold text-sm">
                      {initials}
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="font-display text-lg font-semibold tracking-tight truncate">{p.patient_name}</div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5 mb-3">
                    {p.patient_id ? `MRN ${p.patient_id}` : "No ID"}
                    {p.patient_age != null && ` · ${p.patient_age}y`}
                    {p.patient_gender && ` · ${p.patient_gender}`}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap mb-3">
                    {p.modalities.map((m) => (
                      <span key={m} className="text-[10px] uppercase tracking-wider bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                        {m}
                      </span>
                    ))}
                    {p.last_severity && <SeverityBadge severity={p.last_severity} />}
                  </div>

                  <div className="text-sm font-medium truncate text-foreground" title={p.last_finding || ""}>
                    {p.last_finding || "—"}
                  </div>

                  <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      <span className="font-mono text-foreground">{p.scan_count}</span> scan{p.scan_count !== 1 ? "s" : ""}
                      {" · "}
                      <span className="text-emerald-600 dark:text-emerald-400 font-mono">{p.signed_count}</span> signed
                    </span>
                    <span>{new Date(p.last_scan_at).toLocaleDateString()}</span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
