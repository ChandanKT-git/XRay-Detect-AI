import { useEffect, useState, useMemo } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { apiClient, useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, SeverityBadge } from "@/components/StatusBadge";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Loader2,
  ScanLine,
  ShieldCheck,
  Plus,
  AlertCircle,
} from "lucide-react";

const SEVERITY_ORDER = { critical: 5, high: 4, moderate: 3, low: 2, normal: 1 };

export default function PatientTimeline() {
  const { identifier } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);

  const decoded = decodeURIComponent(identifier || "");

  useEffect(() => {
    setLoading(true);
    apiClient
      .get("/patients/timeline", {
        params: { identifier: decoded, all_users: user?.role === "admin" },
      })
      .then((r) => setScans(r.data))
      .finally(() => setLoading(false));
  }, [decoded, user?.role]);

  const patient = scans[0] || null;

  const stats = useMemo(() => {
    let signed = 0, drafts = 0, errors = 0, processing = 0;
    let mostSevere = null;
    for (const s of scans) {
      if (s.status === "processing") processing += 1;
      else if (s.status === "error") errors += 1;
      else if (s.status === "completed") {
        if (s.review?.status === "signed") signed += 1;
        else drafts += 1;
      }
      const sev = (s.final_result || s.result)?.severity;
      if (sev && (mostSevere == null || (SEVERITY_ORDER[sev] || 0) > (SEVERITY_ORDER[mostSevere] || 0))) {
        mostSevere = sev;
      }
    }
    return { signed, drafts, errors, processing, total: scans.length, mostSevere };
  }, [scans]);

  if (loading) {
    return (
      <div className="px-6 md:px-10 py-12 max-w-5xl mx-auto text-sm text-muted-foreground">
        Loading patient timeline…
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="px-6 md:px-10 py-12 max-w-5xl mx-auto">
        <Card className="p-10 text-center border-border">
          <div className="font-display font-semibold mb-2">No scans for this patient</div>
          <Button asChild><Link to="/patients">Back to patients</Link></Button>
        </Card>
      </div>
    );
  }

  const initials = (patient.patient_name || "?")
    .split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="px-6 md:px-10 py-8 max-w-5xl mx-auto" data-testid="patient-timeline">
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4"
        data-testid="patient-timeline-back"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* Patient header */}
      <Card className="p-6 sm:p-8 border-border mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-16 h-16 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-display font-bold text-xl shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">Patient timeline</div>
            <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight truncate">
              {patient.patient_name}
            </h1>
            <div className="text-sm text-muted-foreground mt-1">
              {patient.patient_id ? `MRN ${patient.patient_id} · ` : ""}
              {patient.patient_age != null ? `${patient.patient_age}y · ` : ""}
              {patient.patient_gender || "—"}
            </div>
          </div>
          <Button asChild className="shrink-0">
            <Link to="/upload" data-testid="patient-new-scan">
              <Plus className="w-4 h-4" /> New scan
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6 pt-6 border-t border-border">
          <Stat label="Total scans" value={stats.total} icon={ScanLine} accent="text-primary" />
          <Stat label="Signed" value={stats.signed} icon={ShieldCheck} accent="text-emerald-600 dark:text-emerald-400" />
          <Stat label="Drafts" value={stats.drafts} icon={CheckCircle2} accent="text-amber-600 dark:text-amber-400" />
          <Stat label="Errors" value={stats.errors} icon={AlertCircle} accent="text-destructive" />
          <Stat label="Processing" value={stats.processing} icon={Loader2} accent="text-blue-600 dark:text-blue-400" />
        </div>
      </Card>

      {/* Vertical timeline */}
      <h2 className="font-display text-xl font-semibold mb-4">Scans · most recent first</h2>
      <ol className="relative border-l-2 border-border pl-6 space-y-6" data-testid="timeline-list">
        {scans.map((s) => {
          const result = s.final_result || s.result;
          const signed = s.review?.status === "signed";
          return (
            <li key={s.id} data-testid={`timeline-item-${s.id}`}>
              <span className={`absolute -left-[7px] mt-2 w-3 h-3 rounded-full ring-4 ring-background ${dotColor(s, signed)}`} />
              <Link to={`/scans/${s.id}`} className="block group">
                <Card className="p-5 border-border group-hover:border-primary/40 group-hover:-translate-y-0.5 transition-all">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="text-xs uppercase tracking-wider text-muted-foreground">
                          {s.scan_type} · {s.body_part || "—"}
                        </span>
                        <StatusBadge status={s.status} />
                        {result?.severity && <SeverityBadge severity={result.severity} />}
                        {s.status === "completed" && signed && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                            <ShieldCheck className="w-3 h-3" /> Signed
                          </span>
                        )}
                        {s.status === "completed" && !signed && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                            Draft
                          </span>
                        )}
                      </div>
                      <div className="font-display text-lg font-semibold tracking-tight">
                        {result?.primary_finding || (s.status === "error" ? "Analysis failed" : "Awaiting analysis")}
                      </div>
                      {result?.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{result.description}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {result?.confidence != null && (
                        <div className="font-display text-2xl font-bold text-primary">
                          {Math.round(result.confidence)}%
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(s.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function dotColor(scan, signed) {
  if (scan.status === "error") return "bg-destructive";
  if (scan.status === "processing") return "bg-blue-500";
  if (signed) return "bg-emerald-500";
  return "bg-amber-500";
}

function Stat({ label, value, icon: Icon, accent }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className={`flex items-center gap-2 mt-1 ${accent}`}>
        <Icon className="w-4 h-4" />
        <span className="font-display text-xl font-bold">{value}</span>
      </div>
    </div>
  );
}
