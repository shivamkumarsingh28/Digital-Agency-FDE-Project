# Backend learning guide

This guide explains the backend as if you are new to TypeScript, NestJS, databases, and APIs. It follows the files in `src/` and the order a request takes through the application. The explanations group related lines into small blocks; braces and punctuation are explained as part of the block rather than repeated on every line.

## 1. The big picture

The backend is a web server written in **TypeScript** using **NestJS**. It exposes an HTTP API, checks who is making each request, reads and writes application data in **PostgreSQL**, and uses an S3-compatible object store for uploaded files.

```text
Browser
  |
  | HTTP request, often with a login token
  v
NestJS controller -> service -> TypeORM repository -> PostgreSQL
                            |
                            +-> RustFS, for file uploads/downloads
```

The main ideas:

- **Controller:** connects a URL and HTTP method to application code.
- **Service:** contains the work the application needs to do.
- **Entity:** describes a database table.
- **Repository:** TypeORM's object for finding, creating, and saving rows in a table.
- **DTO:** describes and validates the data accepted by an API endpoint.
- **Guard:** decides whether a request may continue.
- **Interceptor:** runs extra behavior around a request, such as writing an audit record.
- **Module:** groups related controllers and services and tells NestJS how to connect them.

## 2. How the backend starts

### `src/main.ts` — create and start the web server

1. `import 'reflect-metadata'` loads metadata support used by TypeScript decorators and NestJS.
2. The imports bring in NestJS application creation, request validation, Swagger documentation, Helmet security headers, and the root `AppModule`.
3. `async function bootstrap()` defines the startup procedure. `async` lets it wait for operations that finish later.
4. `NestFactory.create(AppModule)` builds the application and all modules registered under `AppModule`.
5. `app.setGlobalPrefix('api')` puts `/api` in front of controller routes. For example, a controller route `auth/login` becomes `/api/auth/login`.
6. `app.use(helmet())` adds common HTTP security headers.
7. `app.enableCors(...)` allows browser pages from the configured `CORS_ORIGINS` list to call the API. If it is unset, the local frontend origin `http://localhost:3000` is used.
8. `app.useGlobalPipes(new ValidationPipe(...))` validates incoming request data everywhere:
   - `whitelist: true` removes fields not declared on the DTO.
   - `forbidNonWhitelisted: true` rejects a request that contains undeclared fields instead of silently accepting them.
   - `transform: true` converts input into the DTO's class and transforms values when supported.
9. The `DocumentBuilder` and `SwaggerModule` create interactive API documentation. Open `/docs` while the server is running.
10. `app.listen(...)` starts listening on the configured `PORT` (default `4000`) and on all container network interfaces (`0.0.0.0`).
11. The last `bootstrap()` call actually starts the server.

### `src/app.module.ts` — connect the application pieces

The `@Module({...})` decorator gives NestJS the application's wiring instructions.

- `ConfigModule.forRoot({ isGlobal: true })` loads environment variables and makes `ConfigService` available throughout the app. A variable such as `DB_HOST` can then be read by backend code.
- `ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }])` sets a general request limit: up to 120 requests per 60-second window for a client.
- `TypeOrmModule.forRootAsync(...)` configures the database connection. “Async” is used because the connection settings are read from `ConfigService`.
  - `inject: [ConfigService]` asks NestJS to supply the config service to the factory.
  - `useFactory: (c) => ({ ... })` builds the database settings.
  - `host`, `port`, `username`, `password`, and `database` come from environment variables, with local defaults.
  - `entities: ALL_ENTITIES` tells TypeORM which TypeScript classes represent database tables.
  - `synchronize` automatically updates the database tables from the entities only when `DB_SYNC` is exactly `"true"`. This is convenient for local learning, but production should use reviewed database migrations instead.
- The module imports `DatabaseModule` and the feature modules: authentication, tenants, projects, assets, and invoices.
- `HealthController` provides a simple health endpoint.
- The global providers run across requests:
  1. `ThrottlerGuard` applies rate limits.
  2. `JwtAuthGuard` requires a valid login token unless a route is marked `@Public()`.
  3. `RolesGuard` enforces route role requirements.
  4. `AuditInterceptor` writes an audit entry after a successful change request by a logged-in user.

