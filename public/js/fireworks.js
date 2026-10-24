/**
 * Fire crackers for the moment a diya catches: rockets climb from the bottom of the
 * screen and burst into coloured sparks. Skipped entirely when motion is reduced.
 */

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const PALETTES = [
  ["#ffd25a", "#ff9a1f", "#fff3cf"],
  ["#ff5c8a", "#e0386f", "#ffd1e0"],
  ["#7fd8ff", "#4aa8ff", "#e0f6ff"],
  ["#9dff9d", "#3ddc84", "#e6ffe6"],
  ["#d6a8ff", "#a05cff", "#f1e0ff"],
];

let canvas, ctx, W, H, dpr, raf, last;
let rockets = [];
let sparks = [];
let queue = []; // [time, x, y]
let clock = 0;

function setup() {
  canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:5";
  document.body.append(canvas);
  ctx = canvas.getContext("2d");
  const fit = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fit();
  window.addEventListener("resize", fit);
}

function burst(x, y) {
  const pal = PALETTES[Math.floor(Math.random() * PALETTES.length)];
  const n = 46 + Math.floor(Math.random() * 24);
  const power = 90 + Math.random() * 90;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
    const v = power * (0.45 + Math.random() * 0.55);
    sparks.push({
      x, y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: 0,
      ttl: 1.1 + Math.random() * 0.9,
      color: pal[Math.floor(Math.random() * pal.length)],
      r: 1.2 + Math.random() * 1.4,
    });
  }
  // a flash at the centre of the burst
  sparks.push({ x, y, vx: 0, vy: 0, life: 0, ttl: 0.25, color: "#fff7e0", r: 14, flash: true });
  navigator.vibrate?.(8);
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  clock += dt;

  while (queue.length && queue[0][0] <= clock) {
    const [, x, y] = queue.shift();
    rockets.push({ x: x + (Math.random() - 0.5) * 40, y: H + 10, tx: x, ty: y, vy: -(H - y) / 0.75, trail: [] });
  }

  // fade the previous frame instead of clearing it so sparks leave trails
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "lighter";

  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    r.y += r.vy * dt;
    r.x += (r.tx - r.x) * Math.min(1, dt * 2);
    ctx.fillStyle = "#ffe9a8";
    ctx.beginPath();
    ctx.arc(r.x, r.y, 2, 0, 6.283);
    ctx.fill();
    if (r.y <= r.ty) {
      burst(r.x, r.y);
      rockets.splice(i, 1);
    }
  }

  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life += dt;
    if (s.life >= s.ttl) { sparks.splice(i, 1); continue; }
    const k = s.life / s.ttl;
    if (s.flash) {
      ctx.fillStyle = `rgba(255, 240, 200, ${0.5 * (1 - k)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * (1 + k * 4), 0, 6.283);
      ctx.fill();
      continue;
    }
    s.vx *= 1 - dt * 1.4;
    s.vy = s.vy * (1 - dt * 1.4) + 110 * dt; // drag and a little gravity
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * (1 - k * 0.5), 0, 6.283);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  if (queue.length || rockets.length || sparks.length) {
    raf = requestAnimationFrame(frame);
  } else {
    raf = 0;
    ctx.clearRect(0, 0, W, H);
  }
}

export function fireworks() {
  if (reduced) return;
  if (!canvas) setup();
  const shots = 9;
  clock = 0;
  queue = [];
  for (let i = 0; i < shots; i++) {
    const t = i * 0.28 + Math.random() * 0.15;
    queue.push([t, W * (0.12 + Math.random() * 0.76), H * (0.12 + Math.random() * 0.38)]);
  }
  queue.sort((a, b) => a[0] - b[0]);
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
}
