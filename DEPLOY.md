# Deploying

Written for: whoever is shipping this — the developer who builds, and whoever
is at the server when something needs rolling back.

Three apps go out as two images, from one command.

| app                | lives in    | ships as                      |
| ------------------ | ----------- | ----------------------------- |
| Fastify API        | `api/`      | `minna-api`                   |
| public site        | `frontend/` | `minna-web` (nginx)           |
| admin              | `backend/`  | `minna-web`, the same image   |

The two websites share an image because they ship from the same commit and
talk to the same API. Splitting them would create a way for one half of a
release to be live while the other is not.

| | |
| --- | --- |
| public site | https://minna.learnsbuy.com |
| admin | https://minna-admin.learnsbuy.com |
| registry | `ghcr.io/ideavivat` |
| server path | `/srv/minna` |
| nginx listens on | `127.0.0.1:8096` |

---

## Every deploy

### 1. Build and push, on your machine

```powershell
.\build-push.ps1 -Tag 2026-10-10-01
```

Tag format is `YYYY-MM-DD-XX`, where `XX` counts the deploys that day. The tag
is the only name a release has; there is no `latest`, on purpose — a moving
tag makes "what is running?" unanswerable.

Omit `-Tag` and it uses today at `-01`. Add `-NoPush` to check the images
build without publishing them.

### 2. Deploy, on the server

```bash
cd /srv/minna
bash deploy.sh 2026-10-10-01
```

It pulls, starts, waits for the API's healthcheck to pass, and prints which
commit went out. It records the tag in `.deployed-tag`, so a bare
`bash deploy.sh` redeploys the same release.

---

## Schema changes come first

**Run them before the deploy that needs them, not after.**

`drizzle-kit push` cannot run against this database — DigitalOcean's MySQL
sets `sql_require_primary_key = ON` — so every schema change is a hand-written
script under `api/scripts/add-*.mts`. They are written to be safe to run
twice, and they are not in the production image: `tsx` is a dev dependency.

From your machine, pointed at production:

```bash
cd api
export DATABASE_URL="mysql://...@db-...ondigitalocean.com:25060/minna"
export DATABASE_SSL=true DATABASE_SSL_CA=./certs/ca-certificate.crt

npx tsx scripts/migrate-all.mts --dry-run   # what it would run
npx tsx scripts/migrate-all.mts             # all of them, in order
```

`migrate-all.mts` runs every `add-*.mts` there is, oldest first. They each
check before they act, so running the whole set is safe whether the database
is empty, half-built or already current — which is the point: nothing records
which have run, and this way nothing has to.

**Some releases also seed.** Seeding is not migration: it fills in content
that the code expects to find rather than changing the shape of anything.
Each one leaves alone whatever is already filled in.

```bash
npx tsx scripts/seed-category-translations.mts   # category names in en/jp/vn
npx tsx scripts/seed-og-defaults.mts             # the site-wide share card
```

`seed-og-defaults.mts` has to run **on the server**, or from a shell whose
`APP_URL` is the live domain: it builds the share picture's address from it,
and a crawler cannot fetch `localhost`. It says so if it sees one.

Old code against a new table is fine; new code against an old table is a
500 on every request that touches it. That is the whole reason for the order.

---

## Rolling back

The same command with an older tag:

```bash
bash deploy.sh 2026-10-09-02
```

Every tag stays in the registry, so there is always something to go back to.

A schema change does **not** roll back with the code. The `add-*.mts` scripts
only add — they create tables and columns, and never drop them — so an older
release runs against a newer database without noticing. That is deliberate:
it means code can be rolled back at the speed of a `docker pull`, without
anyone having to reason about data.

### Old images on the server

`deploy.sh` keeps the five newest `minna-api` and `minna-web` tags on the disk
and removes the rest, plus whatever layers that leaves unreferenced. A tag
still in use by a running container is kept and said so. Everything stays in
the registry either way, so rolling back further than five is a `docker pull`,
not a lost release.

```bash
KEEP=10 bash deploy.sh 2026-10-19-01   # keep more
KEEP=0  bash deploy.sh 2026-10-19-01   # remove nothing
```

It touches those two repositories by exact tag and nothing else. Do **not**
reach for `docker image prune -a` on this server: jaga, plusexploration, the
PHP site and redis keep their own rollback tags here, and that command would
take all of them.

---

## First time on a server

```bash
mkdir -p /srv/minna/certs && cd /srv/minna
# from this repo: docker-compose.prod.yml, deploy.sh, .env.prod.example
cp .env.prod.example .env       # then fill it in
```

Then:

1. **`.env`** — every value. `openssl rand -base64 48` for each JWT secret.
   The API refuses to start if anything required in production is missing,
   and says which.
2. **`certs/ca-certificate.crt`** — the managed database's CA, downloaded
   from the DigitalOcean panel. `DATABASE_SSL=true` without it still connects
   but does not verify the server, and the API says so at boot.
3. **Registry login**, so the server can pull:
   ```bash
   echo "$GITHUB_TOKEN" | docker login ghcr.io -u <user> --password-stdin
   ```
4. **The host's vhost** — forward both hostnames to `127.0.0.1:8096`,
   passing the original `Host` through. That header is what picks between the
   two sites; without it everything lands on the default block and gets a
   closed connection. TLS is Cloudflare's, not this server's.
5. **Stripe webhook** — point the endpoint at
   `https://minna.learnsbuy.com/api/v1/webhooks/stripe` and put the signing
   secret it gives you in `STRIPE_WEBHOOK_SECRET`.
6. **DNS** — both names at the server.

The vhost is kept in the repo at `docker/nginx/host-vhost.example.conf`,
ready to copy to `/etc/nginx/sites-available/minna-v2`. TLS is terminated at
Cloudflare, so it listens on port 80 and carries no certificate — the same
shape as every other site on this server.

---

## What is baked in, and what is not

Anything Vite reads is compiled into the bundle and visible in the page
source, so **nothing secret can go there**. Two build arguments, both public:

- `VITE_ADMIN_URL` — the public site renders a link to the admin.
- `VITE_RECAPTCHA_SITE_KEY` — the public half of the pair. Read from
  `frontend/.env` when not passed. Its secret lives in the API's `.env` as
  `RECAPTCHA_SECRET`.

Changing either needs a rebuild. Everything else — database, Stripe, SMTP,
storage, JWT secrets — is read by the API at run time from `/srv/minna/.env`,
so changing it is an edit and a restart:

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate api
```

---

## When something is wrong

```bash
cd /srv/minna
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
docker inspect --format '{{ .State.Health.Status }}' minna-api
curl -s -H 'Host: minna.learnsbuy.com' http://127.0.0.1:8096/health
```

**Which commit is running**

```bash
docker image inspect ghcr.io/ideavivat/minna-api:"$(cat .deployed-tag)" \
  --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}'
```

**The sites load but the API gives 502** — the API container is down or
unhealthy. nginx resolves it per request rather than at startup precisely so
that this stays a 502 on `/api` instead of taking both websites down with it.
`docker compose logs api` will say why; a bad `DATABASE_URL` or a missing
required variable both stop it at boot with a readable message.

**Both sites give an empty reply** — the request arrived under a hostname
nginx does not serve, and the default block closed it. Check that the host's
proxy is passing `Host` through unchanged.

**Signed in, then signed out again on reload** — the refresh cookie is
`SameSite=Lax`, `Secure`, `path=/api/v1/auth`. It needs HTTPS, and it needs
the app and the API on the same origin. Both hold as long as each site
reaches the API through its own hostname, which is what the nginx config
does; a setup that served the admin under a path on the public domain would
break this.