The guard order matters: rate-limit first, then authenticate, then check the user's role.

### `src/modules/database.module.ts` — make table repositories available

- `ALL_ENTITIES` is passed to `TypeOrmModule.forFeature(...)` so code can inject repositories for those tables.
- `@Global()` makes this module available throughout the app without importing it into every feature module.
- `exports: [TypeOrmModule]` lets other modules use the registered repositories.

For example, `@InjectRepository(User)` asks NestJS for the repository that works with the `User` table.

### `src/modules/health.controller.ts` — a simple status check

- `@Controller('health')` sets the route prefix to `health`.
- `@Public()` means no login token is needed.
- `@Get()` handles HTTP GET requests to `/api/health`.
- `check()` returns a small JSON object with `status: "ok"` and the current time. Monitoring tools can use this to see whether the API responds.

## 3. The database model

### `src/entities.ts` — TypeScript classes that map to tables

TypeORM reads the decorators on each class and property to understand the database schema.

- `@Entity('organizations')` means the `Organization` class maps to the `organizations` table.
- `@PrimaryGeneratedColumn('uuid', { name: 'org_id' })` means the database generates a UUID for the primary key. The TypeScript property is called `id`, while its database column is called `org_id`.
- `@Column(...)` describes a regular database column. Options can set its database name, type, length, default value, or whether it allows `NULL`.
- `@Index(...)` asks the database to create an index. Indexes help searches; `{ unique: true }` also prevents duplicate values.
- `@CreateDateColumn(...)` is a date/time column TypeORM fills in when the row is created.
- `@ManyToOne`, `@ManyToMany`, and `@JoinColumn` / `@JoinTable` describe relationships between tables.
- `Relation<T>` tells TypeScript the type of a related entity. It does not itself create the relationship; the decorators do that.

The eight entities are:

| Entity | Table | What it stores |
| --- | --- | --- |
| `Organization` | `organizations` | Agency/client organization, branding, and custom domain |
| `Role` | `roles_permissions` | Role names and their permission data |
| `User` | `users` | Login identity, organization, password hash, and roles |
| `Project` | `projects` | Client work, status, budget, and start date |
| `Deliverable` | `deliverables` | A piece of project work and its review status |
| `DocumentAsset` | `document_assets` | File metadata and its deliverable |
| `Invoice` | `invoices` | Amount, due date, organization, and payment status |
| `AuditLog` | `audit_logs` | Who performed a change, what endpoint they used, and when |

Important details:

- The enums (`UserStatus`, `ProjectStatus`, `DeliverableStatus`, `InvoiceStatus`, `AssetVisibility`) restrict status values to known choices.
- A user belongs to one organization using `org_id`. A user can have multiple roles through the `user_roles` join table.
- Projects belong to organizations; deliverables belong to projects; document assets belong to deliverables.
- Invoices belong to organizations and can optionally point to a project.
- `onDelete: 'CASCADE'` means deleting a parent can delete its related rows. `SET NULL` means the related reference is cleared instead.
- Money columns use `numeric` and are represented as strings in TypeScript to avoid floating-point rounding problems.
- `ALL_ENTITIES` is the list given to TypeORM when connecting to the database.

## 4. Authentication and permissions

### `src/common/types.ts` — shared role and user types

- `RoleName` is an enum: valid role names are `SYSTEM_ADMIN`, `ACCOUNT_MANAGER`, `SPECIALIST`, `CLIENT_ADMIN`, and `CLIENT_REVIEWER`.
- `AuthUser` describes the compact identity the API uses after login: user ID, organization ID, email, roles, and whether they belong to the agency.
- `isInternal` is important: agency staff can work across client organizations; client users must stay within their own organization.

### `src/common/decorators.ts` — labels used by guards and controllers

- `Public()` attaches metadata saying an endpoint does not need a JWT.
- `Roles(...roles)` attaches the list of roles allowed to use an endpoint. The `...` syntax lets a caller pass a list as separate arguments.
- `CurrentUser()` is a custom parameter decorator. It reads the authenticated user's information from the HTTP request and supplies it to a controller method.
- `IS_PUBLIC` and `ROLES_KEY` are metadata keys shared with the guards.

### `src/common/guards.ts` — decide whether a request may continue

**`JwtAuthGuard`:**

