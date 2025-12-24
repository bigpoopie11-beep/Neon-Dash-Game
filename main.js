(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const levelsListEl = document.getElementById("levelsList");
  const statusPillEl = document.getElementById("statusPill");
  const bestPctEl = document.getElementById("bestPct");
  const runPctEl = document.getElementById("runPct");

  const btnLevels = document.getElementById("btnLevels");
  const btnPlay = document.getElementById("btnPlay");
  const btnRestart = document.getElementById("btnRestart");

  const musicToggle = document.getElementById("musicToggle");
  const particlesToggle = document.getElementById("particlesToggle");

  const State = { LEVELS: "levels", PLAY: "play" };
  let state = State.LEVELS;
  let paused = false;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- Canvas sizing ----------
  function resizeCanvasToDisplaySize() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r.width * dpr));
    const h = Math.max(1, Math.floor(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { w, h, dpr };
  }

  // ---------- UI playmode ----------
  function enterPlayModeUI() { document.body.classList.add("playmode"); }
  function exitPlayModeUI() { document.body.classList.remove("playmode"); }

  // ---------- Music (simple synth) ----------
  let audioCtx = null;
  let musicNode = null;

  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  }
  function stopMusic() {
    if (!musicNode) return;
    try { clearInterval(musicNode.timer); } catch {}
    try { musicNode.osc1.stop(); } catch {}
    try { musicNode.osc2.stop(); } catch {}
    try { musicNode.noise.stop(); } catch {}
    musicNode = null;
  }
  function startMusic() {
    if (!musicToggle.checked) return;
    ensureAudio();
    stopMusic();

    const master = audioCtx.createGain();
    master.gain.value = 0.12;
    master.connect(audioCtx.destination);

    const filt = audioCtx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 1300;
    filt.Q.value = 0.8;
    filt.connect(master);

    const beat = 120;
    const stepDur = (60 / beat) / 2;
    const notes = [0, 7, 10, 7, 0, 7, 12, 10];
    const baseHz = 220;

    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    osc1.type = "sawtooth";
    osc2.type = "triangle";

    const g1 = audioCtx.createGain();
    const g2 = audioCtx.createGain();
    g1.gain.value = 0;
    g2.gain.value = 0;

    osc1.connect(g1); g1.connect(filt);
    osc2.connect(g2); g2.connect(filt);

    osc1.start();
    osc2.start();

    const noise = audioCtx.createBufferSource();
    const noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.12;
    noise.buffer = noiseBuf;
    noise.loop = true;

    const ng = audioCtx.createGain();
    ng.gain.value = 0.03;
    noise.connect(ng); ng.connect(master);
    noise.start();

    let step = 0;
    const timer = setInterval(() => {
      const t = audioCtx.currentTime;
      const n = notes[step % notes.length];
      const freq = baseHz * Math.pow(2, n / 12);

      const a = t + 0.01;
      const r = t + stepDur * 0.95;

      osc1.frequency.setValueAtTime(freq, a);
      osc2.frequency.setValueAtTime(freq * 2, a);

      g1.gain.cancelScheduledValues(t);
      g2.gain.cancelScheduledValues(t);

      g1.gain.setValueAtTime(0.0001, t);
      g1.gain.linearRampToValueAtTime(0.16, a);
      g1.gain.exponentialRampToValueAtTime(0.0001, r);

      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.linearRampToValueAtTime(0.09, a);
      g2.gain.exponentialRampToValueAtTime(0.0001, r);

      step++;
    }, stepDur * 1000);

    musicNode = { osc1, osc2, g1, g2, noise, ng, timer };
  }

  function sfx(freq, dur, vol = 0.06) {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "square";
    o.frequency.value = freq;
    g.gain.value = 0.0001;
    o.connect(g); g.connect(audioCtx.destination);
    const t = audioCtx.currentTime;
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.01);
  }

  // ---------- Levels (more GD-like: spikes + blocks) ----------
  // type: "block" or "spike"
  const LEVELS = [
    {
      id: "neon-start", name: "Neon Start", difficulty: "Easy",
      speed: 560, length: 5200,
      obstacles: [
        { type:"spike", x: 1600, w: 44, h: 54 },
        { type:"block", x: 1920, w: 70, h: 120 },
        { type:"spike", x: 2240, w: 44, h: 54 },
        { type:"block", x: 2560, w: 80, h: 160 },
        { type:"spike", x: 2920, w: 44, h: 54 },
        { type:"block", x: 3260, w: 90, h: 120 },
        { type:"spike", x: 3600, w: 44, h: 54 },
        { type:"block", x: 3940, w: 90, h: 180 },
        { type:"spike", x: 4380, w: 44, h: 54 },
      ]
    },
    {
      id: "pulse-run", name: "Pulse Run", difficulty: "Medium",
      speed: 620, length: 6000,
      obstacles: [
        { type:"spike", x: 1600, w: 44, h: 54 },
        { type:"spike", x: 1760, w: 44, h: 54 },
        { type:"block", x: 2120, w: 80, h: 160 },
        { type:"spike", x: 2460, w: 44, h: 54 },
        { type:"block", x: 2740, w: 120, h: 120 },
        { type:"spike", x: 3140, w: 44, h: 54 },
        { type:"block", x: 3460, w: 90, h: 200 },
        { type:"spike", x: 3860, w: 44, h: 54 },
        { type:"block", x: 4200, w: 140, h: 140 },
        { type:"spike", x: 4680, w: 44, h: 54 },
        { type:"spike", x: 4860, w: 44, h: 54 },
      ]
    },
    {
      id: "ion-storm", name: "Ion Storm", difficulty: "Hard",
      speed: 700, length: 6800,
      obstacles: [
        { type:"spike", x: 1700, w: 44, h: 54 },
        { type:"block", x: 2040, w: 90, h: 220 },
        { type:"spike", x: 2380, w: 44, h: 54 },
        { type:"block", x: 2680, w: 140, h: 150 },
        { type:"spike", x: 3060, w: 44, h: 54 },
        { type:"block", x: 3340, w: 90, h: 260 },
        { type:"spike", x: 3720, w: 44, h: 54 },
        { type:"block", x: 4000, w: 180, h: 140 },
        { type:"spike", x: 4480, w: 44, h: 54 },
        { type:"block", x: 4780, w: 100, h: 300 },
        { type:"spike", x: 5300, w: 44, h: 54 },
        { type:"block", x: 5600, w: 220, h: 160 },
      ]
    }
  ];

  let selectedLevel = LEVELS[0];

  function loadBest() {
    try { return JSON.parse(localStorage.getItem("neonDashBest") || "{}"); }
    catch { return {}; }
  }
  const bestById = loadBest();
  function saveBest() {
    try { localStorage.setItem("neonDashBest", JSON.stringify(bestById)); } catch {}
  }

  function renderLevelsList() {
    levelsListEl.innerHTML = "";
    LEVELS.forEach((lvl) => {
      const best = Math.floor((bestById[lvl.id] || 0) * 100);
      const el = document.createElement("div");
      el.className = "levelItem" + (lvl.id === selectedLevel.id ? " selected" : "");
      el.innerHTML = `<div class="name">${lvl.name}</div>
                      <div class="meta">${lvl.difficulty} • Best ${best}% • Speed ${lvl.speed}</div>`;
      el.addEventListener("click", () => {
        selectedLevel = lvl;
        renderLevelsList();
        updateBestUI();
      });
      levelsListEl.appendChild(el);
    });
  }

  function updateBestUI() {
    const best = bestById[selectedLevel.id] || 0;
    bestPctEl.textContent = `${Math.floor(best * 100)}%`;
  }

  // ---------- GD-like physics tuning ----------
  // y is "height above ground"
  const GRAVITY = 2600;
  const JUMP_V = 980;
  const MAX_FALL = -1600;

  // forgiveness (feels GD-ish)
  let coyoteTime = 0;        // can jump shortly after leaving ground
  let jumpBuffer = 0;        // if you press slightly early
  const COYOTE_MAX = 0.08;   // seconds
  const BUFFER_MAX = 0.10;   // seconds

  // auto-restart
  let deathTimer = 0;        // seconds until auto restart
  const DEATH_RESTART = 0.85;

  // start countdown (tiny)
  let countdown = 0;

  // ---------- World & player ----------
  const world = { x: 0, t: 0 };
  const player = { x: 240, y: 0, r: 18, vy: 0, onGround: true, alive: true };
  let runProgress = 0;

  // background stars
  const stars = Array.from({ length: 200 }, () => ({
    x: Math.random(), y: Math.random(),
    s: Math.random() * 1.3 + 0.3,
    p: Math.random()
  }));

  // sparks
  const sparks = [];
  function spawnSparks(x, y, n = 26) {
    if (!particlesToggle.checked) return;
    for (let i = 0; i < n; i++) {
      sparks.push({
        x, y,
        vx: (Math.random() * 2 - 1) * (260 + Math.random() * 260),
        vy: (Math.random() * -1) * (420 + Math.random() * 520),
        life: 0.55 + Math.random() * 0.35
      });
    }
  }

  function getGroundY() {
    const { h } = resizeCanvasToDisplaySize();
    return h * 0.84;
  }

  function resetRun() {
    world.x = 0;
    world.t = 0;
    runProgress = 0;

    player.y = 0;
    player.vy = 0;
    player.onGround = true;
    player.alive = true;

    coyoteTime = COYOTE_MAX;
    jumpBuffer = 0;
    deathTimer = 0;

    countdown = 0.35; // small "GO" delay
    paused = false;
    runPctEl.textContent = "0%";
    statusPillEl.textContent = "Playing";
  }

  function goMenu() {
    exitPlayModeUI();
    state = State.LEVELS;
    paused = false;
    statusPillEl.textContent = "Menu";
    deathTimer = 0;
  }

  function startLevel() {
    ensureAudio();
    enterPlayModeUI();
    state = State.PLAY;
    if (musicToggle.checked) startMusic();
    resetRun();
    updateBestUI();
  }

  // ONLY Play starts. Space never starts.
  // Space/click only jumps during play.

  function queueJump() {
    if (state !== State.PLAY) return;
    if (paused) return;
    if (!player.alive) return;
    jumpBuffer = BUFFER_MAX;
  }

  function doJumpNow() {
    player.vy = JUMP_V;
    player.onGround = false;
    coyoteTime = 0;
    spawnSparks(player.x, 10, 24);
    sfx(560, 0.03, 0.05);
  }

  function die() {
    if (!player.alive) return;
    player.alive = false;
    deathTimer = DEATH_RESTART;
    spawnSparks(player.x, player.y + 40, 60);
    sfx(160, 0.08, 0.07);
    statusPillEl.textContent = "Crashed";
  }

  function win() {
    const best = bestById[selectedLevel.id] || 0;
    if (runProgress > best) {
      bestById[selectedLevel.id] = runProgress;
      saveBest();
      renderLevelsList();
      updateBestUI();
    }
    statusPillEl.textContent = "Cleared!";
    // auto go back to menu after win
    setTimeout(() => {
      if (state === State.PLAY) goMenu();
    }, 900);
  }

  // ---------- Collision helpers ----------
  function rectCircleCollide(rx, ry, rw, rh, cx, cy, cr) {
    const nx = clamp(cx, rx, rx + rw);
    const ny = clamp(cy, ry, ry + rh);
    const dx = cx - nx;
    const dy = cy - ny;
    return (dx * dx + dy * dy) <= cr * cr;
  }

  function triCollideSpike(sx, sy, w, h, cx, cy, cr) {
    // Simple: approximate spike as rectangle near its base + tip
    // Looks good enough for GD-like feel.
    const baseH = h * 0.65;
    const rectHit = rectCircleCollide(sx, sy + (h - baseH), w, baseH, cx, cy, cr);
    if (rectHit) return true;
    // tip as small circle
    const tipX = sx + w / 2;
    const tipY = sy + 4;
    const dx = cx - tipX;
    const dy = cy - tipY;
    return (dx * dx + dy * dy) <= (cr * cr);
  }

  // ---------- Drawing ----------
  function roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  function drawBackground(w, h, time) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    const a = 0.23 + Math.sin(time * 0.0008) * 0.04;
    const b = 0.20 + Math.cos(time * 0.0006) * 0.04;
    g.addColorStop(0, `rgba(90,140,255,${a})`);
    g.addColorStop(0.5, `rgba(0,0,0,0)`);
    g.addColorStop(1, `rgba(0,255,190,${b})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalAlpha = 0.85;
    for (const s of stars) {
      const sx = (s.x * w + (world.x * 0.10)) % w;
      const sy = (s.y * h + Math.sin(time * 0.00035 + s.p) * 7) % h;
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillRect(sx, sy, s.s, s.s);
    }
    ctx.restore();
  }

  function drawGrid(w, h) {
    ctx.save();
    ctx.globalAlpha = 0.10;
    const step = Math.max(24, Math.floor(w / 24));
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1;
    for (let x = ((-world.x * 0.25) % step); x < w; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    ctx.restore();
  }

  function drawGround(w, h) {
    const gy = getGroundY();
    ctx.save();
    ctx.fillStyle = "rgba(0,255,190,0.10)";
    ctx.fillRect(0, gy, w, h - gy);

    ctx.strokeStyle = "rgba(0,255,190,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    ctx.restore();
  }

  function drawSpike(x, y, w, h) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.strokeStyle = "rgba(255,120,160,0.70)";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowColor = "rgba(255,120,160,0.85)";
    ctx.shadowBlur = 18;
    ctx.strokeStyle = "rgba(255,120,160,0.55)";
    ctx.stroke();
    ctx.restore();
  }

  function drawBlock(x, y, w, h) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.strokeStyle = "rgba(90,140,255,0.70)";
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();

    ctx.shadowColor = "rgba(0,255,190,0.85)";
    ctx.shadowBlur = 18;
    ctx.strokeStyle = "rgba(0,255,190,0.50)";
    roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 10);
    ctx.stroke();
    ctx.restore();
  }

  function drawObstacles() {
    const gy = getGroundY();
    for (const o of selectedLevel.obstacles) {
      const x = o.x - world.x;
      if (x + o.w < -140 || x > canvas.width + 140) continue;

      if (o.type === "block") {
        drawBlock(x, gy - o.h, o.w, o.h);
      } else {
        drawSpike(x, gy - o.h, o.w, o.h);
      }
    }
  }

  function drawPlayer() {
    const gy = getGroundY();
    const px = player.x;
    const py = gy - player.r - player.y;

    ctx.save();
    ctx.shadowColor = "rgba(0,255,190,0.95)";
    ctx.shadowBlur = 22;
    ctx.fillStyle = "rgba(0,255,190,0.22)";
    ctx.strokeStyle = "rgba(0,255,190,0.85)";
    ctx.lineWidth = 2;

    const angle = world.t * 0.018; // faster spin = more GD feel
    ctx.translate(px, py);
    ctx.rotate(angle);

    roundRect(ctx, -player.r, -player.r, player.r * 2, player.r * 2, 7);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  function drawSparks(dt) {
    if (!particlesToggle.checked) return;
    const gy = getGroundY();
    const w = canvas.width;

    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.life -= dt;
      if (p.life <= 0) { sparks.splice(i, 1); continue; }

      p.vy -= 1100 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      ctx.save();
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.fillStyle = "rgba(0,255,190,0.8)";
      ctx.shadowColor = "rgba(0,255,190,0.95)";
      ctx.shadowBlur = 12;
      ctx.fillRect(p.x, (gy - p.y), 2, 2);
      ctx.restore();

      if (p.x < -220 || p.x > w + 220 || p.y < -240) p.life = 0;
    }
  }

  function drawHUD(w, h) {
    // small in-canvas hints only (not blocking)
    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    roundRect(ctx, 14, 14, 290, 52, 14);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = `${Math.floor(h * 0.03)}px system-ui`;

    if (!player.alive) {
      ctx.fillText("CRASHED — restarting…", 28, 47);
    } else if (paused) {
      ctx.fillText("PAUSED (P)  •  ESC menu", 28, 47);
    } else {
      ctx.fillText("Jump: click/space  •  P pause  •  ESC menu", 28, 47);
    }

    // countdown "GO" in middle
    if (countdown > 0) {
      ctx.globalAlpha = 0.92;
      ctx.font = `${Math.floor(h * 0.09)}px system-ui`;
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillText("GO!", w * 0.46, h * 0.44);
    }
    ctx.restore();
  }

  // ---------- Game loop ----------
  function update(dt) {
    if (state !== State.PLAY) return;

    world.t += dt * 1000;

    if (paused) return;

    if (countdown > 0) {
      countdown -= dt;
      if (countdown < 0) countdown = 0;
    }

    // auto-restart after death
    if (!player.alive) {
      deathTimer -= dt;
      if (deathTimer <= 0) resetRun();
      return;
    }

    // auto-run (GD feel)
    world.x += selectedLevel.speed * dt;

    runProgress = clamp(world.x / selectedLevel.length, 0, 1);
    runPctEl.textContent = `${Math.floor(runProgress * 100)}%`;

    // buffers
    if (jumpBuffer > 0) jumpBuffer -= dt;
    if (player.onGround) coyoteTime = COYOTE_MAX;
    else if (coyoteTime > 0) coyoteTime -= dt;

    // physics
    player.vy -= GRAVITY * dt;
    player.vy = Math.max(player.vy, MAX_FALL);
    player.y += player.vy * dt;

    // ground
    if (player.y <= 0) {
      player.y = 0;
      player.vy = 0;
      player.onGround = true;
    } else {
      player.onGround = false;
    }

    // if we queued a jump and we can jump (on ground OR coyote), do it
    if (jumpBuffer > 0 && (player.onGround || coyoteTime > 0)) {
      jumpBuffer = 0;
      doJumpNow();
    }

    // collisions
    const gy = getGroundY();
    const px = player.x;
    const py = gy - player.r - player.y;

    for (const o of selectedLevel.obstacles) {
      const ox = o.x - world.x;
      if (ox + o.w < -140 || ox > canvas.width + 140) continue;

      if (o.type === "block") {
        const oy = gy - o.h;
        if (rectCircleCollide(ox, oy, o.w, o.h, px, py, player.r * 0.9)) {
          die();
          break;
        }
      } else {
        const sy = gy - o.h;
        if (triCollideSpike(ox, sy, o.w, o.h, px, py, player.r * 0.9)) {
          die();
          break;
        }
      }
    }

    if (runProgress >= 1 && player.alive) win();
  }

  function render(dt, ts) {
    const { w, h } = resizeCanvasToDisplaySize();
    ctx.clearRect(0, 0, w, h);

    drawBackground(w, h, ts);
    drawGrid(w, h);
    drawGround(w, h);
    drawObstacles();
    drawPlayer();
    drawSparks(dt);
    drawHUD(w, h);
  }

  let lastTs = 0;
  function loop(ts) {
    if (!lastTs) lastTs = ts;
    const dt = clamp((ts - lastTs) / 1000, 0, 0.033);
    lastTs = ts;

    update(dt);
    render(dt, ts);
    requestAnimationFrame(loop);
  }

  // ---------- Input ----------
  function togglePause() {
    if (state !== State.PLAY) return;
    paused = !paused;
  }

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;

    if (e.code === "Escape") { goMenu(); return; }
    if (e.code === "KeyP") { togglePause(); return; }
    if (e.code === "KeyR") { startLevel(); return; }

    if (e.code === "Space" || e.code === "ArrowUp") {
      // Space only jumps (never starts)
      queueJump();
    }
  });

  canvas.addEventListener("pointerdown", () => {
    ensureAudio();
    if (state === State.PLAY) queueJump();
  });

  // buttons
  btnLevels.addEventListener("click", () => goMenu());
  btnPlay.addEventListener("click", () => startLevel());
  btnRestart.addEventListener("click", () => startLevel());

  musicToggle.addEventListener("change", () => {
    ensureAudio();
    if (!musicToggle.checked) stopMusic();
    else if (state === State.PLAY) startMusic();
  });

  // ---------- Boot ----------
  function boot() {
    renderLevelsList();
    updateBestUI();
    goMenu();
    window.addEventListener("resize", () => resizeCanvasToDisplaySize());
    resizeCanvasToDisplaySize();
    requestAnimationFrame(loop);
  }

  boot();
})();



