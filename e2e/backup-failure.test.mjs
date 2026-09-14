import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, copyFile, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "mros-backup-failure-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "bin"));
  for (const name of ["backup-all.sh", "backup-db.sh", "backup-uploads.sh", "restore-all.sh", "restore-db.sh", "restore-uploads.sh", "prune-backups.sh"]) {
    await copyFile(resolve(name), join(root, name));
  }
  await writeFile(join(root, ".env"), "");
  await writeFile(join(root, "sample.dump"), "fake archive for fake Docker only");
  await writeFile(join(root, "sample.tgz"), "fake archive for fake tar only");
  await writeFile(join(root, "bin", "docker"), `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$CALL_LOG"
if [[ "$FAIL_STAGE" == "restore_payload" ]]; then
  if [[ "$*" == *pg_restore* && "$*" != *--list* ]]; then exit 23; fi
elif [[ -n "$FAIL_STAGE" && "$*" == *"$FAIL_STAGE"* ]]; then exit 23
fi
exit 0
`, { mode: 0o755 });
  await writeFile(join(root, "bin", "tar"), "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });
  const run = async (script, failStage, args = []) => {
    const log = join(root, "calls.txt");
    await writeFile(log, "");
    const result = spawnSync("bash", [join(root, script), ...args], {
      cwd: root, encoding: "utf8", timeout: 10000, input: script === "restore-uploads.sh" ? "RESTORE_UPLOADS\n" : "RESTORE\nRESTORE_UPLOADS\n",
      env: { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}`, CALL_LOG: log, FAIL_STAGE: failStage,
        POSTGRES_DB: "fixture", POSTGRES_USER: "fixture", UPLOAD_DIR: "/app/uploads", BACKUP_RETENTION_DAYS: "" },
    });
    return { ...result, calls: await readFile(log, "utf8") };
  };
  return { root, run };
}

test("backup failures stop later steps and never announce completion", async t => {
  const { run } = await fixture(t);
  for (const script of ["backup-db.sh", "backup-uploads.sh", "backup-all.sh"]) {
    const result = await run(script, "compose config");
    assert.equal(result.status, 23, result.stdout + result.stderr);
    assert.doesNotMatch(result.calls, /compose up|pg_dump/);
    assert.doesNotMatch(result.stdout, /backup completed/i);
  }
});

test("database restore failures stop before later destructive or restart steps", async t => {
  const { run } = await fixture(t);
  for (const stage of ["compose config", "dropdb", "createdb", "restore_payload"]) {
    const result = await run("restore-db.sh", stage, ["sample.dump"]);
    assert.equal(result.status, 23, result.stdout + result.stderr);
    assert.doesNotMatch(result.stdout, /Database restore completed/);
    assert.doesNotMatch(result.calls, /compose up -d api web/);
    if (stage === "dropdb") assert.doesNotMatch(result.calls, /createdb/);
    if (stage === "createdb") assert.doesNotMatch(result.calls, /pg_restore -U/);
  }
});

test("full restore and upload restore propagate child failures instead of reporting success", async t => {
  const { run } = await fixture(t);
  const all = await run("restore-all.sh", "dropdb", ["sample.dump", "sample.tgz"]);
  assert.equal(all.status, 23, all.stdout + all.stderr);
  assert.doesNotMatch(all.stdout, /Upload restore requested|Full MakeReadyOS restore completed/);
  const uploads = await run("restore-uploads.sh", "tar -C", ["sample.tgz"]);
  assert.equal(uploads.status, 23, uploads.stdout + uploads.stderr);
  assert.doesNotMatch(uploads.stdout, /Upload restore completed/);
});

test("successful workers remain successful and failed log writes return a failure", async t => {
  const { root, run } = await fixture(t);
  assert.equal((await run("backup-all.sh", "")).status, 0);
  await writeFile(join(root, "bin", "tee"), '#!/usr/bin/env bash\n/usr/bin/tee "$@"\nexit 31\n', { mode: 0o755 });
  assert.equal((await run("backup-db.sh", "")).status, 31);
  assert.equal((await run("backup-db.sh", "compose config")).status, 23, "worker failure takes precedence over log failure");
});

test("failed retention discovery never deletes partially enumerated backup files", async t => {
  const { root, run } = await fixture(t);
  await mkdir(join(root, "backups"));
  const candidate = join(root, "backups", "makereadyos-db-20000101-000000.dump");
  await writeFile(candidate, "keep this fixture");
  await writeFile(join(root, "bin", "find"), `#!/usr/bin/env bash\nprintf '%s\\0' '${candidate}'\nexit 23\n`, { mode: 0o755 });
  const result = await run("prune-backups.sh", "");
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(result.stdout, /No expired|Prune completed|Backup prune completed/);
  assert.equal(await readFile(candidate, "utf8"), "keep this fixture");
});
