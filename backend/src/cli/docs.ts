/**
 * Generates the reference part of the technical documentation from the code itself
 * (docs/technical/reference/*.md), so it can never drift from the platform:
 *   api-endpoints · environment · permissions · events · settings · error-codes · data-model
 *
 *   pnpm run docs     → write the files
 *   pnpm docs:check   → exit 1 if a file is stale (CI)
 *
 * Nothing is instantiated: routes come from decorator metadata, descriptions from JSDoc (TypeScript
 * compiler API), the data model from Prisma's DMMF. No database or Redis is needed.
 */
import 'reflect-metadata';
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod, type Type } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import type { z } from 'zod';
import { AppModule } from '../app.module';
import { API_PREFIX, SITE_ROUTES } from '../bootstrap';
import { AUDIENCE, PERMS, RECENT_AUTH } from '../common/auth/decorators';
import { PERMISSIONS, SYSTEM_ROLES } from '../common/auth/permissions';
import { IS_PUBLIC } from '../common/auth/public.decorator';
import { DEFAULT_ERRORS } from '../common/errors/app-exception';
import { RATE_LIMIT, type RateLimitRule } from '../common/rate-limit/rate-limit.decorator';
import { REQUIRE_CSRF } from '../common/security/csrf.guard';
import { envSchema } from '../config/env';
import { EVENT_CATALOG } from '../modules/events/event-catalog';
import { SETTINGS_SECTIONS } from '../modules/settings/schemas';

const ROOT = resolve(__dirname, '../../..');
const SRC = resolve(ROOT, 'backend/src');
const OUT = resolve(ROOT, 'docs/technical/reference');
const HEADER = (title: string) =>
  `# ${title}\n\n> **Generated** by \`pnpm run docs\` from the source code — do not edit by hand.\n> Regenerate after any change; CI runs \`pnpm docs:check\`.\n\n`;

// ───────────── helpers ─────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}
const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
const firstSentence = (s: string) => {
  // Abbreviations such as "e.g." / "i.e." do not end a sentence.
  const t = s
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b(e\.g|i\.e|etc)\./g, '$1\u2024');
  const m = /^(.+?[.!؟?])(\s|$)/.exec(t);
  return (m ? m[1]! : t).replace(/\u2024/g, '.').slice(0, 220);
};

/** `Class.method` and `Class` → first sentence of its JSDoc. */
function jsdocIndex(files: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('@Controller')) continue;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
    const doc = (node: ts.Node): string | null => {
      const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
      const jsdoc = ranges
        .map((r) => text.slice(r.pos, r.end))
        .filter((c) => c.startsWith('/**'))
        .pop();
      if (!jsdoc) return null;
      return jsdoc
        .replace(/^\/\*\*|\*\/$/g, '')
        .split('\n')
        .map((l) => l.replace(/^\s*\*\s?/, ''))
        .join(' ')
        .trim();
    };
    sf.forEachChild((node) => {
      if (!ts.isClassDeclaration(node) || !node.name) return;
      const cls = node.name.text;
      const cd = doc(node);
      if (cd) map.set(cls, firstSentence(cd));
      for (const m of node.members) {
        if (ts.isMethodDeclaration(m) && m.name && ts.isIdentifier(m.name)) {
          const md = doc(m);
          if (md) map.set(`${cls}.${m.name.text}`, firstSentence(md));
        }
      }
    });
  }
  return map;
}

/** Every controller reachable from AppModule (static module metadata, no instantiation). */
function controllers(): Type[] {
  const seen = new Set<unknown>();
  const out: Type[] = [];
  const visit = (mod: unknown) => {
    const m = (mod as { module?: unknown })?.module ?? mod;
    if (!m || seen.has(m)) return;
    seen.add(m);
    for (const c of (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, m as object) as Type[] | undefined) ?? [])
      out.push(c);
    for (const i of (Reflect.getMetadata(MODULE_METADATA.IMPORTS, m as object) as unknown[] | undefined) ?? [])
      visit(i);
  };
  visit(AppModule);
  return out;
}

// ───────────── generators ─────────────

const undocumented: string[] = [];

