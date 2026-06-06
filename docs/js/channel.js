/* ============================================================
   BroadcastChannel wrapper — komunikacja host ↔ display
   w obrębie jednej przeglądarki (bez backendu).
   ============================================================ */

const CHANNEL_NAME = 'awantura-game-channel';
const bc = new BroadcastChannel(CHANNEL_NAME);

/** Wyślij event do drugiego okna. */
export function send(type, payload = {}) {
  bc.postMessage({ type, payload, ts: Date.now() });
}

/** Nasłuchuj eventu konkretnego typu. Zwraca funkcję odpinającą. */
export function on(type, handler) {
  const listener = (e) => {
    if (e.data && e.data.type === type) handler(e.data.payload, e.data);
  };
  bc.addEventListener('message', listener);
  return () => bc.removeEventListener('message', listener);
}

/** Display prosi hosta o pełny stan po otwarciu/odświeżeniu. */
export function requestSync() {
  send('sync:request');
}

/** Host odsyła pełny stan. */
export function sendFullState(state) {
  send('sync:full-state', state);
}

export { CHANNEL_NAME };
