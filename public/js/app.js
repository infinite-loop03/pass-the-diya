import qrcode from "/vendor/qrcode.mjs";
import { config } from "/config.js";
import { decodeFlame, encodeFlame, epochDay, firstFlame, flameUrl, nextFlame } from "/js/link.js";
import { LAND } from "/js/world.js";
import { startAmbient } from "/js/ambient.js";
import { startDecor } from "/js/decor.js";
import { fireworks } from "/js/fireworks.js";

const $ = (id) => document.getElementById(id);
const body = document.body;
const myDiya = $("myDiya");
startAmbient(myDiya);
startDecor(myDiya);

const STORAGE_KEY = "ptd.flame.v1";
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const HOLD_MS = reducedMotion ? 500 : 1200;
const SITE = `${location.origin}/`;
const fmt = new Intl.NumberFormat("en-IN");

// ---------------------------------------------------------------- storage
// Only this browser ever sees it. It may be unavailable (private mode), so every call is guarded.
const store = {
  get() { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } },
  set(v) { try { localStorage.setItem(STORAGE_KEY, v); } catch { /* still works for this visit */ } },
  clear() { try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing to clear */ } },
};

// ---------------------------------------------------------------- drawing

function diyaSvg() {
  const dots = [];
  for (let i = 0; i < 9; i++) {
    const x = 52 + i * 12;
    const u = (x - 100) / 56;
    const y = 163 - 12 * u * u;
    dots.push(
      `<circle cx="${x}" cy="${y.toFixed(1)}" r="${i % 2 ? 2.4 : 3.3}" fill="${i % 2 ? "#E0386F" : "#F6E7C8"}"/>`
    );
  }
  return `
  <svg class="diya-art" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
    <ellipse class="halo" cx="100" cy="74" rx="80" ry="88" fill="url(#g-halo)"/>
    <g class="clay">
      <ellipse cx="100" cy="189" rx="30" ry="6.5" fill="#4A1C0A"/>
      <path d="M22 118 C28 170 62 188 100 188 C138 188 172 170 178 118 Z" fill="url(#g-clay)"/>
      <path d="M38 128 C44 156 64 172 86 179" stroke="#FFE6BE" stroke-opacity=".16" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M36 138 C66 160 134 160 164 138" stroke="#FFC94A" stroke-opacity=".75" stroke-width="2.4" fill="none"/>
      ${dots.join("")}
      <ellipse cx="100" cy="118" rx="78" ry="15" fill="url(#g-rim)"/>
      <ellipse cx="100" cy="118" rx="66" ry="10.5" fill="url(#g-oil)"/>
    </g>
    <ellipse class="glint" cx="100" cy="117" rx="42" ry="7.5" fill="url(#g-glint)"/>
    <path class="ghost" d="M100 22 C108 44 124 62 122 82 C120 97 110 104 100 104 C90 104 80 97 78 82 C76 62 92 44 100 22 Z" fill="none" stroke="#F6E7C8" stroke-width="1.6" stroke-dasharray="4 5" stroke-linecap="round"/>
    <path d="M100 121 C98.5 115 101.5 110 100 104" stroke="#2A1810" stroke-width="3.2" stroke-linecap="round" fill="none"/>
    <g class="flame">
      <path class="flame-outer" d="M100 16 C108 40 126 60 124 82 C122 99 111 107 100 107 C89 107 78 99 76 82 C74 60 92 40 100 16 Z" fill="url(#g-flame)"/>
      <path class="flame-inner" d="M100 50 C105 63 112 74 111 87 C110 97 105 102 100 102 C95 102 90 97 89 87 C88 74 95 63 100 50 Z" fill="url(#g-core)"/>
      <ellipse cx="100" cy="102" rx="5.5" ry="4.5" fill="#7DB2FF" opacity=".5"/>
    </g>
  </svg>`;
}

for (const id of ["myDiya", "theirDiya", "qrDiya"]) $(id).insertAdjacentHTML("afterbegin", diyaSvg());

// ---------------------------------------------------------------- words

const place = (city) => city || "Somewhere";

