#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd /home/mros/MakeReadyOS
marker=/run/makereadyos-nas-backup/paused-api
resume() {
  if [[ -f "$marker" ]]; then
    local id
    id=$(<"$marker")
    if [[ $(docker inspect -f '{{.State.Paused}}' "$id" 2>/dev/null) == true ]]; then
      docker unpause "$id" >/dev/null || return 1
    fi
    rm -f -- "$marker"
  fi
}
if [[ ${1:-} == --resume ]]; then resume; exit; fi
exec 9>/run/makereadyos-nas-backup/lock
flock -n 9 || { echo 'Another NAS backup is running'; exit 1; }
trap resume EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
findmnt -rn -M /mnt/mros-nas -t cifs >/dev/null
[[ $(findmnt -rn -M /mnt/mros-nas -t cifs -o SOURCE) == //Zaq-NAS.local/MROS ]] || { echo 'Unexpected NAS share'; exit 1; }
api=$(docker compose ps -q api)
[[ -n "$api" && $(docker inspect -f '{{.State.Paused}}' "$api") == false ]]
[[ $(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Source}}{{end}}{{end}}' "$api") == /mnt/mros-nas/uploads ]]
stamp=$(date -u +%Y%m%dT%H%M%SZ)
stage=$(mktemp -d "$PWD/backups/.nas-staging-$stamp.XXXXXX")
echo "Starting database and operational-files NAS backup $stamp; unit photos excluded; temporary capture: $stage"
# Capture with writers paused, but never exec inside the paused API container.
printf '%s\n' "$api" > "$marker"
docker pause "$api" >/dev/null
timeout 120 docker compose exec -T db sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' > "$stage/database.dump"
# Classify by database ownership, not file extension: map and operational images stay included.
timeout 60 docker compose exec -T db sh -c 'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$stage/excluded-unit-photos.txt" <<'SQL'
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "ItemAttachment" WHERE "mimeType" LIKE 'image/%' AND ("storedName" ~ '[[:cntrl:]]' OR "storedName" LIKE '/%' OR "storedName" LIKE '%..%')) THEN
    RAISE EXCEPTION 'Unsafe photo path: refusing selective backup';
  END IF;
END $$;
SELECT './' || "storedName" FROM "ItemAttachment" WHERE "mimeType" LIKE 'image/%' ORDER BY "storedName";
SQL
timeout 300 tar -C /mnt/mros-nas/uploads --no-wildcards --anchored --exclude-from="$stage/excluded-unit-photos.txt" -czf "$stage/operational-uploads.tgz" .
resume
echo 'API resumed; checking archives and copying to NAS'
docker compose exec -T db pg_restore --list < "$stage/database.dump" >/dev/null
gzip -t "$stage/operational-uploads.tgz"
tar -tzf "$stage/operational-uploads.tgz" > "$stage/included-files.txt"
if grep -Fxf "$stage/excluded-unit-photos.txt" "$stage/included-files.txt"; then
  echo 'Unit photo found in operational backup; refusing publication'; exit 1
fi
printf '%s\n' 'PARTIAL FILE BACKUP: database plus operational uploads. Unit photos listed in excluded-unit-photos.txt are NOT included. Restore those from a matching NAS snapshot or independent photo backup. Do not replace the upload tree with this partial archive.' > "$stage/RESTORE-NOTES.txt"
(cd "$stage" && sha256sum database.dump operational-uploads.tgz excluded-unit-photos.txt included-files.txt RESTORE-NOTES.txt > SHA256SUMS)
mkdir -p /mnt/mros-nas/backups/scheduled
target=$(mktemp -d "/mnt/mros-nas/backups/scheduled/.partial-$stamp.XXXXXX")
cp -- "$stage/"* "$target/"
(cd "$target" && sha256sum -c SHA256SUMS)
sync -f "$target/database.dump"
sync -f "$target/operational-uploads.tgz"
mv -T -- "$target" "/mnt/mros-nas/backups/scheduled/$stamp"
rm -- "$stage/"*
rmdir -- "$stage"
echo "Verified NAS backup complete: /mnt/mros-nas/backups/scheduled/$stamp"
# No automatic deletion: retention and an independent/off-site copy need an explicit policy.
