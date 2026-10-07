# Chess Study

A local PGN viewer with Stockfish game review and optional model explanations. Paste a game, step through its moves, then explore mistakes and alternative lines on the board.

## Run locally

Install Node.js 22.12+ (or a newer supported release), then:

```sh
npm install
npm run dev
```

Open the address printed in the terminal, normally http://127.0.0.1:5173. Stop with Ctrl+C. Stockfish is installed with the app; no separate chess engine setup is required.

## View a game

- Paste one game's PGN and click **Load game**, or choose **Upload PGN**.
- Use **← / →** or keyboard arrows for each half-move. Click a move to jump to it.
- Use **⇤ / ⇥** or Home / End to jump to the beginning or end. **Flip board** changes the viewpoint.
- Castling, en passant, promotion, and custom starting FENs are supported. Only the main line is displayed; PGN comments and variations are not shown.

The included example is Morphy's Opera Game. Games and analysis are held in memory and cleared on refresh.

## Analyze a game

1. Choose the color you played and a search time in **Analyze game**.
2. Leave **Stockfish engine only** selected to start immediately, or configure a model provider below.
3. Click **Analyze full game**. Progress appears while both players' moves are evaluated. You can cancel; loading a different game also cancels and clears the previous review.
4. The review appears below the board. Click a key moment to show the position **before** that move. You can also inspect any move from the review's dropdown.
5. Alternatives are ranked and color-coded. Select an option to draw its arrow, or enable **Show all option arrows**. **Play this line** lets you step through the engine's continuation and the opponent's replies with the line's controls or keyboard arrows.
6. **Return to game**, the ordinary game navigation buttons, or clicking an original game move exits the suggested line. The original PGN is never changed.
7. **Download review JSON** exports the engine report and any model commentary, with no credentials.

### What the analysis means

Stockfish 19 evaluates every move locally, with up to three candidate moves. If the played move is outside those candidates, it is searched separately from the same position. The engine receives the original starting FEN and move history so it can account for repetition. Each displayed continuation is checked for legality by chess.js.

Search budgets are 120 ms (Quick), 400 ms (Standard), or 1,200 ms (Deeper) per position search. Some positions need a second search for the played move. Reviews are limited to 600 half-moves and one active review at a time. Actual duration depends on the computer and game length.

Scores are from the perspective of the player making the reviewed move: positive favors that player. A centipawn is one hundredth of a pawn. Approximate evaluation drops of 50 / 100 / 200 centipawns are labeled inaccuracy / mistake / blunder. Missed mates and newly allowed mating lines are handled separately. These are simple review heuristics, not a rating or an accuracy percentage. Time-limited searches can disagree, especially in complex positions; use Deeper for a closer look. A variation shows one engine line, not a prediction or forced sequence unless the engine finds mate.

## Optional model explanations

Models explain the engine findings, assess the selected player's game, and suggest practice priorities. The system prompt is in `server/providers.js`. It calls for a candid, constructive assessment supported by the supplied moves, without inventing tactics or estimating a person's rating from one game.

The app sends the complete main line and engine assessments for both players, plus detailed lines for up to six key moments for the selected player. Player names, PGN comments, and other header metadata are not sent to the model. A model failure leaves the engine review usable.

### Local servers

Start your inference server and load a chat/instruction model, then select the corresponding provider in the app:

| Provider | Default base URL | Model name |
| --- | --- | --- |
| Ollama | `http://127.0.0.1:11434/v1` | The exact installed model tag |
| llama.cpp | `http://127.0.0.1:8080/v1` | The served model name or configured alias |
| vLLM | `http://127.0.0.1:8000/v1` | The served model name |

All three adapters use `/chat/completions` with JSON output mode. Ports are editable. This version accepts loopback addresses only (`localhost`, `127.0.0.1`, or `[::1]`); it does not connect to remote custom providers. An API key is optional for local servers that require authentication. The app connects to these servers; it does not install, launch, or load their models.

Use a model/server configuration with enough context for the full report and output. The required context grows with game length. JSON support and explanation quality depend on your model and server configuration. The app rejects malformed output and unknown move references instead of drawing model-invented moves.

Provider references: [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility), [llama.cpp server](https://github.com/ggml-org/llama.cpp/tree/master/tools/server), [vLLM OpenAI-compatible server](https://docs.vllm.ai/en/v0.17.0/serving/openai_compatible_server/).

### OpenAI or Anthropic

Select the provider, enter an exact model ID available to your API account, and enter your API key. Use a model that supports the provider's structured JSON output. The app uses the [OpenAI Responses API with Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) or [Anthropic Messages with structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).

Alternatively, copy `.env.example` to `.env.local`, add `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`, and restart the app. Never put secrets in variables prefixed with `VITE_`, which are exposed to the frontend.

Keys entered in the UI remain in page memory and are sent to the local backend only when starting analysis. Keys are not written to browser storage, logs, or exported reports. Switching providers clears the key field. Only non-secret preferences (provider, model, local URL, search time) are saved in browser storage. Environment keys stay on the backend. Hosted keys are sent only to that provider's fixed official endpoint; redirects are rejected. OpenAI requests set `store: false`.

Hosted analysis sends game moves and engine findings to the selected provider and can incur API charges. Imported games otherwise stay local. Model prose can still contain mistakes even when the underlying engine moves are legal.

## Development

```sh
npm test
npm run build
npm run preview
```

The Vite server and preview server include a local `/api/analyze` endpoint. A static `dist` deployment alone cannot run analysis: it needs the Node backend and installed Stockfish files. This is a local, single-user app, not an authenticated public service.

- `src/game.js`: PGN parsing and immutable game positions.
- `src/main.js`: board and original-game navigation.
- `src/analysis.js`: settings, streamed progress, review UI, arrows, and alternative playback.
- `server/engine.js`: isolated Stockfish subprocess and UCI communication.
- `server/review.js`: full-game review, classifications, and legal variation data.
- `server/providers.js`: system prompt, JSON schema, provider requests, and response validation.
- `server/api.js`: local request validation, progress streaming, and cancellation.

Reports use a versioned JSON structure with `moves`, ranked `moments` (one-based ply IDs), per-move `options`, scores, and legal lines containing UCI, SAN, square coordinates, and FENs. Model output contains `summary`, `strengths`, `practice`, and explanations that reference existing ply and alternative IDs. Model output is treated as text/data, never executable code. Board arrows are derived from engine moves.

Tests cover special moves, score perspective, mate classification, invalid model references, provider request/response formats, local endpoint restrictions, cancellation, and real Stockfish reviews. Live hosted and local model connections require your own running server or account credentials.

## Dependencies

Stockfish.js 19 is distributed under GPL-3.0; its license is installed at `node_modules/stockfish/Copying.txt`, and matching source is available from [Stockfish.js v19.0.0](https://github.com/nmrugg/stockfish.js/tree/v19.0.0). The project also uses chess.js (BSD-2-Clause) and Vite (MIT). Dependencies and generated builds are excluded from Git.