function ordinal(n) {
  const mod100 = n % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${fmt.format(n)}${suffix}`;
}

function daysAgo(day) {
  const d = Math.max(0, epochDay() - day);
  return d === 0 ? "today" : d === 1 ? "yesterday" : `${fmt.format(d)} days ago`;
}

/** "in Pune 3 days ago", or "3 days ago" when we don't know where it began. */
const began = (flame) => `${flame.o ? `in ${flame.o} ` : ""}${daysAgo(flame.s)}`;

function shareText(flame) {
  return flame.d === 1
    ? "I lit the first diya and I'm passing its flame to you 🪔 Hold to light yours, then pass it on."
    : `I'm passing my diya's flame to you 🪔 Mine is the ${ordinal(flame.d)} in a chain of light that began ${began(flame)}. Hold to light yours, then pass it on.`;
}

function setText(el, html) {
  // Only our own strings and escaped city names reach innerHTML.
  el.innerHTML = html;
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------------------------------------------------------------- network

async function api(path, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(path, { ...init, signal: ctrl.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null; // over quota, offline, or slow: the page carries on without it
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- state

const params = new URLSearchParams(location.search);
if (params.has("reset") && ["localhost", "127.0.0.1"].includes(location.hostname)) {
  store.clear();
  history.replaceState(null, "", location.pathname);
}

const rawIncoming = params.get("f");
const incoming = decodeFlame(rawIncoming);
const first = decodeFlame(config.firstFlame);
let mine = decodeFlame(store.get());
let parent = null;
let state;

if (mine) state = "lit";
else if (incoming) { state = "receive"; parent = incoming; }
else if (first) state = "empty";
else state = "first";

// ---------------------------------------------------------------- rendering

function show(el, visible) { el.hidden = !visible; }

function renderTrail(flame, { waiting }) {
  const trail = $("trail");
  const shown = flame.t.slice(waiting ? -2 : -3);
  const before = flame.d - shown.length; // flames earlier than the ones we show
  const items = [];

  if (before >= 1) items.push({ label: place(flame.o), aria: `began in ${place(flame.o)}` });
  if (before >= 2) items.push({ label: `+${fmt.format(before - 1)}`, cls: "gap", aria: `${fmt.format(before - 1)} more diyas` });
  shown.forEach((city, i) => {
    const isMe = !waiting && i === shown.length - 1;
    items.push({ label: isMe ? city || "You" : place(city), cls: isMe ? "you" : "", aria: isMe ? `you, in ${place(city)}` : place(city) });
  });
  if (waiting) items.push({ label: "You", cls: "you is-waiting", aria: "you, next" });

  trail.replaceChildren(
    ...items.map(({ label, cls, aria }) => {
      const li = document.createElement("li");
      li.textContent = label;
      if (cls) li.className = cls;
      if (aria) li.setAttribute("aria-label", aria);
      return li;
    })
  );
  show(trail, true);
}

function renderLit(flame) {
  body.dataset.state = "lit";
  body.classList.remove("can-light");
  myDiya.classList.add("is-lit");
  myDiya.setAttribute("aria-label", "Your diya is lit");

  show($("incoming"), false);
  show($("emptyActions"), false);
  renderTrail(flame, { waiting: false });

  $("headline").textContent = "Your diya is lit";
  setText(
    $("sub"),
    flame.d === 1
      ? ""
      : `Yours is the <strong>${ordinal(flame.d)}</strong> diya in a chain of light that began ${esc(began(flame))}. Pass it to someone you'd like to wish.`
  );

  const url = flameUrl(SITE, flame);
  $("whatsappBtn").href = `https://wa.me/?text=${encodeURIComponent(`${shareText(flame)}\n${url}`)}`;
  show($("litActions"), true);

  // The address bar now holds your own flame, so copying it passes yours, not the one you received.
  history.replaceState(null, "", url);
}

function renderReceive(flame) {
  body.dataset.state = "receive";
  body.classList.add("can-light");
  myDiya.setAttribute("aria-label", "Your diya. Press and hold to light it.");

  const from = flame.t[flame.t.length - 1];
  setText(
    $("incomingFrom"),
    from ? `Passed to you from <strong>${esc(from)}</strong>` : "Passed to you by a friend"
  );
  show($("incoming"), true);
  renderTrail(flame, { waiting: true });

  $("headline").textContent = "Hold your diya to the flame";
  $("sub").textContent = "Press and hold your diya until it catches.";
}

