const DEFAULT_URLS = { ollama: 'http://127.0.0.1:11434/v1', llamacpp: 'http://127.0.0.1:8080/v1', vllm: 'http://127.0.0.1:8000/v1' };
const COLORS = ['#2478b4', '#d29128', '#9663b4'];
const $ = (id) => document.getElementById(id);
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const button = (text, action, className = 'secondary') => {
  const node = element('button', text, className);
  node.type = 'button'; node.onclick = action;
  return node;
};
export const scoreLabel = (score) => score.type === 'mate'
  ? `${score.value > 0 ? 'Mate in' : 'Mated in'} ${Math.abs(score.value)}`
  : `${score.value >= 0 ? '+' : ''}${(score.value / 100).toFixed(2)}`;

export class Analysis {
  constructor({ getGame, jump, redraw }) {
    this.getGame = getGame; this.jump = jump; this.redraw = redraw;
    this.report = null; this.explanation = null; this.selected = null;
    this.preview = null; this.optionIndex = 0; this.allArrows = false;
    this.controller = null; this.runId = 0;
    $('analysis-settings').innerHTML = `
      <div class="card-heading"><h2>Analyze game</h2><span class="result">Stockfish + optional AI</span></div>
      <fieldset id="review-fields"><div class="settings-row">
        <div><label for="review-color">User played</label><select id="review-color"><option value="w">White</option><option value="b">Black</option></select></div>
        <div><label for="review-quality">Search time</label><select id="review-quality"><option value="quick">Quick</option><option value="standard" selected>Standard</option><option value="deep">Deeper</option></select></div>
      </div>
      <label for="provider">Explanation provider</label><select id="provider"><option value="engine">Stockfish engine only · no model needed</option><option value="ollama">Ollama</option><option value="llamacpp">llama.cpp</option><option value="vllm">vLLM</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option></select>
      <div id="model-fields" hidden>
        <div id="server-field"><label for="model-url">Local server URL</label><input id="model-url" type="url" placeholder="http://127.0.0.1:11434/v1" autocomplete="off" /></div>
        <label for="model-name">Model name</label><input id="model-name" placeholder="Exact model name from your provider" autocomplete="off" spellcheck="false" />
        <label for="model-key">API key <span id="key-note">(optional for local servers)</span></label><input id="model-key" type="password" autocomplete="off" spellcheck="false" placeholder="Kept only until this page is closed" />
        <p class="privacy">Keys are not saved. You can also set hosted API keys in .env.local.</p>
      </div></fieldset>
      <p id="analysis-privacy" class="settings-note"></p>
      <div class="import-actions"><button class="primary" id="analyze">Analyze full game <span>→</span></button><button class="secondary" id="cancel-analysis" hidden>Cancel</button></div>
      <progress id="analysis-progress" max="1" value="0" hidden aria-label="Game analysis progress"></progress>
      <p id="analysis-status" class="settings-note" role="status" aria-live="polite"></p>
      <p id="analysis-error" class="error" role="alert" hidden></p>`;
    try {
      const saved = JSON.parse(localStorage.getItem('chess-study-settings') || '{}');
      for (const id of ['provider', 'model-url', 'model-name', 'review-quality']) if (typeof saved[id] === 'string') $(id).value = saved[id];
      if (!$('provider').value) $('provider').value = 'engine';
      if (!$('review-quality').value) $('review-quality').value = 'standard';
    } catch { /* The viewer also works when browser storage is unavailable. */ }
    $('provider').onchange = () => {
      $('model-key').value = ''; // Never carry a hosted key to another provider.
      $('model-name').value = '';
      $('model-url').value = DEFAULT_URLS[$('provider').value] || '';
      this.updateProvider();
    };
    $('analyze').onclick = () => this.analyze();
    $('cancel-analysis').onclick = () => this.controller?.abort();
    this.updateProvider();
  }

