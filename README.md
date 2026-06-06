# Awantura o... — Static Edition

Teleturniej quiz-show działający **w całości w przeglądarce** — bez backendu, bez instalacji.
Dwa okna (Panel Hosta + Widok Ekranu) komunikują się przez **BroadcastChannel API**.
Stan gry trzymany w **localStorage**. Hosting: **GitHub Pages**.

## Jak grać

1. Wejdź na stronę (GitHub Pages lub lokalny serwer — patrz niżej).
2. Kliknij **🎮 PANEL HOSTA** → otwiera się panel sterowania.
3. Kliknij **📺 WIDOK EKRANU** → otwiera się widok dla publiczności.
4. Przeciągnij okno Widoku Ekranu na drugi monitor / projektor (kliknij = pełny ekran).
5. Zakręć kołem, prowadź licytację, pokazuj pytania. Stan synchronizuje się automatycznie.

> **WAŻNE:** oba okna muszą być w **tej samej przeglądarce** (BroadcastChannel działa
> tylko w obrębie jednej instancji przeglądarki, w obrębie tego samego origin).

## Uruchomienie

### Opcja A — GitHub Pages (zalecane, zero instalacji)
1. Wrzuć repozytorium na GitHub.
2. Settings → Pages → Source: gałąź `main`, folder `/root` **lub** `/docs`.
3. Otwórz wygenerowany adres `https://<user>.github.io/<repo>/`.

Wszystkie ścieżki są **relatywne**, więc aplikacja działa też z podfolderu repo.
Folder `docs/` zawiera kopię całej aplikacji — jeśli wybierzesz „Source: /docs", deploy jest gotowy.

### Opcja B — lokalnie (do testów / bez internetu)
Aplikacja używa **ES Modules**, które przeglądarki blokują na `file://` (CORS).
Dlatego uruchom dowolny serwer statyczny, np.:

```bash
node serve-local.cjs        # → http://localhost:3210  (dołączony launcher)
# albo:
npx serve .                 # jeśli masz Node/npm
python -m http.server 8000  # jeśli masz Pythona
```

Następnie otwórz `http://localhost:<port>/`.

> Podwójne kliknięcie `index.html` (`file://`) **nie zadziała** — ES Modules
> i BroadcastChannel wymagają origin `http(s)`. To ograniczenie przeglądarek, nie aplikacji.

## Struktura

```
index.html        — strona startowa (wybór roli)
host.html         — panel hosta (źródło prawdy)
display.html      — widok projektora
css/              — design system (glassmorphism) + style host/display
js/
  channel.js      — wrapper BroadcastChannel
  state.js        — GAME_STATE + localStorage
  questions.js    — 135 pytań inline + walidacja
  wheel.js        — Canvas koło (easeOutQuint)
  host.js         — logika hosta
  display.js      — logika ekranu
docs/             — kopia całości dla GitHub Pages (Source: /docs)
serve-local.cjs   — opcjonalny lokalny serwer (nie jest deployowany)
```

## Drużyny
2–8 drużyn, dynamicznie dodawane/usuwane w panelu hosta (między rundami).
Każda z UUID, własną nazwą i kolorem (paleta 12 + kolor niestandardowy).

## Pytania
135 domyślnych pytań (9 kategorii × 15). Można wgrać własne:
- **JSON**: `{ "Kategoria": [{ "pytanie": "...", "odpowiedz": "..." }] }`
- **CSV**: `kategoria,pytanie,odpowiedz` (nagłówek opcjonalny)
