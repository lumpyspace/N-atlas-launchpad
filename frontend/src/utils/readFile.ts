/**
 * Turn an uploaded file into plain text for the knowledge base.
 * Text formats are read directly; PDFs use Mozilla's pdf.js (loaded only when
 * a PDF is uploaded, so it doesn't slow down the rest of the app).
 */

export const ACCEPTED = ".txt,.md,.markdown,.csv,.json,.pdf";

export async function readFileAsText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return readPdf(file);
  if (name.endsWith(".json")) {
    // Pretty-print so each record lands on its own lines (better passages).
    const raw = await file.text();
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }
  if (/\.(txt|md|markdown|csv)$/.test(name) || file.type.startsWith("text/")) return file.text();
  throw new Error(`${file.name}: unsupported file type. Use .txt, .md, .csv, .json or .pdf.`);
}

async function readPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Rebuild lines from text items (hasEOL marks the end of a line).
    let line = "";
    const lines: string[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line.trim());
        line = "";
      } else {
        line += " ";
      }
    }
    if (line.trim()) lines.push(line.trim());
    pages.push(lines.join("\n"));
  }
  const text = pages.join("\n\n").replace(/[ \t]+/g, " ").trim();
  if (!text) throw new Error(`${file.name}: no text found — it may be a scanned PDF (images only).`);
  return text;
}
