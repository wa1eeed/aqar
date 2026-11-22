# عقار أونلاين — بناء لوحة الإدارة (SPA) إلى ملفّات ثابتة يقدّمها Caddy من حجم مشترك.
# سياق البناء = جذر المستودع.
FROM node:20-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# الاعتماديات (طبقة مخزّنة)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY packages/schema/package.json packages/schema/
COPY admin/package.json admin/
RUN pnpm install --frozen-lockfile

# المصدر والبناء (اللوحة تستورد @manzilah/schema من المصدر عبر alias في vite)
COPY packages/schema packages/schema
COPY admin admin
RUN pnpm --filter @manzilah/admin build

# صورة خفيفة تنسخ الناتج إلى الحجم المشترك عند الإقلاع ثم تنتهي.
FROM alpine:3.20
COPY --from=build /app/admin/dist /dist
# يُستدعى كخدمة لمرّة واحدة: ينظّف الحجم ثم ينسخ البناء إليه.
CMD ["sh", "-c", "rm -rf /out/* && cp -a /dist/. /out/ && echo 'admin/dist جاهزة في الحجم المشترك'"]
