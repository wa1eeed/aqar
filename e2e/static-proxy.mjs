// مُخدِّم بسيط للواجهة العامة الثابتة (frontend/) مع توكيل /api و/ws إلى الباكند (:3000).
// يتيح تشغيل الموقع العام على نفس الأصل كما في الإنتاج (Caddy)، لاختبارات Playwright.
import { createServer, request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..', 'frontend'));
const PORT = Number(process.env.PORT || 4173);
const API = { host: '127.0.0.1', port: Number(process.env.API_PORT || 3000) };

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function proxy(req, res) {
  const p = httpRequest(
    { host: API.host, port: API.port, path: req.url, method: req.method, headers: { ...req.headers, host: `${API.host}:${API.port}` } },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  p.on('error', () => {
    res.writeHead(502);
    res.end('proxy error');
  });
  req.pipe(p);
}

async function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/' || urlPath.endsWith('/')) urlPath += 'index.html';
  const full = normalize(join(ROOT, urlPath));
  if (!full.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  try {
    const body = await readFile(full);
    res.writeHead(200, { 'content-type': TYPES[extname(full)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    // صفحة SPA للمسارات غير الموجودة: جرّب index.html للمسارات بلا امتداد
    if (!extname(full)) {
      try {
        res.writeHead(200, { 'content-type': TYPES['.html'] });
        res.end(await readFile(join(ROOT, 'index.html')));
        return;
      } catch {
        /* fallthrough */
      }
    }
    res.writeHead(404, { 'content-type': TYPES['.html'] });
    res.end('<!doctype html><h1>404</h1>');
  }
}

createServer((req, res) => {
  const url = req.url || '/';
  if (url.startsWith('/api') || url.startsWith('/ws') || url.startsWith('/theme.css') || url.startsWith('/robots.txt') || url.startsWith('/sitemap')) {
    proxy(req, res);
  } else {
    void serveStatic(req, res);
  }
}).listen(PORT, () => {
  console.log(`static+proxy على http://localhost:${PORT} (api→:${API.port}) جذر=${ROOT}`);
});
