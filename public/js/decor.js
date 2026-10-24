/**
 * Festive decoration: a rangoli-mandala that turns slowly behind the diya, and a
 * marigold garland with string lights hanging across the top of the page.
 * Purely decorative; everything is generated here so there are no image downloads.
 */

const NS = "http://www.w3.org/2000/svg";
const f = (n) => Math.round(n * 100) / 100;

function mandalaSvg() {
  const gold = "#ffc94a";
  const rose = "#e0386f";
  let a = "";
  // outer scalloped ring of little lotus petals
  for (let i = 0; i < 24; i++) {
    a += `<path d="M0,-96 C5,-90 5,-82 0,-76 C-5,-82 -5,-90 0,-96Z" transform="rotate(${i * 15})" fill="rgba(255,154,31,.16)" stroke="${gold}" stroke-width=".6"/>`;
  }
  let b = "";
  // bigger overlapping petals
  for (let i = 0; i < 12; i++) {
    b += `<path d="M0,-70 C16,-56 16,-36 0,-22 C-16,-36 -16,-56 0,-70Z" transform="rotate(${i * 30})" fill="none" stroke="${gold}" stroke-width=".7"/>`;
  }
  for (let i = 0; i < 36; i++) {
    const r = (i * 10 * Math.PI) / 180;
    b += `<circle cx="${f(Math.sin(r) * 74)}" cy="${f(-Math.cos(r) * 74)}" r="${i % 3 ? 1 : 1.7}" fill="${i % 3 ? gold : rose}"/>`;
  }
  let c = "";
  for (let i = 0; i < 8; i++) {
    c += `<path d="M0,-48 C10,-38 10,-26 0,-16 C-10,-26 -10,-38 0,-48Z" transform="rotate(${i * 45})" fill="rgba(224,56,111,.16)" stroke="${rose}" stroke-width=".7"/>`;
  }
  for (let i = 0; i < 16; i++) {
    c += `<path d="M0,-30 L3,-24 L0,-18 L-3,-24Z" transform="rotate(${i * 22.5})" fill="${gold}" opacity=".7"/>`;
  }
  return `<svg viewBox="-100 -100 200 200" aria-hidden="true" focusable="false">
    <circle r="98" fill="none" stroke="${gold}" stroke-width=".6" stroke-dasharray="1 3"/>
    <circle r="78" fill="none" stroke="${gold}" stroke-width=".5"/>
    <circle r="66" fill="none" stroke="${gold}" stroke-width=".5"/>
    <g class="m-slow">${a}</g>
    <g class="m-rev">${b}</g>
    <g class="m-slow">${c}</g>
  </svg>`;
}

function marigold(x, y, r, tone) {
  const colors = [["#ff9a1f", "#ffb52e"], ["#ffb52e", "#ffd25a"], ["#e8650c", "#ff8a1f"]][tone % 3];
  let s = `<g transform="translate(${f(x)} ${f(y)})">`;
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2;
    s += `<circle cx="${f(Math.cos(t) * r * 0.62)}" cy="${f(Math.sin(t) * r * 0.62)}" r="${f(r * 0.5)}" fill="${colors[0]}"/>`;
  }
  s += `<circle r="${f(r * 0.62)}" fill="${colors[1]}"/><circle r="${f(r * 0.24)}" fill="#c24a08"/></g>`;
  return s;
}

function garlandSvg(W) {
  const H = 96;
  const sag = (x, base, depth) => base + Math.sin((x / W) * Math.PI) * depth; // hangs lower in the middle
  let strand = "";
  let flowers = "";
  let lights = "";
  const step = 22;
  let k = 0;
  for (let x = 0; x <= W + step; x += step, k++) {
    flowers += marigold(x, sag(x, 6, 20), 9.5, k);
  }
  // hanging drops with a flower and a leaf at the end
  const dropStep = Math.max(56, W / 9);
  let d = 0;
  for (let x = dropStep / 2; x < W; x += dropStep, d++) {
    const y0 = sag(x, 6, 20);
    const len = 20 + ((d * 7) % 3) * 9;
    strand += `<g class="drop" style="animation-delay:${f(-d * 0.6)}s;transform-origin:${f(x)}px ${f(y0)}px">
      <line x1="${f(x)}" y1="${f(y0)}" x2="${f(x)}" y2="${f(y0 + len)}" stroke="#ffc94a" stroke-width="1"/>
      ${marigold(x, y0 + len + 7, 7, d + 1)}
      <path d="M${f(x)},${f(y0 + len - 2)} q-9,3 -10,10 q8,-1 10,-10z M${f(x)},${f(y0 + len - 2)} q9,3 10,10 q-8,-1 -10,-10z" fill="#3f8a3a" opacity=".85"/>
    </g>`;
  }
  // a thin wire of fairy lights hanging just under the flowers
  const bulbs = Math.round(W / 30);
  for (let i = 0; i <= bulbs; i++) {
    const x = (i / bulbs) * W;
    const y = sag(x, 24, 20) + 10 + ((i % 2) * 4);
    const hue = ["#fff0b8", "#ffc45a", "#ff9a3a"][i % 3];
    lights += `<circle class="bulb" cx="${f(x)}" cy="${f(y)}" r="2.6" fill="${hue}" style="animation-delay:${f(-(i % 5) * 0.45)}s"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true" focusable="false">
    <path d="M0,6 Q${W / 2},46 ${W},6" fill="none" stroke="#7a3a10" stroke-width="3"/>
    ${flowers}${strand}${lights}
  </svg>`;
}

export function startDecor(diya) {
  const mandala = document.createElement("div");
  mandala.className = "mandala";
  mandala.innerHTML = mandalaSvg();
  diya.prepend(mandala);

  const garland = document.createElement("div");
  garland.className = "garland";
  document.body.prepend(garland);

  let width = 0;
  const draw = () => {
    const w = Math.round(window.innerWidth);
    if (w === width) return;
    width = w;
    garland.innerHTML = garlandSvg(w);
  };
  draw();
  let t = 0;
  window.addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(draw, 150);
  });
}
