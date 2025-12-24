(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const levelsListEl = document.getElementById("levelsList");
  const statusPillEl = document.getElementById("statusPill");
  const screenTitleEl = document.getElementById("screenTitle");
  const screenSubEl = document.getElementById("screenSub");
  const bestPctEl = document.getElementById("bestPct");
  const runPctEl = document.getElementById("runPct");

  const btnLevels = document.getElementById("btnLevels");
  const btnPlay = document.getElementById("btnPlay");
  const btnRestart = document.getElementById("btnRestart");

  const musicToggle = document.getElementById("musicToggle");
  const particlesToggle = document.getElementById("particlesToggle");
  const shakeToggle = document.getElementById("shakeToggle");

  const State = { LEVELS: "levels", PLAY: "play" };
  let state = State.LEVELS;

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

  // ---------- Playmode UI ----------
  function enterPlayModeUI() { document.body.classList.add("playmode"); }
  function exitPlayModeUI() { document.body.classList.remove("playmode"); }

  // ---------- Audio (music + sfx) ----------
  let audioCtx = null;
  let musicNode = null;

  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function sfxTone(type, freq, dur, vol) {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    const f = audioCtx.createBiquadFilter();

    o.type = type;
    o.frequency.value = freq;

    f.type = "lowpass";
    f.frequency.value = 1600;

    g.gain.value = 0.0001;

    o.connect(f); f.connect(g); g.connect(audioCtx.destination);

    const t = audioCtx.currentTime;
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function sfxJump(){ ensureAudio(); sfxTone("square", 620, 0.06, 0.06); }
  function sfxDeath(){ ensureAudio(); sfxTone("sawtooth", 160, 0.12, 0.08); }
  function sfxWin(){ ensureAudio(); sfxTone("triangle", 980, 0.10, 0.06); }

  function stopMusic() {
    if (!musicNode) return;
    try { clearInterval(musicNode.timer); } catch {}
    try { musicNode.oscA.stop(); } catch {}
    try { musicNode.oscB.stop(); } catch {}
    try { musicNode.noise.stop(); } catch {}
    musicNode = null;
  }

  function startMusic() {
    if (!musicToggle.checked) return;
    ensureAudio();
    stopMusic();

    const master = audioCtx.createGain();
    master.gain.value = 0.13;
    master.connect(audioCtx.destination);

    const lp = audioCtx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    lp.Q.value = 0.8;
    lp.connect(master);

    const oscA = audioCtx.createOscillator();
    const oscB = audioCtx.createOscillator();
    oscA.type = "sawtooth";
    oscB.type = "triangle";

    const gA = audioCtx.createGain();
    const gB = audioCtx.createGain();
    gA.gain.value = 0;
    gB.gain.value = 0;

    oscA.connect(gA); gA.connect(lp);
    oscB.connect(gB); gB.connect(lp);

    // soft noise shimmer
    const noise = audioCtx.createBufferSource();
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i=0;i<d.length;i++) d[i] = (Math.random()*2-1) * 0.10;
    noise.buffer = buf;
    noise.loop = true;
    const ng = audioCtx.createGain();
    ng.gain.value = 0.02;
    noise.connect(ng); ng.connect(master);

    oscA.start();
    oscB.start();
    noise.start();

    // simple catchy arpeggio loop
    const bpm = 128;
    const stepDur = (60 / bpm) / 2; // 8th notes
    const seq = [0, 7, 12, 7, 0, 10, 12, 10]; // semitones
    const base = 220;
    let step = 0;

    const timer = setInterval(() => {
      const t = audioCtx.currentTime;
      const n = seq[step % seq.length];
      const hz = base * Math.pow(2, n/12);

      const a = t + 0.01;
      const r = t + stepDur * 0.95;

      oscA.frequency.setValueAtTime(hz, a);
      oscB.frequency.setValueAtTime(hz * 2, a);

      gA.gain.cancelScheduledValues(t);
      gB.gain.cancelScheduledValues(t);

      gA.gain.setValueAtTime(0.0001, t);
      gA.gain.linearRampToValueAtTime(0.18, a);
      gA.gain.exponentialRampToValueAtTime(0.0001, r);

      gB.gain.setValueAtTime(0.0001, t);
      gB.gain.linearRampToValueAtTime(0.10, a);
      gB.gain.exponentialRampToValueAtTime(0.0001, r);

      step++;
    }, stepDur * 1000);

    musicNode = { oscA, oscB, noise, timer };
  }

  musicToggle.addEventListener("change", () => {
    ensureAudio();
    if (!musicToggle.checked) stopMusic();
    else if (state === State.PLAY) startMusic();
  });

  // ---------- Levels ----------
  // Geometry Dash-ish: spikes + blocks, spaced to feel fair.
  const LEVELS = [
    {
      id:"rift-01", name:"Rift Wake", difficulty:"Easy",
      speed: 600, length: 6200,
      obstacles: [
        {t:"spike", x:1700, w:46, h:56},
        {t:"block", x:2100, w:86, h:150},
        {t:"spike", x:2500, w:46, h:56},
        {t:"block", x:2850, w:110, h:120},
        {t:"spike", x:3300, w:46, h:56},
        {t:"block", x:3650, w:96, h:190},
        {t:"spike", x:4200, w:46, h:56},
        {t:"spike", x:4380, w:46, h:56},
        {t:"block", x:4850, w:140, h:140},
        {t:"spike", x:5450, w:46, h:56},
      ]
    },
    {
      id:"rift-02", name:"Pulse District", difficulty:"Medium",
      speed: 660, length: 7000,
      obstacles: [
        {t:"spike", x:1700, w:46, h:56},
        {t:"spike", x:1880, w:46, h:56},
        {t:"block", x:2300, w:110, h:180},
        {t:"spike", x:2700, w:46, h:56},
        {t:"block", x:3050, w:150, h:130},
        {t:"spike", x:3550, w:46, h:56},
        {t:"block", x:3920, w:110, h:240},
        {t:"spike", x:4520, w:46, h:56},
        {t:"block", x:4900, w:170, h:160},
        {t:"spike", x:5600, w:46, h:56},
        {t:"spike", x:5780, w:46, h:56},
      ]
    },
    {
      id:"rift-03", name:"Ion Cataclysm", difficulty:"Hard",
      speed: 720, length: 7600,
      obstacles: [
        {t:"spike", x:1800, w:46, h:56},
        {t:"block", x:2200, w:120, h:240},
        {t:"spike", x:2680, w:46, h:56},
        {t:"block", x:3020, w:180, h:150},
        {t:"spike", x:3500, w:46, h:56},
        {t:"block", x:3850, w:120, h:290},
        {t:"spike", x:4500, w:46, h:56},
        {t:"block", x:4850, w:220, h:160},
        {t:"spike", x:5500, w:46, h:56},
        {t:"block", x:5850, w:140, h:330},
        {t:"spike", x:6600, w:46, h:56},
      ]
    }
  ];

  let selectedLevel = LEVELS[0];

  function loadBest() {
    try { return JSON.parse(localStorage.getItem("riftRunnerBest") || "{}"); }
    catch { return {}; }
  }
  const bestById = loadBest();
  function saveBest() { try { localStorage.setItem("riftRunnerBest", JSON.stringify(bestById)); } catch {} }

  function updateBestUI() {
    const best = bestById[selectedLevel.id] || 0;
    bestPctEl.textContent = `${Math.floor(best * 100)}%`;
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

  // ---------- Game physics (GD-ish) ----------
  const GRAVITY = 2900;
  const JUMP_V  = 740;     // smaller jump (you asked)
  const MAX_FALL = -1700;

  // forgiveness
  let coyote = 0;
  let buffer = 0;
  const COYOTE_MAX = 0.08;
  const BUFFER_MAX = 0.11;

  // auto restart
  let deathTimer = 0;
  const AUTO_RESTART = 0.75;

  // pause
  let paused = false;

  // world + player (y = height above ground)
  const world = { x: 0, t: 0 };
  const player = { x: 250, y: 0, r: 18, vy: 0, alive: true, onGround: true };
  let runProgress = 0;

  // visuals: parallax stars + grid + glow + particles + screen shake
  const starsFar = Array.from({ length: 120 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random()*1.2+0.3 }));
  const starsNear = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random()*1.6+0.6 }));
  const sparks = [];
  const trail = [];

  let shake = 0; // intensity
  function addShake(v){ if (shakeToggle.checked) shake = Math.max(shake, v); }

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
    player.alive = true;
    player.onGround = true;

    coyote = COYOTE_MAX;
    buffer = 0;
    deathTimer = 0;
    paused = false;
    shake = 0;

    sparks.length = 0;
    trail.length = 0;

    runPctEl.textContent = "0%";
    statusPillEl.textContent = "Playing";
  }

  function goMenu() {
    exitPlayModeUI();
    state = State.LEVELS;
    paused = false;
    statusPillEl.textContent = "Menu";
    screenTitleEl.textContent = "Pick a Level";
    screenSubEl.textContent = "Select one, then press Play";
  }

  function startLevel() {
    ensureAudio(); // Play button triggers audio permission
    enterPlayModeUI();
    state = State.PLAY;
    statusPillEl.textContent = "Playing";
    screenTitleEl.textContent = selectedLevel.name;
    screenSubEl.textContent = "tap to jump • don’t touch spikes";
    if (musicToggle.checked) startMusic();
    resetRun();
    updateBestUI();
  }

  // ONLY sidebar Play starts (Space never starts)
  btnPlay.addEventListener("click", startLevel);
  btnRestart.addEventListener("click", startLevel);
  btnLevels.addEventListener("click", goMenu);

  // ---------- Input (jump buffer) ----------
  function queueJump() {
    if (state !== State.PLAY || paused || !player.alive) return;
    buffer = BUFFER_MAX;
  }

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;

    if (e.code === "Escape") { goMenu(); return; }
    if (e.code === "KeyL") { goMenu(); return; }
    if (e.code === "KeyR") { startLevel(); return; }
    if (e.code === "KeyP") { if (state === State.PLAY) paused = !paused; return; }

    if (e.code === "Space" || e.code === "ArrowUp") {
      // jump only
      queueJump();
    }
  });

  canvas.addEventListener("pointerdown", () => {
    ensureAudio();
    if (state === State.PLAY) queueJump();
  });

  // ---------- Collision helpers ----------
  const rectCircle = (rx, ry, rw, rh, cx, cy, cr) => {
    const nx = clamp(cx, rx, rx + rw);
    const ny = clamp(cy, ry, ry + rh);
    const dx = cx - nx, dy = cy - ny;
    return dx*dx + dy*dy <= cr*cr;
  };

  // quick spike collision approximation
  function spikeHit(sx, sy, w, h, cx, cy, cr) {
    // base rectangle
    if (rectCircle(sx, sy + h*0.55, w, h*0.45, cx, cy, cr)) return true;
    // tip circle
    const tx = sx + w/2, ty = sy + 6;
    const dx = cx - tx, dy = cy - ty;
    return (dx*dx + dy*dy) <= (cr*cr);
  }

  // ---------- Effects ----------
  function spawnSparks(x, y, n, color="a") {
    if (!particlesToggle.checked) return;
    for (let i=0;i<n;i++){
      sparks.push({
        x, y,
        vx:(Math.random()*2-1)*(280+Math.random()*260),
        vy:(Math.random()*-1)*(420+Math.random()*600),
        life:0.45+Math.random()*0.35,
        c: color
      });
    }
  }

  function die() {
    if (!player.alive) return;
    player.alive = false;
    deathTimer = AUTO_RESTART;
    addShake(18);
    spawnSparks(player.x, player.y + 40, 70, "danger");
    sfxDeath();
    statusPillEl.textContent = "Crashed";
  }

  function win() {
    sfxWin();
    const best = bestById[selectedLevel.id] || 0;
    if (runProgress > best) { bestById[selectedLevel.id] = runProgress; saveBest(); }
    statusPillEl.textContent = "Cleared!";
    // back to menu after a moment
    setTimeout(() => { if (state === State.PLAY) goMenu(); }, 900);
  }

  // ---------- Rendering ----------
  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr, y);
    ctx.arcTo(x+w, y, x+w, y+h, rr);
    ctx.arcTo(x+w, y+h, x, y+h, rr);
    ctx.arcTo(x, y+h, x, y, rr);
    ctx.arcTo(x, y, x+w, y, rr);
    ctx.closePath();
  }

  function drawBackground(w, h, t) {
    // animated rift glow
    const pulse = 0.18 + Math.sin(t*0.0012)*0.06;
    const pulse2 = 0.14 + Math.cos(t*0.0010)*0.05;

    const g = ctx.createLinearGradient(0,0,w,h);
    g.addColorStop(0, `rgba(120,120,255,${pulse})`);
    g.addColorStop(0.55, `rgba(0,0,0,0)`);
    g.addColorStop(1, `rgba(0,255,190,${pulse2})`);
    ctx.fillStyle = g;
    ctx.fillRect(0,0,w,h);

    // far stars
    ctx.save();
    ctx.globalAlpha = 0.75;
    for (const s of starsFar){
      const x = (s.x*w + world.x*0.06) % w;
      const y = (s.y*h + Math.sin(t*0.00035 + s.x*9)*6) % h;
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillRect(x,y,s.s,s.s);
    }
    // near stars
    ctx.globalAlpha = 0.85;
    for (const s of starsNear){
      const x = (s.x*w + world.x*0.12) % w;
      const y = (s.y*h + Math.cos(t*0.00045 + s.y*8)*9) % h;
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.fillRect(x,y,s.s,s.s);
    }
    ctx.restore();

    // grid
    ctx.save();
    ctx.globalAlpha = 0.10;
    const step = Math.max(26, Math.floor(w/26));
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    for (let x = ((-world.x*0.22) % step); x < w; x += step) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke();
    }
    ctx.restore();
  }

  function drawGround(w, h) {
    const gy = getGroundY();
    ctx.save();
    ctx.fillStyle = "rgba(0,255,190,0.10)";
    ctx.fillRect(0, gy, w, h-gy);

    ctx.strokeStyle = "rgba(0,255,190,0.60)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    ctx.restore();
  }

  function drawObstacle(o, w, h) {
    const gy = getGroundY();
    const ox = o.x - world.x;
    if (ox + o.w < -160 || ox > canvas.width + 160) return;

    if (o.t === "block") {
      const y = gy - o.h;
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.strokeStyle = "rgba(120,120,255,0.75)";
      ctx.lineWidth = 2;

      roundRect(ox, y, o.w, o.h, 10);
      ctx.fill(); ctx.stroke();

      ctx.shadowColor = "rgba(0,255,190,0.85)";
      ctx.shadowBlur = 18;
      ctx.strokeStyle = "rgba(0,255,190,0.45)";
      roundRect(ox+1, y+1, o.w-2, o.h-2, 10);
      ctx.stroke();
      ctx.restore();
    } else {
      const y = gy - o.h;
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.strokeStyle = "rgba(255,120,170,0.80)";
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(ox, y + o.h);
      ctx.lineTo(ox + o.w/2, y);
      ctx.lineTo(ox + o.w, y + o.h);
      ctx.closePath();
      ctx.fill(); ctx.stroke();

      ctx.shadowColor = "rgba(255,120,170,0.90)";
      ctx.shadowBlur = 18;
      ctx.strokeStyle = "rgba(255,120,170,0.55)";
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPlayer() {
    const gy = getGroundY();
    const px = player.x;
    const py = gy - player.r - player.y;

    // trail
    trail.push({ x:px, y:py, life:0.22 });
    while (trail.length > 24) trail.shift();

    ctx.save();
    for (let i=trail.length-1;i>=0;i--){
      const p = trail[i];
      ctx.globalAlpha = clamp(p.life / 0.22, 0, 1) * 0.25;
      ctx.fillStyle = "rgba(0,255,190,0.65)";
      ctx.fillRect(p.x-2, p.y-2, 4, 4);
      p.life -= 1/60;
      if (p.life <= 0) trail.splice(i,1);
    }
    ctx.restore();

    ctx.save();
    ctx.shadowColor = "rgba(0,255,190,0.95)";
    ctx.shadowBlur = 22;
    ctx.fillStyle = "rgba(0,255,190,0.20)";
    ctx.strokeStyle = "rgba(0,255,190,0.88)";
    ctx.lineWidth = 2;

    const angle = world.t * 0.0022; // spin
    ctx.translate(px, py);
    ctx.rotate(angle);

    roundRect(-player.r, -player.r, player.r*2, player.r*2, 7);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawSparks(dt) {
    if (!particlesToggle.checked) return;
    const gy = getGroundY();

    for (let i=sparks.length-1;i>=0;i--){
      const p = sparks[i];
      p.life -= dt;
      if (p.life <= 0) { sparks.splice(i,1); continue; }

      p.vy -= 1200 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      ctx.save();
      ctx.globalAlpha = clamp(p.life, 0, 1);
      if (p.c === "danger") {
        ctx.fillStyle = "rgba(255,120,170,0.85)";
        ctx.shadowColor = "rgba(255,120,170,0.95)";
      } else {
        ctx.fillStyle = "rgba(0,255,190,0.85)";
        ctx.shadowColor = "rgba(0,255,190,0.95)";
      }
      ctx.shadowBlur = 12;
      ctx.fillRect(p.x, (gy - p.y), 2, 2);
      ctx.restore();
    }
  }

  function drawHUD(w, h) {
    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    roundRect(14, 14, 320, 52, 14);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = `${Math.floor(h*0.030)}px system-ui`;

    if (!player.alive) ctx.fillText("CRASHED — restarting…", 28, 47);
    else if (paused) ctx.fillText("PAUSED (P) • ESC menu", 28, 47);
    else ctx.fillText("Jump: click/space • P pause • ESC menu", 28, 47);
    ctx.restore();
  }

  // ---------- Update ----------
  function update(dt) {
    if (state !== State.PLAY) return;

    world.t += dt * 1000;

    // shake decay
    shake = Math.max(0, shake - 40*dt);

    if (paused) return;

    // auto restart after death
    if (!player.alive) {
      deathTimer -= dt;
      if (deathTimer <= 0) resetRun();
      return;
    }

    // move
    world.x += selectedLevel.speed * dt;

    // progress
    runProgress = clamp(world.x / selectedLevel.length, 0, 1);
    runPctEl.textContent = `${Math.floor(runProgress*100)}%`;

    // buffers / forgiveness
    if (buffer > 0) buffer -= dt;
    if (player.onGround) coyote = COYOTE_MAX;
    else coyote = Math.max(0, coyote - dt);

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

    // buffered jump
    if (buffer > 0 && (player.onGround || coyote > 0)) {
      buffer = 0;
      coyote = 0;
      player.vy = JUMP_V;
      player.onGround = false;
      sfxJump();
      spawnSparks(player.x, 10, 22, "a");
    }

    // collisions
    const gy = getGroundY();
    const px = player.x;
    const py = gy - player.r - player.y;

    for (const o of selectedLevel.obstacles) {
      const ox = o.x - world.x;
      if (ox + o.w < -160 || ox > canvas.width + 160) continue;

      if (o.t === "block") {
        const oy = gy - o.h;
        if (rectCircle(ox, oy, o.w, o.h, px, py, player.r*0.90)) {
          addShake(18);
          die();
          break;
        }
      } else {
        const sy = gy - o.h;
        if (spikeHit(ox, sy, o.w, o.h, px, py, player.r*0.90)) {
          addShake(18);
          die();
          break;
        }
      }
    }

    if (runProgress >= 1) win();
  }

  // ---------- Render ----------
  function render(dt, ts) {
    const { w, h } = resizeCanvasToDisplaySize();

    // apply screen shake (camera)
    let camX = 0, camY = 0;
    if (shake > 0) {
      camX = (Math.random()*2 - 1) * shake;
      camY = (Math.random()*2 - 1) * shake;
    }

    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    ctx.save();
    ctx.translate(camX, camY);

    drawBackground(w, h, ts);
    drawGround(w, h);

    // obstacles
    for (const o of selectedLevel.obstacles) drawObstacle(o, w, h);

    drawPlayer();
    drawSparks(dt);
    drawHUD(w, h);

    ctx.restore();
  }

  // ---------- Loop ----------
  let lastTs = 0;
  function loop(ts) {
    if (!lastTs) lastTs = ts;
    const dt = clamp((ts - lastTs)/1000, 0, 0.033);
    lastTs = ts;

    update(dt);
    render(dt, ts);
    requestAnimationFrame(loop);
  }

  // ---------- Boot ----------
  function boot() {
    renderLevelsList();
    updateBestUI();
    goMenu();
    requestAnimationFrame(loop);
  }

  boot();
})();




