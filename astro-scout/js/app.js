/* =========================================================================
   ASTRO SCOUT — NUCLEO DE LA APP
   Enrutado, progreso, inmersion (starfield, sonido, confeti), insignias,
   visor 3D interactivo (hotspots, AR, controles) y el bus de eventos que
   conecta al Instructor IA y al tracking de gestos.
   ========================================================================= */
import { STATIONS, STATION_ORDER, FACTS } from "./data.js";

/* ----------------------------- ESTADO ---------------------------------- */
const SAVE_KEY = "astroscout.progress.v1";
const state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return { completed: {}, xp: 0, sound: true };
}
function saveState() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (_) {}
}

const RANKS = [
  { min: 0, name: "RECLUTA" },
  { min: 100, name: "CADETE" },
  { min: 260, name: "PILOTO" },
  { min: 440, name: "NAVEGANTE" },
  { min: 640, name: "COMANDANTE" }
];
function currentRank() {
  let r = RANKS[0];
  for (const x of RANKS) if (state.xp >= x.min) r = x;
  return r.name;
}
function isCompleted(key) { return !!state.completed[key]; }
function isUnlocked(key) {
  const idx = STATION_ORDER.indexOf(key);
  if (idx <= 0) return true;
  return isCompleted(STATION_ORDER[idx - 1]);
}
function completedCount() { return STATION_ORDER.filter(isCompleted).length; }

/* ----------------------------- SONIDO ---------------------------------- */
let audioCtx = null;
function beep(freq = 660, dur = 0.08, type = "sine", gain = 0.05) {
  if (!state.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.stop(audioCtx.currentTime + dur);
  } catch (_) {}
}
function chord(freqs, dur = 0.5) { freqs.forEach((f, i) => setTimeout(() => beep(f, dur, "triangle", 0.06), i * 90)); }

/* ----------------------------- STARFIELD -------------------------------- */
function initStarfield() {
  const cv = document.getElementById("starfield");
  const ctx = cv.getContext("2d");
  let stars = [], shooting = [], w, h;
  function resize() {
    w = cv.width = window.innerWidth; h = cv.height = window.innerHeight;
    stars = Array.from({ length: Math.min(220, Math.floor(w * h / 9000)) }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      z: Math.random() * 0.8 + 0.2, r: Math.random() * 1.4 + 0.2
    }));
  }
  window.addEventListener("resize", resize); resize();
  function spawnShoot() {
    shooting.push({ x: Math.random() * w, y: Math.random() * h * 0.5, vx: 6 + Math.random() * 4, vy: 2 + Math.random() * 2, life: 1 });
    setTimeout(spawnShoot, 2500 + Math.random() * 4000);
  }
  setTimeout(spawnShoot, 2000);
  function frame() {
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      s.x -= s.z * 0.15;
      if (s.x < 0) s.x = w;
      ctx.globalAlpha = 0.4 + s.z * 0.6;
      ctx.fillStyle = "#cfe2ff";
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    shooting = shooting.filter(sh => sh.life > 0);
    for (const sh of shooting) {
      sh.x += sh.vx; sh.y += sh.vy; sh.life -= 0.015;
      const grad = ctx.createLinearGradient(sh.x, sh.y, sh.x - sh.vx * 8, sh.y - sh.vy * 8);
      grad.addColorStop(0, "rgba(77,166,255,0.9)"); grad.addColorStop(1, "rgba(77,166,255,0)");
      ctx.strokeStyle = grad; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(sh.x - sh.vx * 8, sh.y - sh.vy * 8); ctx.stroke();
    }
    requestAnimationFrame(frame);
  }
  frame();
}

/* ----------------------------- TOASTS ---------------------------------- */
function toast(title, msg, kind = "") {
  const box = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.innerHTML = `<b>${title}</b>${msg}`;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 400); }, 4200);
}