1. It asks NestJS `Reflector` whether the route or controller has `@Public()`.
2. If public, it returns `true`, which means “continue without login.”
3. Otherwise it calls Passport's JWT authentication guard. That guard reads and validates the bearer token and uses `JwtStrategy`.

**`RolesGuard`:**

1. It reads the allowed roles placed on the route with `@Roles(...)`.
2. If no roles are specified, any authenticated user may continue.
3. If the current user's role list includes an allowed role, it returns `true`.
4. Otherwise it throws `ForbiddenException`, which becomes an HTTP 403 response.

Authentication answers “who are you?” Role authorization answers “is your role allowed to do this?”

### `src/modules/auth.module.ts` — login and token validation

**`LoginDto`:**

- Describes the login JSON body.
- `@IsEmail()` requires a valid email-like value.
- `@IsString()` and `@MinLength(8)` require a string password of at least eight characters.
- The global `ValidationPipe` runs these checks before the controller uses the DTO.

**`AuthService.login(dto)`:**

1. Uses a TypeORM query builder to find a user whose email matches the lowercased input email.
2. `.addSelect('u.passwordHash')` explicitly includes the password hash. The entity marks it `select: false`, so regular queries do not expose it.
3. The two `leftJoinAndSelect` calls load the user's roles and organization along with the user.
4. `.where('u.email = :email', ...)` uses a named parameter rather than inserting raw user text into SQL.
5. The user is allowed to log in only if found, active, and the submitted password matches the stored bcrypt hash.
6. If any check fails, `UnauthorizedException` returns HTTP 401 with a generic message.
7. `toAuthUser` creates the safe identity used by the rest of the backend.
8. `jwt.signAsync(...)` signs that identity into a JWT. `sub` is the standard JWT field for the subject/user ID.
9. The response contains the access token and selected user information for the frontend.

**`toAuthUser(u)`:**

- Maps database fields to the smaller `AuthUser` type.
- `u.roles.map(...)` converts loaded role rows to role-name strings.
- `u.org.isAgency` determines whether the person is internal agency staff.

**`JwtStrategy`:**

- Configures Passport to look for a token in the `Authorization: Bearer <token>` header.
- Reads `JWT_SECRET` from configuration. `getOrThrow` makes startup fail clearly if the required secret is missing.
- `validate(p)` turns the verified JWT payload into the request's authenticated user. This function runs after the JWT signature is accepted.

**`AuthController`:**

- `@Controller('auth')` gives these routes the `auth` prefix.
- `POST /api/auth/login` is public and has a stricter throttle: 10 attempts per 60 seconds.
- `@Body()` gives the controller the parsed request body.
- `GET /api/auth/me` returns the current authenticated user. `@CurrentUser()` supplies it.

**`AuthModule`:**

- Imports Passport and configures the JWT module.
- JWT tokens expire after `JWT_EXPIRES_IN`, or after eight hours if unset.
- Registers the service, strategy, and controller with NestJS.

### `src/common/tenancy.ts` — keep client data separated

- `assertOrgAccess(user, orgId)` throws HTTP 403 if a client user tries to access another organization's data.
- Internal agency staff are allowed through this check.
- `orgScope(user, requestedOrgId)` creates a database filter for list queries:
  - Internal staff may see all organizations or request one specific organization.
  - Client users always get filtered to their own `orgId`, even if they request a different one.

This is called tenant isolation: each client organization is a separate tenant.

## 5. Feature modules and API routes

### `src/modules/tenants.module.ts` — organizations, users, and branding

**DTOs (validated request shapes):**

- `CreateOrgDto` accepts a name and optional custom domain/branding object.
- `CreateUserDto` requires an organization UUID, email, name, password, and one of the known role names.
- `@IsOptional()` means skip the following validation if the property is absent.

**`TenantsService`:**

- Its constructor receives repositories for organizations, users, and roles. NestJS supplies them through dependency injection.
- `listOrgs()` returns organizations ordered by name.
- `createOrg(dto)` checks that a custom domain is not already used; duplicates raise HTTP 409. It then creates a non-agency organization.
- `listUsers(actor, orgId)` uses `orgScope` so a client cannot list users belonging to another tenant. The `relations` option also loads roles.
- `createUser(dto)`:
  1. Finds the requested organization.
  2. Rejects a missing organization with HTTP 400.
  3. Checks that agency roles go to agency organizations and client roles go to client organizations.
  4. Rejects duplicate email addresses.
  5. Finds the role row.
  6. Hashes the password with bcrypt (cost factor 12); the plain password is not saved.
  7. Saves the user and returns only safe fields, not the password hash.