function apiEndpoints(): string {
  const docs = jsdocIndex(walk(SRC));
  const rows: Array<{ tag: string; method: string; path: string; line: string }> = [];
  for (const ctrl of controllers()) {
    const base = String(Reflect.getMetadata(PATH_METADATA, ctrl) ?? '');
    const tags = (Reflect.getMetadata('swagger/apiUseTags', ctrl) as string[] | undefined) ?? [base || ctrl.name];
    const proto = ctrl.prototype as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;
      const fn = proto[name];
      if (typeof fn !== 'function') continue;
      const path = Reflect.getMetadata(PATH_METADATA, fn) as string | undefined;
      const method = Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod | undefined;
      if (path === undefined || method === undefined) continue;
      const meta = <T>(key: string): T | undefined =>
        (Reflect.getMetadata(key, fn) as T | undefined) ?? (Reflect.getMetadata(key, ctrl) as T | undefined);
      const isPublic = !!meta<boolean>(IS_PUBLIC);
      const audience = meta<string>(AUDIENCE);
      const perms = meta<string[]>(PERMS) ?? [];
      const access = isPublic ? 'public' : audience === 'any' ? 'any signed-in' : (audience ?? '—');
      const limits = (meta<RateLimitRule[]>(RATE_LIMIT) ?? [])
        .map(
          (r) => `${r.limit}/${r.windowSec >= 3600 ? `${r.windowSec / 3600}h` : `${r.windowSec / 60}min`} per ${r.by}`,
        )
        .join(', ');
      const local = [base, path]
        .map((s) => s.replace(/^\/|\/$/g, ''))
        .filter(Boolean)
        .join('/');
      // Site routes (docs/02 §8) are excluded from the /api/v1 prefix.
      const full = `/${(SITE_ROUTES as readonly string[]).includes(local) ? local : `${API_PREFIX}/${local}`}`;
      const verb = RequestMethod[method];
      const desc = docs.get(`${ctrl.name}.${name}`) ?? '';
      if (!desc) undocumented.push(`${ctrl.name}.${name} ${RequestMethod[method]} ${full}`);
      rows.push({
        tag: tags[0]!,
        method: verb,
        path: full,
        line: `| \`${verb}\` | \`${full}\` | ${access} | ${perms.map((p) => `\`${p}\``).join(' ') || '—'} | ${
          meta<boolean>(RECENT_AUTH) ? 'yes' : ''
        } | ${meta<boolean>(REQUIRE_CSRF) ? 'yes' : ''} | ${limits} | ${esc(desc)} |`,
      });
    }
  }
  rows.sort((a, b) => a.tag.localeCompare(b.tag) || a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  const byTag = new Map<string, string[]>();
  for (const r of rows) byTag.set(r.tag, [...(byTag.get(r.tag) ?? []), r.line]);
  let md = HEADER('API endpoints');
  md += `Base path \`/${API_PREFIX}\`. **${rows.length} endpoints.** Access: \`public\` (no token; a valid token is still read),\n`;
  md += '`staff`, `customer` or `any signed-in`. Every listed permission is required. *Re-auth* = password/TOTP\n';
  md += 'within the last 10 minutes (`REAUTH_REQUIRED`). *CSRF* = header `X-Requested-With: nx` required.\n';
  md += 'Public GETs without a rule share the default limit of 120/min per IP. Request/response schemas:\n';
  md += 'Swagger UI at `/api/docs` (non-production, `SWAGGER_ENABLED=true`).\n\n';
  for (const [tag, lines] of byTag) {
    md += `## ${tag}\n\n| Method | Path | Access | Permissions | Re-auth | CSRF | Rate limit | Description |\n|---|---|---|---|---|---|---|---|\n`;
    md += `${lines.join('\n')}\n\n`;
  }
  return md;
}

/** Descriptions are required: adding a variable without documenting it fails `pnpm run docs`. */
const ENV_DOCS: Record<string, string> = {
  NODE_ENV: '`development` · `test` · `staging` · `production`. Staging/production never print emails or codes.',
  PORT: 'HTTP port of the API process.',
  LOG_LEVEL: 'pino log level. Logs are JSON; secrets are redacted.',
  PUBLIC_URL:
    'Public origin of the site (https in production). Used in emails, callbacks and the WebSocket origin check.',
  TRUST_PROXY_HOPS:
    'Number of reverse proxies in front of the API (Caddy = 1; Coolify proxy + Caddy = 2). Rate limits and audit IPs depend on it.',
  DATABASE_URL: 'PostgreSQL 16 connection string.',
  REDIS_URL: 'Redis 7 (cache, rate limits, sessions revocation, BullMQ, Socket.IO adapter).',
  APP_ENCRYPTION_KEY:
    'AES-256-GCM key (base64 of 32 bytes) for integration secrets and TOTP secrets. `openssl rand -base64 32`.',
  APP_ENCRYPTION_KEY_PREVIOUS: 'Previous key, only while running `rotate-encryption-key`.',
  JWT_ACCESS_SECRET: 'HS256 secret for 15-minute access tokens (≥ 32 chars, different from the refresh secret).',
  JWT_REFRESH_SECRET: 'Secret for refresh-token hashing (≥ 32 chars).',
  NATIONAL_ID_PEPPER: 'Pepper for national ID hashes (≥ 32 chars).',
  RESEND_API_KEY: 'Optional bootstrap value for the Resend integration; the value saved in the admin panel wins.',
  R2_ACCOUNT_ID: 'Optional bootstrap value for Cloudflare R2 (admin panel wins).',
  R2_ACCESS_KEY_ID: 'Optional bootstrap value for Cloudflare R2.',
  R2_SECRET_ACCESS_KEY: 'Optional bootstrap value for Cloudflare R2.',
  R2_UPLOADS_BUCKET: 'Private bucket (transfer receipts, original uploads).',
  R2_MEDIA_BUCKET: 'Public media bucket (listing photo variants).',
  R2_PUBLIC_BASE_URL: 'CDN base URL of the media bucket.',
  SWAGGER_ENABLED: '`true` serves Swagger UI at `/api/docs` (never in production).',
  SENTRY_DSN: 'Optional error tracking DSN.',
  CHROMIUM_PATH:
    'Chromium binary for receipt PDFs (worker). Set in the Docker image (`/usr/bin/chromium`); without it receipts are emailed without a PDF and downloads answer 503.',
};
function environment(): string {
  const shape = (envSchema as unknown as { _def: { schema: z.AnyZodObject } })._def.schema.shape;
  let md = HEADER('Environment variables (API and worker)');
  md += 'Validated at boot by `backend/src/config/env.ts`: the process refuses to start with a missing or weak\n';
  md += 'value and never prints values. Production template: `infra/.env.example`; local: `backend/.env.example`.\n\n';
  md += '| Variable | Required | Default | Description |\n|---|---|---|---|\n';
  for (const [key, schema] of Object.entries(shape)) {
    const desc = ENV_DOCS[key];
    if (!desc) throw new Error(`docs: environment variable ${key} has no description in src/cli/docs.ts (ENV_DOCS)`);
    const s = schema as z.ZodTypeAny;
    const optional = s.isOptional();
    let def = '';
    const parsed = s.safeParse(undefined);
    if (parsed.success && parsed.data !== undefined) def = `\`${String(parsed.data)}\``;
    md += `| \`${key}\` | ${optional ? 'no' : 'yes'} | ${def} | ${esc(desc)} |\n`;
  }
  return md;
}

function permissions(): string {
  let md = HEADER('Roles and permissions');
  md += 'System roles are seeded and read-only (docs/03 §3). "own" scope = agents see only their listings,\n';
  md += 'assigned leads, own viewings and linked customers (enforced in services by `AccessScopeService`;\n';
  md += 'out-of-scope rows answer 404). Custom roles can be created in the admin panel.\n\n';
  md += `| Permission | ${SYSTEM_ROLES.map((r) => `${r.key}`).join(' | ')} |\n|---|${SYSTEM_ROLES.map(() => ':-:').join('|')}|\n`;
  for (const p of PERMISSIONS) {
    md += `| \`${p}\` | ${SYSTEM_ROLES.map((r) => ((r.permissions as readonly string[]).includes(p) ? (r.scope === 'own' ? 'own' : '✓') : '')).join(' | ')} |\n`;
  }
  md += `\n| Role | Arabic name | Mandatory 2FA | Scope |\n|---|---|---|---|\n`;
  for (const r of SYSTEM_ROLES) md += `| \`${r.key}\` | ${r.nameAr} | ${r.requires2fa ? 'yes' : 'no'} | ${r.scope} |\n`;
  return md;
}

function events(): string {
  let md = HEADER('Domain events and notification defaults');
  md += 'Keys are final (docs/06 §3). Emitted with `EventEmitter2` **after** the database transaction commits;\n';
  md += 'recipients and texts live in `backend/src/modules/notifications/notification-rules.ts`. Default channels\n';
  md += 'can be changed by admins (`settings.notifications.channels`) and by each recipient (preferences).\n';
  md +=
    '*Locked* events cannot be turned off by recipients.\n\n| Event | In-app | Email | SMS | Locked |\n|---|:-:|:-:|:-:|:-:|\n';
  for (const e of EVENT_CATALOG) {
    md += `| \`${e.key}\` | ${e.defaults.inApp ? '✓' : ''} | ${e.defaults.email ? '✓' : ''} | ${e.defaults.sms ? '✓' : ''} | ${e.locked ? 'yes' : ''} |\n`;
  }
  md += '\n### Realtime (Socket.IO `/ws`)\n\n| Server → client event | Rooms | Payload |\n|---|---|---|\n';
  md +=
    '| `notification.new` | `staff:{id}` / `customer:{id}` | `{ id, eventKey, title, body, link, priority, createdAt }` |\n';
  md += '| `notification.count` | same | `{ unread }` |\n';
  md +=
    '| `lead.created` / `lead.updated` | `role:{key}` (roles with `leads.view`, unrestricted scope), `staff:{assignee}` | `{ id, number, stage, assignedToId }` |\n';
  md += '| `property.updated` | `property:{id}`, `public` | `{ id, status, price (SAR), visibility }` |\n';
  md += '| `property.published` / `property.unpublished` | `public` (+ `property:{id}`) | `{ id }` |\n';
  md += '| `auth.invalid` | the socket | `{}` — the token was rejected; refresh and reconnect |\n';
  md +=
    '\nClient → server: `subscribe:property {id}`, `unsubscribe:property {id}`, `notifications:read {ids}` (validated; others ignored).\n';
  return md;
}

function settings(): string {
  let md = HEADER('Settings sections and defaults');
  md += 'Edited in the admin panel (`GET/PUT /api/v1/admin/settings/:section`), validated by the zod schemas in\n';
  md += '`backend/src/modules/settings/schemas/`, cached in Redis and audited. Defaults below are what a fresh\n';
  md += 'installation uses. Money values are halalas.\n\n';
  for (const [key, def] of Object.entries(SETTINGS_SECTIONS)) {
    const value = (def.schema as z.ZodTypeAny).parse({});
    md += `## \`${key}\`\n\nEditable with \`${def.permission}\`.\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n\n`;
  }
  return md;
}

function errorCodes(): string {
  const found = new Map<string, { status: Set<string>; message: string; files: Set<string> }>();
  const re = /new AppException\(\s*'([A-Z0-9_]+)'\s*,\s*(\d{3})\s*,\s*(?:'([^']*)'|`([^`]*)`)/g;
  for (const file of walk(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(re)) {
      const entry = found.get(m[1]!) ?? { status: new Set(), message: m[3] ?? m[4] ?? '', files: new Set() };
      entry.status.add(m[2]!);
      entry.files.add(relative(ROOT, file).replace(/^backend\/src\//, ''));
      found.set(m[1]!, entry);
    }
  }
  let md = HEADER('Error codes');
  md += 'Every error has the shape `{ "error": { "code", "message", "details", "correlationId" } }` (docs/02 §1).\n';
  md += '`VALIDATION_FAILED` carries `details.fields` (field → message code). Messages are Arabic and safe to show.\n';
  md += 'Generic codes returned by the exception filter for framework errors (by HTTP status), plus\n';
  md += '`VALIDATION_FAILED` (400) for DTO validation and `INVALID_JSON` (400) for malformed bodies:\n\n';
  md += '| HTTP | Code | Message |\n|---|---|---|\n';
  for (const [status, d] of Object.entries(DEFAULT_ERRORS).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    md += `| ${status} | \`${d.code}\` | ${esc(d.message)} |\n`;
  }
  md += '\nCodes thrown by the application:\n\n';
  md += '| Code | HTTP | Example message | Thrown in |\n|---|---|---|---|\n';
  for (const [code, e] of [...found].sort((a, b) => a[0].localeCompare(b[0]))) {
    md += `| \`${code}\` | ${[...e.status].sort().join(', ')} | ${esc(e.message)} | ${[...e.files].sort().join('<br>')} |\n`;
  }
  return md;
}

function dataModel(): string {
  const dm = Prisma.dmmf.datamodel;
  let md = HEADER('Data model');
  md += 'Source of truth: `backend/prisma/schema.prisma` (from docs/01) and its migrations. Money columns are\n';
  md += 'halalas (`BigInt`). Extra SQL in the init migration: `pg_trgm`/`unaccent` search indexes, the partial\n';
  md += 'unique index `one_active_booking` (one active booking per property) and CHECK constraints.\n\n';
  md += '```mermaid\nerDiagram\n';
  const rels = new Set<string>();
  for (const m of dm.models) {
    for (const f of m.fields) {
      if (f.kind !== 'object' || !f.relationFromFields?.length) continue;
      const card = f.isRequired ? '||' : 'o|';
      rels.add(`  ${f.type} ${card}--o{ ${m.name} : "${f.name}"`);
    }
  }
  md += `${[...rels].sort().join('\n')}\n\`\`\`\n\n`;
  md += `## Enums\n\n| Enum | Values |\n|---|---|\n`;
  for (const e of dm.enums) md += `| \`${e.name}\` | ${e.values.map((v) => `\`${v.name}\``).join(' ')} |\n`;
  md += '\n## Models\n\n';
  for (const m of dm.models) {
    md += `### ${m.name}\n\n| Field | Type | Notes |\n|---|---|---|\n`;
    for (const f of m.fields) {
      const notes = [
        f.isId ? 'PK' : '',
        f.isUnique ? 'unique' : '',
        f.isRequired ? '' : 'optional',
        f.isList ? 'list' : '',
        f.hasDefaultValue ? 'default' : '',
        f.kind === 'object'
          ? `relation${f.relationFromFields?.length ? ` (${f.relationFromFields.join(', ')})` : ''}`
          : '',
        f.isUpdatedAt ? 'updatedAt' : '',
      ].filter(Boolean);
      md += `| \`${f.name}\` | \`${f.type}\` | ${notes.join(', ')} |\n`;
    }
    const uniques = m.uniqueFields.map((u) => `(${u.join(', ')})`);
    if (uniques.length) md += `\nComposite unique: ${uniques.join(' · ')}\n`;
    md += '\n';
  }
  return md;
}

