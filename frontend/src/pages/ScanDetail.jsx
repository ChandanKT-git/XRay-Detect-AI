import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { apiClient } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import BoundingBoxOverlay from "@/components/BoundingBoxOverlay";
import ReviewEditor from "@/components/ReviewEditor";
import { StatusBadge, SeverityBadge } from "@/components/StatusBadge";
import { generateScanPDF } from "@/lib/pdf";
import { toast } from "sonner";
import {
  ArrowLeft,
  Download,
  Trash2,
  User,
  Calendar,
  IdCard,
  Stethoscope,
  Loader2,
  ShieldCheck,
  FileSignature,
  History as HistoryIcon,
  Sparkles,
} from "lucide-react";

export default function ScanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [scan, setScan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const fetchScan = async () => {
    try {
      const r = await apiClient.get(`/scans/${id}`);
      setScan(r.data);
    } catch {
      toast.error("Could not load scan");
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchScan().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Poll while processing
  useEffect(() => {
    if (!scan || scan.status !== "processing") return;
    const t = setInterval(fetchScan, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan?.status]);

  const downloadPDF = async () => {
    if (!scan) return;
    try {
      await generateScanPDF(scan);
      toast.success(scan?.review?.status === "signed" ? "Signed PDF downloaded" : "Draft PDF downloaded");
    } catch {
      toast.error("Failed to generate PDF");
    }
  };

  const remove = async () => {
    if (!scan) return;
    if (scan?.review?.status === "signed") {
      toast.error("Signed-off scans cannot be deleted");
      return;
    }
    if (!window.confirm("Delete this scan permanently?")) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/scans/${scan.id}`);
      toast.success("Scan deleted");
      navigate("/history");
    } catch {
      toast.error("Failed to delete scan");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="px-6 md:px-10 py-12 max-w-5xl mx-auto text-sm text-muted-foreground">
        Loading scan…
      </div>
    );
  }

  if (!scan) {
    return (
      <div className="px-6 md:px-10 py-12 max-w-5xl mx-auto">
        <Card className="p-10 text-center border-border">
          <div className="font-display font-semibold mb-2">Scan not found</div>
          <Button asChild><Link to="/history">Back to history</Link></Button>
        </Card>
      </div>
    );
  }

  const r = scan.final_result || scan.result;
  const signed = scan.review?.status === "signed";
  const canReview = scan.status === "completed" && !signed;
  const imgSrc = scan.image_base64
    ? `data:${scan.image_mime || "image/jpeg"};base64,${scan.image_base64}`
    : null;

  return (
    <div className="px-6 md:px-10 py-8 max-w-6xl mx-auto" data-testid="scan-detail">
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4"
        data-testid="scan-detail-back"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <StatusBadge status={scan.status} />
            {r?.severity && <SeverityBadge severity={r.severity} />}
            {signed ? (
              <span
                data-testid="signed-badge"
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider"
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Signed off
              </span>
            ) : scan.status === "completed" ? (
              <span
                data-testid="draft-badge"
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider"
              >
                Draft · pending review
              </span>
            ) : null}
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              {scan.scan_type} · {scan.body_part || "—"}
            </span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
            {r?.primary_finding || (scan.status === "error" ? "Analysis failed" : "Awaiting analysis")}
          </h1>
          <div className="text-sm text-muted-foreground mt-1">
            Patient{" "}
            <Link
              to={`/patients/${encodeURIComponent(
                scan.patient_id ? `id:${scan.patient_id}` : `name:${(scan.patient_name || "").toLowerCase().trim()}`,
              )}`}
              data-testid="scan-detail-patient-link"
              className="text-foreground font-medium hover:text-primary hover:underline underline-offset-2"
            >
              {scan.patient_name}
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={remove}
            disabled={deleting || signed}
            data-testid="scan-detail-delete"
            title={signed ? "Signed reports cannot be deleted" : "Delete scan"}
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete
          </Button>
          <Button onClick={downloadPDF} className="glow-primary" data-testid="scan-detail-pdf">
            <Download className="w-4 h-4" /> {signed ? "Download signed PDF" : "Download draft PDF"}
          </Button>
        </div>
      </div>

      {scan.status === "error" && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive mb-6">
          {scan.error_message || "AI analysis failed."}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <BoundingBoxOverlay
            src={imgSrc}
            regions={r?.regions || []}
            processing={scan.status === "processing"}
          />

          {signed && (
            <Card className="p-5 border-emerald-500/30 bg-emerald-500/5" data-testid="signoff-card">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-emerald-600 dark:text-emerald-400">
                  Signed off
                </span>
              </div>
              <div className="font-medium">{scan.review.signed_by_name}</div>
              <div className="text-sm text-muted-foreground">
                {scan.review.signed_by_license ? `License ${scan.review.signed_by_license} · ` : ""}
                {new Date(scan.review.signed_at).toLocaleString()}
              </div>
              {scan.review.notes && (
                <p className="text-sm mt-3 leading-relaxed border-t border-emerald-500/20 pt-3">
                  “{scan.review.notes}”
                </p>
              )}
            </Card>
          )}

          {/* Clinician review editor — shown only when completed & not yet signed */}
          {canReview && <ReviewEditor scan={scan} onUpdated={setScan} />}

          {r?.description && (
            <Card className="p-5 border-border">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                Clinical description {scan.final_result ? "(reviewed)" : "(AI)"}
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-line">{r.description}</p>
            </Card>
          )}

          {/* Show AI original when clinician has edited */}
          {scan.final_result && scan.result && (
            <Card className="p-5 border-border bg-muted/30">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Original AI read (for reference)
                </div>
              </div>
              <div className="text-sm">
                <div className="font-medium">{scan.result.primary_finding}</div>
                <div className="text-xs text-muted-foreground">
                  Confidence {Math.round(scan.result.confidence)}% · Severity {scan.result.severity}
                </div>
                {scan.result.description && (
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{scan.result.description}</p>
                )}
              </div>
            </Card>
          )}

          {r?.raw_observations && (
            <Card className="p-5 border-border">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Detailed observations</div>
              <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{r.raw_observations}</p>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {r?.confidence != null && (
            <Card className="p-5 border-border">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Confidence</div>
              <div className="font-display text-4xl font-bold text-primary mt-1">
                {Math.round(r.confidence)}%
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {scan.final_result ? "Clinician-reviewed" : "AI only"}
              </div>
            </Card>
          )}

          <Card className="p-5 border-border space-y-3 text-sm">
            <Row icon={User} label="Patient" value={scan.patient_name} />
            <Row icon={IdCard} label="Patient ID" value={scan.patient_id || "—"} />
            <Row
              icon={User}
              label="Age / Gender"
              value={`${scan.patient_age ?? "—"} / ${scan.patient_gender ?? "—"}`}
            />
            <Row icon={Stethoscope} label="Ordering" value={scan.user_name} />
            <Row icon={Calendar} label="Created" value={new Date(scan.created_at).toLocaleString()} />
          </Card>

          {r?.regions?.length > 0 && (
            <Card className="p-5 border-border">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Detected regions</div>
              <ul className="space-y-1.5 text-sm">
                {r.regions.map((reg, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-sm bg-bbox" />
                    <span className="font-medium">{reg.label}</span>
                    <span className="text-muted-foreground ml-auto">{Math.round(reg.confidence)}%</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {r?.differential_diagnoses?.length > 0 && (
            <Card className="p-5 border-border">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Differential diagnoses</div>
              <ul className="text-sm list-disc list-inside space-y-1 marker:text-muted-foreground">
                {r.differential_diagnoses.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </Card>
          )}

          {r?.recommendations?.length > 0 && (
            <Card className="p-5 border-border">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Recommendations</div>
              <ul className="text-sm list-disc list-inside space-y-1 marker:text-muted-foreground">
                {r.recommendations.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </Card>
          )}

          {scan.notes && (
            <Card className="p-5 border-border">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Clinician notes</div>
              <p className="text-sm whitespace-pre-line">{scan.notes}</p>
            </Card>
          )}

          {/* Audit trail */}
          {Array.isArray(scan.audit) && scan.audit.length > 0 && (
            <Card className="p-5 border-border" data-testid="audit-log">
              <div className="flex items-center gap-2 mb-3">
                <HistoryIcon className="w-3.5 h-3.5 text-muted-foreground" />
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Audit trail</div>
              </div>
              <ol className="space-y-3 text-xs">
                {scan.audit.map((a, i) => (
                  <li key={i} className="flex gap-3">
                    <AuditDot action={a.action} />
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {new Date(a.at).toLocaleString()}
                      </div>
                      <div className="text-sm">
                        <span className="font-medium capitalize">{a.action.replace(/_/g, " ")}</span>
                        <span className="text-muted-foreground"> · {a.user_name}</span>
                      </div>
                      {a.detail && <div className="text-xs text-muted-foreground truncate" title={a.detail}>{a.detail}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-medium truncate">{value}</div>
      </div>
    </div>
  );
}

function AuditDot({ action }) {
  const map = {
    created: "bg-slate-400",
    ai_completed: "bg-primary",
    ai_failed: "bg-destructive",
    edited: "bg-amber-500",
    signed_off: "bg-emerald-500",
  };
  return <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${map[action] || "bg-slate-400"}`} />;
}
