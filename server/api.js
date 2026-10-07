import { reviewGame } from './review.js';
import { providerConfig, explainGame } from './providers.js';

export function analysisMiddleware() {
  let busy = false;
  return async (req, res, next) => {
    if (req.url?.split('?')[0] !== '/api/analyze') return next();
    res.setHeader('Cache-Control', 'no-store');
    const reject = (status, message) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: message })); };
    // The app is local-only. Reject cross-origin browser requests before reading keys.
    const host = req.headers.host;
    if (!host || !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)
      || (req.headers.origin && req.headers.origin !== `http://${host}`)
      || req.headers['sec-fetch-site'] === 'cross-site') return reject(403, 'Use the app from its local address.');
    if (req.method !== 'POST') return reject(405, 'Use POST.');
    if (!req.headers['content-type']?.startsWith('application/json')) return reject(415, 'Use JSON.');
    if (busy) return reject(409, 'A review is already running. Wait for it to finish or cancel it.');
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    const send = (type, data) => { if (!res.destroyed) res.write(JSON.stringify({ type, ...data }) + '\n'); };
    let acquired = false;
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 1_100_000) return reject(413, 'The request is too large.');
      }
      let input;
      try { input = JSON.parse(body); } catch { return reject(400, 'Invalid JSON.'); }
      if (!input || typeof input.pgn !== 'string' || input.pgn.length > 1_000_000) return reject(400, 'Include a valid PGN.');
      const config = input.settings?.provider && input.settings.provider !== 'engine' ? providerConfig(input.settings) : null;
      if (busy) return reject(409, 'A review is already running.');
      busy = true;
      acquired = true;
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'X-Content-Type-Options': 'nosniff' });
      const report = await reviewGame(input, controller.signal, (progress) => send('progress', progress));
      send('report', { report });
      if (config) {
        send('progress', { completed: report.moves.length, total: report.moves.length, message: 'Writing your model explanation…' });
        try { send('explanation', { explanation: await explainGame(config, report, controller.signal), provider: config.provider, model: config.model }); }
        catch (error) { if (!controller.signal.aborted) send('warning', { message: error.message }); }
      }
      send('done', {});
    } catch (error) {
      if (!res.headersSent) reject(400, error.message);
      else if (!controller.signal.aborted) send('error', { message: error.message });
    } finally {
      if (acquired) busy = false;
      if (!res.writableEnded) res.end();
    }
  };
}
