import { jsPDF } from "jspdf";

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function downloadPng(canvas: HTMLCanvasElement, name: string) {
  canvas.toBlob((b) => b && downloadBlob(b, name), "image/png");
}

/** A4 portrait, image placed edge to edge at 100% (the bill canvas is A4 at about 300 dpi). */
export function downloadA4Pdf(canvas: HTMLCanvasElement, name: string) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, 297, undefined, "FAST");
  pdf.save(name);
}

export function downloadText(text: string, name: string, type = "text/csv") {
  downloadBlob(new Blob([text], { type }), name);
}

/** One print-ready PDF: the bill on A4, then each meter at A5 centred on A4 with crop marks (like the print kit). */
export function downloadPropsPdf(bill: HTMLCanvasElement, meters: HTMLCanvasElement[], name: string) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  pdf.addImage(bill.toDataURL("image/png"), "PNG", 0, 0, 210, 297, undefined, "FAST");
  const x = (210 - 148) / 2, y = (297 - 210) / 2, w = 148, h = 210, m = 6;
  for (const c of meters) {
    pdf.addPage("a4", "portrait");
    pdf.addImage(c.toDataURL("image/jpeg", 0.93), "JPEG", x, y, w, h, undefined, "FAST");
    pdf.setDrawColor(0);
    pdf.setLineWidth(0.2);
    for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
      const dx = cx === x ? -1 : 1, dy = cy === y ? -1 : 1;
      pdf.line(cx + dx * 2, cy, cx + dx * (2 + m), cy);
      pdf.line(cx, cy + dy * 2, cx, cy + dy * (2 + m));
    }
    pdf.setFontSize(8);
    pdf.text("Trim to A5 along the crop marks. Print at 100% (Actual size).", 105, 290, { align: "center" });
  }
  pdf.save(name);
}
