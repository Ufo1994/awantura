/* ============================================================
   DISPLAY — odbiera eventy z BroadcastChannel i renderuje.
   ============================================================ */

import { on, requestSync } from './channel.js';
import { SpinWheel } from './wheel.js';

const SEGMENT_COLORS = {
  'Muzyka': '#8B5CF6', 'Sport': '#EF4444', 'Film, Bajki i Seriale': '#F97316',
  'Kulinaria': '#EC4899', 'Zwierzęta i Przyroda': '#22C55E', 'Historia i Ciekawostki': '#3B82F6',
  'Polska — Ludzie i Miejsca': '#14B8A6', 'Nauka i Wynalazki': '#A855F7',
  'Jastrzębie-Zdrój': '#F59E0B', 'Czarna Skrzynka': '#1A1A2E'
};
const catColor = (c) => SEGMENT_COLORS[c] || '#555';

const DEFAULT_CATEGORIES = [
  'Muzyka', 'Sport', 'Film, Bajki i Seriale', 'Kulinaria',
  'Zwierzęta i Przyroda', 'Historia i Ciekawostki',
  'Polska — Ludzie i Miejsca', 'Nauka i Wynalazki',
  'Jastrzębie-Zdrój', 'Czarna Skrzynka'
];

const $ = (id) => document.getElementById(id);

// --- elementy ---
const wheel = new SpinWheel($('wheel'), DEFAULT_CATEGORIES);
const teamsEl = $('teams');
const poolEl = $('pool');
const poolValEl = $('poolVal');
const statusBar = $('statusBar');
const gameTitleEl = $('gameTitle');
const qOverlay = $('qOverlay');
const qCat = $('qCat');
const qText = $('qText');
const answerBox = $('answerBox');
const answerTxt = $('answerTxt');
const timerWrap = $('timerWrap');
const timerNum = $('timerNum');
const timerProg = $('timerProg');
const blackbox = $('blackbox');
const bbTitle = $('bbTitle');

let displayedBalances = {};

// === TIMER SVG ===
const TIMER_MAX = 60, RAD = 90, CIRC = 2 * Math.PI * RAD;
timerProg.style.strokeDasharray = CIRC;
function setTimer(seconds) {
  timerNum.textContent = seconds;
  const frac = Math.max(0, Math.min(1, seconds / TIMER_MAX));
  timerProg.style.strokeDashoffset = CIRC * (1 - frac);
  let color = '#39FF14';
  if (seconds <= 20) color = '#FF4D4D';
  else if (seconds <= 40) color = '#F5A623';
  timerProg.style.stroke = color;
  timerNum.style.color = seconds <= 20 ? '#FF4D4D' : '#FFFFFF';
  if (seconds <= 10 && seconds > 0) sndBeep();
}

// === TABLICA WYNIKÓW ===
function renderTeams(teams) {
  if (!Array.isArray(teams)) return;
  const maxBal = Math.max(1, ...teams.map(t => t.balance));
  const leaders = teams.filter(t => t.balance === maxBal).length;
  const uniqueLeader = maxBal > 0 && leaders === 1;
  const count = teams.length;
  const sizes = count <= 3 ? ['clamp(22px,2.6vw,38px)', 'clamp(34px,4.4vw,64px)']
              : count <= 5 ? ['clamp(18px,2vw,28px)', 'clamp(26px,3.2vw,46px)']
              : ['clamp(15px,1.6vw,22px)', 'clamp(20px,2.4vw,34px)'];

  teamsEl.innerHTML = '';
  teams.forEach(t => {
    const card = document.createElement('div');
    card.className = 'team-card' + (uniqueLeader && t.balance === maxBal ? ' leader' : '');
    card.style.borderLeftColor = t.color;
    card.dataset.teamId = t.id;

    const info = document.createElement('div'); info.className = 'info';
    const name = document.createElement('div'); name.className = 'team-name';
    name.style.fontSize = sizes[0]; name.style.color = t.color;
    name.textContent = t.name;
    const bal = document.createElement('div'); bal.className = 'team-balance';
    bal.style.fontSize = sizes[1];
    const num = document.createElement('span'); num.dataset.teamId = t.id;
    bal.appendChild(num);

    const track = document.createElement('div'); track.className = 'balance-track';
    const fill = document.createElement('div'); fill.className = 'balance-bar';
    fill.style.background = t.color;
    fill.style.width = Math.max(0, Math.min(100, (t.balance / maxBal) * 100)) + '%';
    track.appendChild(fill);

    info.appendChild(name); info.appendChild(bal); info.appendChild(track);
    card.appendChild(info);
    teamsEl.appendChild(card);

    const from = displayedBalances[t.id] ?? t.balance;
    animateCount(num, from, t.balance, 800);
    displayedBalances[t.id] = t.balance;
  });
}