function index(files: string[]): string {
  let md = HEADER('Reference (generated)');
  md += 'Facts generated from the code. The hand-written guides are one level up (`docs/technical/`).\n\n';
  for (const f of files) md += `- [${f.replace(/\.md$/, '').replace(/-/g, ' ')}](./${f})\n`;
  return md;
}

// ───────────── main ─────────────

function main(): void {
  const check = process.argv.includes('--check');
  const outputs: Record<string, string> = {
    'api-endpoints.md': apiEndpoints(),
    'environment.md': environment(),
    'permissions.md': permissions(),
    'events.md': events(),
    'settings.md': settings(),
    'error-codes.md': errorCodes(),
    'data-model.md': dataModel(),
  };
  outputs['README.md'] = index(Object.keys(outputs));
  if (undocumented.length) {
    // Every endpoint needs a one-line JSDoc on its controller method (it becomes its description here).
    console.error(
      `endpoints without a description (add a /** … */ comment on the method):\n  ${undocumented.join('\n  ')}`,
    );
    process.exit(1);
  }
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  const stale: string[] = [];
  for (const [name, content] of Object.entries(outputs)) {
    const path = join(OUT, name);
    const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (current === content) continue;
    if (check) stale.push(name);
    else writeFileSync(path, content);
  }
  if (check && stale.length) {
    console.error(`docs/technical/reference is stale: ${stale.join(', ')}\nRun: pnpm run docs`);
    process.exit(1);
  }
  console.log(
    check
      ? 'docs/technical/reference is up to date'
      : `wrote ${Object.keys(outputs).length} files to docs/technical/reference`,
  );
}

main();
