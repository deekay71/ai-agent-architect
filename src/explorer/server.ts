import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { projectExplorer, type ExplorerScope } from './projection.js';
import type { ContextWindow } from '../context/engine.js';

export interface ExplorerServer { url: string; close(): Promise<void>; server: Server }
/** Static file allowlist; the server never opens Memory for writing or accepts a mutation request. */
export async function startExplorer(options: { scope: ExplorerScope; load: () => unknown | Promise<unknown>; loadProofWindows?: () => readonly ContextWindow[] | Promise<readonly ContextWindow[]>; port?: number }): Promise<ExplorerServer> {
  const assets = new Map(await Promise.all([
    ['/', 'index.html', 'text/html; charset=utf-8'], ['/app.js', 'app.js', 'text/javascript; charset=utf-8'], ['/style.css', 'style.css', 'text/css; charset=utf-8'],
  ].map(async ([route, file, mime]) => [route!, { body: await readFile(fileURLToPath(new URL(`../../../src/explorer/web/${file}`, import.meta.url))), mime: mime! }] as const)));
  let authority = '';
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff'); response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    const reject = (code: number, message: string) => { response.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end(message); };
    if (request.headers.host !== authority || (request.headers.origin && request.headers.origin !== `http://${authority}`) || request.headers['sec-fetch-site'] === 'cross-site') {
      reject(403, 'This inspector accepts same-origin loopback requests only'); return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.setHeader('Allow', 'GET, HEAD'); reject(405, 'Read-only inspector'); return; }
    try {
      const url = new URL(request.url ?? '/', `http://${authority}`);
      if (url.search || url.hash) { reject(400, 'Scope and files cannot be selected through URL parameters'); return; }
      let body: Buffer | string, mime: string;
      if (url.pathname === '/api/snapshot') {
        body = JSON.stringify(projectExplorer(await options.load(), options.scope, await options.loadProofWindows?.() ?? [])); mime = 'application/json; charset=utf-8';
      } else {
        const asset = assets.get(url.pathname); if (!asset) { reject(404, 'Not found'); return; }
        body = asset.body; mime = asset.mime;
      }
      response.writeHead(200, { 'Content-Type': mime }); response.end(request.method === 'HEAD' ? undefined : body);
    } catch { reject(503, 'Snapshot unavailable or invalid. Re-export from the trusted Memory process.'); }
  });
  server.requestTimeout = 5000; server.headersTimeout = 5000;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(options.port ?? 0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Expected TCP loopback address');
  authority = `127.0.0.1:${address.port}`;
  return { url: `http://${authority}`, server, close: () => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }) };
}
