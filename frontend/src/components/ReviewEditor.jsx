import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { apiClient } from "@/lib/auth";
import { Loader2, PenSquare, Plus, X, FileSignature } from "lucide-react";

function toList(text) {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function ReviewEditor({ scan, onUpdated }) {
  const existing = scan.final_result || scan.result || {};
  const [form, setForm] = useState({
    primary_finding: existing.primary_finding || "",
    confidence: existing.confidence ?? 0,
    severity: existing.severity || "moderate",
    description: existing.description || "",
    differentials_text: (existing.differential_diagnoses || []).join("\n"),
    recommendations_text: (existing.recommendations || []).join("\n"),
    notes: scan?.review?.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signDialog, setSignDialog] = useState(false);
  const [signNotes, setSignNotes] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const saveDraft = async () => {
    setSaving(true);
    try {
      const payload = {
        primary_finding: form.primary_finding,
        confidence: Number(form.confidence),
        severity: form.severity,
        description: form.description,
        differential_diagnoses: toList(form.differentials_text),
        recommendations: toList(form.recommendations_text),
        notes: form.notes || null,
      };
      const res = await apiClient.put(`/scans/${scan.id}/review`, payload);
      toast.success("Review saved as draft");
      onUpdated(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save review");
    } finally {
      setSaving(false);
    }
  };

  const signOff = async () => {
    setSigning(true);
    try {
      // First save any pending edits so the final_result reflects the form
      await saveDraft();
      const res = await apiClient.post(`/scans/${scan.id}/signoff`, {
        notes: signNotes || form.notes || null,
      });
      toast.success("Scan signed off and finalized");
      onUpdated(res.data);
      setSignDialog(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to sign off");
    } finally {
      setSigning(false);
    }
  };

  return (
    <Card className="p-6 border-border" data-testid="review-editor">
      <div className="flex items-center gap-2 mb-1">
        <PenSquare className="w-4 h-4 text-primary" />
        <span className="text-[10px] uppercase tracking-[0.18em] text-primary font-semibold">Clinician review</span>
      </div>
      <h3 className="font-display text-lg font-semibold mb-1">Confirm or edit the AI findings.</h3>
      <p className="text-xs text-muted-foreground mb-5">
        All edits are logged in the audit trail. Sign-off is permanent and generates a legally-attested PDF.
      </p>

      <div className="space-y-4">
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Primary finding</Label>
          <Input
            value={form.primary_finding}
            onChange={(e) => set("primary_finding", e.target.value)}
            className="mt-1.5 h-10"
            data-testid="review-primary-finding"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Confidence</Label>
            <div className="flex items-center gap-2 mt-1.5">
              <Input
                type="number"
                min={0}
                max={100}
                value={form.confidence}
                onChange={(e) => set("confidence", e.target.value)}
                className="h-10"
                data-testid="review-confidence"
              />
              <span className="text-muted-foreground text-sm">%</span>
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Severity</Label>
            <Select value={form.severity} onValueChange={(v) => set("severity", v)}>
              <SelectTrigger className="mt-1.5 h-10" data-testid="review-severity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Clinical description</Label>
          <Textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            className="mt-1.5"
            data-testid="review-description"
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Differentials (one per line)
            </Label>
            <Textarea
              value={form.differentials_text}
              onChange={(e) => set("differentials_text", e.target.value)}
              rows={3}
              className="mt-1.5 font-mono text-xs"
              data-testid="review-differentials"
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Recommendations (one per line)
            </Label>
            <Textarea
              value={form.recommendations_text}
              onChange={(e) => set("recommendations_text", e.target.value)}
              rows={3}
              className="mt-1.5 font-mono text-xs"
              data-testid="review-recommendations"
            />
          </div>
        </div>

        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Clinician notes</Label>
          <Textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
            className="mt-1.5"
            placeholder="Optional — will appear on the signed report"
            data-testid="review-notes"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 pt-5 mt-5 border-t border-border">
        <Button variant="outline" onClick={saveDraft} disabled={saving} data-testid="review-save">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Save draft
        </Button>
        <Button
          className="glow-primary"
          onClick={() => setSignDialog(true)}
          data-testid="review-signoff-open"
        >
          <FileSignature className="w-4 h-4" /> Sign off & finalize
        </Button>
      </div>

      <Dialog open={signDialog} onOpenChange={setSignDialog}>
        <DialogContent data-testid="signoff-dialog">
          <DialogHeader>
            <DialogTitle>Sign off &amp; finalize this report</DialogTitle>
            <DialogDescription>
              By signing off you formally attest to these findings. This action is <strong>permanent</strong>:
              the report is locked and cannot be edited afterwards. The PDF will include your name, license
              number, and a timestamped signature.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Attestation notes (optional)</Label>
            <Textarea
              value={signNotes}
              onChange={(e) => setSignNotes(e.target.value)}
              rows={3}
              placeholder="e.g. 'Confirmed diagnosis via auscultation — prescribed antibiotics'"
              data-testid="signoff-notes"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignDialog(false)} data-testid="signoff-cancel">
              Cancel
            </Button>
            <Button onClick={signOff} disabled={signing} className="glow-primary" data-testid="signoff-confirm">
              {signing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />}
              I confirm &amp; sign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
