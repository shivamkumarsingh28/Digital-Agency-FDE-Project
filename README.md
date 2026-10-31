# Saiam Digital Agency Platform

A full-stack agency website and multi-tenant client portal, built from the *Saiam Agency System Design Plan*.
Separate **NestJS** backend and **Next.js** frontend, **PostgreSQL**, S3-compatible file storage, all running in **Docker**.

Three goals: **learn** real-world architecture, **show** it on a resume, and **run** it for the agency.

## Run it (needs Docker only)

```bash
cp .env.example .env
docker compose up --build
```

PostgreSQL is available to local database tools at `localhost:5433` by default (`DB_FORWARD_PORT` in `.env`). Inside Compose, the API connects directly to the `db` service.

| What | URL |
|---|---|
| Public website | http://localhost:3000 |
| Client / staff portal | http://localhost:3000/login |
| API + Swagger docs | http://localhost:4000/docs |
| File storage console (RustFS) | http://localhost:9001 (credentials from `S3_ACCESS_KEY` / `S3_SECRET_KEY`; defaults: minioadmin / minioadmin) |

Demo accounts (password `ChangeMe123!`, created by the seed script):

| Email | Role |
|---|---|
| admin@saiam.agency | System Administrator |
| manager@saiam.agency | Account Manager |
| designer@saiam.agency | Agency Specialist |
| owner@acme.test | Client Administrator |
| reviewer@acme.test | Client Reviewer |

Try the core flow: log in as the manager, open *Spring Campaign Reels*, move "Instagram Reel pack" to internal review and then to the client; log in as `owner@acme.test` and approve it or request changes.

## Structure

```
backend/    NestJS API (TypeORM, JWT, RBAC, tenant isolation, audit log, S3 pre-signed URLs)
frontend/   Next.js 14 + Tailwind (public site + portal)
deploy/     Production overlay (Caddy HTTPS) 
docs/       Architecture, database, API, deployment, roadmap, learning guide
```

## Implementation status vs the system design PDF

| Area | Status |
|---|---|
| Multi-tier split (frontend / API / DB / object storage) | Done |
| Schema: all 8 tables from the PDF (plus `is_agency`, `full_name`, `feedback`, `file_name`, `visibility`) | Done |
| JWT auth, 5-role RBAC, tenant isolation on every query | Done |
| Deliverable state machine with mandatory revision feedback | Done |
| Document vault: versioned paths, pre-signed upload/download, visibility tags | Done |
| Invoices (create, send, pay) | Done, payment is a stub |
| Audit log for all mutations | Done |
| White-label branding lookup by domain (`/api/public/branding`) | API done, UI theming pending |
| Rate limiting, Helmet, validation | Done |
| MFA (TOTP/WebAuthn), OAuth2/OIDC provider | Roadmap |
| Redis caching, notifications, webhooks, Stripe | Roadmap (Redis container already provisioned) |
| Migrations, automated tests, WAF, SOC 2 evidence | Roadmap |

See `docs/ROADMAP.md` for the build order.
