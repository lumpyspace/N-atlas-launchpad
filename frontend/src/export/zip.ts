import JSZip from "jszip";
import { saveAs } from "file-saver";
import { buildProject, type ExportLang, type ProjectInput } from "./templates";

/** Build the starter project in-browser and trigger a .zip download. */
export async function downloadProjectZip(
  input: ProjectInput,
  lang: ExportLang,
): Promise<void> {
  const { files, rootDir } = buildProject(input, lang);
  const zip = new JSZip();
  const folder = zip.folder(rootDir)!;
  for (const [path, content] of Object.entries(files)) {
    folder.file(path, content);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, `${rootDir}.zip`);
}

export function listProjectFiles(input: ProjectInput, lang: ExportLang): string[] {
  return Object.keys(buildProject(input, lang).files);
}
