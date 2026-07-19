import jsPDF from "jspdf";

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Generate a clinical PDF report for a scan and trigger download.
 * - Uses `final_result` (clinician edits) when present, otherwise AI `result`.
 * - Adds a "DRAFT — Pending clinician review" watermark when not signed off.
 * - Adds a signature block + audit log when signed off.
 */
export async function generateScanPDF(scan) {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  const signed = scan?.review?.status === "signed";
  const result = scan.final_result || scan.result || {};

  // Header bar
  pdf.setFillColor(37, 99, 235);
  pdf.rect(0, 0, pageW, 70, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.text("MedAI Diagnosis Report", margin, 30);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`Generated: ${fmtDate(new Date().toISOString())}`, margin, 50);
  pdf.text(`Scan ID: ${scan.id}`, pageW - margin, 50, { align: "right" });

  // Status badge
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "bold");
  const badgeLabel = signed ? "SIGNED OFF" : "DRAFT";
  const bx = pageW - margin - 80;
  const by = 12;
  if (signed) {
    pdf.setFillColor(16, 185, 129);
  } else {
    pdf.setFillColor(234, 179, 8);
  }
  pdf.roundedRect(bx, by, 80, 18, 3, 3, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.text(badgeLabel, bx + 40, by + 12, { align: "center" });

  pdf.setTextColor(15, 23, 42);
  y = 100;

  // Patient info block
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text("Patient Information", margin, y);
  y += 6;
  pdf.setDrawColor(226, 232, 240);
  pdf.line(margin, y, pageW - margin, y);
  y += 14;

  const patientRows = [
    ["Patient Name", scan.patient_name || "—"],
    ["Age / Gender", `${scan.patient_age ?? "—"} / ${scan.patient_gender ?? "—"}`],
    ["Patient ID", scan.patient_id || "—"],
    ["Modality", `${(scan.scan_type || "").toUpperCase()} · ${scan.body_part || "—"}`],
    ["Ordering Clinician", `${scan.user_name} (${scan.user_email})`],
    ["Scan Created", fmtDate(scan.created_at)],
  ];
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  for (const [label, val] of patientRows) {
    pdf.setTextColor(100, 116, 139);
    pdf.text(label, margin, y);
    pdf.setTextColor(15, 23, 42);
    pdf.text(String(val), margin + 130, y);
    y += 16;
  }

  y += 10;

  // Findings block
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  const headerLabel = scan.final_result ? "Clinical Findings (reviewed)" : "AI Preliminary Findings";
  pdf.text(headerLabel, margin, y);
  y += 6;
  pdf.line(margin, y, pageW - margin, y);
  y += 18;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(result.primary_finding || "—", margin, y);
  y += 18;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(100, 116, 139);
  pdf.text(
    `Confidence: ${Math.round(result.confidence ?? 0)}%   ·   Severity: ${(result.severity || "—").toUpperCase()}`,
    margin,
    y,
  );
  y += 16;

  pdf.setTextColor(15, 23, 42);
  if (result.description) {
    const lines = pdf.splitTextToSize(result.description, pageW - margin * 2);
    pdf.text(lines, margin, y);
    y += lines.length * 13 + 6;
  }

  // Image with bounding boxes
  if (scan.image_base64) {
    try {
      const imgUrl = `data:${scan.image_mime || "image/jpeg"};base64,${scan.image_base64}`;
      const canvas = await renderScanCanvas(imgUrl, result.regions || []);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const maxW = pageW - margin * 2;
      const ratio = canvas.height / canvas.width;
      const drawW = Math.min(maxW, 400);
      const drawH = drawW * ratio;
      if (y + drawH + 40 > pageH - margin) {
        pdf.addPage();
        y = margin;
      }
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text("Annotated Scan", margin, y);
      y += 14;
      pdf.addImage(dataUrl, "JPEG", margin, y, drawW, drawH);
      y += drawH + 18;
    } catch (e) {
      console.error("PDF image render failed", e);
    }
  }

  // Detected regions
  if (Array.isArray(result.regions) && result.regions.length > 0) {
    if (y + 60 > pageH - margin) { pdf.addPage(); y = margin; }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text("Detected Regions", margin, y);
    y += 6;
    pdf.line(margin, y, pageW - margin, y);
    y += 14;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    result.regions.forEach((r, i) => {
      const text = `${i + 1}. ${r.label} — ${Math.round(r.confidence ?? 0)}%`;
      pdf.text(text, margin, y);
      y += 14;
    });
    y += 8;
  }

  // Differentials & recommendations
  const blocks = [
    ["Differential Diagnoses", result.differential_diagnoses],
    ["Recommendations", result.recommendations],
  ];
  for (const [title, list] of blocks) {
    if (!Array.isArray(list) || list.length === 0) continue;
    if (y + 60 > pageH - margin) { pdf.addPage(); y = margin; }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text(title, margin, y);
    y += 6;
    pdf.line(margin, y, pageW - margin, y);
    y += 14;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    list.forEach((d) => {
      const lines = pdf.splitTextToSize(`• ${d}`, pageW - margin * 2);
      pdf.text(lines, margin, y);
      y += lines.length * 13;
    });
    y += 8;
  }

  // Signature / Clinician Attestation block
  if (y + 140 > pageH - margin) { pdf.addPage(); y = margin; }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text("Clinician Attestation", margin, y);
  y += 6;
  pdf.line(margin, y, pageW - margin, y);
  y += 16;

  if (signed) {
    const r = scan.review || {};
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(100, 116, 139);
    pdf.text("Signed by", margin, y);
    pdf.setTextColor(15, 23, 42);
    pdf.setFont("helvetica", "bold");
    pdf.text(r.signed_by_name || "—", margin + 130, y);
    y += 14;

    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100, 116, 139);
    pdf.text("License #", margin, y);
    pdf.setTextColor(15, 23, 42);
    pdf.text(r.signed_by_license || "—", margin + 130, y);
    y += 14;

    pdf.setTextColor(100, 116, 139);
    pdf.text("Signed at", margin, y);
    pdf.setTextColor(15, 23, 42);
    pdf.text(fmtDate(r.signed_at), margin + 130, y);
    y += 14;

    if (r.notes) {
      pdf.setTextColor(100, 116, 139);
      pdf.text("Notes", margin, y);
      pdf.setTextColor(15, 23, 42);
      const lines = pdf.splitTextToSize(r.notes, pageW - margin * 2 - 130);
      pdf.text(lines, margin + 130, y);
      y += lines.length * 13;
    }
    y += 8;

    // Signature line
    pdf.setDrawColor(15, 23, 42);
    pdf.setLineWidth(0.8);
    pdf.line(margin, y + 20, margin + 260, y + 20);
    pdf.setFontSize(9);
    pdf.setTextColor(100, 116, 139);
    pdf.text("Authorised electronic signature", margin, y + 34);
    y += 48;
  } else {
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(10);
    pdf.setTextColor(180, 83, 9);
    pdf.text(
      "This report has not yet been reviewed and signed off by a clinician. It is marked DRAFT.",
      margin,
      y,
    );
    y += 18;
    pdf.setTextColor(15, 23, 42);
  }

  // Audit trail (compact)
  if (Array.isArray(scan.audit) && scan.audit.length > 0) {
    if (y + 80 > pageH - margin) { pdf.addPage(); y = margin; }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text("Audit Trail", margin, y);
    y += 6;
    pdf.line(margin, y, pageW - margin, y);
    y += 14;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    scan.audit.forEach((a) => {
      if (y > pageH - margin - 30) { pdf.addPage(); y = margin; }
      pdf.setTextColor(100, 116, 139);
      pdf.text(fmtDate(a.at), margin, y);
      pdf.setTextColor(15, 23, 42);
      const text = `${a.action} · ${a.user_name}${a.detail ? " · " + a.detail : ""}`;
      const lines = pdf.splitTextToSize(text, pageW - margin * 2 - 120);
      pdf.text(lines, margin + 120, y);
      y += Math.max(12, lines.length * 11);
    });
    y += 8;
  }

  // Draft watermark (last to overlay on top of everything)
  if (!signed) {
    pdf.saveGraphicsState?.();
    const pagesCount = pdf.internal.pages.length - 1;
    for (let p = 1; p <= pagesCount; p += 1) {
      pdf.setPage(p);
      pdf.setTextColor(234, 179, 8);
      pdf.setFontSize(90);
      pdf.setFont("helvetica", "bold");
      try {
        pdf.setGState(new pdf.GState({ opacity: 0.12 }));
      } catch (_) {
        /* GState may be unavailable in some jsPDF builds */
      }
      pdf.text("DRAFT", pageW / 2, pageH / 2, { angle: 35, align: "center" });
      try {
        pdf.setGState(new pdf.GState({ opacity: 1 }));
      } catch (_) { /* */ }
    }
    pdf.restoreGraphicsState?.();
  }

  // Disclaimer (bottom of last page)
  pdf.setPage(pdf.internal.pages.length - 1);
  pdf.setDrawColor(226, 232, 240);
  pdf.line(margin, pageH - 60, pageW - margin, pageH - 60);
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "normal");
  const disclaimer =
    "This report is generated by an AI decision-support tool and is intended for use by qualified medical professionals " +
    "as a preliminary review. AI findings are not a medical diagnosis; a signed clinician attestation is required before " +
    "this report may inform treatment decisions.";
  const lines = pdf.splitTextToSize(disclaimer, pageW - margin * 2);
  pdf.text(lines, margin, pageH - 45);

  pdf.save(
    `medai-${signed ? "signed" : "draft"}-${(scan.patient_name || "scan").replace(/\s+/g, "_")}-${scan.id.slice(0, 8)}.pdf`,
  );
}

function renderScanCanvas(src, regions) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      ctx.lineWidth = Math.max(3, Math.round(img.naturalWidth / 300));
      ctx.strokeStyle = "#06B6D4";
      ctx.fillStyle = "rgba(6, 182, 212, 0.18)";
      ctx.font = `${Math.max(14, Math.round(img.naturalWidth / 50))}px sans-serif`;
      regions.forEach((r) => {
        const x = (r.x ?? 0) * img.naturalWidth;
        const y = (r.y ?? 0) * img.naturalHeight;
        const w = (r.width ?? 0) * img.naturalWidth;
        const h = (r.height ?? 0) * img.naturalHeight;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        const label = `${r.label} ${Math.round(r.confidence ?? 0)}%`;
        const padding = 6;
        const tw = ctx.measureText(label).width;
        const th = parseInt(ctx.font, 10);
        ctx.fillStyle = "#06B6D4";
        ctx.fillRect(x, Math.max(0, y - th - padding * 2), tw + padding * 2, th + padding);
        ctx.fillStyle = "#0F172A";
        ctx.fillText(label, x + padding, Math.max(0, y - padding * 1.2));
        ctx.fillStyle = "rgba(6, 182, 212, 0.18)";
      });
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = src;
  });
}
