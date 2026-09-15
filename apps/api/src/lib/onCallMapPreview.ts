import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

let rendering = 0;
const run = promisify(execFile);
export async function mapPdfPreview(path: string, page: number) {
  const cache = `${path}-page-${page}.png`;
  try { return await readFile(cache); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (rendering >= 2) throw Object.assign(new Error("Map previews are busy. Try again shortly."), { statusCode: 503 });
  rendering++;
  let temporary: string | undefined;
  try {
    temporary = await mkdtemp(join(tmpdir(), "on-call-map-"));
    await run("pdftoppm", ["-f", String(page), "-l", String(page), "-singlefile", "-scale-to", "1800", "-png", path, join(temporary, "preview")], { timeout: 15000, maxBuffer: 1024 * 1024 });
    const buffer = await readFile(join(temporary, "preview.png"));
    await writeFile(cache, buffer);
    return buffer;
  } catch {
    throw Object.assign(new Error("Cannot preview this PDF page. Check the page number or upload an unlocked PDF or image."), { statusCode: 422 });
  } finally { rendering--; if (temporary) await rm(temporary, { recursive: true, force: true }); }
}