- `branding(host)` looks for an organization by custom domain. If none matches, it uses the agency branding as a fallback.

**`TenantsController` routes:**

| Method and path | Access |
| --- | --- |
| `GET /api/public/branding?host=...` | Public |
| `GET /api/organizations` | System admin or account manager |
| `POST /api/organizations` | System admin or account manager |
| `GET /api/users` | System admin, account manager, or client admin; tenant-scoped |
| `POST /api/users` | System admin or account manager |

The module declaration at the end registers the controller and service. It exports `TenantsService` so another module can use it if needed.

### `src/modules/projects.module.ts` — projects, deliverables, and approvals

**DTOs:**

- `CreateProjectDto` requires an organization UUID and title; budget and start date are optional and validated.
- `UpdateProjectDto` allows an optional project status.
- `CreateDeliverableDto` requires a title and optionally accepts a due date.
- `TransitionDto` requires a valid next deliverable status and can include feedback.

**Role lists:**

- `MANAGERS` includes system admins and account managers.
- `INTERNAL` adds specialists to those staff roles.
- `CLIENT_VISIBLE` contains the deliverable states clients may see. Draft and internal-review work stays hidden from clients.

**`TRANSITIONS`:** the allowed deliverable workflow:

```text
DRAFT -> IN_INTERNAL_REVIEW
IN_INTERNAL_REVIEW -> PENDING_CLIENT_APPROVAL or DRAFT
PENDING_CLIENT_APPROVAL -> APPROVED or REVISION_REQUESTED
REVISION_REQUESTED -> IN_INTERNAL_REVIEW
APPROVED -> no further transition
```

Each arrow also lists which roles may make that change. This prevents a user from skipping review steps or approving work with the wrong role.

**`ProjectsService`:**

- `list(user, orgId)` lists projects using a tenant filter and loads their organization.
- `get(user, id)` loads one project, returns HTTP 404 if missing, and checks organization access.
- `create(dto)` saves a project. `String(...)` converts the budget to the string format expected for a database `numeric` column. `??` supplies a default only when the left side is missing or null.
- `update(user, id, dto)` first loads and authorizes the project, then changes its status if supplied.
- `listDeliverables(user, projectId)` checks access to the parent project. Clients see only statuses in `CLIENT_VISIBLE`; staff may see all. `In(...)` is TypeORM's SQL “IN” filter.
- `createDeliverable(...)` checks parent-project access, converts an optional date string to a JavaScript `Date`, then saves the new deliverable.
- `getDeliverable(user, id)` loads the parent project too, checks tenant ownership, and hides internal deliverables from clients.
- `transition(user, id, dto)`:
  1. Loads and authorizes the deliverable.
  2. Finds the requested transition in the state-machine table.
  3. Returns HTTP 400 if that transition is not allowed.
  4. Returns HTTP 403 if the current user's roles cannot perform it.
  5. Requires nonblank feedback when a client requests a revision.
  6. Updates the status and, if provided, the feedback, then saves the row.

**`ProjectsController` routes:**

| Method and path | Access |
| --- | --- |
| `GET /api/projects` | Logged-in user; tenant-scoped |
| `GET /api/projects/:id` | Logged-in user; tenant checked |
| `POST /api/projects` | System admin or account manager |
| `PATCH /api/projects/:id` | System admin or account manager |
| `GET /api/projects/:id/deliverables` | Logged-in user; client-visible filtering |
| `POST /api/projects/:id/deliverables` | System admin or account manager |
| `PATCH /api/deliverables/:id/transition` | Logged-in user; checked by transition rules |

`:id` is a URL parameter. `ParseUUIDPipe` rejects it unless it is a valid UUID.

### `src/modules/invoices.module.ts` — billing records

