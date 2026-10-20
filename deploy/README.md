# Deploying to the VPS (aspire.thechunkmedia.com)

The server (Debian 13, shared with other sites) runs this app in Docker so it can use Node 24 without touching the host's Node 20 apps. nginx on the host terminates TLS and proxies `aspire.thechunkmedia.com` to `127.0.0.1:3011`.

## Layout on the server

| Path | What |
|---|---|
| `/opt/aspire-web/docker-compose.yml` | Copy of `deploy/docker-compose.yml` |
| `/opt/aspire-web/.env` | Settings, mode 600, never committed (see below) |
| `/opt/aspire-web/release/` | Source of the deployed commit (`git archive`) — the Docker build context |
| `/opt/aspire-web/data/` | Auth database `aspire.sqlite` (owned by uid 1000) — **back this up** |
| `/etc/nginx/sites-available/aspire.thechunkmedia.com` | Server block; `proxy_pass http://127.0.0.1:3011;` |

`.env` keys: `NEXT_PUBLIC_SITE_URL=https://aspire.thechunkmedia.com`, `TRUSTED_PROXY_HOPS=1` (nginx appends to `X-Forwarded-For`), optional `PREVIEW_ACCESS_PASSWORD` (browser password prompt on every page; remove the line and restart to open the site), `RELEASE=<commit>`. Leave `SHOW_PLACEHOLDER_CONTENT` / `PORTAL_PREVIEW` unset for the production build (demo data hidden).

## Release

```sh
# from the repo, on your machine
git archive --format=tar <commit> | ssh root@69.62.76.109 "rm -rf /opt/aspire-web/release && mkdir -p /opt/aspire-web/release && tar -x -C /opt/aspire-web/release"
# on the server
cd /opt/aspire-web && sed -i "s/^RELEASE=.*/RELEASE=<commit>/" .env
docker compose build && docker compose up -d
docker compose ps        # healthy
```

## First admin (once)

```sh
cd /opt/aspire-web && docker compose exec app npm run auth:create-admin -- --login-id <id> --name "<name>"
```
It prompts for the password (hidden). Never run `auth:seed` on the server.

## Roll back

Previous images stay tagged `aspire-web:<commit>`: set `RELEASE=<previous commit>` in `.env` and `docker compose up -d`.
The pre-M4 demo (`/opt/aspire-demo`, port 3010) was stopped, not deleted: point nginx back to `127.0.0.1:3010`, `cd /opt/aspire-demo && docker compose up -d`, `nginx -t && systemctl reload nginx`.
