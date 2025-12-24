(() => {
  // ---------- DOM ----------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: true });

  const levelsListEl = document.getElementById("levelsList");
  const statusPillEl = document.getElementById("statusPill");
  const screenTitleEl = document.getElementById("screenTitle");
  const screenSubEl = document.getElementById("screenSub");
  const bestPctEl = document.getElementById("bestPct");
  const runPctEl = document.getElementById("runPct");

  const btnPlay = document.getElementById("btnPlay");
  const btnLevels = document.getElementById("btnLevels");
  const btnRestart = document.getElementById("btnRestart");

  const musicToggle = document.getElementById("musicToggle");
  const fxToggle = document.getElementById("fxToggle");
  const liteToggle = document.getElementById("liteToggle");

  // ---------- Helpers ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, (r.width * dpr) | 0);
    const h = Math.max(1, (r.height * dpr) | 0);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { w, h, dpr };
  }

  function groundY() {
    return canvas.height * 0.84;
  }

  function enterPlayUI() { document.body.classList.add("playmode"); }
  function exitPlayUI() { document.body.classList.remove("playmode"); }

  // ---------- Audio (very light) ----------
  let audioCtx = null;
  let music = null;

  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function beep(type, freq, dur, vol) {
    if (!audioCtx || !fxToggle.checked) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = 0.0001;
    o.connect(g); g.connect(audioCtx.destination);
    const t = audioCtx.currentTime;
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  const sfx = {
    jump(){ beep("square", 650, 0.06, 0.06); },
    pad(){  beep("triangle", 880, 0.08, 0.06); },
    die(){  beep("sawtooth", 160, 0.12, 0.08); },
    win(){  beep("triangle", 980, 0.10, 0.06); },
  };

  function stopMusic() {
    if (!music) return;
    try { clearInterval(music.timer); } catch {}
    try { music.o1.stop(); music.o2.stop(); } catch {}
    music = null;
  }

  function startMusic() {
    if (!musicToggle.checked) return;
    ensureAudio();
    stopMusic();

    const master = audioCtx.createGain();
    master.gain.value = 0.11;
    master.connect(audioCtx.destination);

    const o1 = audioCtx.createOscillator();
    const o2 = audioCtx.createOscillator();
    const g1 = audioCtx.createGain();
    const g2 = audioCtx.createGain();
    o1.type = "sawtooth";
    o2.type = "triangle";
    g1.gain.value = 0;
    g2.gain.value = 0;
    o1.connect(g1); g1.connect(master);
    o2.connect(g2); g2.connect(master);
    o1.start(); o2.start();

    const bpm = 126;
    const stepDur = (60 / bpm) / 2; // 8ths
    const seq = [0, 7, 12, 7, 0, 10, 12, 10];
    const base = 220;
    let step = 0;

    const timer = setInterval(() => {
      const t = audioCtx.currentTime;
      const n = seq[step++ % seq.length];
      const hz = base * Math.pow(2, n/12);

      const a = t + 0.01;
      const r = t + stepDur * 0.95;

      o1.frequency.setValueAtTime(hz, a);
      o2.frequency.setValueAtTime(hz * 2, a);

      g1.gain.cancelScheduledValues(t);
      g2.gain.cancelScheduledValues(t);

      g1.gain.setValueAtTime(0.0001, t);
      g1.gain.linearRampToValueAtTime(0.14, a);
      g1.gain.exponentialRampToValueAtTime(0.0001, r);

      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.linearRampToValueAtTime(0.08, a);
      g2.gain.exponentialRampToValueAtTime(0.0001, r);
    }, stepDur * 1000);

    music = { o1, o2, timer };
  }

  musicToggle.addEventListener("change", () => {
    ensureAudio();
    if (!musicToggle.checked) stopMusic();
    else if (state === "play") startMusic();
  });

  // ---------- Save best ----------
  const bestKey = "riftpulseBest";
  const bestById = (() => {
    try { return JSON.parse(localStorage.getItem(bestKey) || "{}"); }
    catch { return {}; }
  })();
  function saveBest(){ try { localStorage.setItem(bestKey, JSON.stringify(bestById)); } catch {} }

  // ---------- Levels (OG-ish: spikes, blocks, pads) ----------
  // type: 0=spike, 1=block, 2=pad
  const LEVELS = [
    {
      id:"l1", name:"Neon Steps", diff:"Easy",
      speed: 620, length: 6200,
      obs: [
        [0,1700,46,56],
        [1,2100,90,110],
        [0,2500,46,56],
        [2,2700,70,16],  // pad
        [1,2860,110,170],
        [0,3320,46,56],
        [1,3650,100,140],
        [0,4200,46,56],
        [0,4380,46,56],
        [1,4900,150,130],
        [0,5480,46,56],
      ]
    },
    {
      id:"l2", name:"Pulse Lane", diff:"Medium",
      speed: 690, length: 7000,
      obs: [
        [0,1700,46,56],
        [0,1880,46,56],
        [1,2300,120,170],
        [0,2750,46,56],
        [2,2960,70,16],
        [1,3120,160,150],
        [0,3650,46,56],
        [1,4020,120,230],
        [0,4660,46,56],
        [1,5050,180,160],
        [0,5750,46,56],
        [0,5930,46,56],
      ]
    },
    {
      id:"l3", name:"Ion Rush", diff:"Hard",
      speed: 740, length: 7600,
      obs: [
        [0,1800,46,56],
        [1,2200,140,230],
        [0,2700,46,56],
        [2,2920,70,16],
        [1,3080,200,160],
        [0,3600,46,56],
        [1,3950,140,280],
        [0,4620,46,56],
        [1,4980,240,170],
        [0,5650,46,56],
        [1,6000,160,320],
        [0,6750,46,56],
      ]
    }
  ];

  let selected = LEVELS[0];

  function updateBestUI() {
    bestPctEl.textContent = `${((bestById[selected.id] || 0) * 100) | 0}%`;
  }

  function renderLevels() {
    levelsListEl.innerHTML = "";
    for (const lvl of LEVELS) {
      const best = ((bestById[lvl.id] || 0) * 100) | 0;
      const el = document.createElement("div");
      el.className = "levelItem" + (lvl.id === selected.id ? " sel" : "");
      el.innerHTML = `<div class="n">${lvl.name}</div><div class="m">${lvl.diff} • Best ${best}% • Speed ${lvl.speed}</div>`;
      el.onclick = () => { selected = lvl; renderLevels(); updateBestUI(); };
      levelsListEl.appendChild(el);
    }
  }

  // ---------- Game State ----------
  let state = "menu"; // menu | play
  let paused = false;

  // physics (OG feel)
  const GRAV = 2850;
  const JUMP = 820;     // fair jump
  const PADJ = 1240;    // yellow pad boost
  const MAXF = -1750;

  // forgiveness (feels good)
  let coyote = 0;
  let buffer = 0;
  const COYOTE_MAX = 0.08;
  const BUFFER_MAX = 0.11;

  // auto-restart
  let deadTimer = 0;
  const RESTART_IN = 0.75;

  // world/player (y = height above ground)
  const world = { x: 0, t: 0 };
  const player = { x: 250, y: 0, vy: 0, r: 18, alive: true, onGround: true };

  // lightweight visuals (no lag): stars + tiny trail (in arrays, re-used)
  const starsA = new Float32Array(240); // x,y pairs 120
  const starsB = new Float32Array(180); // x,y pairs 90
  for (let i=0;i<starsA.length;i++) starsA[i] = Math.random();
  for (let i=0;i<starsB.length;i++) starsB[i] = Math.random();

  const TRAIL_MAX = 18;
  const trailX = new Float32Array(TRAIL_MAX);
  const trailY = new Float32Array(TRAIL_MAX);
  let trailN = 0;

  function setStatus(t){ statusPillEl.textContent = t; }

  function goMenu() {
    exitPlayUI();
    state = "menu";
    paused = false;
    setStatus("Menu");
    screenTitleEl.textContent = "Pick a Level";
    screenSubEl.textContent = "Select one, then press Play";
  }

  function startRun() {
    ensureAudio();
    enterPlayUI();
    state = "play";
    paused = false;
    setStatus("Playing");
    screenTitleEl.textContent = selected.name;
    screenSubEl.textContent = "tap to jump • don’t touch spikes";
    if (musicToggle.checked) startMusic();

    world.x = 0; world.t = 0;
    player.y = 0; player.vy = 0;
    player.alive = true; player.onGround = true;
    coyote = COYOTE_MAX; buffer = 0;
    deadTimer = 0;
    trailN = 0;
    runPctEl.textContent = "0%";
  }

  function die() {
    if (!player.alive) return;
    player.alive = false;
    deadTimer = RESTART_IN;
    setStatus("Crashed");
    sfx.die();
  }

  function win() {
    setStatus("Cleared!");
    sfx.win();
    const prog = clamp(world.x / selected.length, 0, 1);
    const prev = bestById[selected.id] || 0;
    if (prog > prev) { bestById[selected.id] = prog; saveBest(); renderLevels(); updateBestUI(); }
    // go menu after a moment
    setTimeout(() => { if (state === "play") goMenu(); }, 900);
  }

  // Only Play starts
  btnPlay.onclick = startRun;
  btnRestart.onclick = startRun;
  btnLevels.onclick = goMenu;

  // input: queue jump only (space never starts)
  function queueJump() {
    if (state !== "play" || paused || !player.alive) return;
    buffer = BUFFER_MAX;
  }

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "Escape") { goMenu(); return; }
    if (e.code === "KeyP") { if (state === "play") paused = !paused; return; }
    if (e.code === "KeyR") { startRun(); return; }
    if (e.code === "Space" || e.code === "ArrowUp") { queueJump(); }
  });
  canvas.addEventListener("pointerdown", () => { ensureAudio(); queueJump(); });

  // ---------- Collision (fast) ----------
  function rectCircle(rx, ry, rw, rh, cx, cy, cr) {
    const nx = cx < rx ? rx : cx > rx + rw ? rx + rw : cx;
    const ny = cy < ry ? ry : cy > ry + rh ? ry + rh : cy;
    const dx = cx - nx, dy = cy - ny;
    return dx*dx + dy*dy <= cr*cr;
  }

  function spikeHit(sx, sy, w, h, cx, cy, cr) {
    // base rectangle + tip circle approximation (cheap & good)
    if (rectCircle(sx, sy + h*0.55, w, h*0.45, cx, cy, cr)) return true;
    const tx = sx + w*0.5, ty = sy + 6;
    const dx = cx - tx, dy = cy - ty;
    return dx*dx + dy*dy <= cr*cr;
  }

  // ---------- Drawing ----------
  function rr(x, y, w, h, r) {
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr, y);
    ctx.arcTo(x+w, y, x+w, y+h, rr);
    ctx.arcTo(x+w, y+h, x, y+h, rr);
    ctx.arcTo(x, y+h, x, y, rr);
    ctx.arcTo(x, y, x+w, y, rr);
    ctx.closePath();
  }

  function drawBackground(t) {
    const w = canvas.width, h = canvas.height;
    const p1 = 0.18 + Math.sin(t*0.0012)*0.05;
    const p2 = 0.14 + Math.cos(t*0.0010)*0.05;

    const g = ctx.createLinearGradient(0,0,w,h);
    g.addColorStop(0, `rgba(130,140,255,${p1})`);
    g.addColorStop(0.55, `rgba(0,0,0,0)`);
    g.addColorStop(1, `rgba(0,255,190,${p2})`);
    ctx.fillStyle = g;
    ctx.fillRect(0,0,w,h);

    // stars (lite mode draws fewer)
    const lite = liteToggle.checked;
    ctx.save();
    ctx.globalAlpha = 0.8;

    const countA = lite ? 50 : 120;
    for (let i=0;i<countA;i++){
      const x = (starsA[i*2] * w + world.x*0.06) % w;
      const y = (starsA[i*2+1] * h + Math.sin(t*0.00035 + i)*4) % h;
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillRect(x,y,1.6,1.6);
    }

    const countB = lite ? 35 : 90;
    for (let i=0;i<countB;i++){
      const x = (starsB[i*2] * w + world.x*0.12) % w;
      const y = (starsB[i*2+1] * h + Math.cos(t*0.00045 + i)*6) % h;
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.fillRect(x,y,2.0,2.0);
    }
    ctx.restore();

    // grid (cheap)
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    const step = Math.max(26, (w/26)|0);
    for (let x = ((-world.x*0.22) % step); x < w; x += step) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke();
    }
    ctx.restore();
  }

  function drawGround() {
    const w = canvas.width, h = canvas.height;
    const gy = groundY();
    ctx.fillStyle = "rgba(0,255,190,0.10)";
    ctx.fillRect(0, gy, w, h-gy);
    ctx.strokeStyle = "rgba(0,255,190,0.60)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0,gy); ctx.lineTo(w,gy); ctx.stroke();
  }

  function drawObstacle(type, x, w, h) {
    const gy = groundY();
    const y = gy - h;

    if (type === 1) { // block
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.strokeStyle = "rgba(130,140,255,0.75)";
      ctx.lineWidth = 2;
      rr(x,y,w,h,10); ctx.fill(); ctx.stroke();

      ctx.shadowColor = "rgba(0,255,190,0.85)";
      ctx.shadowBlur = 16;
      ctx.strokeStyle = "rgba(0,255,190,0.42)";
      rr(x+1,y+1,w-2,h-2,10); ctx.stroke();
      ctx.restore();
      return;
    }

    if (type === 0) { // spike
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.strokeStyle = "rgba(255,120,170,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y+h);
      ctx.lineTo(x+w*0.5, y);
      ctx.lineTo(x+w, y+h);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
      return;
    }

    if (type === 2) { // pad
      ctx.save();
      ctx.fillStyle = "rgba(255,230,90,0.18)";
      ctx.strokeStyle = "rgba(255,230,90,0.90)";
      ctx.lineWidth = 2;
      rr(x, gy-h, w, h, 8); ctx.fill(); ctx.stroke();
      ctx.restore();
      return;
    }
  }

  function drawPlayer() {
    const gy = groundY();
    const px = player.x;
    const py = gy - player.r - player.y;

    // trail (no allocations, fixed arrays)
    const lite = liteToggle.checked;
    if (!lite) {
      trailX[trailN % TRAIL_MAX] = px;
      trailY[trailN % TRAIL_MAX] = py;
      trailN++;
      const n = Math.min(trailN, TRAIL_MAX);
      for (let i=0;i<n;i++){
        const idx = (trailN - 1 - i + TRAIL_MAX) % TRAIL_MAX;
        const a = 0.18 - i * 0.008;
        if (a <= 0) break;
        ctx.globalAlpha = a;
        ctx.fillStyle = "rgba(0,255,190,0.65)";
        ctx.fillRect(trailX[idx]-2, trailY[idx]-2, 4, 4);
      }
      ctx.globalAlpha = 1;
    }

    // cube
    ctx.save();
    ctx.shadowColor = "rgba(0,255,190,0.95)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "rgba(0,255,190,0.20)";
    ctx.strokeStyle = "rgba(0,255,190,0.90)";
    ctx.lineWidth = 2;

    const ang = world.t * 0.0022;
    ctx.translate(px, py);
    ctx.rotate(ang);
    rr(-player.r, -player.r, player.r*2, player.r*2, 7);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawHUD() {
    // super tiny HUD (no DOM overlays in play)
    const w = canvas.width, h = canvas.height;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    rr(14,14,280,46,14); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = `${(h*0.03)|0}px system-ui`;

    if (!player.alive) ctx.fillText("CRASHED — restarting…", 28, 44);
    else if (paused) ctx.fillText("PAUSED (P) • ESC menu", 28, 44);
    else ctx.fillText("Jump: click/space • ESC menu", 28, 44);
    ctx.restore();
  }

  // ---------- Update ----------
  function update(dt) {
    if (state !== "play") return;

    world.t += dt * 1000;

    if (paused) return;

    // dead => auto restart
    if (!player.alive) {
      deadTimer -= dt;
      if (deadTimer <= 0) startRun();
      return;
    }

    // run
    world.x += selected.speed * dt;

    const prog = clamp(world.x / selected.length, 0, 1);
    runPctEl.textContent = `${(prog * 100) | 0}%`;

    // buffers
    if (buffer > 0) buffer -= dt;
    if (player.onGround) coyote = COYOTE_MAX;
    else coyote = Math.max(0, coyote - dt);

    // physics
    player.vy -= GRAV * dt;
    player.vy = Math.max(player.vy, MAXF);
    player.y += player.vy * dt;

    if (player.y <= 0) {
      player.y = 0;
      player.vy = 0;
      player.onGround = true;
    } else {
      player.onGround = false;
    }

    // jump
    if (buffer > 0 && (player.onGround || coyote > 0)) {
      buffer = 0;
      coyote = 0;
      player.vy = JUMP;
      player.onGround = false;
      sfx.jump();
    }

    // collisions
    const gy = groundY();
    const px = player.x;
    const py = gy - player.r - player.y;

    // iterate obstacles
    const obs = selected.obs;
    for (let i=0;i<obs.length;i++){
      const o = obs[i];
      const type = o[0];
      const ox = o[1] - world.x;
      const ow = o[2];
      const oh = o[3];

      if (ox + ow < -160) continue;
      if (ox > canvas.width + 160) break; // obs are sorted by x

      if (type === 2) { // pad
        const oy = gy - oh;
        if (rectCircle(ox, oy, ow, oh, px, py, player.r*0.95) && player.y <= 7) {
          player.vy = PADJ;
          player.onGround = false;
          buffer = 0; coyote = 0;
          sfx.pad();
        }
        continue;
      }

      if (type === 1) { // block
        const oy = gy - oh;
        if (rectCircle(ox, oy, ow, oh, px, py, player.r*0.90)) { die(); break; }
      } else { // spike
        const sy = gy - oh;
        if (spikeHit(ox, sy, ow, oh, px, py, player.r*0.90)) { die(); break; }
      }
    }

    if (prog >= 1) win();
  }

  // ---------- Render ----------
  function render(ts) {
    resizeCanvas();
    ctx.clearRect(0,0,canvas.width,canvas.height);
    drawBackground(ts);
    drawGround();

    if (state === "play") {
      const obs = selected.obs;
      for (let i=0;i<obs.length;i++){
        const o = obs[i];
        const ox = o[1] - world.x;
        if (ox + o[2] < -160) continue;
        if (ox > canvas.width + 160) break;
        drawObstacle(o[0], ox, o[2], o[3]);
      }
      drawPlayer();
      drawHUD();
    }
  }

  // ---------- Loop (stable, low-lag) ----------
  let last = 0;
  function loop(ts) {
    if (!last) last = ts;
    // fixed-ish delta clamp
    const dt = clamp((ts - last) / 1000, 0, 0.033);
    last = ts;

    update(dt);
    render(ts);
    requestAnimationFrame(loop);
  }

  // ---------- Menu boot ----------
  function boot() {
    renderLevels();
    updateBestUI();
    goMenu();
    window.addEventListener("resize", resizeCanvas);
    requestAnimationFrame(loop);
  }

  // start only via Play
  btnPlay.addEventListener("click", () => {
    startRun();
    if (musicToggle.checked) startMusic();
  });

  // ensure audio on first click anywhere (helps browsers)
  window.addEventListener("pointerdown", () => ensureAudio(), { once:true });

  boot();
})();