- `CreateInvoiceDto` validates organization ID, optional project ID, a positive amount, and a date string.
- `InvoicesService.list(...)` applies tenant scope, loads related organization/project rows, sorts by due date, and hides draft invoices from client users.
- `create(dto)` converts the amount to a string for the numeric database column and saves the invoice.
- `load(user, id)` finds one invoice and checks tenant access. Missing invoices return HTTP 404.
- `send(user, id)` only moves a draft invoice to `SENT`; all other starting states return HTTP 400.
- `pay(user, id)` currently changes a sent or overdue invoice to `PAID`. **This is a demo placeholder, not a real payment transaction.** A real implementation should use a payment provider and verify its payment callback.

**Routes:**

| Method and path | Access |
| --- | --- |
| `GET /api/invoices` | System admin, account manager, or client admin |
| `POST /api/invoices` | System admin or account manager |
| `POST /api/invoices/:id/send` | System admin or account manager |
| `POST /api/invoices/:id/pay` | Client admin |

### `src/modules/assets.module.ts` — file metadata and signed URLs

Files are stored in the S3-compatible object service (RustFS locally). PostgreSQL stores metadata; it does not store the file bytes.

**`UploadUrlDto`:**

- Requires a string filename.
- Requires file size from 1 byte through 524,288,000 bytes (500 MB).
- Allows an optional visibility value: `INTERNAL` or `CLIENT`.

**`AssetsService` constructor:**

- Receives the document asset repository and project service.
- Reads the bucket name and S3 credentials from configuration.
- Creates an AWS SDK `S3Client` using the public endpoint. The URL must be reachable by the browser because the backend returns signed URLs to the frontend.
- `forcePathStyle: true` makes requests look like `endpoint/bucket/key`, which is useful with local S3-compatible services.

**`createUpload(user, deliverableId, dto)`:**

1. Checks that the user can access the deliverable.
2. Reads the most recent asset version and chooses the next number.
3. Replaces unsafe filename characters with underscores for the stored object key.
4. Creates a path such as `projects/<project>/deliverables/<deliverable>/v1/file.pdf`.
5. Saves file metadata in the database.
6. Creates a temporary signed `PUT` URL that permits the browser to upload the file for ten minutes.
7. Returns the saved metadata and URL. The browser sends the file itself directly to storage.

**`list(user, deliverableId)`:**

- Checks deliverable access first.
- Returns file metadata in newest-version-first order.
- Client users see only files marked `CLIENT`; internal staff can see both visibility levels.

**`downloadUrl(user, id)`:**

- Finds the file metadata or returns HTTP 404.
- Checks access to the file's deliverable.
- Hides internal files from clients.
- Returns a signed `GET` URL that expires after five minutes.

**Routes:**

| Method and path | Access |
| --- | --- |
| `POST /api/deliverables/:id/assets/upload-url` | System admin, account manager, or specialist |
| `GET /api/deliverables/:id/assets` | Logged-in user; visibility-filtered |
| `GET /api/assets/:id/download-url` | Logged-in user; tenant and visibility checked |

### `src/common/audit.interceptor.ts` — record successful changes

- `AuditInterceptor` runs around each request handled by NestJS.
- It immediately skips requests other than `POST`, `PUT`, `PATCH`, and `DELETE`; those are the usual write/change methods.
- `next.handle()` represents the controller's work.
- `tap(...)` runs a side effect after a successful response.
- If the request has a logged-in user, it saves an audit row with the user ID, HTTP method/route, and IP address.
- If audit saving fails, the error is written to NestJS logs. The request's main response is not replaced by an audit failure.

## 6. Demo data and local settings

### `src/seed.ts` — create sample data

The seed program creates demo organizations, roles, users, a project, deliverables, and an invoice so the app can be tried quickly.

1. It creates a NestJS application context without starting an HTTP server.
2. It obtains TypeORM's `DataSource`, which provides access to repositories.
3. It checks whether any roles exist. If so, it skips seeding to avoid adding duplicate demo data.
4. It creates role rows and their permission descriptions.
5. It creates an agency and a client organization.
6. It reads `SEED_PASSWORD` (or the local default), hashes it with bcrypt, then creates five demo users.
7. It creates sample project/deliverable/invoice rows.
8. It prints a safe success message and closes the app context.
9. The final `.catch(...)` prints an unexpected error and exits with a failure code.

The skip check is intentionally simple: if a previous seed stopped partway through but already created a role, it will skip rather than repair the incomplete seed.

