# NAS photo storage and selective scheduled backups

New turn attachments use `<property>/units/<unit>/turn-<created-date>-<turn-id>/<upload-stage>/<unique-file>`.
The property route overrides the property-code folder when configured. Shared root
still applies to other upload types; unit attachments always have identifying folders.
The turn ID separates repeat turnovers. Upload-stage folders describe the stage at
capture; editing photo metadata later does not move the file. Database records remain
the source of truth for access permissions, captions, original names and relationships.

Existing paths remain valid. `uploads:route-existing` previews root-level attachment
moves into turn folders, and applies them only with `--apply`. Run during a maintenance
window with upload/delete traffic stopped. It does not move already nested files.
Keep a database and file backup together before migration. Never manually rename files.

## Scheduled NAS backup

`deploy/examples/mros-nas-backup.sh` is the installed server-specific job for the
MROS NAS. It produces database.dump, operational-uploads.tgz, an excluded photo
manifest, included file listing, restore notes and checksums. It excludes only files
identified by ItemAttachment image MIME records, irrespective of their folder.
Maps, logos, project documents and other operational uploads stay included.
Unknown/orphan files are deliberately included rather than silently discarded.

The API is briefly paused for consistent capture and resumed before archive checking
and transfer. This still scales with operational data and filesystem entry count,
but no longer reads/compresses every unit photo each night. Files placed manually on
the NAS are not classified automatically. Existing backup sets are not deleted.

This is a PARTIAL file backup, not a full disaster-recovery set. Restore database and
operational files alongside the matching photo snapshot/backup; do not replace the
uploads directory with this partial archive. Unit photos require NAS snapshots or an
independent incremental backup, preferably on separate hardware/off-site. These are
not configured by this change. NAS snapshots on the same device do not protect against
loss of that device. Retention remains unchanged; monitor operational backup growth.

Manual `backup-uploads.sh`, deployment backups, and `backup-all.sh` still capture all
uploads intentionally. The selective policy currently applies only to the scheduled
NAS job; do not assume manual archives exclude photos.
