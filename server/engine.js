import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const enginePath = join(dirname(require.resolve('stockfish/package.json')), 'bin/stockfish-19-single.js');

export function parseEngineLines(lines) {
  const depths = new Map();
  let count = 0;
  for (const line of lines) {
    const match = line.match(/^info depth (\d+).*?multipv (\d+).*?score (cp|mate) (-?\d+)(.*?) pv (.+)$/);
    if (!match || /bound/.test(match[5])) continue;
    const depth = Number(match[1]), rank = Number(match[2]);
    if (!depths.has(depth)) depths.set(depth, new Map());
    count = Math.max(count, rank);
    depths.get(depth).set(rank, {
      depth, score: { type: match[3], value: Number(match[4]) },
      uci: match[6].trim().split(/\s+/).slice(0, 12),
    });
  }
  // A time cutoff may interrupt a MultiPV iteration. Use the last complete
  // depth so stale options cannot be mixed with a newer ranking.
  const complete = [...depths.entries()].filter(([, options]) => options.size === count).sort((a, b) => b[0] - a[0])[0];
  if (!complete) throw new Error('Stockfish returned no usable moves for a position.');
  return [...complete[1].entries()].sort((a, b) => a[0] - b[0]).map(([, value]) => value);
}

// Each review owns a subprocess: cancellation stops its CPU work immediately.
export class Engine {
  constructor(signal) {
    signal?.throwIfAborted();
    this.child = spawn(process.execPath, [enginePath], { stdio: ['pipe', 'pipe', 'ignore'] });
    this.lines = createInterface({ input: this.child.stdout });
    this.failure = null;
    this.child.on('error', () => this.fail(new Error('Could not start Stockfish. Run npm install again.')));
    this.child.on('exit', () => this.fail(new Error('Stockfish stopped before the review finished.')));
    this.child.stdin.on('error', () => this.fail(new Error('Stockfish connection closed.')));
    this.abort = () => { this.fail(new Error('Analysis cancelled.')); this.close(); };
    this.signal = signal;
    signal?.addEventListener('abort', this.abort, { once: true });
  }

  fail(error) { this.failure = error; this.rejectPending?.(error); }

  command(commands, until, timeout = 15_000) {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const output = [];
      const finish = (error) => {
        clearTimeout(timer);
        this.lines.off('line', onLine);
        this.rejectPending = null;
        error ? reject(error) : resolve(output);
      };
      const onLine = (line) => { output.push(line); if (until(line)) finish(); };
      const timer = setTimeout(() => finish(new Error('Stockfish timed out. Try the review again.')), timeout);
      this.rejectPending = finish;
      this.lines.on('line', onLine);
      this.child.stdin.write(commands.join('\n') + '\n');
    });
  }

  async start() {
    await this.command(['uci'], (line) => line === 'uciok');
    await this.command(['setoption name Hash value 64', 'ucinewgame', 'isready'], (line) => line === 'readyok');
  }

  async evaluate(startFen, history, milliseconds, forcedMove) {
    const lines = await this.command([
      `setoption name MultiPV value ${forcedMove ? 1 : 3}`,
      `position fen ${startFen}${history.length ? ' moves ' + history.join(' ') : ''}`,
      `go movetime ${milliseconds}${forcedMove ? ' searchmoves ' + forcedMove : ''}`,
    ], (line) => line.startsWith('bestmove'), milliseconds + 15_000);
    return parseEngineLines(lines);
  }

  close() {
    this.signal?.removeEventListener('abort', this.abort);
    this.lines.close();
    this.child.kill();
  }
}
