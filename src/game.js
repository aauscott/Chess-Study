import { Chess } from 'chess.js';

export const EXAMPLE_PGN = `[Event "Opera Game"]
[Site "Paris"]
[Date "1858.??.??"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5
6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5
11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6
15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

// Immutable positions let the viewer navigate without replaying moves. A future
// analysis module can evaluate these FENs without depending on the interface.
export function parseGame(pgn) {
  if (!pgn.trim()) throw new Error('Paste a PGN or choose a .pgn file first.');
  if ((pgn.match(/\[Event\s+"/g) || []).length > 1) {
    throw new Error('Please load one game at a time. This PGN contains multiple games.');
  }
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch {
    throw new Error('This PGN could not be read. Check the move notation and include one complete game.');
  }
  const moves = chess.history({ verbose: true });
  if (!moves.length) throw new Error('No moves found. Include the game’s moves, such as 1. e4 e5.');
  return {
    headers: chess.getHeaders(),
    moves,
    positions: [moves[0].before, ...moves.map((move) => move.after)],
  };
}