function renderEmpty() {
  body.dataset.state = "empty";
  myDiya.setAttribute("aria-label", "Your unlit diya");
  $("headline").textContent = "This diya can't light itself";
  $("sub").textContent =
    "Someone has to pass you their flame. Ask a friend for theirs, or borrow one from the first diya.";
  $("borrowBtn").href = flameUrl(SITE, first);
  show($("emptyActions"), true);
}

function renderFirst() {
  body.dataset.state = "first";
  body.classList.add("can-light");
  myDiya.setAttribute("aria-label", "The first diya. Press and hold to light it.");
  $("headline").textContent = "Light the first diya";
  $("sub").textContent =
    "Every diya lit after this one will lead back to yours. Press and hold to light it.";
}

function render() {
  if (state === "lit") renderLit(mine);
  else if (state === "receive") renderReceive(parent);
  else if (state === "empty") renderEmpty();
  else renderFirst();
}

// ---------------------------------------------------------------- lighting

let holdTimer = 0;
let lighting = false;
const canLight = () => (state === "receive" || state === "first") && !lighting;

function startHold() {
  if (!canLight() || holdTimer) return;
  myDiya.classList.add("holding");
  body.classList.add("reaching");
  holdTimer = setTimeout(() => {
    holdTimer = 0;
    ignite();
  }, HOLD_MS);
}

function cancelHold() {
  if (!holdTimer) return;
  clearTimeout(holdTimer);
  holdTimer = 0;
  myDiya.classList.remove("holding");
  body.classList.remove("reaching");
}

myDiya.addEventListener("pointerdown", (e) => {
  if (state === "empty") return toast("This diya can only be lit from another flame.");
  if (!canLight()) return;
  e.preventDefault();
  myDiya.setPointerCapture?.(e.pointerId);
  startHold();
});
myDiya.addEventListener("pointerup", cancelHold);
myDiya.addEventListener("pointercancel", cancelHold);
myDiya.addEventListener("contextmenu", (e) => e.preventDefault());
myDiya.addEventListener("keydown", (e) => {
  if ((e.key === " " || e.key === "Enter") && !e.repeat) {
    e.preventDefault();
    startHold();
  }
});
myDiya.addEventListener("keyup", (e) => {
  if (e.key === " " || e.key === "Enter") cancelHold();
});

async function ignite() {
  lighting = true;
  const recorded = api("/api/light", { method: "POST" }); // runs while the animation plays

  if (state === "receive" && !reducedMotion) await flySpark($("theirDiya"), myDiya);
  myDiya.classList.remove("holding");
  body.classList.remove("reaching");
  myDiya.classList.add("is-lit");
  navigator.vibrate?.([15, 40, 35]);
  fireworks();

  const geo = await recorded;
  const city = geo?.city ?? "";
  mine = parent ? nextFlame(parent, city) : firstFlame(city);
  store.set(encodeFlame(mine));
  state = "lit";
  if (geo?.recorded) countTo(counted + 1); // show your diya at once; the shared total catches up

  await wait(reducedMotion ? 0 : 900);
  if (document.startViewTransition && !reducedMotion) document.startViewTransition(() => renderLit(mine));
  else renderLit(mine);
  lighting = false;
  setTimeout(refreshSky, 2500);
}

