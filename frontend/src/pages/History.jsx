import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { apiClient, useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge, SeverityBadge } from "@/components/StatusBadge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, ScanLine, Plus, ArrowUpRight } from "lucide-react";

export default function History() {
  const { user } = useAuth();
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("mine"); // mine | all (admin only)

  useEffect(() => {
    setLoading(true);
    apiClient
      .get("/scans", { params: { limit: 200, all_users: scope === "all" } })
      .then((r) => setScans(r.data))
      .finally(() => setLoading(false));
  }, [scope]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return scans;
    return scans.filter((s) =>
      [s.patient_name, s.primary_finding, s.scan_type, s.body_part, s.user_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [scans, q]);

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1400px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">Patient history</h1>
          <p className="text-muted-foreground mt-2">All scans you have analysed, sorted by most recent.</p>
        </div>
        <Button asChild data-testid="history-new-scan">
          <Link to="/upload"><Plus className="w-4 h-4" /> New scan</Link>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by patient, finding, modality…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9 h-11"
            data-testid="history-search"
          />
        </div>
        {user?.role === "admin" && (
          <Tabs value={scope} onValueChange={setScope} data-testid="history-scope">
            <TabsList>
              <TabsTrigger value="mine" data-testid="history-scope-mine">My scans</TabsTrigger>
              <TabsTrigger value="all" data-testid="history-scope-all">All clinicians</TabsTrigger>
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
            <ScanLine className="w-5 h-5" />
          </div>
          <div className="font-display font-semibold">No scans match your search</div>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Try adjusting your filter or upload a new scan.</p>
          <Button asChild>
            <Link to="/upload"><Plus className="w-4 h-4" /> Upload</Link>
          </Button>
        </Card>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="history-grid">
          {filtered.map((s) => (
            <Link
              key={s.id}
              to={`/scans/${s.id}`}
              className="group"
              data-testid={`history-card-${s.id}`}
            >
              <Card className="p-5 border-border hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-200 h-full">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <ScanLine className="w-5 h-5" />
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
                  {(s.scan_type || "").toUpperCase()} · {s.body_part || "—"}
                </div>
                <div className="font-display font-semibold tracking-tight truncate">{s.patient_name}</div>
                <div className="text-sm text-muted-foreground truncate mt-1 mb-3">
                  {s.primary_finding || "—"}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <StatusBadge status={s.status} />
                    {s.severity && <SeverityBadge severity={s.severity} />}
                    {s.status === "completed" && s.review_status === "signed" && (
                      <span
                        data-testid={`history-signed-${s.id}`}
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                      >
                        Signed
                      </span>
                    )}
                    {s.status === "completed" && s.review_status !== "signed" && (
                      <span
                        data-testid={`history-draft-${s.id}`}
                        className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                      >
                        Draft
                      </span>
                    )}
                  </div>
                  {s.confidence != null && (
                    <div className="text-right shrink-0">
                      <div className="font-display text-lg font-bold text-primary">
                        {Math.round(s.confidence)}%
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border flex items-center justify-between">
                  <span>{new Date(s.created_at).toLocaleDateString()}</span>
                  {scope === "all" && <span className="truncate">{s.user_name}</span>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
