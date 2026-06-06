/* ============================================================
   HOST — źródło prawdy. Mutuje GAME_STATE, zapisuje do
   localStorage i rozsyła zmiany przez BroadcastChannel.
   ============================================================ */

import { send, on, sendFullState } from './channel.js';
import {
  loadState, saveState, newGameState,
  MIN_TEAMS, MAX_TEAMS, HEX_COLOR, START_BALANCE, TEAM_COLORS, uid
} from './state.js';
import { pickQuestion, validateQuestions } from './questions.js';

const SEGMENT_COLORS = {
  'Muzyka': '#8B5CF6', 'Sport': '#EF4444', 'Film, Bajki i Seriale': '#F97316',
  'Kulinaria': '#EC4899', 'Zwierzęta i Przyroda': '#22C55E', 'Historia i Ciekawostki': '#3B82F6',
  'Polska — Ludzie i Miejsca': '#14B8A6', 'Nauka i Wynalazki': '#A855F7',
  'Jastrzębie-Zdrój': '#F59E0B', 'Czarna Skrzynka': '#1A1A2E'
};
const catColor = (c) => SEGMENT_COLORS[c] || '#555';
const $ = (id) => document.getElementById(id);

let state = loadState();
let localAnswer = null;     // odpowiedź bieżącego pytania — nigdy nie idzie do display przed answer:show
let answerHidden = true;
let timerHandle = null;

// ---------------------------------------------------------------
//  POMOCNICZE
// ---------------------------------------------------------------
function persist() { saveState(state); }

function findTeam(id) { return state.teams.find(t => String(t.id) === String(id)); }

function toast(msg, kind = 'success') {
  const t = document.createElement('div');
  t.className = 'toast toast-' + kind;
  t.textContent = msg;
  $('toasts').appendChild(t);
  requestAnimationFrame(() => t.classList.add('visible'));
  setTimeout(() => { t.classList.remove('visible'); setTimeout(() => t.remove(), 300); }, 3000);
}

/** Snapshot dla display — z tekstem pytania (jeśli faza question), BEZ odpowiedzi. */
function publicSnapshot() {
  let currentQuestionText = null;
  const r = state.round;
  if (r.phase === 'question' && r.category && r.questionIndex !== null) {
    const q = (state.questions[r.category] || [])[r.questionIndex];
    if (q) currentQuestionText = q.pytanie;
  }
  return {
    gameTitle: state.gameTitle,
    teams: state.teams,
    categories: state.categories,
    round: { ...r },
    currentQuestionText
  };
}

function broadcastScores() { send('scores:update', { teams: state.teams }); persist(); }
function broadcastConfig() { send('config:update', { gameTitle: state.gameTitle, teams: state.teams, categories: state.categories }); persist(); }
function broadcastPool() { send('pool:update', { amount: state.round.questionPool }); persist(); }