function flySpark(fromEl, toEl) {
  const a = fromEl.getBoundingClientRect();
  const b = toEl.getBoundingClientRect();
  const x1 = a.left + a.width / 2;
  const y1 = a.top + a.height * 0.3;
  const x2 = b.left + b.width / 2;
  const y2 = b.top + b.height * 0.5;
  const mx = (x1 + x2) / 2 + Math.min(70, b.width * 0.35);
  const my = y1 + (y2 - y1) * 0.45;

  const spark = document.createElement("div");
  spark.className = "spark";
  body.append(spark);
  const anim = spark.animate(
    [
      { transform: `translate(${x1}px, ${y1}px) scale(0.5)`, opacity: 0.6 },
      { transform: `translate(${mx}px, ${my}px) scale(1.15)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${x2}px, ${y2}px) scale(0.7)`, opacity: 1 },
    ],
    { duration: 700, easing: "cubic-bezier(.45,0,.25,1)" }
  );
  return anim.finished.then(() => spark.remove(), () => spark.remove());
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- passing

$("shareBtn").addEventListener("click", async () => {
  const url = flameUrl(SITE, mine);
  const text = shareText(mine);
  if (navigator.share) {
    try {
      await navigator.share({ title: "Pass the Diya", text, url });
    } catch {
      /* closed the share sheet */
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast("Link copied. Send it to whoever you'd like to pass your flame to.");
  } catch {
    toast("Copy the link from your address bar to pass your flame.");
  }
});

let wakeLock = null;

$("qrBtn").addEventListener("click", async () => {
  const qr = qrcode(0, "M");
  qr.addData(flameUrl(SITE, mine));
  qr.make();
  $("qrCode").innerHTML = qr
    .createSvgTag({ cellSize: 4, margin: 0, scalable: true })
    .replace('fill="white"', 'fill="#FFF8E8"')
    .replace('fill="black"', 'fill="#1A1238"');
  $("qrDialog").showModal();
  // Keep the screen awake while someone lines up their camera.
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { wakeLock = null; }
});

$("qrDialog").addEventListener("close", () => {
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
});

for (const btn of document.querySelectorAll("[data-close]")) {
  btn.addEventListener("click", () => btn.closest("dialog").close());
}

// ---------------------------------------------------------------- the sky

let skyLoop = 0;
let skyDrawn = { points: [], myCity: "" }; // redrawn on resize without another request

let counted = 0; // what the counter currently shows

/** Rolls the counter up (or down) to its new value. */
function countTo(target) {
  const el = $("counterNum");
  el.closest(".counter").classList.add("ready");
  const from = counted;
  counted = target;
  $("counterLabel").textContent = target === 1 ? "diya lit" : "diyas lit";
  if (reducedMotion || from === target) {
    el.textContent = fmt.format(target);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - start) / 1400);
    const eased = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt.format(Math.round(from + (target - from) * eased));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Fetches the lit cities and shows them on the globe behind the page. */
async function refreshSky() {
  const sky = await api("/api/sky");
  if (!sky) {
    drawSky(skyDrawn.points, skyDrawn.myCity);
    return;
  }
  countTo(Math.max(sky.total, counted)); // the map lags a few minutes; never drop below what you just added
  drawSky(sky.points, mine ? mine.t[mine.t.length - 1] : "");
}

// ---- the globe: a night-side Earth you can spin, lit only by the cities with diyas

let landDots = null; // [sinLat, cosLat, lon] for a grid of points that fall on land
let globeRot = null; // { lon, lat } in radians, kept across redraws
let globeIdle = 0; // time of the last drag, so auto-spin waits for you to let go

function landGrid() {
  if (landDots) return landDots;
  const rings = LAND.filter((r) => r.length > 12 && !r.every((v, i) => i % 2 === 0 || v < -55)).map((raw) => {
    // rings that cross the antimeridian jump by ~360 degrees; unwrap them so they stay continuous
    const r = raw.slice();
    let shift = 0;
    for (let i = 2; i < r.length; i += 2) {
      const d = raw[i] - raw[i - 2];
      if (d > 180) shift -= 360;
      else if (d < -180) shift += 360;
      r[i] = raw[i] + shift;
    }
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < r.length; i += 2) {
      x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]);
      y0 = Math.min(y0, r[i + 1]); y1 = Math.max(y1, r[i + 1]);
    }
    return { r, x0, x1, y0, y1 };
  });
  const inside = ({ r }, x, y) => {
    let c = false;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      if (r[i + 1] > y !== r[j + 1] > y && x < ((r[j] - r[i]) * (y - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) c = !c;
    }
    return c;
  };
  const out = [];
  const step = 1.8;
  for (let lat = -58; lat <= 82; lat += step) {
    const lonStep = step / Math.max(0.25, Math.cos((lat * Math.PI) / 180)); // even spacing on the sphere
    for (let lon = -180; lon < 180; lon += lonStep) {
      let n = 0;
      for (const g of rings) for (const off of [0, 360, -360]) {
        const x = lon + off;
        if (x >= g.x0 && x <= g.x1 && lat >= g.y0 && lat <= g.y1 && inside(g, x, lat)) n++;
      }
      if (n % 2) {
        const la = (lat * Math.PI) / 180;
        out.push(Math.sin(la), Math.cos(la), (lon * Math.PI) / 180);
      }
    }
  }
  return (landDots = Float32Array.from(out));
}

