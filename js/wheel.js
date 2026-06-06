/* ============================================================
   SpinWheel — Canvas koło kategorii z animacją easeOutQuint.
   ============================================================ */

const SEGMENT_COLORS = [
  '#8B5CF6', '#EF4444', '#F97316', '#EC4899', '#22C55E',
  '#3B82F6', '#14B8A6', '#A855F7', '#F59E0B', '#1A1A2E'
];

function shortLabel(cat) {
  const map = {
    'Film, Bajki i Seriale': 'Film i Bajki',
    'Zwierzęta i Przyroda': 'Zwierzęta',
    'Historia i Ciekawostki': 'Historia',
    'Polska — Ludzie i Miejsca': 'Polska',
    'Nauka i Wynalazki': 'Nauka',
    'Jastrzębie-Zdrój': 'Jastrzębie',
    'Czarna Skrzynka': 'Czarna Skrzynka'
  };
  return map[cat] || cat;
}

export class SpinWheel {
  constructor(canvas, categories) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.categories = categories;
    this.currentAngle = 0;
    this.spinning = false;
    this.glowIdx = -1;
    this.glowVal = 0;
    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  setCategories(categories) {
    this.categories = categories;
    this.draw(this.currentAngle);
  }

  resize() {
    // Rozmiar liczony z faktycznej komórki kolumny koła — wypełnia dostępną przestrzeń.
    const col = this.canvas.closest('.wheel-col');
    let avail;
    if (col && col.clientWidth && col.clientHeight) {
      avail = Math.min(col.clientWidth - 16, col.clientHeight - 16);
    } else {
      avail = Math.min(window.innerWidth * 0.56, window.innerHeight * 0.84);
    }
    const size = Math.max(420, Math.min(avail, 860));
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.canvas.style.width = size + 'px';
    this.canvas.style.height = size + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.size = size;
    this.draw(this.currentAngle);
  }

  /**
   * Indeks segmentu znajdującego się dokładnie pod wskaźnikiem (na górze) dla danego kąta obrotu.
   * Segment i jest rysowany od (angle - π/2 + i*seg); jego środek = angle - π/2 + (i+0.5)*seg.
   * Wskaźnik celuje w kierunek -π/2 (góra), więc szukamy i: środek ≡ -π/2.
   */
  segmentAtPointer(angle) {
    const n = this.categories.length;
    const seg = (2 * Math.PI) / n;
    const i = Math.round((-angle) / seg - 0.5);
    return ((i % n) + n) % n;
  }

