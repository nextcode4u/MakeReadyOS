import { expect, test } from "@playwright/test";
import { build } from "../apps/web/node_modules/esbuild/lib/main.js";
import { splitDelimitedLine } from "../apps/web/src/lib/delimitedRows";

const statuses = ["Vacant Not Leased Ready", "Vacant Not Leased Not Ready", "NTV Not Leased", "NTV Leased", "Vacant Leased Ready", "Vacant Leased Not Ready", "Model", "Down"];
// Synthetic example of the RealPage report structure; no production records.
const xml = `<root><Response><Settings><Row PropertyDate="09/30/2026" RunDate="09/30/2026 08:00:00 AM" /></Settings><LeaseVariance>
${statuses.map((status, i) => `<Row><SectionType>DETAIL</SectionType><Status>${status}</Status><UnitNumber_Display>00${i + 1}</UnitNumber_Display><UnitNumber>internal-${i}</UnitNumber><fpCode>A1</fpCode><unitRentSqFtCount>750</unitRentSqFtCount><bldgNumber>01</bldgNumber><UnitFloorNumber>2</UnitFloorNumber><MoveOut>10/15/2026</MoveOut><MoveIn>11/01/2026</MoveIn><MakeReady>10/20/2026</MakeReady><Applied>09/29/2026</Applied><DaysVacant>5</DaysVacant><reshBillingName>${status.startsWith("NTV") ? "Current Demo" : "Vacant - pending resident: Future Demo"}</reshBillingName><NewreshBillingName>Future &amp; Demo</NewreshBillingName><leaID>database-id-not-a-name</leaID></Row>`).join("")}
<Row><SectionType>SUMMARY</SectionType><UnitNumber>999</UnitNumber><Status>Model</Status></Row>
</LeaseVariance></Response></root>`;

test("RealPage XML preserves status, names, dates and units without summary rows", async ({ page }) => {
  const bundle = await build({ entryPoints: ["apps/web/src/lib/realpageAvailabilityXml.ts"], bundle: true, write: false, format: "iife", globalName: "realpage" });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const parse = (input: string) => page.evaluate(input => (window as any).realpage.convertAvailabilityXmlToCsv(input), input);
  const csv = await parse(xml);
  const [headers, ...values] = csv.split("\n").map(line => splitDelimitedLine(line, ","));
  const rows = values.map(row => Object.fromEntries(headers.map((name, i) => [name, row[i]])));
  expect(rows).toHaveLength(8);
  expect(rows.map(row => row.unit)).toEqual(["001", "002", "003", "004", "005", "006", "007", "008"]);
  expect(rows.map(row => row.vacancyStatus)).toEqual(statuses.map(status => status.toUpperCase()));
  for (const row of rows) {
    expect(row.reportDate).toBe("2026-09-30");
    expect(row.applicant).toBe("Future & Demo");
    expect(row.dateApplied).toBe("2026-09-29");
    expect(row.makeReadyDate).toBe("2026-10-20");
    expect(row.moveInDate).toBe("2026-11-01");
  }
  expect(rows[2]).toMatchObject({ currentResidentName: "Current Demo", moveOutDate: "2026-10-15", vacatedDate: "" });
  expect(rows[0]).toMatchObject({ currentResidentName: "", moveOutDate: "", vacatedDate: "2026-10-15" });
  expect(csv).not.toContain("database-id-not-a-name");
  expect(await parse(xml.replace('PropertyDate="09/30/2026"', ""))).toBe(csv);
  expect(await parse(xml.replace(/<(\/?)([A-Za-z][A-Za-z0-9]*)/g, "<$1rp:$2").replace("<rp:root>", '<rp:root xmlns:rp="urn:demo">'))).toBe(csv);
  await expect(parse("<root>")).rejects.toThrow("Invalid XML");
  await expect(parse("<root><AllUnitsReport /></root>")).rejects.toThrow("Unsupported XML");
  await expect(parse(xml.replace("Vacant Not Leased Ready", "Unknown vendor status"))).rejects.toThrow("unsupported availability status");
  await expect(parse(xml.replace("<Status>Vacant Not Leased Ready</Status>", ""))).rejects.toThrow("missing its unit or status");
  await expect(parse("<root><LeaseVariance /></root>")).rejects.toThrow("no detail rows");
});

test("direct UTF-16 RealPage file upload previews and imports without conversion", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL || "admin@example.com");
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("property-filter")).toBeVisible();
  const { csrfToken } = await (await page.request.get("/api/auth/me")).json();
  const created = await page.request.post("/api/operations/properties", { headers: { "x-csrf-token": csrfToken }, data: { code: `XML${Date.now()}`, name: "RealPage XML Demo" } });
  expect(created.ok()).toBeTruthy();
  const { property } = await created.json();
  await page.reload();
  await page.getByTestId("mobile-views-toggle").click();
  await page.getByTestId("tab-availability").click();
  await page.getByTestId("availability-import-property").selectOption(property.id);
  await expect(page.getByTestId("realpage-direct-import-help")).toBeVisible();
  await page.getByTestId("availability-import-file").setInputFiles({ name: "realpage-demo.xml", mimeType: "application/xml", buffer: Buffer.from("\ufeff" + xml, "utf16le") });
  await expect(page.getByTestId("availability-import-csv")).toHaveValue(/2026-09-30/);
  await page.getByTestId("availability-full-report").check();
  await expect(page.getByTestId("availability-report-date-detected")).toContainText("2026-09-30");
  await page.getByTestId("availability-full-report").uncheck();
  page.once("dialog", dialog => dialog.accept());
  const imported = page.waitForResponse(r => r.url().endsWith("/operations/availability/import") && r.request().method() === "POST");
  await page.getByTestId("availability-import-submit").click();
  const response = await imported;
  expect(response.status(), await response.text()).toBe(200);
  const request = response.request().postDataJSON();
  expect(request.rows).toHaveLength(8);
  expect(request.rows[2]).toMatchObject({ number: "003", vacancyStatus: "NTV NOT LEASED", currentResidentName: "Current Demo", applicant: "Future & Demo", reportDate: "2026-09-30" });
  await page.getByTestId("availability-import-file").setInputFiles({ name: "broken.xml", mimeType: "application/xml", buffer: Buffer.from("<root>") });
  await expect(page.getByTestId("availability-import-csv")).toHaveValue("");
  await expect(page.getByText("Invalid XML. Upload the original RealPage availability XML export.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("availability-import-submit")).toBeDisabled();
});
