import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import UploadDropzone from "@/components/UploadDropzone";
import BoundingBoxOverlay from "@/components/BoundingBoxOverlay";
import { StatusBadge, SeverityBadge } from "@/components/StatusBadge";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Loader2, ScanLine, Sparkles, CheckCircle2, FileText, Download } from "lucide-react";
import { generateScanPDF } from "@/lib/pdf";

const STEPS = [
  { id: 1, label: "Patient & scan", icon: ScanLine },
  { id: 2, label: "Upload image", icon: ScanLine },
  { id: 3, label: "AI analysis", icon: Sparkles },
  { id: 4, label: "Result & PDF", icon: FileText },
];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || "";
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Upload() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    patient_name: "",
    patient_age: "",
    patient_gender: "",
    patient_id: "",
    scan_type: "xray",
    body_part: "",
    notes: "",
  });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [scan, setScan] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleFile = (f) => {
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const clearFile = () => {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  };

  const next = () => {
    if (step === 1) {
      if (!form.patient_name.trim()) {
        toast.error("Patient name is required");
        return;
      }
    }
    if (step === 2) {
      if (!file) {
        toast.error("Please upload a medical image");
        return;
      }
      analyze();
      return;
    }
    setStep((s) => Math.min(4, s + 1));
  };

  const analyze = async () => {
    setSubmitting(true);
    setStep(3);
    try {
      const b64 = await fileToBase64(file);
      const payload = {
        ...form,
        patient_age: form.patient_age ? Number(form.patient_age) : null,
        patient_gender: form.patient_gender || null,
        patient_id: form.patient_id || null,
        body_part: form.body_part || null,
        notes: form.notes || null,
        image_base64: b64,
        image_mime: file.type,
      };
      const createRes = await apiClient.post("/scans", payload);
      const scanId = createRes.data.id;

      // Poll until AI completes or errors out
      const started = Date.now();
      const timeoutMs = 90_000;
      let latest = createRes.data;
      while (latest.status === "processing") {
        if (Date.now() - started > timeoutMs) {
          throw new Error("Analysis timed out. Please try again.");
        }
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const poll = await apiClient.get(`/scans/${scanId}`);
          latest = poll.data;
        } catch (e) {
          // transient network blip — continue polling
        }
      }

      setScan(latest);
      if (latest.status === "error") {
        toast.error(latest.error_message || "AI analysis failed");
      } else {
        toast.success("Analysis complete");
      }
      setStep(4);
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message || "Failed to analyze image");
      setStep(2);
    } finally {
      setSubmitting(false);
    }
  };

  const downloadPDF = async () => {
    if (!scan) return;
    try {
      await generateScanPDF(scan);
      toast.success("PDF report downloaded");
    } catch (e) {
      toast.error("Failed to generate PDF");
    }
  };

  return (
    <div className="px-6 md:px-10 py-8 max-w-5xl mx-auto">
      <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-2">New scan</h1>
      <p className="text-muted-foreground mb-8">
        Follow the four-step workflow to upload, analyse and report on a medical image.
      </p>

      {/* Stepper */}
      <div className="grid grid-cols-4 gap-2 mb-10" data-testid="upload-stepper">
        {STEPS.map((s) => {
          const active = step === s.id;
          const done = step > s.id;
          return (
            <div
              key={s.id}
              data-testid={`step-${s.id}`}
              className={`flex flex-col items-start p-3 rounded-lg border transition-all ${
                done ? "border-emerald-500/30 bg-emerald-500/5" : active ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div
                  className={`w-7 h-7 rounded-full grid place-items-center text-xs font-bold ${
                    done ? "bg-emerald-500 text-white" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {done ? <CheckCircle2 className="w-4 h-4" /> : s.id}
                </div>
              </div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Step {s.id}</div>
              <div className="text-sm font-medium">{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* Step content */}
      {step === 1 && (
        <Card className="p-6 sm:p-8 border-border" data-testid="step1-card">
          <h2 className="font-display text-xl font-semibold mb-6">Patient & scan information</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Patient name *</Label>
              <Input
                required
                value={form.patient_name}
                onChange={(e) => set("patient_name", e.target.value)}
                className="mt-1.5 h-11"
                data-testid="patient-name"
                placeholder="John Doe"
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Age</Label>
              <Input
                type="number"
                min={0}
                value={form.patient_age}
                onChange={(e) => set("patient_age", e.target.value)}
                className="mt-1.5 h-11"
                data-testid="patient-age"
                placeholder="42"
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Gender</Label>
              <Select value={form.patient_gender} onValueChange={(v) => set("patient_gender", v)}>
                <SelectTrigger className="mt-1.5 h-11" data-testid="patient-gender">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Patient ID</Label>
              <Input
                value={form.patient_id}
                onChange={(e) => set("patient_id", e.target.value)}
                className="mt-1.5 h-11"
                data-testid="patient-id"
                placeholder="MRN-00012"
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Modality</Label>
              <Select value={form.scan_type} onValueChange={(v) => set("scan_type", v)}>
                <SelectTrigger className="mt-1.5 h-11" data-testid="scan-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="xray">X-ray</SelectItem>
                  <SelectItem value="mri">MRI</SelectItem>
                  <SelectItem value="ct">CT</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Body part</Label>
              <Input
                value={form.body_part}
                onChange={(e) => set("body_part", e.target.value)}
                className="mt-1.5 h-11"
                data-testid="body-part"
                placeholder="Chest, Brain, Knee…"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Clinical notes</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                className="mt-1.5"
                data-testid="notes"
                placeholder="Optional context for the AI (symptoms, prior history, etc.)"
              />
            </div>
          </div>
          <div className="flex justify-end mt-6">
            <Button onClick={next} data-testid="step1-next">
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="p-6 sm:p-8 border-border" data-testid="step2-card">
          <h2 className="font-display text-xl font-semibold mb-2">Upload medical image</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Accepted formats: JPG, PNG, WEBP. Max 10 MB. Images are sent securely for AI analysis.
          </p>
          <UploadDropzone
            file={file}
            preview={preview}
            onFile={handleFile}
            onClear={clearFile}
            disabled={submitting}
          />
          <div className="flex justify-between mt-6">
            <Button variant="outline" onClick={() => setStep(1)} data-testid="step2-back">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <Button onClick={next} disabled={!file || submitting} data-testid="step2-analyze">
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</> : <>Analyze with AI <ArrowRight className="w-4 h-4" /></>}
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="p-6 sm:p-8 border-border" data-testid="step3-card">
          <h2 className="font-display text-xl font-semibold mb-6">AI analysis in progress…</h2>
          <div className="grid lg:grid-cols-2 gap-6 items-center">
            <BoundingBoxOverlay src={preview} processing regions={[]} />
            <div className="space-y-4">
              {[
                "Decoding image…",
                "Sending to vision model…",
                "Locating regions of interest…",
                "Drafting structured report…",
              ].map((line, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-accent pulse-dot" style={{ animationDelay: `${i * 0.2}s` }} />
                  <span className="text-muted-foreground">{line}</span>
                </div>
              ))}
              <div className="text-xs text-muted-foreground pt-4 border-t border-border">
                Analysis typically completes in under 10 seconds.
              </div>
            </div>
          </div>
        </Card>
      )}

      {step === 4 && scan && (
        <Card className="p-6 sm:p-8 border-border" data-testid="step4-card">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <StatusBadge status={scan.status} />
                {scan.result?.severity && <SeverityBadge severity={scan.result.severity} />}
              </div>
              <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight">
                {scan.result?.primary_finding || (scan.status === "error" ? "Analysis failed" : "Inconclusive")}
              </h2>
              <div className="text-sm text-muted-foreground mt-1">
                Patient: <span className="text-foreground font-medium">{scan.patient_name}</span>{" "}
                · {(scan.scan_type || "").toUpperCase()} {scan.body_part ? `· ${scan.body_part}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {scan.result?.confidence != null && (
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Confidence</div>
                  <div className="font-display text-3xl font-bold text-primary">{Math.round(scan.result.confidence)}%</div>
                </div>
              )}
            </div>
          </div>

          {scan.status === "error" && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive mb-6">
              {scan.error_message || "AI analysis failed. Please try again."}
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-6">
            <BoundingBoxOverlay
              src={preview || (scan.image_base64 ? `data:${scan.image_mime};base64,${scan.image_base64}` : null)}
              regions={scan.result?.regions || []}
            />
            <div className="space-y-4">
              {scan.result?.description && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Clinical description</div>
                  <p className="text-sm leading-relaxed">{scan.result.description}</p>
                </div>
              )}
              {scan.result?.regions?.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Detected regions</div>
                  <ul className="space-y-1.5">
                    {scan.result.regions.map((r, i) => (
                      <li key={i} className="text-sm flex items-center gap-2">
                        <span className="w-2 h-2 rounded-sm bg-bbox" />
                        <span className="font-medium">{r.label}</span>
                        <span className="text-muted-foreground">· {Math.round(r.confidence)}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {scan.result?.differential_diagnoses?.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Differential diagnoses</div>
                  <ul className="text-sm list-disc list-inside space-y-1 marker:text-muted-foreground">
                    {scan.result.differential_diagnoses.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                </div>
              )}
              {scan.result?.recommendations?.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Recommendations</div>
                  <ul className="text-sm list-disc list-inside space-y-1 marker:text-muted-foreground">
                    {scan.result.recommendations.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 mt-8 pt-6 border-t border-border">
            <Button variant="outline" onClick={() => navigate("/upload")} data-testid="step4-new">
              New scan
            </Button>
            <Button variant="outline" onClick={downloadPDF} data-testid="step4-pdf">
              <Download className="w-4 h-4" /> Draft PDF
            </Button>
            <Button onClick={() => navigate(`/scans/${scan.id}`)} className="glow-primary" data-testid="step4-review">
              Review &amp; sign off →
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
