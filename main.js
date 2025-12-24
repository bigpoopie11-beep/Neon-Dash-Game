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
    return { w, h };
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

  // ---------- Levels ----------
  // Fix: first obstacle starts farther away so you don't die instantly.
  const LEVELS = [
    { id:"neon-start", name:"Neon Start", difficulty:"Easy", speed:480, length:4200,
      obstacles:[{x:1600,w:60,h:90},{x:1950,w:70,h:120},{x:2300,w:60,h:160},{x:2650,w:90,h:110},{x:3050,w:65,h:180},{x:3400,w:80,h:120},{x:3750,w:70,h:160}] },
    { id:"pulse-run", name:"Pulse Run", difficulty:"Medium", speed:560, length:5200,
      obstacles:[{x:1600,w:70,h:130},{x:1950,w:70,h:170},{x:2350,w:70,h:200},{x:2700,w:120,h:110},{x:3100,w:70,h:210},{x:3450,w:90,h:150},{x:3850,w:70,h:240},{x:4300,w:140,h:120}] },
    { id:"ion-storm", name:"Ion Storm", difficulty:"Hard", speed:620, length:6000,
      obstacles:[{x:1700,w:80,h:220},{x:2100,w:80,h:260},{x:2500,w:130,h:140},{x:2900,w:90,h:260},{x:3300,w:120,h:170},{x:3700,w:90,h:280},{x:4150,w:170,h:140},{x:4600,w:90,h:300},{x:5100,w:200,h:150}] }
  ];

  let selectedLevel = LEVELS[0];

  function loadBest() {
    try { return JSON.parse(localStorage.getItem("neonDashBest") || "{}"); }
    catch { return {}; }
  }
  const bestById = loadBest();
  function saveBest() { try { localStorage.setItem("neonDashBest", JSON.stringify(bestById)); } catch {} }

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

  // ---------- World & player ----------
  const world = { x: 0, t: 0 };
  const player = { x: 220, y: 0, r: 20, vy: 0, onGround: true, alive: true };
  let runProgress = 0;

  // Fix: countdown + grace time so you can react
  let countdown = 0;     // seconds
  let grace = 0;         // seconds (no collision)
  const GRAVITY = 1200;  // tuned
  const JUMP_V = 900;    // tuned

  // stars + sparks
  const stars = Array.from({ length: 180 }, () => ({
    x: Math.random(), y: Math.random(), s: Math.random()*1.2+0.3, p: Math.random()
  }));
  const sparks = [];
  function spawnSparks(x, y, n=18) {
    if (!particlesToggle.checked) return;
    for (let i=0;i<n;i++) {
      sparks.push({
        x,y,
        vx:(Math.random()*2-1)*(220+Math.random()*240),
        vy:(Math.random()*-1)*(260+Math.random()*360),
        life:0.6+Math.random()*0.4
      });
    }
  }

  function getGroundY() {
    const { h } = resizeCanvasToDisplaySize();
    return h * 0.82;
  }

  function resetRun() {
    world.x = 0;
    world.t = 0;
    runProgress = 0;
    player.y = 0;
    player.vy = 0;
    player.onGround = true;
    player.alive = true;
    sparks.length = 0;
    paused = false;

    countdown = 1.0; // 1 second "Ready"
    grace = 1.2;     // 1.2 seconds no collisions
    runPctEl.textContent = "0%";
  }

  function goMenu() {
    exitPlayModeUI();
    state = State.LEVELS;
    statusPillEl.textContent = "Menu";
    resetRun();
  }

  function startLevel() {
    ensureAudio(); // allow music after clicking play
    enterPlayModeUI();
    state = State.PLAY;
    statusPillEl.textContent = "Playing";
    resetRun();
    updateBestUI();
    if (musicToggle.checked) startMusic();
  }

  function winRun() {
    const best = bestById[selectedLevel.id] || 0;
    if (runProgress > best) { bestById[selectedLevel.id] = runProgress; saveBest(); }
    exitPlayModeUI();
    state = State.LEVELS;
    statusPillEl.textContent = "Cleared!";
    renderLevelsList();
    updateBestUI();
  }

  function loseRun() {
    const best = bestById[selectedLevel.id] || 0;
    if (runProgress > best) { bestById[selectedLevel.id] = runProgress; saveBest(); }
    statusPillEl.textContent = "Crashed";
    paused = true;
  }

  function jump() {
    if (state !== State.PLAY || paused) return;
    if (countdown > 0) return; // can't jump during "Ready"
    if (player.onGround && player.alive) {
      player.vy = JUMP_V;
      player.onGround = false;
      spawnSparks(player.x, 10, 24);
    }
  }

  // ---------- Collisions ----------
  function rectCircleCollide(rx, ry, rw, rh, cx, cy, cr) {
    const nx = clamp(cx, rx, rx + rw);
    const ny = clamp(cy, ry, ry + rh);
    const dx = cx - nx;
    const dy = cy - ny;
    return (dx*dx + dy*dy) <= cr*cr;
  }

  // ---------- Draw helpers ----------
  function roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w/2, h/2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  function drawBackground(w, h, time) {
    const g = ctx.createLinearGradient(0,0,w,h);
    const a = 0.22 + Math.sin(time*0.0007)*0.04;
    const b = 0.18 + Math.cos(time*0.0005)*0.04;
    g.addColorStop(0, `rgba(90,140,255,${a})`);
    g.addColorStop(0.5, `rgba(0,0,0,0)`);
    g.addColorStop(1, `rgba(0,255,190,${b})`);
    ctx.fillStyle = g;
    ctx.fillRect(0,0,w,h);

    ctx.save();
    ctx.globalAlpha = 0.85;
    for (const s of stars) {
      const sx = (s.x*w + (world.x*0.08)) % w;
      const sy = (s.y*h + Math.sin(time*0.0003 + s.p)*6) % h;
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillRect(sx, sy, s.s, s.s);
    }
    ctx.restore();
  }

  function drawGround(w, h) {
    const gy = getGroundY();
    ctx.save();
    ctx.fillStyle = "rgba(0,255,190,0.10)";
    ctx.fillRect(0, gy, w, h-gy);
    ctx.strokeStyle = "rgba(0,255,190,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(w, gy);
    ctx.stroke();
    ctx.restore();
  }

  function drawObstacles() {
    const gy = getGroundY();
    for (const o of selectedLevel.obstacles) {
      const x = o.x - world.x;
      const y = gy - o.h;
      if (x + o.w < -120 || x > canvas.width + 120) continue;

      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.strokeStyle = "rgba(90,140,255,0.65)";
      ctx.lineWidth = 2;
      roundRect(ctx, x, y, o.w, o.h, 10);
      ctx.fill();
      ctx.stroke();

      ctx.shadowColor = "rgba(0,255,190,0.8)";
      ctx.shadowBlur = 16;
      ctx.strokeStyle = "rgba(0,255,190,0.55)";
      roundRect(ctx, x+1, y+1, o.w-2, o.h-2, 10);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPlayer() {
    const gy = getGroundY();
    const px = player.x;
    const py = gy - player.r - player.y;

    ctx.save();
    ctx.shadowColor = "rgba(0,255,190,0.9)";
    ctx.shadowBlur = 22;
    ctx.fillStyle = "rgba(0,255,190,0.24)";
    ctx.strokeStyle = "rgba(0,255,190,0.85)";
    ctx.lineWidth = 2;

    const angle = world.t * 0.010;
    ctx.translate(px, py);
    ctx.rotate(angle);
    roundRect(ctx, -player.r, -player.r, player.r*2, player.r*2, 8);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawSparks(dt) {
    if (!particlesToggle.checked) return;
    const gy = getGroundY();
    const w = canvas.width;

    for (let i=sparks.length-1;i>=0;i--) {
      const p = sparks[i];
      p.life -= dt;
      if (p.life <= 0) { sparks.splice(i,1); continue; }

      p.vy -= 980 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      ctx.save();
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.fillStyle = "rgba(0,255,190,0.8)";
      ctx.shadowColor = "rgba(0,255,190,0.9)";
      ctx.shadowBlur = 12;
      ctx.fillRect(p.x, (gy - p.y), 2, 2);
      ctx.restore();

      if (p.x < -200 || p.x > w+200 || p.y < -200) p.life = 0;
    }
  }

  function drawHUD(w, h) {
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    roundRect(ctx, 16, 16, 280, 68, 14);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.90)";
    ctx.font = `${Math.floor(h*0.032)}px system-ui`;

    if (countdown > 0) {
      ctx.fillText("READY", 32, 46);
      ctx.globalAlpha = 0.75;
      ctx.fillText("Click or Space to Jump", 32, 76);
    } else if (paused) {
      ctx.fillText("PAUSED", 32, 46);
      ctx.globalAlpha = 0.75;
      ctx.fillText("P resume • Esc menu", 32, 76);
    } else {
      ctx.fillText("RUN", 32, 46);
      ctx.globalAlpha = 0.75;
      ctx.fillText("P pause • Esc menu", 32, 76);
    }
    ctx.restore();
  }

  // ---------- Update / Render ----------
  function update(dt) {
    if (state !== State.PLAY) return;

    world.t += dt * 1000;

    // countdown before moving
    if (countdown > 0) {
      countdown -= dt;
      if (countdown < 0) countdown = 0;
    } else if (!paused) {
      world.x += selectedLevel.speed * dt;
    }

    if (grace > 0) grace -= dt;

    runProgress = clamp(world.x / selectedLevel.length, 0, 1);
    runPctEl.textContent = `${Math.floor(runProgress*100)}%`;

    if (!paused) {
      // Correct gravity (y is height above ground)
      player.vy -= GRAVITY * dt;
      player.y += player.vy * dt;

      if (player.y <= 0) {
        player.y = 0;
        player.vy = 0;
        player.onGround = true;
      } else {
        player.onGround = false;
      }
    }

    // collision only after grace time and after countdown
    if (!paused && grace <= 0 && countdown <= 0) {
      const gy = getGroundY();
      const px = player.x;
      const py = gy - player.r - player.y;

      for (const o of selectedLevel.obstacles) {
        const ox = o.x - world.x;
        const oy = gy - o.h;
        if (ox + o.w < -120 || ox > canvas.width + 120) continue;

        if (rectCircleCollide(ox, oy, o.w, o.h, px, py, player.r * 0.92)) {
          player.alive = false;
          spawnSparks(px, player.y + 20, 50);
          loseRun();
          break;
        }
      }
    }

    if (!paused && runProgress >= 1 && player.alive) winRun();
  }

  function render(dt, ts) {
    const { w, h } = resizeCanvasToDisplaySize();
    ctx.clearRect(0,0,w,h);

    drawBackground(w,h,ts);
    drawGround(w,h);
    drawObstacles();
    drawPlayer();
    drawSparks(dt);
    drawHUD(w, h);
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

  // ---------- Input ----------
  function togglePause() {
    if (state !== State.PLAY) return;
    if (countdown > 0) return;
    paused = !paused;
  }

  // IMPORTANT: Space does NOT start the level anymore.
  // Space only jumps during PLAY.
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;

    if (e.code === "Escape") { goMenu(); return; }
    if (e.code === "KeyP") { togglePause(); return; }
    if (e.code === "KeyR") { startLevel(); return; }

    if (e.code === "Space" || e.code === "ArrowUp") {
      if (state === State.PLAY) jump();
    }
  });

  // click/tap jumps in play
  canvas.addEventListener("pointerdown", () => {
    ensureAudio();
    if (state === State.PLAY) jump();
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


