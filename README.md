# Chess Study

A small local chess game viewer. Paste a PGN or open a `.pgn` file, then step through the game on a board. Includes the Morphy Opera Game as an example.

## Run locally

Install Node.js 22.12+ (or a newer supported release), then run:

```sh
npm install
npm run dev
```

Open the local address printed in the terminal (normally http://127.0.0.1:5173). Stop the server with Ctrl+C.

## Using the viewer

- Paste one game's PGN and click **Load game**, or choose **Upload PGN**.
- The board starts at the initial position, before the first move.
- Use **← / →** to step backward or forward by one move, or click a move in the list.
- Use **⇤ / ⇥** (or Home / End) to jump to the beginning or end.
- **Flip board** changes your viewpoint. The last move's squares are highlighted.
- Keyboard navigation stays out of the way while you're editing PGN text.

Castling, en passant, promotion, and PGNs with custom starting positions are supported. The viewer follows the main line; variations and comments are not displayed. Load one game at a time. Imported PGNs stay in browser memory and are cleared on refresh. No account, backend, or external service is required.

## Development

```sh
npm test
npm run build
npm run preview
```

Built with plain JavaScript, CSS, Vite, and chess.js. `src/game.js` parses each game into moves and FEN positions; `src/main.js` handles the interface. Future local analysis can consume the same FEN positions without changing navigation. Analysis is not implemented yet.
