import { Chess } from 'chess.js';
import { parseGame } from '../src/game.js';
import { Engine } from './engine.js';

export const SEARCH_TIMES = { quick: 120, standard: 400, deep: 1200 };
export const uciMove = (move) => move.from + move.to + (move.promotion || '');

export function legalVariation(fen, uci) {
  const chess = new Chess(fen);
  return uci.map((notation) => {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(notation)) throw new Error('Invalid engine move.');
    const move = chess.move({ from: notation.slice(0, 2), to: notation.slice(2, 4), promotion: notation[4] });
    return { uci: notation, san: move.san, from: move.from, to: move.to, fen: chess.fen() };
  });
}

export function classify(best, played, sameMove = false) {
  if (sameMove) return { label: 'Best', loss: 0, severity: 0 };
  if (best.type === 'mate' && best.value > 0 && !(played.type === 'mate' && played.value > 0)) {
    return { label: 'Missed mate', loss: null, severity: 5 };
  }
  if (played.type === 'mate' && played.value < 0 && !(best.type === 'mate' && best.value < 0)) {
    return { label: 'Allows mate', loss: null, severity: 5 };
  }
  if (best.type === 'mate' || played.type === 'mate') return { label: 'Mate line', loss: null, severity: 0 };
  const loss = Math.max(0, best.value - played.value);
  const label = loss >= 200 ? 'Blunder' : loss >= 100 ? 'Mistake' : loss >= 50 ? 'Inaccuracy' : 'Good';
  return { label, loss, severity: loss >= 200 ? 4 : loss >= 100 ? 3 : loss >= 50 ? 2 : 0 };
}

export async function reviewGame({ pgn, color, quality }, signal, progress = () => {}) {
  const game = parseGame(pgn);
  if (!['w', 'b'].includes(color)) throw new Error('Choose White or Black to review.');
  const milliseconds = SEARCH_TIMES[quality];
  if (!milliseconds) throw new Error('Choose a valid review depth.');
  if (game.moves.length > 600) throw new Error('Please use a game with no more than 600 half-moves.');
  const engine = new Engine(signal);
  const moves = [];
  const history = [];
  try {
    await engine.start();
    for (const [index, move] of game.moves.entries()) {
      signal?.throwIfAborted();
      progress({ completed: index, total: game.moves.length, message: `Checking move ${index + 1} of ${game.moves.length}…` });
      const candidates = await engine.evaluate(game.positions[0], history, milliseconds);
      const actualUci = uciMove(move);
      const played = candidates.find((line) => line.uci[0] === actualUci)
        || (await engine.evaluate(game.positions[0], history, milliseconds, actualUci))[0];
      // Scores are always from the player-to-move's perspective, never White-only.
      const assessment = classify(candidates[0].score, played.score, candidates[0].uci[0] === actualUci);
      const options = candidates.map((line, rank) => ({
        id: `${index + 1}-${rank + 1}`, rank: rank + 1, score: line.score, depth: line.depth,
        line: legalVariation(move.before, line.uci),
      }));
      moves.push({
        ply: index + 1, number: Number(move.before.split(' ')[5]), color: move.color,
        san: move.san, from: move.from, to: move.to, fen: move.before,
        ...assessment, bestScore: candidates[0].score, playedScore: played.score,
        playedLine: legalVariation(move.before, played.uci), options,
      });
      history.push(actualUci);
    }
  } finally { engine.close(); }
  const selected = moves.filter((move) => move.color === color);
  const moments = selected.filter((move) => move.severity > 0)
    .sort((a, b) => b.severity - a.severity || (b.loss || 0) - (a.loss || 0)).slice(0, 6).map((move) => move.ply);
  return {
    version: 1, color, quality, engine: 'Stockfish 19', milliseconds,
    moves, moments,
    counts: { blunders: selected.filter((m) => m.severity >= 4).length, mistakes: selected.filter((m) => m.label === 'Mistake').length, inaccuracies: selected.filter((m) => m.label === 'Inaccuracy').length },
    summary: moments.length ? `Review ${moments.length} key moment${moments.length === 1 ? '' : 's'} from your ${selected.length} moves, ranked by impact.` : `No major evaluation drops found in your ${selected.length} moves at this search setting. You can inspect any move below.`,
  };
}