/* ----------------------------- CONFETTI -------------------------------- */
function confetti() {
  const cv = document.getElementById("confetti");
  const ctx = cv.getContext("2d");
  cv.width = window.innerWidth; cv.height = window.innerHeight;
  const cols = ["#4da6ff", "#ffb347", "#3ddc97", "#ff6fae", "#8a7dff"];
  const parts = Array.from({ length: 160 }, () => ({
    x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.4,
    vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 4,
    s: 4 + Math.random() * 6, c: cols[(Math.random() * cols.length) | 0],
    rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3
  }));
  let t = 0;
  function frame() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); ctx.restore();
    }
    t++;
    if (t < 200) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, cv.width, cv.height);
  }
  frame();
}

/* ------------------------- HUD / PROGRESO ------------------------------- */
function refreshHUD() {
  const done = completedCount(), total = STATION_ORDER.length;
  const pct = Math.round((done / total) * 100);
  document.getElementById("progress-fill").style.width = pct + "%";
  document.getElementById("progress-count").textContent = `${done}/${total} ESTACIONES`;
  document.getElementById("progress-pct").textContent = pct + "% COMPLETADO";
  document.getElementById("hud-xp").textContent = state.xp;
  document.getElementById("hud-rank").textContent = currentRank();
}

/* --------------------------- HUB RENDER --------------------------------- */
function renderHub() {
  const grid = document.getElementById("station-grid");
  grid.innerHTML = "";
  STATION_ORDER.forEach((key) => {
    const s = STATIONS[key];
    const done = isCompleted(key), unlocked = isUnlocked(key);
    const a = document.createElement("a");
    a.className = "station-card" + (done ? " completed" : "") + (unlocked ? "" : " locked");
    a.href = unlocked ? "#" + key : "#";
    a.dataset.key = key;
    if (!unlocked) a.addEventListener("click", (e) => { e.preventDefault(); beep(200, 0.12, "square"); toast("BLOQUEADA", "Completa la estacion anterior para desbloquearla.", "amber"); });
    const status = done
      ? `<div class="station-status done">COMPLETADA</div>`
      : unlocked
        ? `<div class="station-status">PENDIENTE</div>`
        : `<div class="station-status lock">BLOQUEADA</div>`;
    a.innerHTML = `
      <div class="station-icon">${s.icon}</div>
      <div class="station-callsign">${s.callsign}</div>
      <div class="station-name">${s.name}</div>
      <div class="station-skill">${s.skill}</div>
      ${status}`;
    grid.appendChild(a);
  });
  refreshHUD();
}

/* ------------------------- STATION RENDER ------------------------------- */
let autoRotate = true;
function renderStation(key) {
  const s = STATIONS[key];
  if (!s || !isUnlocked(key)) { goHome(); return; }
  document.getElementById("view-hub").style.display = "none";
  document.getElementById("view-station").style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });

  document.getElementById("st-callsign").textContent = s.callsign;
  document.getElementById("st-name").textContent = s.name;
  document.getElementById("st-skill").textContent = s.skill;
  document.getElementById("st-mission").textContent = s.mission;
  document.getElementById("st-gesture").textContent = s.gesture;

  const gs = document.getElementById("st-gesture-state");
  gs.className = "gesture-state" + (isCompleted(key) ? " done" : "");
  gs.textContent = isCompleted(key) ? "VALIDADO" : "PENDIENTE";

  const mv = document.getElementById("st-model");
  mv.setAttribute("src", s.src);
  mv.setAttribute("alt", s.name);

  // Sync auto-rotate state with the model-viewer and button
  autoRotate = true;
  mv.setAttribute("auto-rotate", "");
  const tbRotate = document.getElementById("tb-rotate");
  if (tbRotate) tbRotate.classList.add("active");

  // hotspots
  [...mv.querySelectorAll(".hotspot")].forEach(h => h.remove());
  (s.hotspots || []).forEach((h, i) => {
    const btn = document.createElement("button");
    btn.className = "hotspot";
    btn.setAttribute("slot", `hotspot-${i}`);
    btn.setAttribute("data-position", h.pos);
    btn.setAttribute("data-normal", h.normal);
    btn.innerHTML = `<div class="annotation"><b>${h.title}</b>${h.text}</div>`;
    mv.appendChild(btn);
  });

  window.CURRENT_STATION = key;
  document.dispatchEvent(new CustomEvent("astro:station", { detail: { key } }));
  beep(520, 0.06);
}

