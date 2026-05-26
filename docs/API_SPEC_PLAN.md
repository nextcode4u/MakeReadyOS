# API Spec Plan

MakeReadyOS currently has handwritten API documentation in `docs/API.md`. A generated OpenAPI contract is still future work, but the production-hardening baseline should keep the API shape predictable for integrators.

## Current Contract Boundary

Stable public integration surfaces are JSON over HTTP with either:

- browser cookie sessions plus CSRF for the web UI
- `Authorization: Bearer <token>` for scoped API/service tokens

Public integration routes should keep:

- stable path names
- JSON request/response bodies
- documented pagination on growing collections
- documented error responses using `{ "message": "..." }`
- scoped authorization checks before data access

## Initial OpenAPI Scope

When OpenAPI generation is added, the first generated/static spec should cover:

- `GET /health`
- auth/session routes
- `GET /api/meta`
- make-ready item list/create/update/archive/restore
- item comments and attachment metadata/download routes
- dashboard summary
- risk summary/items/evaluate
- vendor directory and assignments
- property maps and unit locations
- API token management metadata for admins

## Implementation Plan

1. Add shared route schemas where Fastify routes do not already validate with Zod.
2. Generate OpenAPI from route schemas or maintain a checked-in `openapi.json` only if generation proves too disruptive.
3. Add a CI/test check that the spec file exists and can be parsed.
4. Add examples that reference the spec for pagination and auth behavior.

Do not block operational feature work on full OpenAPI generation, but do not introduce new public integration routes without documenting auth, scopes, pagination, and error behavior.
