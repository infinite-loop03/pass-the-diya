/**
 * The night behind the page: twinkling stars, drifting fireflies, and, once your diya
 * is lit, a flickering pool of warm light with embers rising from the flame.
 * Purely decorative. Stops itself when the tab is hidden or motion is reduced.
 */

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

export function startAmbient(diya) {
  const canvas = document.createElement("canvas");
  canvas.className = "ambient";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  const ctx = canvas.getContext("2d");

  let W = 0, H = 0, dpr = 1;
  let stars = [];
  let flies = [];
  const embers = [];
  let warmth = 0; // 0 = unlit night, 1 = fully lit
  let px = 0, py = 0; // pointer / tilt parallax, -1..1
  let last = 0;
  let raf = 0;

  const rand = (a, b) => a + Math.random() * (b - a);

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(140, (W * H) / 9000));
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * W,
      y: Math.random() * H * 0.85,
      r: rand(0.4, 1.5),
      depth: rand(0.2, 1),
      phase: rand(0, 6.28),
      speed: rand(0.6, 1.8),
    }));
    flies = Array.from({ length: Math.round(Math.min(14, W / 60)) }, () => ({
      x: Math.random() * W,
      y: rand(H * 0.3, H),
      vx: rand(-6, 6),
      vy: rand(-8, -2),
      phase: rand(0, 6.28),
      r: rand(1, 2.2),
    }));
  }

  function flamePoint() {
    const r = diya.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.3, base: r.bottom - r.height * 0.12, w: r.width };
  }

  function spawnEmber(p) {
    embers.push({
      x: p.x + rand(-6, 6),
      y: p.y + rand(-4, 4),
      vx: rand(-10, 10),
      vy: rand(-48, -22),
      life: 0,
      ttl: rand(2.2, 4.8),
      r: rand(0.8, 2.2),
      phase: rand(0, 6.28),
    });
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    const t = now / 1000;
    const lit = diya.classList.contains("is-lit");
    warmth += ((lit ? 1 : 0) - warmth) * Math.min(1, dt * 1.6);

    ctx.clearRect(0, 0, W, H);

    // Stars, with a little parallax so the sky feels deep.
    for (const s of stars) {
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
      const x = s.x + px * 14 * s.depth;
      const y = s.y + py * 10 * s.depth;
      ctx.fillStyle = `rgba(255, 244, 220, ${a * (1 - warmth * 0.45)})`;
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, 6.283);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "lighter";

    // Fireflies: slow golden specks wandering up the page.
    for (const f of flies) {
      f.x += (f.vx + Math.sin(t * 0.7 + f.phase) * 10) * dt;
      f.y += f.vy * dt;
      if (f.y < -10) { f.y = H + 10; f.x = Math.random() * W; }
      if (f.x < -10) f.x = W + 10;
      if (f.x > W + 10) f.x = -10;
      const a = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.6 + f.phase));
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 6);
      g.addColorStop(0, `rgba(255, 214, 120, ${a})`);
      g.addColorStop(1, "rgba(255, 160, 50, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 6, 0, 6.283);
      ctx.fill();
    }

    if (warmth > 0.01) {
      const p = flamePoint();
      const flick = 0.9 + 0.1 * Math.sin(t * 9.1) * Math.sin(t * 5.3 + 1.3) + 0.04 * Math.sin(t * 23);

      // A pool of light on the surface the diya rests on, and a glow around the flame.
      const poolR = p.w * 1.9;
      ctx.save();
      ctx.translate(p.x, p.base + p.w * 0.06);
      ctx.scale(1, 0.28);
      const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, poolR);
      pool.addColorStop(0, `rgba(255, 170, 70, ${0.34 * warmth * flick})`);
      pool.addColorStop(1, "rgba(255, 130, 40, 0)");
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.arc(0, 0, poolR, 0, 6.283);
      ctx.fill();
      ctx.restore();

      const glowR = p.w * 3.2 * (0.96 + 0.06 * flick);
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR);
      glow.addColorStop(0, `rgba(255, 200, 100, ${0.28 * warmth * flick})`);
      glow.addColorStop(0.5, `rgba(255, 140, 50, ${0.1 * warmth})`);
      glow.addColorStop(1, "rgba(255, 120, 40, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, glowR, 0, 6.283);
      ctx.fill();

      // Embers lift off the flame.
      if (Math.random() < dt * 9 * warmth) spawnEmber(p);
    }

    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      e.life += dt;
      if (e.life > e.ttl) { embers.splice(i, 1); continue; }
      e.x += (e.vx + Math.sin(t * 2 + e.phase) * 14) * dt;
      e.y += e.vy * dt;
      const k = e.life / e.ttl;
      const a = (1 - k) * (0.6 + 0.4 * Math.sin(t * 14 + e.phase));
      ctx.fillStyle = `rgba(255, ${Math.round(200 - 90 * k)}, ${Math.round(110 - 60 * k)}, ${Math.max(0, a)})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * (1 - k * 0.6), 0, 6.283);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
    raf = requestAnimationFrame(frame);
  }

  function onPointer(e) {
    px = (e.clientX / W - 0.5) * 2;
    py = (e.clientY / H - 0.5) * 2;
  }
  function onTilt(e) {
    if (e.gamma == null) return;
    px = Math.max(-1, Math.min(1, e.gamma / 30));
    py = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
  }

  resize();
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    cancelAnimationFrame(raf);
    if (!document.hidden && !reduced) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });

  if (reduced) {
    // One still frame of stars; no motion.
    frame(0);
    cancelAnimationFrame(raf);
    return;
  }
  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("deviceorientation", onTilt, { passive: true });
  raf = requestAnimationFrame(frame);
}