function animateCount(el, from, to, dur) {
  if (from === to) { el.textContent = to.toLocaleString('pl-PL'); return; }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(from + (to - from) * eased).toLocaleString('pl-PL');
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function updatePool(amount) {
  const start = parseInt((poolValEl.textContent || '0').replace(/\D/g, '')) || 0;
  animateCount(poolValEl, start, amount || 0, 600);
  poolEl.classList.toggle('show', (amount || 0) > 0);
}

// === STATUS ===
function setStatus(text) { statusBar.innerHTML = ''; statusBar.append(document.createTextNode(text)); }
function setStatusCategory(prefix, category) {
  statusBar.innerHTML = '';
  statusBar.append(document.createTextNode(prefix));
  const chip = document.createElement('span'); chip.className = 'cat-chip';
  chip.style.background = catColor(category);
  if (category === 'Czarna Skrzynka') chip.style.color = '#F5A623';
  chip.textContent = category;
  statusBar.appendChild(chip);
}

// === OVERLAYE ===
function showQuestion(pytanie, category) {
  hideBlackbox();
  qCat.textContent = category;
  qText.textContent = pytanie;
  answerBox.classList.remove('show'); answerTxt.textContent = '';
  timerWrap.classList.remove('hidden'); setTimer(60);
  qOverlay.classList.remove('show'); void qOverlay.offsetWidth;
  qOverlay.classList.add('show');
}
function hideQuestion() { qOverlay.classList.remove('show'); }
function showAnswer(odpowiedz) {
  answerTxt.textContent = odpowiedz;
  answerBox.classList.remove('show'); void answerBox.offsetWidth;
  answerBox.classList.add('show');
}

// === CZARNA SKRZYNKA ===
let bbBuilt = false, typeTimer = null;
function buildBlackboxParticles() {
  if (bbBuilt) return; bbBuilt = true;
  const host = $('bbParticles');
  for (let i = 0; i < 24; i++) {
    const p = document.createElement('div'); p.className = 'particle';
    p.style.cssText = `left:${Math.random()*100}%;top:${Math.random()*100}%;` +
      `width:${2+Math.random()*5}px;height:${2+Math.random()*5}px;` +
      `opacity:${0.15+Math.random()*0.4};animation:particle-float ${5+Math.random()*7}s linear ${Math.random()*6}s infinite;`;
    host.appendChild(p);
  }
}
function showBlackbox() {
  hideQuestion(); buildBlackboxParticles();
  blackbox.classList.add('show');
  sndFanfare();
  const full = 'CZARNA SKRZYNKA'; bbTitle.textContent = '';
  clearInterval(typeTimer); let i = 0;
  typeTimer = setInterval(() => { bbTitle.textContent = full.slice(0, ++i); if (i >= full.length) clearInterval(typeTimer); }, 80);
}
function hideBlackbox() { blackbox.classList.remove('show'); }

// === AMBIENT PARTICLES (tło) ===
(function buildParticles() {
  const host = $('particles');
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div'); p.className = 'particle';
    p.style.cssText = `left:${Math.random()*100}vw;top:${Math.random()*100}vh;` +
      `width:${2+Math.random()*4}px;height:${2+Math.random()*4}px;` +
      `opacity:${0.1+Math.random()*0.3};animation-delay:${Math.random()*8}s;animation-duration:${6+Math.random()*8}s;`;
    host.appendChild(p);
  }
})();

