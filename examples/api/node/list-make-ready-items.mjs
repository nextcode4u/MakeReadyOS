const baseUrl = process.env.MAKEREADYOS_URL || "http://localhost:4000";
const token = process.env.MAKEREADYOS_TOKEN;

if (!token) {
  console.error("Set MAKEREADYOS_TOKEN to a MakeReadyOS API token.");
  process.exit(1);
}

const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/make-ready-items?limit=25`, {
  headers: { Authorization: `Bearer ${token}` },
});

if (!response.ok) {
  throw new Error(`MakeReadyOS API request failed: ${response.status} ${await response.text()}`);
}

const items = await response.json();
for (const item of items) {
  console.log(`${item.property?.code ?? item.propertyId} ${item.unitNumber}: ${item.vacancyStatus ?? "unset"}`);
}
