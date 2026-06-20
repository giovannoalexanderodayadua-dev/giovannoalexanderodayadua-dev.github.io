/* ============================================================
   maz — landing page interactions
   ============================================================ */
(() => {
  "use strict";

  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  /* ---------- navbar: shrink + bg on scroll ---------- */
  const nav = $("#nav");
  const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 30);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- mobile menu ---------- */
  const burger = $("#burger");
  const navLinks = $("#navLinks");
  burger.addEventListener("click", () => {
    const open = navLinks.classList.toggle("is-open");
    burger.classList.toggle("is-open", open);
  });
  $$(".nav__link", navLinks).forEach(a =>
    a.addEventListener("click", () => {
      navLinks.classList.remove("is-open");
      burger.classList.remove("is-open");
    })
  );

  /* ---------- active link on scroll (scroll-spy) ---------- */
  const sections = ["home", "about", "studio", "pricing"]
    .map(id => document.getElementById(id))
    .filter(Boolean);
  const links = $$(".nav__link");

  const spy = new IntersectionObserver(
    entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          links.forEach(l =>
            l.classList.toggle("is-active", l.getAttribute("href") === "#" + e.target.id)
          );
        }
      });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  sections.forEach(s => spy.observe(s));

  /* ---------- reveal on scroll ---------- */
  const reveal = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((e, i) => {
        if (e.isIntersecting) {
          // small stagger for siblings entering together
          setTimeout(() => e.target.classList.add("is-in"), i * 70);
          obs.unobserve(e.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  $$("[data-reveal]").forEach(el => reveal.observe(el));

  /* ---------- animated stat counters ---------- */
  const counters = $$("[data-count]");
  const countObs = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target;
        const target = +el.dataset.count;
        const dur = 1400;
        const start = performance.now();
        const tick = now => {
          const p = Math.min((now - start) / dur, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(target * eased);
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        obs.unobserve(el);
      });
    },
    { threshold: 0.6 }
  );
  counters.forEach(c => countObs.observe(c));

  /* ---------- cursor glow + card spotlight + hero parallax ---------- */
  const glow = $(".cursor-glow");
  const heroObject = $("#heroObject");
  const cards = $$(".card");
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  if (finePointer) {
    let tx = 0, ty = 0, cx = 0, cy = 0;

    window.addEventListener("mousemove", e => {
      tx = e.clientX;
      ty = e.clientY;

      // parallax for hero focus object
      if (heroObject) {
        const dx = (e.clientX / window.innerWidth - 0.5) * 30;
        const dy = (e.clientY / window.innerHeight - 0.5) * 30;
        heroObject.style.transform = `translateY(-50%) translate3d(${dx}px, ${dy}px, 0)`;
      }

      // card spotlight position
      cards.forEach(card => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${e.clientX - r.left}px`);
        card.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    });

    // smooth-follow glow
    const loop = () => {
      cx += (tx - cx) * 0.15;
      cy += (ty - cy) * 0.15;
      glow.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      requestAnimationFrame(loop);
    };
    loop();
  } else {
    glow.style.display = "none";
  }

  /* ---------- year + tiny console flourish ---------- */
  console.log("%cmaz", "font-size:32px;font-weight:800;color:#ff2bd0;");
  console.log("%cgame creation made easy with AI", "color:#2ce8ff;");
})();


/* ============================================================
   NEON MAZE — interactive minigame card
   - desktop: ball seeks the cursor, card tilts to "watch" cursor
   - touch/no-cursor: ball rolls with device tilt, card tilts too
   - reach the red flag -> ball lags, walls deconstruct, a new flag
     emerges elsewhere, then the ball is released
   - all SFX synthesized in audio.js (MazAudio)
   ============================================================ */
(() => {
  "use strict";

  const card = document.getElementById("mazeCard");
  const canvas = document.getElementById("mazeCanvas");
  const hintEl = document.getElementById("mazeHint");
  if (!card || !canvas) return;

  const ctx = canvas.getContext("2d");

  /* ---- logical play-field (7:9), physics run in these units ---- */
  const W = 280, H = 360;
  const R = 10;                 // ball radius
  const WALL = 12;              // wall thickness
  const MAX_TILT = 26;          // deg, card "watch" tilt
  const audio = (typeof MazAudio !== "undefined") ? MazAudio : null;

  const hasFinePointer = window.matchMedia("(pointer: fine)").matches;
  const tiltMode = !hasFinePointer;

  hintEl.textContent = tiltMode ? "Tilt your device to roll" : "Move your cursor around";

  /* ---------- crisp canvas sizing ---------- */
  let scale = 1;
  function resize() {
    const rect = card.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    scale = canvas.width / W;          // ratio preserved (7:9 both sides)
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(card);
  window.addEventListener("resize", resize);
  resize();

  /* ---------- helpers ---------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);

  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /* ---------- state ---------- */
  const ball = { x: W * 0.5, y: H * 0.22, vx: 0, vy: 0, roll: 0 };
  let walls = [];
  let flag = { x: W * 0.5, y: H * 0.8, scale: 1 };
  let fragments = [];
  let mazeAlpha = 1;            // wall build-in alpha during "emerge"

  let phase = "play";          // play | goal | deconstruct | emerge
  let phaseT = 0;
  const DUR = { goal: 0.55, deconstruct: 0.7, emerge: 0.65 };

  // input
  const target = { x: W * 0.5, y: H * 0.5 };
  const tilt = { x: 0, y: 0 };
  let curRX = 0, curRY = 0, tgtRX = 0, tgtRY = 0;   // card tilt (deg)

  /* ---------- maze generation ---------- */
  function rectHitsPoint(r, px, py, pad) {
    return px > r.x - pad && px < r.x + r.w + pad &&
           py > r.y - pad && py < r.y + r.h + pad;
  }

  function generateMaze(avoidX, avoidY) {
    const w = [];
    const M = 22;                       // keep away from the edges
    const bars = 3 + Math.floor(Math.random() * 3);
    let tries = 0;
    while (w.length < bars && tries < 60) {
      tries++;
      let r;
      if (Math.random() < 0.5) {        // horizontal bar
        const bw = rand(W * 0.30, W * 0.60);
        r = { x: rand(M, W - M - bw), y: rand(M + 26, H - M - 26), w: bw, h: WALL };
      } else {                          // vertical bar
        const bh = rand(H * 0.20, H * 0.42);
        r = { x: rand(M + 26, W - M - 26), y: rand(M, H - M - bh), w: WALL, h: bh };
      }
      // don't trap the ball's start
      if (rectHitsPoint(r, avoidX, avoidY, R + 24)) continue;
      // avoid stacking bars right on top of each other
      if (w.some(o => Math.abs(o.x - r.x) < 26 && Math.abs(o.y - r.y) < 26)) continue;
      w.push(r);
    }
    return w;
  }

  function placeFlag(avoidX, avoidY) {
    for (let i = 0; i < 80; i++) {
      const fx = rand(34, W - 34);
      const fy = rand(54, H - 30);
      const far = Math.hypot(fx - avoidX, fy - avoidY) > H * 0.42;
      const clear = !walls.some(r => rectHitsPoint(r, fx, fy, R + 14));
      if (far && clear) return { x: fx, y: fy, scale: 1 };
    }
    return { x: W * 0.5, y: H * 0.82, scale: 1 };
  }

  // initial layout
  walls = generateMaze(ball.x, ball.y);
  flag = placeFlag(ball.x, ball.y);

  /* ---------- collisions ---------- */
  function collideWall(r) {
    const cx = clamp(ball.x, r.x, r.x + r.w);
    const cy = clamp(ball.y, r.y, r.y + r.h);
    let dx = ball.x - cx, dy = ball.y - cy;
    let d2 = dx * dx + dy * dy;
    if (d2 >= R * R) return;
    let d = Math.sqrt(d2) || 0.0001;
    let nx = dx / d, ny = dy / d;
    if (d2 === 0) { nx = 0; ny = -1; }            // dead-center fallback
    ball.x = cx + nx * R;
    ball.y = cy + ny * R;
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      const e = 0.42;
      ball.vx -= (1 + e) * vn * nx;
      ball.vy -= (1 + e) * vn * ny;
      const impact = Math.min(1, Math.abs(vn) / 380);
      if (impact > 0.04 && audio) audio.wallHit(impact);
    }
  }

  function collideBounds() {
    let hit = 0;
    if (ball.x < R) { ball.x = R; if (ball.vx < 0) { hit = Math.abs(ball.vx); ball.vx = -ball.vx * 0.42; } }
    if (ball.x > W - R) { ball.x = W - R; if (ball.vx > 0) { hit = Math.abs(ball.vx); ball.vx = -ball.vx * 0.42; } }
    if (ball.y < R) { ball.y = R; if (ball.vy < 0) { hit = Math.abs(ball.vy); ball.vy = -ball.vy * 0.42; } }
    if (ball.y > H - R) { ball.y = H - R; if (ball.vy > 0) { hit = Math.abs(ball.vy); ball.vy = -ball.vy * 0.42; } }
    if (hit > 90 && audio) audio.wallHit(Math.min(1, hit / 420));
  }

  /* ---------- goal -> deconstruct -> emerge sequence ---------- */
  function spawnFragments() {
    fragments = [];
    walls.forEach(r => {
      const cols = Math.max(2, Math.round(r.w / 14));
      const rows = Math.max(2, Math.round(r.h / 14));
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const fx = r.x + (i + 0.5) * (r.w / cols);
          const fy = r.y + (j + 0.5) * (r.h / rows);
          fragments.push({
            x: fx, y: fy,
            vx: rand(-160, 160), vy: rand(-220, 60),
            rot: rand(0, 6.28), vrot: rand(-8, 8),
            size: rand(5, 10), life: 0, max: rand(0.5, 0.9)
          });
        }
      }
    });
  }

  function enterPhase(p) {
    phase = p;
    phaseT = 0;
    if (p === "goal") { ball.vx = ball.vy = 0; if (audio) { audio.goal(); audio.rollStop(); } }
    if (p === "deconstruct") { spawnFragments(); walls = []; if (audio) audio.deconstruct(); }
    if (p === "emerge") {
      walls = generateMaze(ball.x, ball.y);
      flag = placeFlag(ball.x, ball.y);
      flag.scale = 0;
      mazeAlpha = 0;
      if (audio) audio.emerge();
    }
  }

  /* ---------- update ---------- */
  function update(dt) {
    // card tilt targets (visual only, no sound)
    if (tiltMode) {
      tgtRY = tilt.x * MAX_TILT;
      tgtRX = -tilt.y * MAX_TILT;
    }
    curRX += (tgtRX - curRX) * Math.min(1, dt * 8);
    curRY += (tgtRY - curRY) * Math.min(1, dt * 8);
    card.style.transform = `rotateX(${curRX.toFixed(2)}deg) rotateY(${curRY.toFixed(2)}deg)`;

    if (phase === "play") {
      // acceleration input
      let ax, ay;
      if (tiltMode) {
        ax = tilt.x * 900;
        ay = tilt.y * 900;
        ax -= ball.vx * 2.0;
        ay -= ball.vy * 2.0;
      } else {
        const k = 90, c = 9.0;                 // spring toward cursor + damping
        ax = (target.x - ball.x) * k - ball.vx * c;
        ay = (target.y - ball.y) * k - ball.vy * c;
      }
      ball.vx += ax * dt;
      ball.vy += ay * dt;

      // clamp speed
      const sp = Math.hypot(ball.vx, ball.vy);
      const MAXV = 900;
      if (sp > MAXV) { ball.vx *= MAXV / sp; ball.vy *= MAXV / sp; }

      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      collideBounds();
      for (const r of walls) collideWall(r);

      // rolling visuals + sound
      const speed = Math.hypot(ball.vx, ball.vy);
      ball.roll += (speed / R) * dt;
      if (audio) audio.rollUpdate(clamp(speed / 620, 0, 1));

      // goal check
      if (Math.hypot(ball.x - flag.x, ball.y - flag.y) < R + 12) enterPhase("goal");

    } else {
      // frozen-ball phases
      if (audio) audio.rollStop();
      phaseT += dt;

      if (phase === "deconstruct") {
        fragments.forEach(f => {
          f.life += dt;
          f.vy += 480 * dt;          // gravity on debris
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          f.rot += f.vrot * dt;
        });
      }
      if (phase === "emerge") {
        mazeAlpha = clamp(phaseT / DUR.emerge, 0, 1);
        flag.scale = clamp(phaseT / (DUR.emerge * 0.8), 0, 1);
      }

      if (phaseT >= DUR[phase]) {
        if (phase === "goal") enterPhase("deconstruct");
        else if (phase === "deconstruct") enterPhase("emerge");
        else if (phase === "emerge") { phase = "play"; mazeAlpha = 1; flag.scale = 1; fragments = []; }
      }
    }
  }

  /* ---------- rendering ---------- */
  function drawBackground() {
    ctx.clearRect(0, 0, W, H);
    // faint inner grid for "maze" texture
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = "rgba(94, 234, 255, 0.06)";
    ctx.lineWidth = 1;
    for (let x = 20; x < W; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 20; y < H; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.restore();
  }

  function drawWalls() {
    if (!walls.length) return;
    ctx.save();
    ctx.globalAlpha = mazeAlpha;
    walls.forEach(r => {
      // grow-in from center during emerge
      const s = mazeAlpha < 1 ? 0.4 + 0.6 * mazeAlpha : 1;
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const x = cx - (r.w * s) / 2, y = cy - (r.h * s) / 2;
      const w = r.w * s, h = r.h * s;
      ctx.fillStyle = "#0a0d18";
      roundRect(ctx, x, y, w, h, 5);
      ctx.fill();
      ctx.shadowColor = "#2ce8ff";
      ctx.shadowBlur = 12;
      ctx.strokeStyle = "rgba(44,232,255,0.95)";
      ctx.lineWidth = 2;
      roundRect(ctx, x, y, w, h, 5);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(210,250,255,0.85)";
      ctx.lineWidth = 0.8;
      roundRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, 4);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawFragments() {
    fragments.forEach(f => {
      const a = clamp(1 - f.life / f.max, 0, 1);
      if (a <= 0) return;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      ctx.shadowColor = "#2ce8ff";
      ctx.shadowBlur = 8;
      ctx.fillStyle = "rgba(120,240,255,0.9)";
      ctx.fillRect(-f.size / 2, -f.size / 2, f.size, f.size);
      ctx.restore();
    });
  }

  function drawFlag() {
    if (flag.scale <= 0) return;
    ctx.save();
    ctx.translate(flag.x, flag.y);
    ctx.scale(flag.scale, flag.scale);
    // glow base
    ctx.shadowColor = "#ff2b4d";
    ctx.shadowBlur = 16;
    // base dot
    ctx.fillStyle = "#ff2b4d";
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, 6.2832);
    ctx.fill();
    // pole
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#e7eefc";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(0, -30);
    ctx.stroke();
    // triangular flag (waving)
    const wob = Math.sin(performance.now() / 220) * 2;
    ctx.shadowColor = "#ff2b4d";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#ff2b4d";
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.lineTo(20 + wob, -24);
    ctx.lineTo(0, -17);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawBall() {
    if (phase === "deconstruct" || phase === "emerge") {
      // ball still visible, sitting at goal
    }
    const x = ball.x, y = ball.y;
    ctx.save();
    // contact shadow
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(x, y + R * 0.7, R * 0.9, R * 0.4, 0, 0, 6.2832);
    ctx.fill();
    ctx.globalAlpha = 1;

    // metallic body
    const grad = ctx.createRadialGradient(x - R * 0.4, y - R * 0.45, R * 0.1, x, y, R);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.25, "#d9dee6");
    grad.addColorStop(0.6, "#8b93a3");
    grad.addColorStop(0.85, "#454b59");
    grad.addColorStop(1, "#23262f");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, 6.2832);
    ctx.fill();

    // brushed-metal streaks that rotate as it rolls
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, R, 0, 6.2832);
    ctx.clip();
    ctx.translate(x, y);
    ctx.rotate(ball.roll);
    ctx.strokeStyle = "rgba(60,66,78,0.5)";
    ctx.lineWidth = 1;
    for (let i = -R; i < R; i += 3) {
      ctx.beginPath();
      ctx.moveTo(-R, i);
      ctx.lineTo(R, i);
      ctx.stroke();
    }
    ctx.restore();

    // specular highlight
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(x - R * 0.38, y - R * 0.4, R * 0.22, 0, 6.2832);
    ctx.fill();

    // rim
    ctx.strokeStyle = "rgba(10,12,18,0.7)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, R - 0.6, 0, 6.2832);
    ctx.stroke();
    ctx.restore();
  }

  function render() {
    drawBackground();
    drawWalls();
    drawFragments();
    drawFlag();
    drawBall();
  }

  /* ---------- loop ---------- */
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.033) dt = 0.033;        // clamp big gaps (tab switch)
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ---------- input wiring ---------- */
  if (!tiltMode) {
    window.addEventListener("mousemove", e => {
      const rect = card.getBoundingClientRect();
      // ball target (mapped into the field, clamped)
      target.x = clamp((e.clientX - rect.left) / rect.width * W, R, W - R);
      target.y = clamp((e.clientY - rect.top) / rect.height * H, R, H - R);
      // card "watches" the cursor anywhere on screen
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      tgtRY = clamp((e.clientX - cx) / (window.innerWidth / 2), -1, 1) * MAX_TILT;
      tgtRX = -clamp((e.clientY - cy) / (window.innerHeight / 2), -1, 1) * MAX_TILT;
    }, { passive: true });
  }

  // device tilt (mobile / tablets). iOS needs a permission gesture.
  function attachOrientation() {
    window.addEventListener("deviceorientation", e => {
      if (e.gamma == null || e.beta == null) return;
      tilt.x = clamp(e.gamma / 32, -1, 1);          // left / right
      tilt.y = clamp((e.beta - 35) / 32, -1, 1);    // tilt forward = roll down
    }, { passive: true });
  }

  if (tiltMode) {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      const ask = () => {
        DOE.requestPermission().then(res => { if (res === "granted") attachOrientation(); }).catch(() => {});
        window.removeEventListener("touchend", ask);
        window.removeEventListener("click", ask);
      };
      window.addEventListener("touchend", ask, { once: true });
      window.addEventListener("click", ask, { once: true });
    } else {
      attachOrientation();
    }
  }
})();
