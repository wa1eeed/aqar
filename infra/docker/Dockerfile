# syntax=docker/dockerfile:1.7
# Multi-target build, context = repository root.
#   api              → NestJS API + worker (same image, docs/10 §3)
#   frontend-static  → public site files, copied into the `frontend` volume served by Caddy
#   admin-static     → admin SPA build, copied into the `admin` volume served by Caddy

ARG NODE_IMAGE=node:20-bookworm-slim

# ───────────── dependencies (cached by lockfile) ─────────────
FROM ${NODE_IMAGE} AS deps
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true \
    # Prisma CLI engines for the runtime platform (the build stage has no OpenSSL to detect it).
    PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/schema/package.json packages/schema/
COPY backend/package.json backend/
COPY admin/package.json admin/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ───────────── build ─────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/schema packages/schema
COPY backend backend
COPY admin admin
COPY frontend/assets/js/schema.js frontend/assets/js/schema.js
RUN pnpm --filter @nx/schema build \
 && pnpm --filter @nx/schema check:frontend \
 && pnpm --filter @nx/backend exec prisma generate \
 && pnpm --filter @nx/backend build \
 && pnpm --filter @nx/admin build
# Self-contained production install of the backend (workspace deps copied, dev deps dropped).
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @nx/backend deploy --legacy --prod /out \
 && cp -r backend/dist /out/dist \
 && cd /out && ./node_modules/.bin/prisma generate --schema prisma/schema.prisma

# ───────────── api / worker runtime ─────────────
FROM ${NODE_IMAGE} AS api
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /out ./
# Demo listings for staging (`node dist/cli/index.js seed-demo`); never used in production.
COPY --chown=node:node frontend/data/properties.js ./demo/properties.js
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]

# ───────────── static sites (copied into volumes at start) ─────────────
FROM busybox:1.36 AS static-base
CMD ["sh", "-c", "rm -rf /target/* /target/.[!.]* 2>/dev/null; cp -a /dist/. /target/ && echo copied"]

FROM static-base AS frontend-static
COPY frontend/ /dist/

FROM static-base AS admin-static
COPY --from=build /repo/admin/dist/ /dist/
