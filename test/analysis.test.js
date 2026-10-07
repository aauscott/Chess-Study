import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { classify, legalVariation, reviewGame } from '../server/review.js';
import { parseEngineLines } from '../server/engine.js';
import { providerConfig, providerRequest, validateExplanation, explainGame, modelInput } from '../server/providers.js';

const cp = (value) => ({ type: 'cp', value });
const mate = (value) => ({ type: 'mate', value });
const report = {
  color: 'b', engine: 'Stockfish 19', milliseconds: 400, moments: [2],
  moves: [{ ply: 1, color: 'w', san: 'e4', options: [] }, { ply: 2, color: 'b', san: 'f6', options: [{ id: '2-1' }] }],
};
const explanation = { summary: 'Focus on king safety.', strengths: [], practice: ['Check your opponent’s threats.'],
  moments: [{ ply: 2, explanation: 'This weakens the king.', lesson: 'Consider development.', alternativeId: '2-1' }] };

test('engine alternatives come from the same completed search depth', () => {
  const options = parseEngineLines([
    'info depth 8 seldepth 10 multipv 1 score cp 40 nodes 100 pv e2e4 e7e5',
    'info depth 8 seldepth 10 multipv 2 score cp 30 nodes 100 pv d2d4 d7d5',
    'info depth 9 seldepth 11 multipv 1 score cp 45 nodes 110 pv d2d4 d7d5',
    'info depth 9 seldepth 11 multipv 2 score cp 35 lowerbound nodes 110 pv e2e4 e7e5',
    'bestmove d2d4',
  ]);
  assert.deepEqual(options.map((option) => option.depth), [8, 8]);
  assert.deepEqual(options.map((option) => option.uci[0]), ['e2e4', 'd2d4']);
});

test('classifies losses from the mover’s perspective and handles mates separately', () => {
  assert.equal(classify(cp(80), cp(-180)).label, 'Blunder');
  assert.equal(classify(cp(-200), cp(-220)).label, 'Good');
  assert.equal(classify(cp(10), mate(-3)).label, 'Allows mate');
  assert.equal(classify(mate(2), cp(500)).label, 'Missed mate');
  assert.equal(classify(mate(2), mate(4)).severity, 0);
  assert.equal(classify(mate(-2), mate(-5)).severity, 0);
  assert.equal(classify(cp(80), cp(150)).loss, 0);
});

test('validates every variation move, including promotion', () => {
  const moves = legalVariation(new Chess().fen(), ['e2e4', 'e7e5', 'g1f3']);
  assert.deepEqual(moves.map((m) => m.san), ['e4', 'e5', 'Nf3']);
  assert.throws(() => legalVariation(new Chess().fen(), ['e2e5']));
  assert.equal(legalVariation('7k/8/8/8/8/8/p6K/8 b - - 0 42', ['a2a1q'])[0].san, 'a1=Q');
});

test('all local providers use chat completions; hosted destinations are fixed', () => {
  for (const provider of ['ollama', 'llamacpp', 'vllm']) {
    const config = providerConfig({ provider, model: 'local-model', baseUrl: 'http://localhost:9999/v1/' });
    const request = providerRequest(config, report);
    assert.equal(config.url, 'http://localhost:9999/v1/chat/completions');
    assert.equal(request.body.response_format.type, 'json_object');
    assert.equal(request.headers.Authorization, undefined);
  }
  assert.throws(() => providerConfig({ provider: 'ollama', model: 'm', baseUrl: 'https://untrusted.example/v1' }));
  const openai = providerConfig({ provider: 'openai', model: 'chosen-model', apiKey: 'test-key', baseUrl: 'http://elsewhere/v1' });
  assert.equal(openai.url, 'https://api.openai.com/v1/responses');
  assert.equal(providerRequest(openai, report).body.store, false);
  const anthropic = providerConfig({ provider: 'anthropic', model: 'chosen-model', apiKey: 'test-key' });
  assert.equal(providerRequest(anthropic, report).headers['anthropic-version'], '2023-06-01');
  assert.equal(JSON.parse(modelInput(report)).fullGame.length, 2);
});

test('rejects model references to nonexistent moves, options, and duplicate moments', () => {
  assert.deepEqual(validateExplanation(explanation, report), explanation);
  assert.throws(() => validateExplanation({ ...explanation, moments: [{ ...explanation.moments[0], ply: 1 }] }, report));
  assert.throws(() => validateExplanation({ ...explanation, moments: [{ ...explanation.moments[0], alternativeId: 'invented' }] }, report));
  assert.throws(() => validateExplanation({ ...explanation, moments: [...explanation.moments, ...explanation.moments] }, report));
  assert.throws(() => validateExplanation({ ...explanation, moments: [] }, report));
});

test('reads each provider response format and safely handles failures', async () => {
  const json = JSON.stringify(explanation);
  for (const [provider, body] of [
    ['openai', { output: [{ content: [{ type: 'output_text', text: json }] }] }],
    ['anthropic', { content: [{ type: 'text', text: json }] }],
    ['ollama', { choices: [{ message: { content: '```json\n' + json + '\n```' } }] }],
  ]) {
    const config = { provider, key: 'test-key', model: 'test', url: 'http://localhost/v1' };
    const result = await explainGame(config, report, undefined, async (_, init) => {
      assert.equal(init.redirect, 'error');
      return Response.json(body);
    });
    assert.deepEqual(result, explanation);
  }
  await assert.rejects(explainGame({ provider: 'ollama' }, report, undefined, async () => Response.json({ error: 'SECRET' }, { status: 401 })), (error) => !error.message.includes('SECRET') && /401/.test(error.message));
  await assert.rejects(explainGame({ provider: 'ollama' }, report, undefined, async () => Response.json({ choices: [{ message: { content: 'not JSON' } }] })), /valid JSON/);
});

test('real Stockfish finds a mating vulnerability and supplies legal alternatives', { timeout: 30_000 }, async () => {
  const result = await reviewGame({ pgn: '1. f3 e5 2. g4 Qh4# 0-1', color: 'w', quality: 'quick' });
  assert.equal(result.moves.length, 4);
  assert.equal(result.moves[2].label, 'Allows mate');
  assert.equal(result.moments[0], 3);
  assert.equal(result.moves[3].label, 'Best');
  for (const move of result.moves) for (const option of move.options) {
    assert.deepEqual(legalVariation(move.fen, option.line.map((m) => m.uci)), option.line);
  }
});

test('cancelling stops an active engine review', { timeout: 10_000 }, async () => {
  const controller = new AbortController();
  const review = reviewGame({ pgn: '1. e4 e5 2. Nf3 Nc6 *', color: 'b', quality: 'deep' }, controller.signal, () => controller.abort());
  await assert.rejects(review, /cancelled|aborted/i);
});

test('real Stockfish detects a missed mating opportunity for Black', { timeout: 30_000 }, async () => {
  const result = await reviewGame({ pgn: '1. f3 e5 2. g4 Nc6 *', color: 'b', quality: 'quick' });
  assert.equal(result.moves[3].label, 'Missed mate');
  assert.equal(result.moves[3].options[0].line[0].san, 'Qh4#');
  assert.equal(result.moments[0], 4);
});
