import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "@/lib/auth";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, SeverityBadge } from "@/components/StatusBadge";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  Plus,
  ScanLine,
  Sparkles,
} from "lucide-react";

function StatTile({ label, value, icon: Icon, accent }) {
  return (
    <Card className="p-5 border-border" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
          <div className="font-display text-3xl font-bold mt-2">{value}</div>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get("/scans", { params: { limit: 6 } })
      .then((r) => setScans(r.data))
      .finally(() => setLoading(false));
  }, []);

  const total = scans.length;
  const completed = scans.filter((s) => s.status === "completed").length;
  const processing = scans.filter((s) => s.status === "processing").length;
  const flagged = scans.filter((s) => ["high", "critical"].includes(s.severity)).length;

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1400px] mx-auto">
      {/* Hero */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-10">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">Overview</div>
          <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
            Hello, <span className="text-primary">{user?.full_name?.split(" ")[0] || "Doctor"}</span>.
          </h1>
          <p className="text-muted-foreground mt-2 max-w-xl">
            Upload a medical image to receive an AI-assisted preliminary read with annotated regions and a downloadable PDF.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild data-testid="dashboard-history-link">
            <Link to="/history">
              <ClipboardList className="w-4 h-4" /> All scans
            </Link>
          </Button>
          <Button asChild className="glow-primary" data-testid="dashboard-new-scan">
            <Link to="/upload">
              <Plus className="w-4 h-4" /> New scan
            </Link>
          </Button>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatTile label="Recent scans" value={total} icon={ScanLine} accent="bg-primary/10 text-primary" />
        <StatTile label="Completed" value={completed} icon={CheckCircle2} accent="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" />
        <StatTile label="Processing" value={processing} icon={Loader2} accent="bg-blue-500/10 text-blue-600 dark:text-blue-400" />
        <StatTile label="Flagged severe" value={flagged} icon={Activity} accent="bg-amber-500/10 text-amber-600 dark:text-amber-400" />
      </div>

      {/* Recent scans */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-semibold">Recent activity</h2>
            <Link to="/history" className="text-xs text-primary hover:underline" data-testid="dashboard-view-all">
              View all →
            </Link>
          </div>
          <Card className="border-border divide-y divide-border overflow-hidden">
            {loading && (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading scans…</div>
            )}
            {!loading && scans.length === 0 && (
              <div className="p-10 text-center">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="font-display font-semibold">No scans yet</div>
                <p className="text-sm text-muted-foreground mt-1 mb-4">Start by uploading your first medical image.</p>
                <Button asChild>
                  <Link to="/upload"><Plus className="w-4 h-4" /> Upload first scan</Link>
                </Button>
              </div>
            )}
            {!loading &&
              scans.map((s) => (
                <Link
                  key={s.id}
                  to={`/scans/${s.id}`}
                  data-testid={`scan-row-${s.id}`}
                  className="flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <ScanLine className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{s.patient_name}</span>
                      <span className="text-xs text-muted-foreground uppercase">{s.scan_type}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {s.primary_finding || "—"} · {new Date(s.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 shrink-0">
                    {s.severity && <SeverityBadge severity={s.severity} />}
                    <StatusBadge status={s.status} />
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
                </Link>
              ))}
          </Card>
        </div>

        {/* Workflow card */}
        <div>
          <h2 className="font-display text-xl font-semibold mb-4">Workflow</h2>
          <Card className="p-6 border-border">
            <ol className="space-y-5">
              {[
                { n: 1, t: "Upload Image", d: "Drag & drop X-ray, MRI or CT", icon: ScanLine },
                { n: 2, t: "AI Processing", d: "Vision model analyses regions", icon: Sparkles },
                { n: 3, t: "Review Results", d: "Confirm findings & confidence", icon: CheckCircle2 },
                { n: 4, t: "Download PDF", d: "Share with patient or team", icon: FileText },
              ].map((step) => (
                <li key={step.n} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center font-bold text-sm shrink-0">
                    {step.n}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{step.t}</div>
                    <div className="text-xs text-muted-foreground">{step.d}</div>
                  </div>
                </li>
              ))}
            </ol>
            <Button asChild className="w-full mt-6" data-testid="dashboard-start-workflow">
              <Link to="/upload">Start workflow →</Link>
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
