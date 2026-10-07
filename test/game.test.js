import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { parseGame, EXAMPLE_PGN } from '../src/game.js';

test('example preserves every position including castling and checkmate', () => {
  const game = parseGame(EXAMPLE_PGN);
  assert.equal(game.moves.length, 33);
  assert.equal(game.positions[0], new Chess().fen());
  assert.equal(game.positions.length, 34);
  assert.equal(game.moves[22].san, 'O-O-O');
  assert.equal(new Chess(game.positions[23]).get('c1').type, 'k');
  assert.equal(new Chess(game.positions.at(-1)).isCheckmate(), true);
});

test('rejects empty, malformed, and multiple-game PGNs', () => {
  for (const pgn of ['', '[Event "No moves"]', '1. e4 e5 2. Qh9', `${EXAMPLE_PGN}\n\n${EXAMPLE_PGN}`]) {
    assert.throws(() => parseGame(pgn));
  }
});

test('handles comments and en passant', () => {
  const game = parseGame('1. e4 {hello} a6 2. e5 d5 3. exd6 *');
  const final = new Chess(game.positions.at(-1));
  assert.equal(final.get('d5'), undefined);
  assert.equal(final.get('d6').color, 'w');
});

test('respects custom starting positions, black to move, and promotion', () => {
  const fen = '7k/8/8/8/8/8/p6K/8 b - - 0 42';
  const game = parseGame(`[SetUp "1"]\n[FEN "${fen}"]\n\n42... a1=Q *`);
  assert.equal(game.positions[0], fen);
  assert.equal(game.moves[0].color, 'b');
  assert.equal(new Chess(game.positions[1]).get('a1').type, 'q');
});