function goHome() { window.location.hash = ""; }

function markComplete(key) {
  if (!key || isCompleted(key)) return;
  state.completed[key] = true;
  state.xp += (STATIONS[key].xp || 100);
  saveState();
  refreshHUD();
  const gs = document.getElementById("st-gesture-state");
  if (window.CURRENT_STATION === key && gs) { gs.className = "gesture-state done"; gs.textContent = "VALIDADO"; }
  confetti();
  chord([523, 659, 784, 1046]);
  toast("ESTACION COMPLETADA", `+${STATIONS[key].xp} XP - ${STATIONS[key].name}`, "ok");
  const nextKey = STATION_ORDER[STATION_ORDER.indexOf(key) + 1];
  if (nextKey) toast("DESBLOQUEADA", `${STATIONS[nextKey].name} ya esta disponible.`, "amber");
  if (completedCount() === STATION_ORDER.length) {
    setTimeout(() => { toast("MISION CUMPLIDA", "Has completado toda la academia, cadete.", "ok"); openBadges(); }, 900);
  }
  document.dispatchEvent(new CustomEvent("astro:complete", { detail: { key } }));
}

/* --------------------------- VISOR TOOLBAR ------------------------------ */
function wireViewerToolbar() {
  const mv = document.getElementById("st-model");
  const tbRotate = document.getElementById("tb-rotate");
  const tbReset = document.getElementById("tb-reset");
  const tbFs = document.getElementById("tb-fs");
  const tbAr = document.getElementById("tb-ar");

  tbRotate?.addEventListener("click", (e) => {
    try {
      autoRotate = !autoRotate;
      if (autoRotate) {
        mv?.setAttribute("auto-rotate", "");
      } else {
        mv?.removeAttribute("auto-rotate");
      }
      e.currentTarget.classList.toggle("active", autoRotate);
      beep();
    } catch (err) { console.error(err); toast("ERROR", "No se pudo cambiar rotacion.", "amber"); }
  });

  tbReset?.addEventListener("click", () => {
    try {
      if (mv) {
        mv.cameraOrbit = "0deg 75deg 105%";
        mv.fieldOfView = "auto";
        autoRotate = true;
        mv.setAttribute("auto-rotate", "");
        if (tbRotate) tbRotate.classList.add("active");
      }
      beep();
    } catch (err) { console.error(err); toast("ERROR", "No se pudo reiniciar la vista.", "amber"); }
  });

  tbFs?.addEventListener("click", () => {
    try {
      if (!mv) return;
      const frame = mv.closest(".viewer-frame");
      if (!document.fullscreenElement) {
        frame.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
      beep();
    } catch (err) { console.error(err); toast("ERROR", "Pantalla completa no disponible.", "amber"); }
  });

  // Listen for fullscreen changes to adjust model-viewer sizing
  document.addEventListener("fullscreenchange", () => {
    const mv = document.getElementById("st-model");
    if (!mv) return;
    if (document.fullscreenElement) {
      mv.style.height = "100vh";
      mv.style.width = "100vw";
      mv.style.maxHeight = "100vh";
    } else {
      mv.style.height = "";
      mv.style.width = "";
      mv.style.maxHeight = "";
    }
  });

  tbAr?.addEventListener("click", () => {
    try { mv?.activateAR?.(); beep(); }
    catch (err) { console.error(err); toast("ERROR", "AR no disponible en este navegador.", "amber"); }
  });
}

/* ------------------------------ MODALES --------------------------------- */
function openModal(id) { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }

function openBadges() {
  const grid = document.getElementById("badge-grid");
  grid.innerHTML = "";
  STATION_ORDER.forEach(key => {
    const s = STATIONS[key], done = isCompleted(key);
    const d = document.createElement("div");
    d.className = "badge" + (done ? " earned" : "");
    d.innerHTML = `<div class="b-icon">${s.icon}</div><div class="b-name">${s.name}</div><div class="b-lock">${done ? "OBTENIDA" : "BLOQUEADA"}</div>`;
    grid.appendChild(d);
  });
  const all = completedCount() === STATION_ORDER.length;
  const d = document.createElement("div");
  d.className = "badge" + (all ? " earned" : "");
  d.innerHTML = `<div class="b-icon">ASTRO</div><div class="b-name">Astro Scout</div><div class="b-lock">${all ? "OBTENIDA" : "COMPLETA TODO"}</div>`;
  grid.appendChild(d);
  openModal("modal-badges");
}

/* ------------------------------ ROUTING --------------------------------- */
function route() {
  const key = window.location.hash.replace("#", "");
  if (key && STATIONS[key]) renderStation(key);
  else {
    document.getElementById("view-station").style.display = "none";
    document.getElementById("view-hub").style.display = "block";
    window.CURRENT_STATION = null;
    renderHub();
    document.dispatchEvent(new CustomEvent("astro:hub"));
  }
}

/* --------------------------- API PUBLICA -------------------------------- */
window.AstroScout = {
  STATIONS, STATION_ORDER,
  markComplete,
  isCompleted, isUnlocked, completedCount,
  goHome,
  navigateTo: (key) => { if (STATIONS[key] && isUnlocked(key)) window.location.hash = key; },
  toast, beep,
  getState: () => state
};
window.AstroScoutMarkComplete = markComplete;

/* ------------------------------- INIT ----------------------------------- */
function wireChrome() {
  document.getElementById("btn-back").addEventListener("click", (e) => { e.preventDefault(); goHome(); });
  document.getElementById("btn-badges").addEventListener("click", () => { openBadges(); beep(); });
  document.getElementById("btn-qr").addEventListener("click", () => { openModal("modal-qr"); beep(); });
  document.getElementById("btn-fact").addEventListener("click", () => {
    const f = FACTS[(Math.random() * FACTS.length) | 0];
    toast("DATO CURIOSO", f, "amber"); beep(700, 0.06);
  });
  document.getElementById("btn-sound").addEventListener("click", (e) => {
    state.sound = !state.sound; saveState();
    e.currentTarget.textContent = state.sound ? "Sonido" : "Silencio";
    if (state.sound) beep(660, 0.08);
  });
  document.getElementById("btn-reset").addEventListener("click", () => {
    if (confirm("Reiniciar todo el progreso de la academia?")) {
      state.completed = {}; state.xp = 0; saveState(); renderHub();
      toast("PROGRESO REINICIADO", "Empiezas de cero, cadete.", "amber"); beep(300, 0.1, "square");
    }
  });
  document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => closeModal(b.dataset.close)));
  document.querySelectorAll(".modal-backdrop").forEach(bd => bd.addEventListener("click", (e) => { if (e.target === bd) bd.classList.remove("open"); }));
  document.getElementById("btn-sound").textContent = state.sound ? "Sonido" : "Silencio";
}

// QR items navigate to the corresponding station
document.querySelectorAll(".qr-item").forEach(el => {
  el.style.cursor = "pointer";
  const key = el.dataset.key;
  el.addEventListener("click", () => {
    if (!key) return;
    closeModal("modal-qr");
    if (STATIONS[key]) { window.location.hash = key; beep(); }
    else { toast("ERROR", "QR no reconocido en esta app.", "amber"); }
  });
});

function initClock() {
  const el = document.getElementById("hud-clock");
  setInterval(() => {
    const t = new Date();
    el.textContent = "T+ " + t.toLocaleTimeString("es-ES", { hour12: false });
  }, 1000);
}

document.addEventListener("DOMContentLoaded", () => {
  initStarfield();
  wireChrome();
  wireViewerToolbar();
  initClock();
  window.addEventListener("hashchange", route);
  route();
});
