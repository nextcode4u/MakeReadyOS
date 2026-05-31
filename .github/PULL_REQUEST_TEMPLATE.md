## Summary

Describe what changed and why.

## Scope

- [ ] API/backend
- [ ] Web/frontend
- [ ] Database/schema
- [ ] Docs
- [ ] Scripts/deployment
- [ ] Tests only

## Safety Checks

- [ ] Stable internal field keys are unchanged, or migration impact is documented.
- [ ] `reference/` is not used as a runtime dependency.
- [ ] No arbitrary JavaScript/plugin execution was introduced.
- [ ] Role and property-scope behavior was considered.
- [ ] Backup/export/import boundaries were considered if data models changed.

## Validation

Commands run:

```bash
./doctor.sh
./build.sh
./test.sh
./e2e.sh
npm --prefix apps/api audit --omit=dev
npm --prefix apps/web audit --omit=dev
```

## Notes

List follow-up work, skipped tests, or deployment considerations.
