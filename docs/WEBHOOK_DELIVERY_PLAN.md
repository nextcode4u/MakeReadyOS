# Webhook Delivery Plan

Webhook endpoints can be registered in the Admin Integrations area, but delivery remains intentionally scaffolded. This avoids blocking board writes on external HTTP calls before MakeReadyOS has a safe queue, retry, and observability layer.

## Current State

- Webhook endpoint metadata can be created and revoked.
- Secrets are stored as hashes and are not exposed after creation.
- Event type subscriptions are stored as configuration.
- No outbound HTTP delivery is performed by the API server today.

## Delivery Requirements

A production webhook worker should add:

- asynchronous delivery queue
- HMAC-signed payloads
- short HTTP timeouts
- retry with backoff
- delivery attempt table
- failure counts and last delivery status
- endpoint disablement after repeated failures
- admin-visible delivery history
- property-scope checks before queueing scoped events

## Initial Event Scope

The first worker should support the already documented foundation events:

- `item.created`
- `item.updated`
- `item.assigned`
- `item.risk.changed`
- `comment.created`
- `vendor.assignment.updated`
- `checklist.completed`

## Safety Rules

- Webhook delivery must never execute remote code.
- Webhook delivery must not block primary user actions.
- Secrets, API tokens, passwords, sessions, CSRF tokens, and private environment values must never appear in payloads.
- Failed delivery should be observable but should not corrupt operational board data.

Until this worker exists, integrations should poll the scoped API using API tokens and bounded `limit`/`offset` queries.