// ---------------------------------------------------------------
//  LOSOWANIE
// ---------------------------------------------------------------
function weightedSpin() {
  const cats = state.categories;
  const recent = state.spinHistory.slice(-3);
  const weights = cats.map(cat => {
    let w = 1;
    const idx = recent.lastIndexOf(cat);
    if (idx !== -1) w *= 0.15 * (recent.length - idx);
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < cats.length; i++) { roll -= weights[i]; if (roll <= 0) return cats[i]; }
  return cats[cats.length - 1];
}

// ---------------------------------------------------------------
//  AKCJE GRY
// ---------------------------------------------------------------
function doSpin() {
  if (state.round.phase === 'spinning') return;
  const category = weightedSpin();
  state.round.category = category;
  state.round.questionIndex = null;
  state.round.phase = 'spinning';
  state.spinHistory.push(category);
  if (state.spinHistory.length > 50) state.spinHistory.shift();
  const spinDuration = 5000 + Math.floor(Math.random() * 1500);
  send('spin:start', { targetCategory: category, spinDuration });
  send('phase:change', { phase: 'spinning' });
  persist();
  renderAll();

  setTimeout(() => {
    if (state.round.phase === 'spinning' && state.round.category === category) {
      state.round.phase = 'bidding';
      send('phase:change', { phase: 'bidding' });
      persist(); renderPhase();
    }
  }, spinDuration + 200);
}

function showQuestion() {
  const cat = state.round.category;
  if (!cat) { toast('Najpierw zakręć kołem', 'error'); return; }
  const picked = pickQuestion(state.questions, cat, state.usedQuestions);
  if (!picked) { toast(`Brak pytań w kategorii „${cat}”`, 'error'); return; }
  state.round.questionIndex = picked.index;
  state.round.phase = 'question';
  if (!state.usedQuestions[cat]) state.usedQuestions[cat] = [];
  if (!state.usedQuestions[cat].includes(picked.index)) state.usedQuestions[cat].push(picked.index);

  localAnswer = picked.odpowiedz;
  send('question:show', { pytanie: picked.pytanie, category: cat });  // bez odpowiedzi!
  send('phase:change', { phase: 'question' });
  persist();
  renderQuestion(picked.pytanie, cat);
  setLocalAnswer(picked.odpowiedz);
  renderCatList(); renderPhase();
  toast('Pytanie pokazane na ekranie');
}

function showAnswer() {
  if (localAnswer == null) { toast('Najpierw pokaż pytanie', 'error'); return; }
  state.round.phase = 'answer';
  send('answer:show', { odpowiedz: localAnswer });
  send('phase:change', { phase: 'answer' });
  persist(); renderPhase();
}

function blackbox() {
  state.round.phase = 'blackbox';
  send('blackbox:show', {});
  send('phase:change', { phase: 'blackbox' });
  persist(); renderPhase();
}

// --- TIMER ---
function startTimer() {
  stopTimer();
  state.round.timerActive = true;
  send('timer:tick', { seconds: state.round.timerSeconds });
  timerHandle = setInterval(() => {
    state.round.timerSeconds -= 1;
    if (state.round.timerSeconds <= 0) {
      state.round.timerSeconds = 0; state.round.timerActive = false; stopTimer();
      send('timer:tick', { seconds: 0 }); send('timer:end', {});
      $('timerDisplay').textContent = '0'; persist(); return;
    }
    send('timer:tick', { seconds: state.round.timerSeconds });
    $('timerDisplay').textContent = state.round.timerSeconds;
  }, 1000);
}
function stopTimer() { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; } }
function pauseTimer() { state.round.timerActive = false; stopTimer(); }
function resetTimer() { pauseTimer(); state.round.timerSeconds = 60; send('timer:tick', { seconds: 60 }); $('timerDisplay').textContent = '60'; }

// --- LICYTACJA / WYNIKI ---
function addBid(teamId, amount) {
  const team = findTeam(teamId);
  const amt = Math.round(Number(amount));
  if (!team || !Number.isFinite(amt) || amt <= 0) { toast('Nieprawidłowa kwota', 'error'); return; }
  if (amt > team.balance) { toast(`${team.name}: za mało punktów (saldo ${team.balance})`, 'error'); return; }
  team.balance -= amt;
  state.round.questionPool += amt;
  broadcastScores(); broadcastPool(); renderAll();
}
function awardPool(teamId) {
  const team = findTeam(teamId);
  if (!team) { toast('Nie ma takiej drużyny', 'error'); return; }
  if (state.round.questionPool <= 0) { toast('Pula jest pusta', 'error'); return; }
  const awarded = state.round.questionPool;
  team.balance += awarded; state.round.questionPool = 0;
  broadcastScores(); broadcastPool(); renderAll();
  toast(`Przekazano ${awarded} pkt → ${team.name}`);
}
function manualScore(teamId, delta) {
  const team = findTeam(teamId);
  const d = Math.round(Number(delta));
  if (!team || !Number.isFinite(d)) return;
  team.balance = Math.max(0, team.balance + d);
  broadcastScores(); renderAll();
}

// --- DRUŻYNY ---
function updateTeam(teamId, name, color) {
  const team = findTeam(teamId);
  if (!team) return;
  if (typeof name === 'string' && name.trim()) team.name = name.trim().slice(0, 40);
  if (typeof color === 'string' && HEX_COLOR.test(color)) team.color = color;
  broadcastConfig(); renderAll();
}
function addTeam(name, color) {
  if (state.teams.length >= MAX_TEAMS) { toast(`Maksymalnie ${MAX_TEAMS} drużyn`, 'error'); return; }
  if (state.round.phase !== 'idle') { toast('Drużyny można dodawać tylko między rundami', 'error'); return; }
  const cleanName = (name || '').trim().slice(0, 40);
  if (!cleanName) { toast('Podaj nazwę drużyny', 'error'); return; }
  const cleanColor = HEX_COLOR.test(color || '') ? color : '#F59E0B';
  state.teams.push({ id: uid(), name: cleanName, color: cleanColor, balance: START_BALANCE });
  broadcastConfig(); renderAll();
  toast(`Dodano drużynę „${cleanName}”`);
}
function removeTeam(teamId) {
  if (state.teams.length <= MIN_TEAMS) { toast(`Minimum ${MIN_TEAMS} drużyny`, 'error'); return; }
  if (state.round.phase === 'bidding') { toast('Nie można usunąć drużyny podczas licytacji', 'error'); return; }
  if (state.round.questionPool > 0) { toast('Nie można usunąć drużyny gdy w puli są punkty', 'error'); return; }
  state.teams = state.teams.filter(t => String(t.id) !== String(teamId));
  broadcastConfig(); renderAll();
}
function reorderTeam(from, to) {
  if (to < 0 || to >= state.teams.length) return;
  const arr = state.teams;
  const [moved] = arr.splice(from, 1);
  arr.splice(to, 0, moved);
  broadcastConfig(); renderAll();
}