  /**
   * Kręci kołem tak, by środek wylosowanego segmentu zatrzymał się pod wskaźnikiem.
   * KLUCZOWE: liczba pełnych obrotów musi być CAŁKOWITA, inaczej koło nie trafi w segment.
   */
  spin(targetCategory, onComplete, durationOverride) {
    if (this.spinning) return;
    const n = this.categories.length;
    const targetIdx = this.categories.indexOf(targetCategory);
    if (targetIdx < 0) { onComplete?.(targetCategory); return; }
    this.spinning = true;
    this.glowIdx = -1;

    const seg = (2 * Math.PI) / n;
    const jitter = (Math.random() - 0.5) * seg * 0.5;        // ± ćwierć segmentu (bezpiecznie w środku)
    const desired = -(targetIdx + 0.5) * seg + jitter;       // kąt, przy którym środek segmentu jest na górze
    const currentMod = ((this.currentAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const desiredMod = ((desired % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const delta = ((desiredMod - currentMod) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const fullTurns = 5 + Math.floor(Math.random() * 3);     // 5, 6 lub 7 PEŁNYCH obrotów
    const totalRotation = fullTurns * 2 * Math.PI + delta;

    const duration = durationOverride || (5000 + Math.random() * 1500);
    const startTime = performance.now();
    const startAngle = this.currentAngle;
    const easeOutQuint = t => 1 - Math.pow(1 - t, 5);

    const frame = (now) => {
      const t = Math.min((now - startTime) / duration, 1);
      this.currentAngle = startAngle + totalRotation * easeOutQuint(t);
      this.draw(this.currentAngle);
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        this.currentAngle = startAngle + totalRotation;       // dokładne wyrównanie końcowe
        this.draw(this.currentAngle);
        this.spinning = false;
        const landed = this.segmentAtPointer(this.currentAngle);
        this.glowSegment(landed);
        onComplete?.(this.categories[landed]);
      }
    };
    requestAnimationFrame(frame);
  }

  draw(angle) {
    const { ctx, categories } = this;
    const W = this.size, H = this.size;
    const cx = W / 2, cy = H / 2;
    const r = Math.min(cx, cy) - 8;
    const segAngle = (2 * Math.PI) / categories.length;

    ctx.clearRect(0, 0, W, H);

    // zewnętrzny złoty ring
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(245,166,35,0.55)';
    ctx.lineWidth = 3;
    ctx.stroke();

    categories.forEach((cat, i) => {
      const startA = angle + i * segAngle - Math.PI / 2;
      const endA = startA + segAngle;
      const color = cat === 'Czarna Skrzynka' ? '#1A1A2E' : SEGMENT_COLORS[i % SEGMENT_COLORS.length];

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startA, endA);
      ctx.closePath();

      if (i === this.glowIdx && this.glowVal > 0) {
        ctx.save();
        ctx.shadowBlur = this.glowVal * 36;
        ctx.shadowColor = cat === 'Czarna Skrzynka' ? '#F5A623' : color;
        ctx.fillStyle = color; ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = color; ctx.fill();
      }

      // gradient overlay (głębia)
      const grad = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r);
      grad.addColorStop(0, 'rgba(0,0,0,0.25)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad; ctx.fill();

      // złota obwódka dla Czarnej Skrzynki
      if (cat === 'Czarna Skrzynka') {
        ctx.strokeStyle = 'rgba(245,166,35,0.9)'; ctx.lineWidth = 2; ctx.stroke();
      }

      // separator
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + r * Math.cos(startA), cy + r * Math.sin(startA));
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();

      // etykieta — promieniście (od środka na zewnątrz), zawsze pionowo, w obrębie klina
      const midA = startA + segAngle / 2;
      const label = shortLabel(cat).toUpperCase();
      const rInner = r * 0.30, rOuter = r * 0.93;
      const maxLen = rOuter - rInner;                 // dostępna długość wzdłuż promienia
      ctx.save();
      ctx.translate(cx, cy);
      const m = ((midA % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const leftSide = m > Math.PI / 2 && m < 3 * Math.PI / 2;  // dolna/lewa połowa → obrót o 180°
      ctx.rotate(leftSide ? midA + Math.PI : midA);
      ctx.fillStyle = cat === 'Czarna Skrzynka' ? '#F5A623' : '#FFFFFF';
      ctx.textBaseline = 'middle';
      ctx.letterSpacing = Math.max(0.5, r * 0.004) + 'px';
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4;
      // auto-dopasowanie rozmiaru, by zmieścić się w promieniu klina
      let fontSize = Math.min(r * 0.12, 32);
      ctx.font = `${fontSize}px 'Bebas Neue', sans-serif`;
      while (fontSize > 12 && ctx.measureText(label).width > maxLen) {
        fontSize -= 1; ctx.font = `${fontSize}px 'Bebas Neue', sans-serif`;
      }
      if (leftSide) { ctx.textAlign = 'left'; ctx.fillText(label, -rOuter, 0); }
      else { ctx.textAlign = 'right'; ctx.fillText(label, rOuter, 0); }
      ctx.restore();
    });

    // środkowy krąg
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.15);
    cg.addColorStop(0, '#FFD166'); cg.addColorStop(1, '#8B4513');
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.13, 0, Math.PI * 2);
    ctx.fillStyle = cg; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#04060F'; ctx.font = `700 ${r * 0.12}px 'Bebas Neue', sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', cx, cy + r * 0.01);

    // wskaźnik (złoty trójkąt u góry, nieruchomy)
    const pw = r * 0.07, ph = r * 0.12;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r + ph + 2);     // czubek skierowany w dół, do środka koła
    ctx.lineTo(cx - pw, cy - r - 6);
    ctx.lineTo(cx + pw, cy - r - 6);
    ctx.closePath();
    ctx.fillStyle = '#F5A623';
    ctx.shadowColor = 'rgba(245,166,35,0.8)'; ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  glowSegment(idx) {
    this.glowIdx = idx; this.glowVal = 0;
    let dir = 1;
    const t0 = performance.now();
    const loop = (now) => {
      this.glowVal += dir * 0.05;
      if (this.glowVal >= 1) { this.glowVal = 1; dir = -1; }
      if (this.glowVal <= 0 && dir < 0) this.glowVal = 0;
      this.draw(this.currentAngle);
      if (now - t0 < 2000) requestAnimationFrame(loop);
      else { this.glowVal = 0; this.glowIdx = -1; this.draw(this.currentAngle); }
    };
    requestAnimationFrame(loop);
  }
}