### `.env.example` — local configuration template

Copy the repository's root `.env.example` to `.env` for the Compose setup. The backend reads settings such as:

- `PORT`: API listening port.
- `CORS_ORIGINS`: browser origins allowed to call the API.
- `JWT_SECRET` and `JWT_EXPIRES_IN`: signing key and token lifetime.
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: database connection.
- `DB_SYNC`: whether TypeORM automatically creates/updates tables.
- `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`: file storage.
- `SEED_PASSWORD`: demo account password.

Docker containers use the Compose service name `db` as the database hostname. A database program running directly on your computer uses `localhost:5433` by default. These are different network paths to the same database container.

Keep real passwords, `JWT_SECRET`, and storage credentials in your private `.env` file. Do not commit real secrets to source control or share them in screenshots/logs.

### `package.json` — commands and dependencies

- `npm run build` compiles the TypeScript NestJS app.
- `npm start` runs the compiled app at `dist/main.js`.
- `npm run start:dev` runs NestJS in development/watch mode.
- `npm run seed` runs the compiled seed program.
- `npm run seed:dev` runs the seed TypeScript directly.
- Dependencies include NestJS, TypeORM/PostgreSQL, JWT/Passport, validation, bcrypt, Swagger, and the AWS S3 SDK.

There is currently no backend test command defined in this package file.

### `Dockerfile` — build and run the API container

The Dockerfile has two stages:

1. The build stage uses Node 20 Alpine, installs exact lockfile dependencies with `npm ci`, copies source, and compiles with `npm run build`.
2. The runtime stage installs production dependencies only, copies the compiled `dist` directory, switches to the less-privileged `node` user, exposes port 4000, and starts `dist/main.js`.

This keeps TypeScript build tools out of the final runtime image.

## 7. What happens when you log in

Suppose the browser sends:

```http
POST /api/auth/login
Content-Type: application/json

{"email":"owner@acme.test","password":"your-password"}
```

The path through the backend is:

1. `main.ts` receives the request and applies Helmet, CORS, and the global validation pipe.
2. The rate-limit guard checks the request count.
3. `JwtAuthGuard` sees `@Public()` on the login endpoint and allows it without a token.
4. `AuthController.login()` receives the body as `LoginDto`.
5. Validation checks the email and password shape.
6. `AuthService.login()` loads the user, compares the bcrypt hash, and creates a JWT.
7. NestJS sends the returned token and user information as JSON.
8. On later protected requests, the browser sends `Authorization: Bearer <token>`.
9. `JwtStrategy` verifies the token, and the guards check authentication and any route role.
10. The controller calls a service; the service checks organization access and uses a TypeORM repository to read or change data.
11. For a successful write, `AuditInterceptor` attempts to save an audit record.

## 8. A few syntax patterns you will see often

- `const name = ...`: declare a value that will not be reassigned.
- `name?: string`: optional property/parameter whose type is a string.
- `Promise<T>`: a value that will be available later; `async` functions return promises.
- `await operation()`: wait for a promise before continuing.
- `a ?? b`: use `b` only when `a` is `null` or `undefined`.
- `a?.b`: access `b` only if `a` exists; otherwise result is undefined.
- `{ ...object, extra: value }`: copy the object's properties and add/replace a property.
- `items.map(fn)`: transform each item into a new item.
- `items.some(fn)`: return true if at least one item matches.
- `@Something()` above a class, method, or property: a decorator that adds framework metadata or validation behavior.
- `throw new BadRequestException(...)`: stop processing and return a corresponding HTTP error response.
- `private` on a constructor parameter: TypeScript creates and assigns a class property automatically. NestJS also injects the dependency.

## 9. Useful status codes when something goes wrong

- **400 Bad Request:** request data is invalid or a requested workflow transition is not allowed.
- **401 Unauthorized:** login/token is missing or invalid, or credentials are incorrect.
- **403 Forbidden:** the user is authenticated but lacks the required role or organization access.
- **404 Not Found:** the requested project, invoice, deliverable, or asset does not exist (or is intentionally hidden).
- **409 Conflict:** a unique value, such as an email or custom domain, is already in use.
- **500 Internal Server Error:** unexpected backend or dependency failure. Check backend container logs for the underlying error.