function updateTitle(title) {
  if (typeof title === 'string' && title.trim()) {
    state.gameTitle = title.trim().slice(0, 80);
    broadcastConfig();
  }
}

function newGame() {
  pauseTimer();
  state = newGameState(state);
  localAnswer = null;
  send('game:reset', {});
  sendFullState(publicSnapshot());
  renderAll();
  toast('Nowa gra rozpoczęta');
}

function loadQuestions(data) {
  const { ok, cleaned, errors } = validateQuestions(data);
  if (!ok) { toast('Upload odrzucony: ' + (errors[0] || 'błąd'), 'error'); return; }
  state.questions = cleaned;
  state.usedQuestions = {};
  persist();
  renderCatList();
  toast(`Wczytano pytania: ${Object.keys(cleaned).length} kategorii`);
  if (errors.length) toast(`Z ${errors.length} ostrzeżeniami walidacji`, 'error');
}

// ---------------------------------------------------------------
//  RENDER
// ---------------------------------------------------------------
const NEXT_COLOR = () => {
  const used = new Set(state.teams.map(t => t.color));
  return TEAM_COLORS.find(c => !used.has(c)) ?? TEAM_COLORS[Math.floor(Math.random() * TEAM_COLORS.length)];
};

function buildSwatches(selected, onPick) {
  const wrap = document.createElement('div'); wrap.className = 'swatches';
  TEAM_COLORS.forEach(c => {
    const sw = document.createElement('button');
    sw.className = 'swatch' + (c === selected ? ' active' : '');
    sw.style.background = c; sw.title = c;
    sw.onclick = () => onPick(c);
    wrap.appendChild(sw);
  });
  const custom = document.createElement('button'); custom.className = 'swatch custom'; custom.title = 'Własny kolor';
  const ci = document.createElement('input'); ci.type = 'color'; ci.value = HEX_COLOR.test(selected) ? selected : '#F59E0B';
  ci.onchange = () => onPick(ci.value);
  custom.appendChild(ci); wrap.appendChild(custom);
  return wrap;
}

function renderPhase() {
  const phase = state.round.phase;
  $('phaseChip').textContent = phase;
  $('btnSpin').disabled = phase === 'spinning';
}

function renderSpun() {
  const chip = $('spunChip'); const cat = state.round.category;
  if (!cat) { chip.textContent = '—'; chip.style.background = 'rgba(255,255,255,0.08)'; chip.style.color = ''; return; }
  chip.textContent = cat; chip.style.background = catColor(cat);
  chip.style.color = cat === 'Czarna Skrzynka' ? '#F5A623' : '#fff';
}

function renderHistory() {
  const ul = $('history'); ul.innerHTML = '';
  state.spinHistory.slice().reverse().slice(0, 5).forEach(c => {
    const li = document.createElement('li');
    const sw = document.createElement('span'); sw.className = 'swatch'; sw.style.background = catColor(c);
    const tx = document.createElement('span'); tx.textContent = c;
    li.appendChild(sw); li.appendChild(tx); ul.appendChild(li);
  });
}

function renderQuestion(pytanie, category) {
  $('qCatHost').textContent = category || '—';
  $('qTextHost').textContent = pytanie || 'Zakręć kołem i pokaż pytanie…';
}
function setLocalAnswer(ans) {
  localAnswer = ans;
  $('answerHostVal').textContent = ans || '—';
  answerHidden = true; $('answerHost').classList.add('blurred');
}

