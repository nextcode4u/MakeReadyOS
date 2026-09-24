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
if [[ "$RUN_UPLOAD_CLEANUP" == "1" && "$*" == *"compose exec -T api sh -eu"* ]]; then
  shift 4
  exec "$@"
fi
exit 0
`, { mode: 0o755 });
  await writeFile(join(root, "bin", "tar"), "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });
  const run = async (script, failStage, args = [], extraEnv = {}) => {
    const log = join(root, "calls.txt");
    await writeFile(log, "");
    const result = spawnSync("bash", [join(root, script), ...args], {
      cwd: root, encoding: "utf8", timeout: 10000, input: script === "restore-uploads.sh" ? "RESTORE_UPLOADS\n" : "RESTORE\nRESTORE_UPLOADS\n",
      env: { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}`, CALL_LOG: log, FAIL_STAGE: failStage,
        POSTGRES_DB: "fixture", POSTGRES_USER: "fixture", UPLOAD_DIR: "/app/uploads", BACKUP_RETENTION_DAYS: "", ...extraEnv },
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

test("upload cleanup errors stop extraction and never report restore success", async t => {
  const { run } = await fixture(t);
  const result = await run("restore-uploads.sh", "find", ["sample.tgz"]);
  assert.equal(result.status, 23, result.stdout + result.stderr);
  assert.doesNotMatch(result.calls, /tar -C/);
  assert.doesNotMatch(result.stdout, /Upload restore completed/);
});

test("upload cleanup removes short dotfiles without following directory symlinks", async t => {
  const { root, run } = await fixture(t);
  const uploads = join(root, "uploads");
  const outside = join(root, "outside");
  await mkdir(uploads);
  await mkdir(outside);
  await writeFile(join(outside, "keep"), "outside upload directory");
  const { symlink, readdir } = await import("node:fs/promises");
  await symlink(outside, join(uploads, "linked-directory"));
  for (const name of [".a", "..a", ".hidden", "photo.jpg"]) await writeFile(join(uploads, name), "old");
  const result = await run("restore-uploads.sh", "", ["sample.tgz"], { UPLOAD_DIR: uploads, RUN_UPLOAD_CLEANUP: "1" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(await readdir(uploads), []);
  assert.equal(await readFile(join(outside, "keep"), "utf8"), "outside upload directory");
});

test("a failed file deletion propagates through find and prevents extraction", async t => {
  const { root, run } = await fixture(t);
  const uploads = join(root, "uploads");
  await mkdir(uploads);
  await writeFile(join(uploads, "keep"), "old data");
  await writeFile(join(root, "bin", "rm"), "#!/usr/bin/env bash\nexit 23\n", { mode: 0o755 });
  const result = await run("restore-uploads.sh", "", ["sample.tgz"], { UPLOAD_DIR: uploads, RUN_UPLOAD_CLEANUP: "1" });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(result.calls, /tar -C/);
  assert.doesNotMatch(result.stdout, /Upload restore completed/);
  assert.equal(await readFile(join(uploads, "keep"), "utf8"), "old data");
});

test("upload restore rejects noncanonical paths before Docker or deletion", async t => {
  const { run } = await fixture(t);
  for (const path of ["/", "/app", "/app/", "/app/uploads/..", "/app/./uploads", "//app/uploads"]) {
    const result = await run("restore-uploads.sh", "", ["sample.tgz"], { UPLOAD_DIR: path });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /refusing unsafe/);
    assert.equal(result.calls, "");
  }
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
