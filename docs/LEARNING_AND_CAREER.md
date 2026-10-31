# Learning guide and resume material

## Read the code in this order
1. `entities.ts` (the schema) -> 2. `common/` (guards, tenancy, audit) -> 3. `modules/auth.module.ts` -> 4. `projects.module.ts` (state machine) -> 5. `assets.module.ts` (pre-signed URLs) -> 6. `frontend/src/lib/api.ts` and the portal pages.

## Concepts you can explain in interviews
Multi-tenancy and why every query is scoped; RBAC vs ABAC; JWT trade-offs (localStorage vs cookies); finite state machines for workflows; pre-signed URLs and why files bypass the API; 3NF and index choices; Docker multi-stage builds and healthchecks; modular monolith vs microservices.

## Resume bullets (edit to match what you ship)
- Built a multi-tenant agency platform (NestJS, Next.js, PostgreSQL, Docker) with 5-role RBAC and tenant-level data isolation enforced on every query.
- Designed a deliverable approval state machine, versioned document vault with pre-signed S3 URLs, and an audit log of all mutations.
- Containerized the full stack (API, web, Postgres, Redis, RustFS) with Docker Compose and CI; deployed to Oracle Cloud behind automatic HTTPS.

## Exercises
Add a `comments` table and endpoint; write a test that proves client A cannot read client B's invoice; implement TOTP MFA; add a Stripe webhook.