function renderTeamConfig() {
  const tc = $('teamConfig'); tc.innerHTML = '';
  const isIdle = state.round.phase === 'idle';

  state.teams.forEach((t, idx) => {
    const block = document.createElement('div'); block.className = 'cfg-team'; block.style.borderLeftColor = t.color;

    const top = document.createElement('div'); top.className = 'cfg-top';
    const reorder = document.createElement('div'); reorder.className = 'reorder';
    const up = document.createElement('button'); up.className = 'btn-ghost'; up.textContent = '▲'; up.disabled = idx === 0;
    up.onclick = () => reorderTeam(idx, idx - 1);
    const down = document.createElement('button'); down.className = 'btn-ghost'; down.textContent = '▼'; down.disabled = idx === state.teams.length - 1;
    down.onclick = () => reorderTeam(idx, idx + 1);
    reorder.appendChild(up); reorder.appendChild(down);

    const name = document.createElement('input'); name.type = 'text'; name.className = 'host-input'; name.value = t.name; name.maxLength = 40;
    name.onblur = () => updateTeam(t.id, name.value, t.color);
    name.onkeydown = (e) => { if (e.key === 'Enter') name.blur(); };

    const rm = document.createElement('button'); rm.className = 'btn-ghost btn-danger btn-remove'; rm.textContent = '✕';
    rm.disabled = state.teams.length <= MIN_TEAMS || !isIdle;
    rm.title = isIdle ? 'Usuń drużynę' : 'Usuwanie tylko między rundami';
    rm.onclick = () => { if (confirm(`Usunąć drużynę „${t.name}”?`)) removeTeam(t.id); };

    top.appendChild(reorder); top.appendChild(name); top.appendChild(rm);
    block.appendChild(top);

    block.appendChild(buildSwatches(t.color, (c) => updateTeam(t.id, t.name, c)));

    const balRow = document.createElement('div'); balRow.className = 'cfg-balance';
    const bal = document.createElement('span'); bal.className = 'bal'; bal.textContent = t.balance.toLocaleString('pl-PL');
    const ctrls = document.createElement('div'); ctrls.className = 'balance-controls';
    [['−1000', -1000], ['−500', -500], ['+500', 500], ['+1000', 1000]].forEach(([lbl, d]) => {
      const b = document.createElement('button'); b.className = 'btn-ghost'; b.textContent = lbl;
      b.onclick = () => manualScore(t.id, d);
      ctrls.appendChild(b);
    });
    balRow.appendChild(bal); balRow.appendChild(ctrls);
    block.appendChild(balRow);

    tc.appendChild(block);
  });

  // przycisk dodawania
  const addBtn = $('addTeamBtn');
  addBtn.disabled = state.teams.length >= MAX_TEAMS || !isIdle;
  addBtn.textContent = state.teams.length >= MAX_TEAMS ? 'Maksimum: 8 drużyn'
    : (!isIdle ? '+ Dodaj drużynę (między rundami)' : '+ Dodaj drużynę');
}

let addFormColor = null;
function renderAddForm() {
  addFormColor = NEXT_COLOR();
  const holder = $('addTeamSwatches'); holder.replaceWith(buildAddSwatches());
}
function buildAddSwatches() {
  const sw = buildSwatches(addFormColor, (c) => { addFormColor = c; const fresh = buildAddSwatches(); $('addTeamSwatches').replaceWith(fresh); });
  sw.id = 'addTeamSwatches';
  return sw;
}

function renderBidRows() {
  const br = $('bidRows'); br.innerHTML = '';
  state.teams.forEach(t => {
    const row = document.createElement('div'); row.className = 'bid-row';
    const bn = document.createElement('span'); bn.className = 'bn'; bn.textContent = t.name; bn.style.color = t.color;
    const inp = document.createElement('input'); inp.type = 'number'; inp.min = '0'; inp.className = 'host-input'; inp.placeholder = 'kwota';
    const btn = document.createElement('button'); btn.className = 'btn-primary'; btn.textContent = 'Zalicytuj';
    const submit = () => { const a = parseInt(inp.value); if (Number.isFinite(a)) { addBid(t.id, a); inp.value = ''; } };
    btn.onclick = submit;
    inp.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    row.appendChild(bn); row.appendChild(inp); row.appendChild(btn);
    br.appendChild(row);
  });
}

function renderAwardGrid() {
  const ag = $('awardGrid'); ag.innerHTML = '';
  state.teams.forEach(t => {
    const b = document.createElement('button'); b.className = 'btn-ghost';
    b.textContent = t.name; b.style.borderBottom = `3px solid ${t.color}`;
    b.onclick = () => awardPool(t.id);
    ag.appendChild(b);
  });
}

function renderPool() { $('poolVal').textContent = (state.round.questionPool || 0).toLocaleString('pl-PL'); }

