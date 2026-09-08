import { access } from "node:fs/promises";
import { chromium } from "playwright-core";

async function detectChromiumPath() {
  const configured = process.env.CHROMIUM_PATH;
  const candidates = [configured, "/usr/bin/chromium-browser", "/usr/bin/chromium"].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  throw new Error("Chromium executable not found. Set CHROMIUM_PATH or install chromium in the API container.");
}

export async function renderPdfFromHtml(html: string, options?: { headerTemplate?: string; footerTemplate?: string; singlePage?: boolean }) {
  const executablePath = await detectChromiumPath();
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    if (options?.singlePage) {
      await page.setViewportSize({ width: 739, height: 974 });
      await page.emulateMedia({ media: "print" });
      await page.route("**/*", route => route.abort());
    }
    await page.setContent(html, { waitUntil: "load" });
    if (options?.singlePage) {
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images).map(image => image.decode())); });
      const fits = await page.evaluate(() => {
        const main = document.querySelector("main")!;
        return main.getBoundingClientRect().height <= 974 && document.documentElement.scrollWidth <= 739;
      });
      if (!fits) throw Object.assign(new Error("This draft does not fit one Letter page. Shorten report wording or notes; no inspection details were clipped."), { statusCode: 422 });
    }
    return await page.pdf({
      format: "Letter",
      printBackground: true,
      displayHeaderFooter: Boolean(options?.headerTemplate || options?.footerTemplate),
      headerTemplate: options?.headerTemplate,
      footerTemplate: options?.footerTemplate,
      margin: { top: "0.4in", right: "0.4in", bottom: "0.45in", left: "0.4in" },
    });
  } finally {
    await browser.close();
  }
}
