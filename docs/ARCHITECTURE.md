# Architecture

```
Browser ──> Next.js (3000) ──REST/JSON + JWT──> NestJS API (4000) ──> PostgreSQL
                  │                                   ├──> RustFS / S3 (files, pre-signed URLs)
                  └── uploads/downloads go straight   └──> Redis (Phase 2)
                      to object storage via signed URLs
```

## Backend modules (`backend/src`)
| Module | Responsibility |
|---|---|
| `auth` | Login, bcrypt check, JWT issue/verify, `/auth/me` |
| `tenants` | Organizations, users, role assignment, white-label branding lookup |
| `projects` | Projects, deliverables, state machine |
| `assets` | Vault: version numbers, pre-signed PUT/GET URLs, visibility |
| `invoices` | Invoice lifecycle |
| `common` | Guards (JWT, roles), tenancy helpers, audit interceptor |

The PDF describes separate microservices behind a gateway. This project is a **modular monolith**: the same domain boundaries, one deployable. That is the right size for one agency, and each module can be split out later because modules only talk through services.

## Security model
1. **Authentication**: bcrypt (cost 12) + JWT (8h). Login is rate-limited to 10/min.
2. **RBAC**: `@Roles()` decorator + global `RolesGuard`. Every route needs a valid JWT unless marked `@Public()`.
3. **Tenant isolation (ABAC)**: client users carry `orgId` in the token. List queries use `orgScope()`; single-resource reads call `assertOrgAccess()` after loading the row's `org_id` (directly or through its project).
4. **Least exposure**: clients never see draft/internal deliverables, internal-only files, or draft invoices.
5. **Files**: private bucket; only short-lived signed URLs (PUT 10 min, GET 5 min).
6. **Audit**: every successful POST/PUT/PATCH/DELETE writes `audit_logs`.
7. **Hardening**: Helmet headers, DTO whitelist validation (`forbidNonWhitelisted`), CORS allow-list.

## Deliverable state machine
```
DRAFT ─> IN_INTERNAL_REVIEW ─> PENDING_CLIENT_APPROVAL ─> APPROVED
  ^            ^  │                         │
  └────────────┘  └─────────────────────────┴─> REVISION_REQUESTED (feedback required) ─┐
                  ^──────────────────────────────────────────────────────────────────────┘
```
Who may move it: internal staff for the first steps, managers to release to the client, `CLIENT_ADMIN` to approve, `CLIENT_REVIEWER` or admin to request changes. Defined in `TRANSITIONS` in `projects.module.ts`; the frontend mirrors it in `lib/api.ts` only to hide buttons.

## Known limitations (deliberate, to keep v1 learnable)
- Tokens live in `localStorage`. Move to httpOnly cookies before handling sensitive client data.
- Schema is created by TypeORM `synchronize`. Switch to migrations before real data (see ROADMAP).
- `Pay now` marks the invoice paid without a gateway.
