import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Server } from 'http';
import { SpiderAgent } from '../SpiderAgent.js';
import { TestCaseStore } from '../TestCaseStore.js';
import { CredentialManager } from '../CredentialManager.js';

// Fixture app with a login wall:
//   GET  /        → redirects to /login (unauthenticated) or links to /dashboard (authenticated)
//   GET  /login   → login form
//   POST /login   → sets session cookie, redirects to /dashboard
//   GET  /dashboard → only accessible after login; behind-login content

const SESSION_COOKIE = 'qa_session=authenticated';

function isAuthenticated(req: IncomingMessage): boolean {
  const cookie = req.headers['cookie'] ?? '';
  return cookie.includes('qa_session=authenticated');
}

function collectBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
  });
}

function startAuthFixtureServer(): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? '/';
      const method = req.method ?? 'GET';

      if (url === '/' && method === 'GET') {
        if (isAuthenticated(req)) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<!DOCTYPE html><html><body>
            <h1>Home (authenticated)</h1>
            <a href="/dashboard">Dashboard</a>
          </body></html>`);
        } else {
          res.writeHead(302, { Location: '/login' });
          res.end();
        }
      } else if (url === '/login' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html><html><body>
          <h1>Login</h1>
          <form method="POST" action="/login">
            <input id="username" name="username" type="text" />
            <input id="password" name="password" type="password" />
            <button id="submit" type="submit">Login</button>
          </form>
        </body></html>`);
      } else if (url === '/login' && method === 'POST') {
        const body = await collectBody(req);
        const params = new URLSearchParams(body);
        const user = params.get('username');
        const pass = params.get('password');
        if (user === 'testuser' && pass === 'testpass') {
          res.writeHead(302, {
            Location: '/dashboard',
            'Set-Cookie': SESSION_COOKIE + '; Path=/',
          });
          res.end();
        } else {
          res.writeHead(401, { 'Content-Type': 'text/html' });
          res.end('<html><body>Unauthorized</body></html>');
        }
      } else if (url === '/dashboard' && method === 'GET') {
        if (!isAuthenticated(req)) {
          res.writeHead(302, { Location: '/login' });
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html><html><body>
          <h1>Dashboard</h1>
          <a href="/">Home</a>
        </body></html>`);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<html><body>Not Found</body></html>');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

describe('SpiderAgent authenticated crawl', () => {
  let server: Server;
  let baseUrl: string;
  let tmpDir: string;
  let store: TestCaseStore;
  let savedEnv: Record<string, string | undefined> = {};

  const ENV_KEYS = [
    'LOGIN_URL', 'LOGIN_USERNAME', 'LOGIN_PASSWORD',
    'LOGIN_USERNAME_SELECTOR', 'LOGIN_PASSWORD_SELECTOR', 'LOGIN_SUBMIT_SELECTOR',
  ] as const;

  beforeAll(async () => {
    ({ server, baseUrl } = await startAuthFixtureServer());
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'qa-bot-auth-'));
    store = new TestCaseStore(tmpDir);
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  it('discovers dashboard page when credentials are provided', async () => {
    process.env['LOGIN_URL'] = `${baseUrl}/login`;
    process.env['LOGIN_USERNAME'] = 'testuser';
    process.env['LOGIN_PASSWORD'] = 'testpass';
    process.env['LOGIN_USERNAME_SELECTOR'] = '#username';
    process.env['LOGIN_PASSWORD_SELECTOR'] = '#password';
    process.env['LOGIN_SUBMIT_SELECTOR'] = '#submit';

    const credManager = new CredentialManager();
    const spider = new SpiderAgent(store, credManager);
    await spider.crawl(baseUrl);

    const testCases = await store.list();
    const urls = testCases.map((tc) => tc.url);
    expect(urls.some((u) => u.includes('/dashboard'))).toBe(true);
  });

  it('does not discover dashboard page without credentials (no regression)', async () => {
    // No env vars set — crawl proceeds unauthenticated
    const credManager = new CredentialManager();
    const spider = new SpiderAgent(store, credManager);
    await spider.crawl(baseUrl);

    const testCases = await store.list();
    const urls = testCases.map((tc) => tc.url);
    expect(urls.some((u) => u.includes('/dashboard'))).toBe(false);
  });
}, 30_000);
