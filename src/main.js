import { Chess } from 'chess.js';
import { EXAMPLE_PGN, parseGame } from './game.js';
import './style.css';

let game = parseGame(EXAMPLE_PGN);
let position = 0;
let flipped = false;

document.querySelector('#app').innerHTML = `
  <header class="site-header"><a class="brand" href="/" aria-label="Chess Study home"><span class="brand-mark">♞</span> Chess Study<span class="tag">LOCAL</span></a><span class="mode-label"><span></span> Game viewer</span></header>
  <main>
    <div class="workspace">
      <section class="board-panel" aria-label="Game board">
        <div class="player"><span class="avatar" id="top-avatar">♟</span><div><strong id="top-player"></strong><span id="top-color"></span></div><span class="player-side" id="top-side"></span></div>
        <div id="board" class="board" role="img" aria-label="Chessboard, starting position"></div>
        <div class="player"><span class="avatar light" id="bottom-avatar">♟</span><div><strong id="bottom-player"></strong><span id="bottom-color"></span></div><span class="player-side" id="bottom-side"></span></div>
        <div class="playback"><div class="position-label" id="position-label" aria-live="polite"></div><div class="transport"><button id="first" title="Starting position (Home)" aria-label="Go to starting position">⇤</button><button id="previous" title="Previous move (Left arrow)" aria-label="Previous move">←</button><button id="next" title="Next move (Right arrow)" aria-label="Next move">→</button><button id="last" title="Last move (End)" aria-label="Go to last move">⇥</button></div><button id="flip" class="flip" title="Flip board" aria-label="Flip board">⇅ <span>Flip board</span></button></div>
        <p class="keyboard-hint">Use your keyboard’s <kbd>←</kbd> <kbd>→</kbd> keys to move through the game.</p>
      </section>
      <aside>
        <section class="card game-card"><div class="card-heading"><h2>Your game</h2><span id="result" class="result"></span></div><p id="game-details" class="game-details"></p><div class="move-heading"><span>MOVE</span><span>WHITE</span><span>BLACK</span></div><div id="moves" class="moves" aria-label="Game moves"></div><div id="game-status" class="game-status" aria-live="polite"></div></section>
        <section class="card import-card"><div class="card-heading"><h2>Load a game</h2><button class="text-button" id="example">Try an example ↗</button></div><label for="pgn">Paste your PGN below or upload a file.</label><textarea id="pgn" spellcheck="false" placeholder='[White "You"]&#10;[Black "Opponent"]&#10;&#10;1. e4 e5 2. Nf3 Nc6…'></textarea><p id="error" class="error" role="alert" hidden></p><div class="import-actions"><button class="primary" id="load">Load game <span>→</span></button><button class="secondary" id="upload">Upload PGN</button><input type="file" id="file" accept=".pgn,.txt" hidden /></div><p class="privacy">Your PGN stays in this browser. Nothing is uploaded.</p></section>
      </aside>
    </div>
    <footer><span>CHESS STUDY</span></footer>
  </main>`;

const $ = (id) => document.getElementById(id);
const symbols = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const pieceNames = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

function renderMoves() {
  $('moves').replaceChildren();
  let row;
  let previousNumber;
  game.moves.forEach((move, index) => {
    const number = Number(move.before.split(' ')[5]);
    if (number !== previousNumber) {
      row = document.createElement('div');
      row.className = 'move-row';
      const label = document.createElement('span');
      label.textContent = `${number}.`;
      row.append(label);
      if (move.color === 'b') row.append(document.createElement('span'));
      $('moves').append(row);
      previousNumber = number;
    }
    const button = document.createElement('button');
    button.textContent = move.san;
    button.dataset.position = index + 1;
    button.setAttribute('aria-label', `Move ${number}, ${move.color === 'w' ? 'White' : 'Black'}: ${move.san}`);
    button.addEventListener('click', () => navigate(index + 1));
    row.append(button);
  });
}

