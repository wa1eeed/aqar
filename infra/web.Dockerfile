# عقار أونلاين — صورة الويب (Caddy) لكوليفاي: تخبز Caddyfile + الواجهة العامة + لوحة الإدارة
# داخل الصورة (بلا bind-mount من المضيف). سياق البناء = جذر المستودع.

# مرحلة ١: بناء لوحة الإدارة (SPA)
FROM node:20-bookworm-slim AS admin
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY packages/schema/package.json packages/schema/
COPY admin/package.json admin/
RUN pnpm install --frozen-lockfile --prod=false
COPY packages/schema packages/schema
COPY admin admin
RUN pnpm --filter @manzilah/admin build

# مرحلة ٢: Caddy مع كلّ الملفّات الثابتة مخبوزة
FROM caddy:2-alpine
COPY infra/Caddyfile.coolify /etc/caddy/Caddyfile
COPY platform /srv/platform
COPY frontend /srv/frontend
COPY --from=admin /app/admin/dist /srv/admin
EXPOSE 80
