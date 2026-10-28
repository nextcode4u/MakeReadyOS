import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { createRelay, enrollTenant, openRelayDatabase, rotateTenant } from "./service.js";
import { fcmConfiguration, sendFcmData } from "../lib/fcm.js";

process.umask(0o077);
const path = process.env.PUSH_RELAY_DB;
if (!path || !path.startsWith("/")) throw new Error("Set PUSH_RELAY_DB to an absolute private database path");
mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
const db = openRelayDatabase(path);
chmodSync(path, 0o600);
const [action = "serve", value] = process.argv.slice(2);
if (action === "enroll") {
  // Operator-only stdout: redirect to a protected file, never CI or public logs.
  console.log(JSON.stringify(enrollTenant(db, value)));
  db.close();
} else if (action === "rotate") {
  console.log(rotateTenant(db, value)); db.close();
} else if (action === "revoke") {
  if (!db.prepare("UPDATE tenants SET enabled=0 WHERE id=?").run(value).changes) throw new Error("Tenant not found");
  db.prepare("DELETE FROM devices WHERE tenant=?").run(value);
  db.prepare("DELETE FROM challenges WHERE tenant=?").run(value);
  db.close();
} else if (action === "serve") {
  const config = fcmConfiguration();
  if (!config) throw new Error("Configure the relay's Firebase sender before starting");
  const app = createRelay(db, config.projectId, async (token, data, challenge) => {
    await sendFcmData(config, { message: { token, data, android: { priority: challenge ? "normal" : "high", ttl: challenge ? "120s" : "300s", restricted_package_name: "com.makereadyos.android" } } });
  });
  await app.listen({ host: process.env.PUSH_RELAY_HOST ?? "127.0.0.1", port: Number(process.env.PUSH_RELAY_PORT ?? 3400) });
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void app.close().finally(() => db.close()); });
} else { db.close(); throw new Error("Use serve, enroll <https-origin>, rotate <tenant-id>, or revoke <tenant-id>"); }
