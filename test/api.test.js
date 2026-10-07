import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { analysisMiddleware } from '../server/api.js';

async function request({ origin, host = '127.0.0.1:5173', contentType = 'application/json', body = '{}' } = {}) {
  const req = Readable.from([body]);
  Object.assign(req, { url: '/api/analyze', method: 'POST', headers: { host, origin, 'content-type': contentType } });
  const res = new EventEmitter();
  Object.assign(res, { output: '', headersSent: false, writableEnded: false,
    setHeader() {}, writeHead(status) { this.status = status; this.headersSent = true; },
    write(text) { this.output += text; }, end(text = '') { this.output += text; this.writableEnded = true; },
  });
  await analysisMiddleware()(req, res, () => {});
  return res;
}

test('local analysis endpoint blocks cross-origin and non-local hosts', async () => {
  assert.equal((await request({ origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await request({ host: 'untrusted.example' })).status, 403);
  assert.equal((await request({ contentType: 'text/plain' })).status, 415);
  assert.equal((await request({ body: '{' })).status, 400);
});

test('streams engine progress and a complete report', { timeout: 30_000 }, async () => {
  const res = await request({ origin: 'http://127.0.0.1:5173', body: JSON.stringify({ pgn: '1. f3 e5 2. g4 Qh4# 0-1', color: 'b', quality: 'quick', settings: { provider: 'engine' } }) });
  const events = res.output.trim().split('\n').map(JSON.parse);
  assert.equal(res.status, 200);
  assert.equal(events[0].type, 'progress');
  assert.equal(events.at(-1).type, 'done');
  const report = events.find((event) => event.type === 'report').report;
  assert.equal(report.color, 'b');
  assert.equal(report.moves.length, 4);
  assert.ok(report.moments.every((ply) => report.moves[ply - 1].color === 'b'));
});
