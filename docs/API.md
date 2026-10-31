# API reference

Base URL `http://localhost:4000/api`. Interactive docs: `/docs` (Swagger). Send `Authorization: Bearer <token>`.

| Method & path | Roles | Purpose |
|---|---|---|
| POST /auth/login | public | Email + password, returns `accessToken` |
| GET /auth/me | any | Current user |
| GET /public/branding?host= | public | White-label theme for a custom domain |
| GET/POST /organizations | admin, manager | Client organizations |
| GET/POST /users | admin, manager (GET also client admin) | Users per org |
| GET /projects, GET /projects/:id | any (tenant-scoped) | Projects |
| POST/PATCH /projects | admin, manager | Create / change status |
| GET/POST /projects/:id/deliverables | any (clients see released only) / managers create | Deliverables |
| PATCH /deliverables/:id/transition | per state machine | `{to, feedback?}` |
| POST /deliverables/:id/assets/upload-url | staff | Returns `uploadUrl`; PUT the file there |
| GET /deliverables/:id/assets | any | Versions (clients see CLIENT-visible only) |
| GET /assets/:id/download-url | any | Short-lived signed GET URL |
| GET/POST /invoices | admin, manager, client admin | List / create |
| POST /invoices/:id/send, /pay | manager / client admin | Lifecycle |
| GET /health | public | Liveness |

Errors are standard Nest JSON: `{statusCode, message, error}`. 403 = role or tenant violation, 400 = validation or illegal state change.
