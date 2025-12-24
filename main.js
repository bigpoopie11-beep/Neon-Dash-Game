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
  const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };

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

  function floorY() { return canvas.height * 0.84; }
  function ceilY() { return canvas.height * 0.18; } // ceiling lane

  function enterPlayUI() { document.body.classList.add("playmode"); }
  function exitPlayUI() { document.body.classList.remove("playmode"); }

  // ---------- Audio (light) ----------
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
    jump(){ beep("square", 680, 0.06, 0.06); },
    orb(){  beep("triangle", 960, 0.08, 0.06); },
    pad(){  beep("triangle", 880, 0.08, 0.06); },
    flip(){ beep("sawtooth", 420, 0.09, 0.06); },
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
    const stepDur = (60 / bpm) / 2;
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

  // ---------- Types ----------
  // 0 spike (floor)
  // 1 block (floor)
  // 2 pad   (floor)
  // 3 orb   (air)    [3, x, yFromTop, radius]
  // 4 portal(gravity flip) (air) [4, x, yFromTop, w, h]
  //
  // For floor stuff arrays are: [type, x, w, h]

  // ---------- Levels (OG-ish) ----------
  const LEVELS = [
    {
      id:"l1", name:"Neon Steps", diff:"Easy",
      speed: 620, length: 6400,
      obs: [
        [0,1700,46,56],
        [1,2100,90,110],
        [0,2500,46,56],

        [3,2680, 310, 18],       // orb (tap in air)
        [2,2860,70,16],           // pad
        [1,3020,110,160],

        [0,3500,46,56],
        [1,3850,100,140],
        [0,4400,46,56],

        [3,4650, 290, 18],        // orb
        [1,5000,150,135],
        [0,5600,46,56],
      ]
    },
    {
      id:"l2", name:"Pulse Lane", diff:"Medium",
      speed: 690, length: 7200,
      obs: [
        [0,1700,46,56],
        [0,1880,46,56],
        [1,2300,120,170],

        [3,2650, 305, 18],
        [2,2950,70,16],
        [1,3120,160,150],

        [0,3650,46,56],
        [1,4020,120,230],

        [4,4520, 260, 70, 130],   // gravity flip portal
        [3,4900, 140, 18],         // ceiling-side orb (after flip)
        [0,5200,46,56],

        [4,5900, 260, 70, 130],   // flip back
        [1,6250,180,160],
        [0,6900,46,56],
      ]
    },
    {
      id:"l3", name:"Ion Rush", diff:"Hard",
      speed: 740, length: 7800,
      obs: [
        [0,1800,46,56],
        [1,2200,140,230],

        [3,2550, 300, 18],
        [0,2700,46,56],
        [2,2920,70,16],
        [1,3080,200,160],

        [4,3600, 260, 70, 130],   // flip
        [3,3920, 140, 18],
        [1,4200,140,260],         // still floor block (danger if you drop)

        [4,4680, 260, 70, 130],   // flip back
        [0,5050,46,56],
        [1,5400,240,170],

        [3,5900, 290, 18],
        [0,6300,46,56],
        [1,6600,160,320],
        [0,7350,46,56],
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

  // physics (jump a little higher per your request)
  const GRAV = 2850;
  const JUMP = 880;    // <- higher than before
  const PADJ = 1260;
  const ORBJ = 1050;   // orb boost
  const MAXF = -1750;

  // forgiveness
  let coyote = 0;
  let buffer = 0;
  const COYOTE_MAX = 0.08;
  const BUFFER_MAX = 0.11;

  // orb tap (must tap while near orb)
  let tapThisFrame = false;
  let orbLock = 0; // prevents double-trigger spam

  // gravity
  // gravitySign = 1 means "normal floor"
  // gravitySign = -1 means "ceiling mode"
  let gravitySign = 1;

  // auto restart
  let deadTimer = 0;
  const RESTART_IN = 0.75;

  // world/player
  const world = { x: 0, t: 0 };
  // offset = distance away from current surface (floor/ceiling)
  const player = { x: 250, offset: 0, vy: 0, r: 18, alive: true, onSurface: true };

  // visuals (fixed arrays, low lag)
  const starsA = new Float32Array(240);
  const starsB = new Float32Array(180);
  for (let i=0;i<starsA.length;i++) starsA[i] = Math.random();
  for (let i=0;i<starsB.length;i++) starsB[i] = Math.random();

  // tiny trail
  const TRAIL_MAX = 18;
  const trailX = new Float32Array(TRAIL_MAX);
  const trailY = new Float32Array(TRAIL_MAX);
  let trailN = 0;

  function setStatus(t){ statusPillEl.textContent = t; }

  function surfaceY() {
    return gravitySign === 1 ? floorY() : ceilY();
  }

  function playerCenterY() {
    const sY = surfaceY();
    // if normal: cube above floor => y = floor - r - offset
    // if inverted: cube below ceiling => y = ceiling + r + offset
    return gravitySign === 1 ? (sY - player.r - player.offset) : (sY + player.r + player.offset);
  }

  function snapToSurface() {
    player.offset = 0;
    player.vy = 0;
    player.onSurface = true;
  }

  function flipGravityKeepPosition() {
    // keep the cube at the same screen Y when flipping
    const py = playerCenterY();
    gravitySign *= -1;

    const sY = surfaceY();
    if (gravitySign === 1) {
      // offset = (floor - r) - py
      player.offset = Math.max(0, (sY - player.r) - py);
    } else {
      // offset = py - (ceiling + r)
      player.offset = Math.max(0, py - (sY + player.r));
    }
    player.vy = -player.vy;
    player.onSurface = false;
    sfx.flip();
  }

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
    screenSubEl.textContent = "tap to jump • orbs/portals enabled";

    if (musicToggle.checked) startMusic();

    world.x = 0; world.t = 0;
    gravitySign = 1;
    player.offset = 0; player.vy = 0;
    player.alive = true; player.onSurface = true;

    coyote = COYOTE_MAX; buffer = 0;
    deadTimer = 0;
    tapThisFrame = false;
    orbLock = 0;
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
    setTimeout(() => { if (state === "play") goMenu(); }, 900);
  }

  // Only Play starts
  btnPlay.onclick = startRun;
  btnRestart.onclick = startRun;
  btnLevels.onclick = goMenu;

  function queueJump() {
    if (state !== "play" || paused || !player.alive) return;
    buffer = BUFFER_MAX;
  }

  // tap used for orbs (and still jumps if on surface)
  function registerTap() {
    tapThisFrame = true;
    queueJump();
  }

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "Escape") { goMenu(); return; }
    if (e.code === "KeyP") { if (state === "play") paused = !paused; return; }
    if (e.code === "KeyR") { startRun(); return; }
    if (e.code === "Space" || e.code === "ArrowUp") { registerTap(); }
  });

  canvas.addEventListener("pointerdown", () => {
    ensureAudio();
    registerTap();
  });

  // ---------- Collision ----------
  function rectCircle(rx, ry, rw, rh, cx, cy, cr) {
    const nx = cx < rx ? rx : cx > rx + rw ? rx + rw : cx;
    const ny = cy < ry ? ry : cy > ry + rh ? ry + rh : cy;
    const dx = cx - nx, dy = cy - ny;
    return dx*dx + dy*dy <= cr*cr;
  }

  function spikeHit(sx, sy, w, h, cx, cy, cr) {
    if (rectCircle(sx, sy + h*0.55, w, h*0.45, cx, cy, cr)) return true;
    const tx = sx + w*0.5, ty = sy + 6;
    return dist2(cx, cy, tx, ty) <= cr*cr;
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

    // stars
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

    // grid
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    const step = Math.max(26, (w/26)|0);
    for (let x = ((-world.x*0.22) % step); x < w; x += step) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke();
    }
    ctx.restore();
  }

  function drawLanes() {
    const w = canvas.width, h = canvas.height;
    const fy = floorY();
    const cy = ceilY();

    // floor lane
    ctx.fillStyle = "rgba(0,255,190,0.10)";
    ctx.fillRect(0, fy, w, h-fy);
    ctx.strokeStyle = "rgba(0,255,190,0.60)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0,fy); ctx.lineTo(w,fy); ctx.stroke();

    // ceiling lane
    ctx.strokeStyle = "rgba(130,140,255,0.60)";
    ctx.beginPath(); ctx.moveTo(0,cy); ctx.lineTo(w,cy); ctx.stroke();
  }

  // OG-style deco: neon pillars + fake gears (visual only)
  function drawDecor(ts) {
    if (liteToggle.checked) return;

    const w = canvas.width;
    const fy = floorY();
    const cy = ceilY();
    const base = Math.floor(world.x / 400) * 400;

    for (let k = -2; k < 6; k++) {
      const xWorld = base + k * 400;
      const x = xWorld - world.x;

      // pillars
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "rgba(130,140,255,0.20)";
      rr(x + 50, cy + 18, 18, fy - cy - 36, 10);
      ctx.fill();
      ctx.restore();

      // gears (just circles)
      const spin = ts * 0.002 + xWorld * 0.001;
      const gx = x + 240;
      const gy = cy + 70 + (Math.sin(xWorld * 0.02) * 10);

      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = "rgba(0,255,190,0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(gx, gy, 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(gx, gy, 6, 0, Math.PI * 2);
      ctx.stroke();

      // spokes
      ctx.translate(gx, gy);
      ctx.rotate(spin);
      for (let i=0;i<6;i++){
        ctx.rotate(Math.PI/3);
        ctx.beginPath();
        ctx.moveTo(6,0);
        ctx.lineTo(18,0);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawObstacle(o) {
    const type = o[0];
    const x = (type <= 2 ? (o[1] - world.x) : (o[1] - world.x));

    // quick cull
    if (type <= 2) {
      const w = o[2];
      if (x + w < -160 || x > canvas.width + 160) return;
    } else {
      if (x < -200 || x > canvas.width + 200) return;
    }

    if (type === 1) { // block (floor)
      const fy = floorY();
      const w = o[2], h = o[3];
      const y = fy - h;

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

    if (type === 0) { // spike (floor)
      const fy = floorY();
      const w = o[2], h = o[3];
      const y = fy - h;

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

    if (type === 2) { // pad (floor)
      const fy = floorY();
      const w = o[2], h = o[3];
      ctx.save();
      ctx.fillStyle = "rgba(255,230,90,0.18)";
      ctx.strokeStyle = "rgba(255,230,90,0.90)";
      ctx.lineWidth = 2;
      rr(x, fy-h, w, h, 8); ctx.fill(); ctx.stroke();
      ctx.restore();
      return;
    }

    if (type === 3) { // orb (air)
      const yTop = o[2], r = o[3];
      const y = yTop;
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = "rgba(60,200,255,0.95)";
      ctx.fillStyle = "rgba(60,200,255,0.12)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.shadowColor = "rgba(60,200,255,0.9)";
      ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.arc(x, y, r+3, 0, Math.PI*2); ctx.stroke();
      ctx.restore();
      return;
    }

    if (type === 4) { // portal (flip)
      const yTop = o[2], w = o[3], h = o[4];
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(180,80,255,0.12)";
      ctx.strokeStyle = "rgba(180,80,255,0.95)";
      ctx.lineWidth = 2;
      rr(x - w/2, yTop, w, h, 16); ctx.fill(); ctx.stroke();

      ctx.shadowColor = "rgba(180,80,255,0.9)";
      ctx.shadowBlur = 22;
      rr(x - w/2 + 2, yTop + 2, w-4, h-4, 16); ctx.stroke();
      ctx.restore();
    }
  }

  function drawPlayer() {
    const px = player.x;
    const py = playerCenterY();

    // trail
    if (!liteToggle.checked) {
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

    const ang = world.t * 0.0022 * gravitySign; // spin direction flips (nice)
    ctx.translate(px, py);
    ctx.rotate(ang);
    rr(-player.r, -player.r, player.r*2, player.r*2, 7);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawHUD() {
    const h = canvas.height;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    rr(14,14,320,46,14); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = `${(h*0.03)|0}px system-ui`;

    if (!player.alive) ctx.fillText("CRASHED — restarting…", 28, 44);
    else if (paused) ctx.fillText("PAUSED (P) • ESC menu", 28, 44);
    else ctx.fillText("Jump: click/space • Orbs: tap in air • ESC menu", 28, 44);
    ctx.restore();
  }

  // ---------- Update ----------
  function update(dt) {
    if (state !== "play") return;

    world.t += dt * 1000;
    tapThisFrame = false; // will be set by input before next frame if tapped

    if (paused) return;

    if (orbLock > 0) orbLock -= dt;

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
    if (player.onSurface) coyote = COYOTE_MAX;
    else coyote = Math.max(0, coyote - dt);

    // physics (offset-space)
    player.vy -= GRAV * dt;
    player.vy = Math.max(player.vy, MAXF);
    player.offset += player.vy * dt;

    // clamp to surface
    if (player.offset <= 0) {
      player.offset = 0;
      player.vy = 0;
      player.onSurface = true;
    } else {
      player.onSurface = false;
    }

    // buffered jump (only from surface/coyote)
    if (buffer > 0 && (player.onSurface || coyote > 0)) {
      buffer = 0;
      coyote = 0;
      player.vy = JUMP;
      player.onSurface = false;
      sfx.jump();
    }

    // collisions
    const fy = floorY();
    const px = player.x;
    const py = playerCenterY();
    const obs = selected.obs;

    for (let i=0;i<obs.length;i++){
      const o = obs[i];
      const type = o[0];

      // sorted by x for floor items; air items also sorted enough
      const ox = o[1] - world.x;

      // cull
      if (type <= 2) {
        const ow = o[2];
        if (ox + ow < -160) continue;
        if (ox > canvas.width + 160) break;
      } else {
        if (ox < -220) continue;
        if (ox > canvas.width + 220) break;
      }

      if (type === 2) { // pad
        const ow = o[2], oh = o[3];
        const oy = fy - oh;
        if (rectCircle(ox, oy, ow, oh, px, py, player.r*0.95) && player.offset <= 7) {
          player.vy = PADJ;
          player.onSurface = false;
          buffer = 0; coyote = 0;
          sfx.pad();
        }
        continue;
      }

      if (type === 1) { // block
        const ow = o[2], oh = o[3];
        const oy = fy - oh;
        if (rectCircle(ox, oy, ow, oh, px, py, player.r*0.90)) { die(); break; }
        continue;
      }

      if (type === 0) { // spike
        const ow = o[2], oh = o[3];
        const sy = fy - oh;
        if (spikeHit(ox, sy, ow, oh, px, py, player.r*0.90)) { die(); break; }
        continue;
      }

      if (type === 3) { // orb
        const oy = o[2], r = o[3];
        // if close enough AND you tap while in air => boost
        if (!player.onSurface && orbLock <= 0) {
          const rr2 = (player.r + r + 6) ** 2;
          if (dist2(px, py, ox, oy) <= rr2 && (buffer > 0)) {
            // orb uses the tap (buffer) while airborne
            buffer = 0;
            orbLock = 0.12;
            player.vy = ORBJ;
            player.onSurface = false;
            sfx.orb();
          }
        }
        continue;
      }

      if (type === 4) { // portal flip
        const yTop = o[2], pw = o[3], ph = o[4];
        const rx = ox - pw/2;
        const ry = yTop;
        if (rectCircle(rx, ry, pw, ph, px, py, player.r*0.92)) {
          // prevent multi-trigger by using orbLock as a general cooldown
          if (orbLock <= 0) {
            orbLock = 0.20;
            flipGravityKeepPosition();
          }
        }
        continue;
      }
    }

    if (prog >= 1) win();
  }

  // ---------- Render ----------
  function render(ts) {
    resizeCanvas();
    ctx.clearRect(0,0,canvas.width,canvas.height);

    drawBackground(ts);
    drawLanes();
    drawDecor(ts);

    if (state === "play") {
      const obs = selected.obs;
      for (let i=0;i<obs.length;i++){
        drawObstacle(obs[i]);
      }
      drawPlayer();
      drawHUD();
    }
  }

  // ---------- Loop ----------
  let last = 0;
  function loop(ts) {
    if (!last) last = ts;
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

  // audio permission helper
  window.addEventListener("pointerdown", () => ensureAudio(), { once:true });

  boot();
})();