  updateProvider() {
    const provider = $('provider').value;
    const local = provider in DEFAULT_URLS;
    $('model-fields').hidden = provider === 'engine';
    $('server-field').hidden = !local;
    if (local && !$('model-url').value) $('model-url').value = DEFAULT_URLS[provider];
    $('key-note').textContent = local ? '(optional for local servers)' : '(or use .env.local)';
    $('analysis-privacy').textContent = provider === 'engine' ? ''
      : local ? 'Game moves and engine findings go to your local model server. Use a model with enough context for a full game.'
        : `Game moves and engine findings will be sent to ${provider === 'openai' ? 'OpenAI' : 'Anthropic'} when you analyze. API usage may incur charges.`;
  }

  reset() {
    this.runId++;
    this.controller?.abort(); this.controller = null;
    this.report = null; this.explanation = null; this.selected = null; this.preview = null;
    $('review-results').replaceChildren(); $('review-results').hidden = true;
    $('variation-controls').replaceChildren(); $('variation-controls').hidden = true;
    $('analysis-status').textContent = ''; $('analysis-error').hidden = true;
    this.setBusy(false);
  }

  setBusy(busy) {
    $('review-fields').disabled = busy;
    $('analyze').disabled = busy;
    $('cancel-analysis').hidden = !busy;
    $('analysis-progress').hidden = !busy;
  }

