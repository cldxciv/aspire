# Aspire IIT & Medical website — production image (see deploy/README.md).
# Node 24: the auth store uses the built-in `node:sqlite`, and `npm run auth:create-admin`
# runs TypeScript sources directly (native type stripping).
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Baked into static pages, canonical URLs and the sitemap at build time.
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
# Demo mode (placeholder/DEMO data visible) must match at build and run time: static pages bake it in.
ARG SHOW_PLACEHOLDER_CONTENT=false
ENV SHOW_PLACEHOLDER_CONTENT=${SHOW_PLACEHOLDER_CONTENT}
RUN npm run build && npm prune --omit=dev && rm -rf .next/cache

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app /app
# Auth database lives on a mounted volume (AUTH_DB_PATH=/data/aspire.sqlite).
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node_modules/.bin/next", "start"]
