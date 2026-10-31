# Deployment

## Choosing a cloud (your open decision)

| Option | Cost | Effort | Best for |
|---|---|---|---|
| **Oracle Cloud (OCI) Always Free VM + Docker Compose** | Free tier ARM VM | Medium | Learning + live pilot; matches your OCI certification, so it also becomes a resume line |
| Render / Railway | ~$15-30/mo | Low | Fastest path to live, less to learn |
| AWS (ECS Fargate + RDS + S3) | $50+/mo | High | Learning enterprise AWS, matches the PDF's S3/Kubernetes direction |

**Suggested path:** start on one OCI VM with the compose overlay below, move files to Cloudflare R2 or OCI Object Storage later, and only adopt Kubernetes/Terraform when you have multiple clients and a reason.

## Single-VM deployment (any cloud)

1. Create an Ubuntu VM, open ports 80/443, install Docker.
2. Point three DNS A records at the VM: `app.`, `api.`, `files.` on your domain.
3. Copy the repo, create `.env.prod`:
   ```
   APP_DOMAIN=app.example.com
   API_DOMAIN=api.example.com
   FILES_DOMAIN=files.example.com
   NEXT_PUBLIC_API_URL=https://api.example.com/api
   CORS_ORIGINS=https://app.example.com
   S3_PUBLIC_ENDPOINT=https://files.example.com
   JWT_SECRET=<openssl rand -hex 48>
   DB_PASSWORD=<strong>  S3_ACCESS_KEY=<random>  S3_SECRET_KEY=<random>  SEED_PASSWORD=<strong>
   DB_SYNC=true   # first boot only, creates tables; see below
   ```
4. `docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml --env-file .env.prod up -d --build`
5. Sign in with the seeded admin, **change every demo password**, then set `DB_SYNC=false`.

The Compose stack uses RustFS for S3-compatible storage. It keeps data in the `rustfsdata` volume; existing MinIO data in `miniodata` is left untouched and must be copied through the S3 API before switching an installation that already stores files.

## Before real client data
- Replace `synchronize` with TypeORM migrations; back up Postgres daily (`pg_dump` to object storage).
- Remove the demo seed users, or run with a fresh DB and create real users via `POST /users`.
- Move the token to an httpOnly cookie and add MFA.
- Don't expose RustFS's console or Postgres publicly (the compose file binds them to localhost).
