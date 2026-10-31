# Roadmap (in build order)

1. **Migrations + tests**: TypeORM migrations, Jest unit tests for the state machine and `assertOrgAccess`, e2e tests for cross-tenant denial.
2. **Security**: httpOnly cookie sessions, TOTP MFA (users.mfa_enabled is ready), account lockout, password reset email.
3. **Redis**: cache branding lookups by host, token revocation list, rate-limit store.
4. **White-label UI**: call `/public/branding` in the Next.js layout (middleware reads the Host header) and inject theme tokens.
5. **Comments**: per-deliverable threads (new `comments` table) plus in-portal notifications.
6. **Notifications**: email for approvals, invoices, contracts; Slack/Teams webhooks.
7. **Billing**: Stripe Checkout + webhook to flip `invoices.status`; retainers.
8. **Task assignment** for specialists and time tracking (the PDF's "active assigned tasks" scope).
9. **Operations**: structured logging, uptime and latency dashboards, Terraform, optional Kubernetes.
10. **Compliance**: dependency/SAST scans in CI, penetration test, SOC 2 evidence collection.