  async analyze() {
    const settings = { provider: $('provider').value, model: $('model-name').value.trim(), baseUrl: $('model-url').value.trim(), apiKey: $('model-key').value };
    $('analysis-error').hidden = true;
    if (settings.provider !== 'engine' && !settings.model) {
      $('analysis-error').textContent = 'Enter the exact model name before analyzing.'; $('analysis-error').hidden = false; return;
    }
    this.reset();
    this.redraw();
    const id = this.runId;
    this.controller = new AbortController();
    const controller = this.controller;
    this.setBusy(true);
    $('analysis-progress').value = 0;
    $('analysis-status').textContent = 'Starting local engine…';
    try {
      const saved = Object.fromEntries(['provider', 'model-url', 'model-name', 'review-quality'].map((key) => [key, $(key).value]));
      try { localStorage.setItem('chess-study-settings', JSON.stringify(saved)); } catch { /* Optional preference storage. */ }
      const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pgn: this.getGame().pgn, color: $('review-color').value, quality: $('review-quality').value, settings }), signal: controller.signal });
      if (!response.ok) {
        let data;
        try { data = await response.json(); } catch { throw new Error('The analysis server is unavailable. Restart npm run dev and try again.'); }
        throw new Error(data.error || 'Could not start analysis.');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', finished = false;
      while (true) {
        const { value, done } = await reader.read();
        if (id !== this.runId) return;
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n')) !== -1) {
          const event = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
          if (event.type === 'progress') {
            $('analysis-status').textContent = event.message;
            $('analysis-progress').value = event.completed / event.total;
          } else if (event.type === 'report') {
            this.report = event.report;
            this.renderResults(); this.redraw();
          } else if (event.type === 'explanation') {
            this.explanation = event.explanation;
            this.modelLabel = `${event.provider} · ${event.model}`;
            this.renderResults();
          } else if (event.type === 'warning') {
            $('analysis-error').textContent = event.message + ' Your engine review is ready below the board.';
            $('analysis-error').hidden = false;
          } else if (event.type === 'error') throw new Error(event.message);
          else if (event.type === 'done') finished = true;
        }
      }
      if (!finished) throw new Error('The review connection ended early. Please try again.');
      $('analysis-status').textContent = 'Review ready below the board.';
    } catch (error) {
      if (id !== this.runId) return;
      if (controller.signal.aborted) $('analysis-status').textContent = this.report ? 'Explanation cancelled. Engine review is available.' : 'Analysis cancelled.';
      else { $('analysis-error').textContent = error.message; $('analysis-error').hidden = false; $('analysis-status').textContent = ''; }
    } finally {
      if (id === this.runId) { this.controller = null; this.setBusy(false); }
    }
  }

  inspect(ply) {
    this.selected = this.report.moves.find((move) => move.ply === ply);
    this.optionIndex = 0; this.preview = null;
    this.jump(ply - 1);
    this.renderResults();
    $('board').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  leaveLine() { this.preview = null; this.renderVariation(); }

  boardState() {
    if (this.preview === null || !this.selected) return null;
    const line = this.selected.options[this.optionIndex].line;
    return { fen: this.preview === 0 ? this.selected.fen : line[this.preview - 1].fen,
      lastMove: this.preview === 0 ? null : line[this.preview - 1], label: `Suggested line · ${this.preview} / ${line.length}` };
  }

  stepLine(step) {
    const line = this.selected.options[this.optionIndex].line;
    this.preview = Math.max(0, Math.min(line.length, step));
    this.renderVariation(); this.redraw();
  }

  renderVariation() {
    const panel = $('variation-controls');
    panel.replaceChildren(); panel.hidden = this.preview === null;
    if (this.preview === null) return;
    const line = this.selected.options[this.optionIndex].line;
    panel.append(element('strong', `Suggested line · option ${this.optionIndex + 1}`));
    const controls = element('div', undefined, 'line-actions');
    const prev = button('←', () => this.stepLine(this.preview - 1)); prev.setAttribute('aria-label', 'Previous suggested move'); prev.disabled = this.preview === 0;
    const next = button('→', () => this.stepLine(this.preview + 1)); next.setAttribute('aria-label', 'Next suggested move'); next.disabled = this.preview === line.length;
    controls.append(prev, next, button('Return to game', () => { this.leaveLine(); this.redraw(); })); panel.append(controls);
    const sequence = element('div', undefined, 'line-sequence');
    line.forEach((move, index) => {
      const moveButton = button(move.san, () => this.stepLine(index + 1), this.preview === index + 1 ? 'line-move active' : 'line-move');
      moveButton.setAttribute('aria-label', `Suggested move ${index + 1}: ${move.san}`); sequence.append(moveButton);
    });
    panel.append(sequence);
  }

  renderResults() {
    const root = $('review-results'); root.replaceChildren(); root.hidden = !this.report;
    if (!this.report) return;
    const report = this.report;
    root.append(element('h2', `${report.color === 'w' ? 'White' : 'Black'}’s game review`));
    root.append(element('p', this.explanation?.summary || report.summary, 'review-summary'));
    root.append(element('p', `${report.counts.blunders} blunders / mate misses · ${report.counts.mistakes} mistakes · ${report.counts.inaccuracies} inaccuracies`, 'review-counts'));
    root.append(element('p', `${report.engine} · ${report.quality} search · evaluations are estimates. Scores favor the player making the move.`, 'settings-note'));
    if (this.explanation) {
      root.append(element('p', `Explanation: ${this.modelLabel}. Model commentary can be imperfect; the board lines come from Stockfish.`, 'settings-note'));
      for (const [title, items] of [['What went well', this.explanation.strengths], ['What to practice', this.explanation.practice]]) {
        if (!items.length) continue;
        root.append(element('h3', title)); const list = element('ul');
        items.forEach((item) => list.append(element('li', item))); root.append(list);
      }
    }
    const moments = element('div', undefined, 'moment-list');
    report.moments.forEach((ply, index) => {
      const move = report.moves.find((move) => move.ply === ply);
      moments.append(button(`${index === 0 ? 'Biggest finding · ' : ''}${move.number}${move.color === 'w' ? '.' : '…'} ${move.san} · ${move.label}`, () => this.inspect(ply), `moment-button${this.selected?.ply === ply ? ' selected' : ''}`));
    });
    root.append(moments);
    const selectLabel = element('label', 'Inspect any move'); selectLabel.htmlFor = 'inspect-move';
    const select = element('select'); select.id = 'inspect-move';
    const placeholder = element('option', 'Choose a move'); placeholder.value = ''; select.append(placeholder);
    report.moves.forEach((move) => { const option = element('option', `${move.number}${move.color === 'w' ? '.' : '…'} ${move.san} (${move.color === 'w' ? 'White' : 'Black'}) · ${move.label}`); option.value = move.ply; select.append(option); });
    select.value = this.selected?.ply || '';
    select.onchange = () => { if (select.value) this.inspect(Number(select.value)); };
    root.append(selectLabel, select);
    if (this.selected) this.renderMoment(root);
    root.append(button('Download review JSON', () => {
      const blob = new Blob([JSON.stringify({ ...report, explanation: this.explanation }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const link = element('a'); link.href = url; link.download = 'chess-review.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'text-button export-review'));
  }

  renderMoment(root) {
    const move = this.selected;
    const detail = element('div', undefined, 'moment-detail');
    detail.append(element('h3', `${move.number}${move.color === 'w' ? '.' : '…'} ${move.san} · ${move.label}`));
    detail.append(element('p', `Best: ${scoreLabel(move.bestScore)} · Played: ${scoreLabel(move.playedScore)}${move.loss === null ? '' : ` · Drop: ${(move.loss / 100).toFixed(2)} pawns`}`, 'review-counts'));
    const commentary = this.explanation?.moments.find((item) => item.ply === move.ply);
    if (commentary) {
      detail.append(element('p', commentary.explanation)); detail.append(element('p', `Takeaway: ${commentary.lesson}`));
    } else {
      detail.append(element('p', `You played ${move.san}. The engine’s first choice was ${move.options[0].line[0].san}. Compare the options below and step through the opponent’s replies.`));
    }
    if (move.severity > 0) detail.append(element('p', `After your move, an engine line is: ${move.playedLine.map((m) => m.san).join(' ')}.`, 'settings-note'));
    detail.append(button('Show position before this move', () => { this.preview = null; this.jump(move.ply - 1); this.renderVariation(); $('board').scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    const toggle = element('label', undefined, 'arrow-toggle'); const input = element('input'); input.type = 'checkbox'; input.checked = this.allArrows;
    input.onchange = () => { this.allArrows = input.checked; this.redraw(); };
    toggle.append(input, document.createTextNode('Show all option arrows')); detail.append(toggle);
    move.options.forEach((option, index) => {
      const row = element('div', undefined, 'alternative');
      row.style.setProperty('--option-color', COLORS[index]);
      const heading = button(`${index + 1}. ${option.line[0].san} · ${scoreLabel(option.score)}${index === 0 ? ' · Engine’s first choice' : ''}`, () => {
        this.optionIndex = index; this.preview = null; this.jump(move.ply - 1); this.renderResults();
      }, `option-button${index === this.optionIndex ? ' selected' : ''}`);
      row.append(heading, element('p', option.line.map((m) => m.san).join(' '), 'option-line'));
      row.append(button('Play this line →', () => { this.optionIndex = index; this.jump(move.ply - 1); this.stepLine(0); this.renderResults(); $('board').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 'text-button'));
      detail.append(row);
    });
    root.append(detail);
  }

  drawArrows(board, position, flipped) {
    if (!this.selected || position !== this.selected.ply - 1 || (this.preview !== null && this.preview > 0)) return;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 800 800'); svg.classList.add('board-arrows'); svg.setAttribute('aria-hidden', 'true');
    const point = (square) => {
      const file = square.charCodeAt(0) - 97, rank = Number(square[1]) - 1;
      return [(flipped ? 7 - file : file) * 100 + 50, (flipped ? rank : 7 - rank) * 100 + 50];
    };
    const options = this.allArrows && this.preview === null ? this.selected.options : [this.selected.options[this.optionIndex]];
    options.slice().reverse().forEach((option) => {
      const move = option.line[0], color = COLORS[option.rank - 1];
      const [x1, y1] = point(move.from), [x2, y2] = point(move.to);
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const line = document.createElementNS(ns, 'line');
      for (const [key, value] of Object.entries({ x1, y1, x2: x2 - Math.cos(angle) * 18, y2: y2 - Math.sin(angle) * 18, stroke: color, 'stroke-width': 12, 'stroke-linecap': 'round', opacity: .85 })) line.setAttribute(key, value);
      const head = document.createElementNS(ns, 'polygon');
      head.setAttribute('points', `${x2},${y2} ${x2 - Math.cos(angle) * 36 + Math.sin(angle) * 19},${y2 - Math.sin(angle) * 36 - Math.cos(angle) * 19} ${x2 - Math.cos(angle) * 36 - Math.sin(angle) * 19},${y2 - Math.sin(angle) * 36 + Math.cos(angle) * 19}`);
      head.setAttribute('fill', color); head.setAttribute('opacity', '.9'); svg.append(line, head);
    });
    board.append(svg);
  }
}