function renderCatList() {
  const ul = $('catList'); ul.innerHTML = '';
  state.categories.forEach(cat => {
    const total = (state.questions[cat] || []).length;
    const used = (state.usedQuestions[cat] || []).length;
    const li = document.createElement('li');
    const nm = document.createElement('span'); nm.textContent = cat; nm.style.color = catColor(cat);
    const cnt = document.createElement('span'); cnt.className = 'count';
    const b = document.createElement('b'); b.textContent = Math.max(0, total - used);
    cnt.append('zostało ', b, ` / ${total}`);
    li.appendChild(nm); li.appendChild(cnt); ul.appendChild(li);
  });
}

function renderAll() {
  $('titleInput').value = state.gameTitle;
  renderPhase(); renderSpun(); renderHistory();
  renderTeamConfig(); renderBidRows(); renderAwardGrid(); renderPool();
  renderCatList();
  $('timerDisplay').textContent = state.round.timerSeconds;
  if (state.round.phase === 'question' && state.round.category && state.round.questionIndex !== null) {
    const q = (state.questions[state.round.category] || [])[state.round.questionIndex];
    if (q) { renderQuestion(q.pytanie, state.round.category); setLocalAnswer(q.odpowiedz); }
  }
}

// ---------------------------------------------------------------
//  CSV PARSER
// ---------------------------------------------------------------
function parseCsv(text) {
  const rows = splitCsvRows(text);
  const out = {};
  let start = 0;
  if (rows.length && /kategoria/i.test(rows[0][0] || '') && /pytanie/i.test(rows[0][1] || '')) start = 1;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 3) continue;
    const cat = (r[0] || '').trim(), pyt = (r[1] || '').trim(), odp = (r[2] || '').trim();
    if (!cat || !pyt || !odp) continue;
    if (!out[cat]) out[cat] = [];
    out[cat].push({ pytanie: pyt, odpowiedz: odp });
  }
  return out;
}
function splitCsvRows(text) {
  const rows = []; let row = [], field = '', inQ = false;
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += ch;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

function handleFile(file, type) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { toast('Plik za duży (max 5MB)', 'error'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = type === 'json' ? JSON.parse(reader.result) : parseCsv(reader.result);
      if (!data || Object.keys(data).length === 0) { toast('Brak poprawnych pytań w pliku', 'error'); return; }
      loadQuestions(data);
    } catch (err) { toast('Błąd parsowania: ' + err.message, 'error'); }
  };
  reader.onerror = () => toast('Nie udało się odczytać pliku', 'error');
  reader.readAsText(file, 'UTF-8');
}

// ---------------------------------------------------------------
//  EVENT BINDING
// ---------------------------------------------------------------
$('btnSpin').onclick = doSpin;
$('btnShowQuestion').onclick = showQuestion;
$('btnShowAnswer').onclick = showAnswer;
$('btnBlackbox').onclick = blackbox;
$('btnTimerStart').onclick = startTimer;
$('btnTimerPause').onclick = pauseTimer;
$('btnTimerReset').onclick = resetTimer;
$('btnToggleAnswer').onclick = () => {
  if (localAnswer == null) { toast('Najpierw pokaż pytanie', 'error'); return; }
  answerHidden = !answerHidden;
  $('answerHost').classList.toggle('blurred', answerHidden);
};
$('titleInput').onblur = () => updateTitle($('titleInput').value);
$('titleInput').onkeydown = (e) => { if (e.key === 'Enter') e.target.blur(); };
$('btnNewGame').onclick = () => { if (confirm('Rozpocząć nową grę? Punkty i historia zostaną zresetowane (pytania pozostają).')) newGame(); };

$('addTeamBtn').onclick = () => {
  const form = $('addTeamForm');
  form.classList.toggle('open');
  if (form.classList.contains('open')) { renderAddForm(); $('addTeamName').focus(); }
};
$('addTeamConfirm').onclick = () => {
  const nm = $('addTeamName').value.trim();
  if (!nm) { toast('Podaj nazwę drużyny', 'error'); return; }
  addTeam(nm, addFormColor || NEXT_COLOR());
  $('addTeamName').value = ''; $('addTeamForm').classList.remove('open');
};
$('addTeamName').onkeydown = (e) => { if (e.key === 'Enter') $('addTeamConfirm').click(); };

$('uploadJson').onchange = (e) => handleFile(e.target.files[0], 'json');
$('uploadCsv').onchange = (e) => handleFile(e.target.files[0], 'csv');

// Display prosi o stan → odeślij pełny snapshot
on('sync:request', () => sendFullState(publicSnapshot()));

// Start
renderAll();
// Wyślij stan startowy do ewentualnie już otwartego ekranu
sendFullState(publicSnapshot());