function drawSky(points, myCity) {
  skyDrawn = { points, myCity };
  cancelAnimationFrame(skyLoop);
  const canvas = $("skyMap");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = canvas.clientWidth || window.innerWidth;
  const H = canvas.clientHeight || window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const dots = landGrid();
  // The globe fills the screen; on a phone it is wider than the screen and runs off both sides.
  const R = Math.max(H * 0.48, Math.min(W * 0.5, H * 0.75));
  const cx = W / 2;
  const cy = H * 0.47;

  const placed = points.filter(([, , lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
  const max = Math.max(1, ...placed.map((p) => p[4]));
  const rad = (d) => (d * Math.PI) / 180;
  const cities = placed.map(([name, , lat, lon, n], i) => ({
    name, n, i,
    sLat: Math.sin(rad(lat)), cLat: Math.cos(rad(lat)), lon: rad(lon),
    k: Math.min(1, Math.log2(1 + n) / Math.log2(1 + max)),
    phase: (i * 2.399) % (Math.PI * 2),
  }));

  // Start facing the lights (India when there are none yet).
  if (!globeRot) {
    const lon = placed.length ? placed.reduce((s, p) => s + p[3], 0) / placed.length : 78;
    const lat = placed.length ? placed.reduce((s, p) => s + p[2], 0) / placed.length : 22;
    globeRot = { lon: rad(lon), lat: rad(Math.max(-10, Math.min(40, lat))) };
  }

  const project = (sLat, cLat, lon) => {
    const { lon: l0, lat: p0 } = globeRot;
    const dl = lon - l0;
    const cosc = Math.sin(p0) * sLat + Math.cos(p0) * cLat * Math.cos(dl);
    return { v: cosc, x: cx + R * cLat * Math.sin(dl), y: cy - R * (Math.cos(p0) * sLat - Math.sin(p0) * cLat * Math.cos(dl)) };
  };

  // dragging spins the globe
  canvas.style.touchAction = "none";
  canvas.style.cursor = "grab";
  let drag = null;
  canvas.onpointerdown = (e) => {
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  };
  canvas.onpointermove = (e) => {
    if (!drag) return;
    globeRot.lon -= ((e.clientX - drag.x) / R) * 0.9;
    globeRot.lat = Math.max(-1.1, Math.min(1.1, globeRot.lat + ((e.clientY - drag.y) / R) * 0.9));
    drag = { x: e.clientX, y: e.clientY };
    globeIdle = performance.now();
    if (reducedMotion) frame(performance.now());
  };
  canvas.onpointerup = canvas.onpointercancel = () => {
    drag = null;
    canvas.style.cursor = "grab";
  };

  let prev = 0;
  const top = [...cities].sort((a, b) => b.n - a.n).slice(0, 3);
  ctx.font = '600 13px Mukta, system-ui, sans-serif';

  function frame(t) {
    const dt = Math.min(0.05, (t - prev) / 1000 || 0);
    prev = t;
    if (!reducedMotion && !drag && t - globeIdle > 3500) globeRot.lon += dt * 0.12; // slow spin

    ctx.clearRect(0, 0, W, H);

    // atmosphere and the dark disc of the Earth
    ctx.globalCompositeOperation = "lighter";
    const atm = ctx.createRadialGradient(cx, cy, R * 0.94, cx, cy, R * 1.28);
    atm.addColorStop(0, "rgba(255, 150, 60, 0.35)");
    atm.addColorStop(0.35, "rgba(190, 80, 90, 0.12)");
    atm.addColorStop(1, "rgba(120, 60, 160, 0)");
    ctx.fillStyle = atm;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    const disc = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
    disc.addColorStop(0, "#150f26");
    disc.addColorStop(1, "#030208");
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    // land, as a field of tiny dots that fade toward the horizon
    for (let i = 0; i < dots.length; i += 3) {
      const q = project(dots[i], dots[i + 1], dots[i + 2]);
      if (q.v <= 0.02) continue;
      ctx.fillStyle = `rgba(220, 196, 240, ${0.08 + 0.42 * q.v})`;
      ctx.fillRect(q.x - 0.85, q.y - 0.85, 1.7, 1.7);
    }

    // the cities
    ctx.globalCompositeOperation = "lighter";
    const seen = [];
    for (const c of cities) {
      const q = project(c.sLat, c.cLat, c.lon);
      if (q.v <= 0.05) continue;
      seen.push({ c, q });
      const tw = reducedMotion ? 1 : 0.88 + 0.12 * Math.sin(t / 650 + c.phase);
      // crisp city-light: a bright champagne core with a small, soft amber halo
      const gr = (R * 0.012 + R * 0.032 * c.k) * (0.6 + 0.4 * q.v);
      const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, gr);
      g.addColorStop(0, `rgba(255, 240, 200, ${(0.5 + 0.4 * c.k) * tw})`);
      g.addColorStop(0.3, `rgba(255, 190, 100, ${(0.2 + 0.3 * c.k) * tw})`);
      g.addColorStop(1, "rgba(255, 150, 60, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(q.x, q.y, gr, 0, Math.PI * 2);
      ctx.fill();
      // the point itself, plus a fine cross-shaped glint on the brightest cities
      const cr = 0.9 + 1.7 * c.k;
      ctx.fillStyle = `rgba(255, 250, 235, ${tw})`;
      ctx.beginPath();
      ctx.arc(q.x, q.y, cr, 0, Math.PI * 2);
      ctx.fill();
      if (c.k > 0.5) {
        const len = gr * (0.9 + 0.3 * Math.sin(t / 800 + c.phase));
        ctx.strokeStyle = `rgba(255, 235, 190, ${0.35 * tw * q.v})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(q.x - len, q.y); ctx.lineTo(q.x + len, q.y);
        ctx.moveTo(q.x, q.y - len); ctx.lineTo(q.x, q.y + len);
        ctx.stroke();
      }
      // a slow ripple spreads from the busier cities
      if (!reducedMotion && c.k > 0.55) {
        const p = ((t / 2600 + c.phase / 6.283) % 1);
        ctx.strokeStyle = `rgba(255, 190, 90, ${0.35 * (1 - p) * q.v})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(q.x, q.y, gr * (0.6 + 1.8 * p), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = "source-over";

    // a fine rim so the sphere reads as a sphere
    ctx.strokeStyle = "rgba(255, 190, 110, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    // labels for the busiest cities, and a ring around yours
    for (const { c, q } of seen) {
      const isMe = myCity && c.name === myCity;
      if (isMe) {
        ctx.strokeStyle = "#FF9A1F";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 11, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (c.name && (isMe || (top.includes(c) && q.v > 0.3))) {
        ctx.fillStyle = isMe ? "#FFC94A" : "rgba(246, 231, 200, 0.88)";
        ctx.fillText(isMe ? `You, ${c.name}` : c.name, q.x + 12, q.y + 4);
      }
    }

    if (!reducedMotion) skyLoop = requestAnimationFrame(frame);
  }
  frame(performance.now());
}

let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    drawSky(skyDrawn.points, skyDrawn.myCity);
  }, 150);
});

// ---------------------------------------------------------------- small things

let toastTimer = 0;
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3800);
}

function renderCredit() {
  const { name, url } = config.creator || {};
  if (!name) return;
  const p = $("credit");
  if (!p) return;
  p.append("Made by ");
  if (url) {
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    a.target = "_blank";
    a.textContent = name;
    p.append(a);
  } else {
    p.append(name);
  }
}

// ---------------------------------------------------------------- start

renderCredit();
render();
refreshSky();
setInterval(() => !document.hidden && refreshSky(), 30_000);

if (rawIncoming && !incoming && state !== "lit") {
  toast("That link's flame couldn't be read. Ask for a fresh link.");
} else if (state === "lit" && incoming && encodeFlame(incoming) !== encodeFlame(mine)) {
  toast("Your diya is already lit. Pass your own flame on.");
}
