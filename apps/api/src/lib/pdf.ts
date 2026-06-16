import { access } from "node:fs/promises";
import puppeteer from "puppeteer-core";

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

export async function renderPdfFromHtml(html: string, options?: { headerTemplate?: string; footerTemplate?: string }) {
  const executablePath = await detectChromiumPath();
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
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