function render() {
  const chess = new Chess(game.positions[position]);
  const lastMove = game.moves[position - 1];
  const files = flipped ? 'hgfedcba' : 'abcdefgh';
  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const board = $('board');
  board.replaceChildren();
  const descriptions = [];
  ranks.forEach((rank, y) => [...files].forEach((file, x) => {
    const square = file + rank;
    const piece = chess.get(square);
    const cell = document.createElement('div');
    cell.className = `square ${(file.charCodeAt(0) + rank) % 2 ? 'light' : 'dark'}`;
    if (lastMove && [lastMove.from, lastMove.to].includes(square)) cell.classList.add('last-move');
    if (piece?.type === 'k' && piece.color === chess.turn() && chess.isCheck()) cell.classList.add('check');
    if (piece) {
      const icon = document.createElement('span');
      icon.className = `piece ${piece.color === 'w' ? 'white-piece' : 'black-piece'}`;
      icon.textContent = symbols[piece.type];
      cell.append(icon);
      descriptions.push(`${piece.color === 'w' ? 'White' : 'Black'} ${pieceNames[piece.type]} on ${square}`);
    }
    if (x === 0) {
      const label = document.createElement('span');
      label.className = 'rank-label'; label.textContent = rank; cell.append(label);
    }
    if (y === 7) {
      const label = document.createElement('span');
      label.className = 'file-label'; label.textContent = file; cell.append(label);
    }
    cell.setAttribute('aria-hidden', 'true');
    board.append(cell);
  }));
  board.setAttribute('aria-label', `Position ${position} of ${game.moves.length}. ${descriptions.join(', ')}.`);
  ['top', 'bottom'].forEach((side) => {
    const isWhite = (side === 'bottom') !== flipped;
    const name = game.headers[isWhite ? 'White' : 'Black'];
    $(side + '-player').textContent = name && name !== '?' ? name : (isWhite ? 'White' : 'Black');
    $(side + '-color').textContent = isWhite ? 'White pieces' : 'Black pieces';
    $(side + '-avatar').classList.toggle('light', isWhite);
    $(side + '-side').textContent = chess.turn() === (isWhite ? 'w' : 'b') ? 'TO MOVE' : '';
  });
  $('position-label').textContent = position ? `${lastMove.san} · ${position} / ${game.moves.length}` : 'Starting position';
  $('first').disabled = $('previous').disabled = position === 0;
  $('last').disabled = $('next').disabled = position === game.moves.length;
  document.querySelectorAll('[data-position]').forEach((button) => {
    const current = Number(button.dataset.position) === position;
    button.classList.toggle('active', current);
    button.setAttribute('aria-current', String(current));
  });
  const active = document.querySelector('[data-position].active');
  if (active) {
    const list = $('moves');
    const top = active.offsetTop;
    if (top < list.scrollTop || top + active.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top - list.clientHeight / 2;
  } else $('moves').scrollTop = 0;
  const turn = chess.turn() === 'w' ? 'White' : 'Black';
  $('game-status').textContent = chess.isCheckmate() ? 'Checkmate · ' + (turn === 'White' ? 'Black' : 'White') + ' wins' : chess.isStalemate() ? 'Stalemate' : `${turn} to move${chess.isCheck() ? ' · Check' : ''}${position === game.moves.length ? ' · End of PGN' : ''}`;
}

function navigate(next) {
  position = Math.max(0, Math.min(game.moves.length, next));
  render();
}

function load(pgn) {
  try {
    const parsed = parseGame(pgn);
    game = parsed;
    position = 0;
    $('error').hidden = true;
    $('result').textContent = game.headers.Result === '*' ? 'Unfinished' : game.headers.Result || '—';
    $('game-details').textContent = [game.headers.Event, game.headers.Site, game.headers.Date?.replace(/\.\?\?/g, '')].filter((value) => value && !/^[?.]+$/.test(value)).join(' · ') || 'Imported game';
    renderMoves();
    render();
  } catch (error) {
    $('error').textContent = error.message;
    $('error').hidden = false;
  }
}

$('first').onclick = () => navigate(0);
$('previous').onclick = () => navigate(position - 1);
$('next').onclick = () => navigate(position + 1);
$('last').onclick = () => navigate(game.moves.length);
$('flip').onclick = () => { flipped = !flipped; render(); };
$('load').onclick = () => load($('pgn').value);
$('example').onclick = () => { $('pgn').value = EXAMPLE_PGN; load(EXAMPLE_PGN); };
$('upload').onclick = () => $('file').click();
$('file').onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 1_000_000) throw new Error('Choose a PGN smaller than 1 MB containing one game.');
    $('pgn').value = await file.text();
    load($('pgn').value);
  } catch (error) {
    $('error').textContent = error.message;
    $('error').hidden = false;
  }
  event.target.value = '';
};
document.addEventListener('keydown', (event) => {
  if (event.target.matches('input, textarea, [contenteditable="true"]') || event.altKey || event.ctrlKey || event.metaKey) return;
  const targets = { ArrowLeft: position - 1, ArrowRight: position + 1, Home: 0, End: game.moves.length };
  if (event.key in targets) { event.preventDefault(); navigate(targets[event.key]); }
});
load(EXAMPLE_PGN);
