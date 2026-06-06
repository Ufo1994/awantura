/* ============================================================
   GAME_STATE — źródło prawdy (host), persystencja localStorage.
   ============================================================ */

import { DEFAULT_QUESTIONS } from './questions.js';

const STORAGE_KEY = 'awantura-state';

export const MIN_TEAMS = 2;
export const MAX_TEAMS = 8;
export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
export const START_BALANCE = 5000;

/** Paleta 12 sugerowanych kolorów drużyn. */
export const TEAM_COLORS = [
  '#3B82F6', '#22C55E', '#EAB308', '#EF4444',
  '#8B5CF6', '#F97316', '#14B8A6', '#EC4899',
  '#F59E0B', '#06B6D4', '#A855F7', '#84CC16'
];

export const CATEGORIES = [
  'Muzyka', 'Sport', 'Film, Bajki i Seriale', 'Kulinaria',
  'Zwierzęta i Przyroda', 'Historia i Ciekawostki',
  'Polska — Ludzie i Miejsca', 'Nauka i Wynalazki',
  'Jastrzębie-Zdrój', 'Czarna Skrzynka'
];

/** Generator id — UUID jeśli dostępny, inaczej fallback. */
export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'team-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function defaultTeams() {
  return [
    { id: uid(), name: 'Drużyna Niebieska', color: '#3B82F6', balance: START_BALANCE },
    { id: uid(), name: 'Drużyna Zielona', color: '#22C55E', balance: START_BALANCE },
    { id: uid(), name: 'Drużyna Żółta', color: '#EAB308', balance: START_BALANCE }
  ];
}

export function getDefaultState() {
  return {
    gameTitle: 'Awantura o Omegę',
    teams: defaultTeams(),
    categories: CATEGORIES.slice(),
    questions: structuredClone(DEFAULT_QUESTIONS),
    round: {
      phase: 'idle',        // idle | spinning | bidding | question | answer | blackbox
      category: null,
      questionPool: 0,
      questionIndex: null,
      timerSeconds: 60,
      timerActive: false
    },
    usedQuestions: {},      // { 'Muzyka': [0,3,7], ... }
    spinHistory: []
  };
}

/** Zapis do localStorage (bez wywrotki gdy quota/Private mode). */
export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('[state] Nie udało się zapisać do localStorage:', err.message);
  }
}

/** Wczytanie stanu (scalone z defaultami dla pól, które mogły dojść). */
export function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return getDefaultState();
    const parsed = JSON.parse(saved);
    const base = getDefaultState();
    const merged = Object.assign(base, parsed);
    merged.round = Object.assign(base.round, parsed.round || {});
    merged.round.timerActive = false; // timer nie przeżywa odświeżenia
    if (!Array.isArray(merged.teams) || merged.teams.length < MIN_TEAMS) merged.teams = base.teams;
    if (!merged.questions || Object.keys(merged.questions).length === 0) merged.questions = base.questions;
    return merged;
  } catch (err) {
    console.warn('[state] Błąd wczytywania stanu, używam defaultów:', err.message);
    return getDefaultState();
  }
}

export function resetState() {
  const fresh = getDefaultState();
  saveState(fresh);
  return fresh;
}

/** Reset rozgrywki bez kasowania bazy pytań (NOWA GRA). */
export function newGameState(prev) {
  const fresh = getDefaultState();
  fresh.gameTitle = prev.gameTitle;          // tytuł zostaje
  fresh.questions = prev.questions;          // pytania zostają
  fresh.categories = prev.categories;
  saveState(fresh);
  return fresh;
}
