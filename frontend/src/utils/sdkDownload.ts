export type SdkFile = "natlas.js" | "natlas.d.ts" | "natlas.py";

/** Save one SDK file. The source is loaded on demand so it stays out of the main bundle. */
export async function downloadSdk(file: SdkFile): Promise<void> {
  const { SDK_JS, SDK_DTS, SDK_PY } = await import("../export/sdkSource");
  const text = file === "natlas.js" ? SDK_JS : file === "natlas.d.ts" ? SDK_DTS : SDK_PY;
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