// === WEB AUDIO ===
let actx = null;
function ac() { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); return actx; }
function tone(f1, f2, dur, type = 'sine', gain = 0.15) {
  try {
    const a = ac(); const o = a.createOscillator(); const g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f1, a.currentTime);
    o.frequency.linearRampToValueAtTime(f2, a.currentTime + dur);
    g.gain.setValueAtTime(gain, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + dur);
  } catch (e) {}
}
function sndWhoosh() { tone(200, 900, 0.5, 'sawtooth', 0.08); }
function sndDing() { tone(800, 400, 0.3, 'triangle', 0.18); }
function sndBeep() { tone(880, 880, 0.05, 'square', 0.1); }
function sndEnd() { tone(300, 80, 1.0, 'sawtooth', 0.2); }
function sndFanfare() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, f, 0.2, 'triangle', 0.18), i * 200)); }

// === PHASE TRANSITION ===
const stage = $('stage');
function phaseFlash() { stage.classList.add('phase-out'); setTimeout(() => stage.classList.remove('phase-out'), 220); }

// === APLIKACJA STANU ===
function applyFullState(s) {
  if (!s) return;
  if (s.gameTitle) gameTitleEl.textContent = s.gameTitle;
  if (s.categories) wheel.setCategories(s.categories);
  if (s.teams) renderTeams(s.teams);
  updatePool(s.round?.questionPool || 0);
  const phase = s.round?.phase;
  if (phase === 'question' && s.round?.category) {
    // host odsyła tekst pytania w sync (currentQuestionText), bez odpowiedzi
    if (s.currentQuestionText) showQuestion(s.currentQuestionText, s.round.category);
    setTimer(s.round.timerSeconds ?? 60);
  } else if (phase === 'blackbox') {
    showBlackbox();
  } else {
    hideQuestion(); hideBlackbox();
  }
  if (s.round?.category && phase !== 'blackbox') setStatusCategory('Kategoria: ', s.round.category);
}

// === NASŁUCH EVENTÓW ===
on('sync:full-state', applyFullState);

on('config:update', ({ gameTitle, teams, categories }) => {
  if (gameTitle) gameTitleEl.textContent = gameTitle;
  if (categories) wheel.setCategories(categories);
  if (teams) renderTeams(teams);
});

on('scores:update', ({ teams }) => { if (teams) renderTeams(teams); });
on('pool:update', ({ amount }) => updatePool(amount));

on('spin:start', ({ targetCategory, spinDuration }) => {
  hideQuestion(); hideBlackbox();
  setStatus('🎡 Zakręcono!');
  sndWhoosh();
  wheel.spin(targetCategory, (cat) => { sndDing(); setStatusCategory('Wylosowano: ', cat); }, spinDuration);
});

on('phase:change', ({ phase }) => {
  if (phase === 'idle') { hideQuestion(); hideBlackbox(); }
});

on('question:show', ({ pytanie, category }) => { phaseFlash(); showQuestion(pytanie, category); setStatusCategory('Pytanie: ', category); });
on('answer:show', ({ odpowiedz }) => showAnswer(odpowiedz));
on('timer:tick', ({ seconds }) => setTimer(seconds));
on('timer:end', () => { sndEnd(); timerNum.style.color = '#FF4D4D'; });
on('blackbox:show', () => { phaseFlash(); showBlackbox(); });

on('game:reset', () => {
  displayedBalances = {};
  hideQuestion(); hideBlackbox();
  setStatus('Nowa gra — czekamy na rozpoczęcie…');
});

// fullscreen + odblokowanie audio przy pierwszym kliknięciu
document.addEventListener('click', () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  ac();
});

// po otwarciu poproś hosta o pełny stan
requestSync();
// ponów, jeśli host startuje wolniej
setTimeout(requestSync, 600);
