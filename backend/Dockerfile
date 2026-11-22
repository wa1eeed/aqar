# عقار أونلاين — backend (api و worker يشتركان نفس الصورة). سياق البناء = جذر المستودع.
FROM node:20-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# تثبيت الاعتماديات (طبقة مخزّنة)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY packages/schema/package.json packages/schema/
COPY backend/package.json backend/
RUN pnpm install --frozen-lockfile

# المصدر والبناء
COPY packages/schema packages/schema
COPY backend backend
# DATABASE_URL وهمي لـ prisma generate وقت البناء (لا يتصل بقاعدة)
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
RUN pnpm --filter @manzilah/schema build \
 && pnpm --filter @manzilah/backend exec prisma generate \
 && pnpm --filter @manzilah/backend build

FROM node:20-bookworm-slim AS runtime
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/backend
EXPOSE 3000
CMD ["node", "dist/main.js"]
