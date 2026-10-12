// Prints the submission documents to PDF with headless Chromium (Playwright).
// Usage: node docs/submission/print.mjs   (after python docs/submission/build.py)
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// Playwright from this project, or from a path given in PLAYWRIGHT_PATH.
const { chromium } = await import(process.env.PLAYWRIGHT_PATH ?? "playwright");

const docs = [
  ["n-atlas-integration-evidence", "N-ATLAS Integration Evidence"],
  ["technical-documentation", "Technical Documentation"],
];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
for (const [file, title] of docs) {
  await page.goto(pathToFileURL(join(here, `${file}.html`)).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: join(here, `${file}.pdf`),
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: `<div style="width:100%;font:8px Inter,Segoe UI,sans-serif;color:#8a857a;padding:0 17mm;display:flex;justify-content:space-between"><span>N-ATLAS Launchpad · ${title}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    margin: { top: "18mm", bottom: "20mm", left: "17mm", right: "17mm" },
  });
  console.log("printed", `${file}.pdf`);
}
await browser.close();
