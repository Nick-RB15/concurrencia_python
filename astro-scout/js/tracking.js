/* =========================================================================
   ASTRO SCOUT — TRACKING DE GESTOS (MediaPipe, 100% en el navegador)
   -------------------------------------------------------------------------
   Dos modos:
   1) NAVEGACION CON LA MANO (en el panel principal): mueve un cursor con el
      dedo indice sobre las tarjetas y "pellizca" (pulgar+indice) para
      SELECCIONAR una estacion.
   2) VALIDACION POR GESTO (dentro de cada estacion): mini-juegos interactivos
      - Casco: agarra el casco y ponlo en el astronauta.
      - Brujula: dispara a estrellas con el dedo indice.
      - Botiquin: cura a un companero herido paso a paso.
      - Panel O2: repara el tanque de oxigeno danado.
      - Guante: repara el sistema electrico reconectando cables.

   Requiere camara + WebAssembly (Chrome/Edge) sobre http/https.
   ========================================================================= */
import {
  GestureRecognizer,
  FaceLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const GESTURE_MAP = {
  casco:    { type: "hand", value: "Open_Palm",   label: "Agarra el casco y ponlo en el astronauta" },
  brujula:  { type: "hand", value: "Pointing_Up", label: "Apunta y dispara con el indice" },
  botiquin: { type: "hand", value: "Open_Palm",   label: "Cura al companero herido" },
  panel:    { type: "hand", value: "Closed_Fist", label: "Repara el tanque de oxigeno" },
  guante:   { type: "hand", value: "Open_Palm",   label: "Repara el sistema electrico" }
};
const GESTURE_ES = {
  Open_Palm: "Mano abierta", Closed_Fist: "Puno cerrado", Pointing_Up: "Indice arriba",
  Victory: "Victoria", Thumb_Up: "Pulgar arriba", Thumb_Down: "Pulgar abajo",
  ILoveYou: "Te quiero", None: "—"
};
const HOLD_MS = 1200;
const DETECTION_THRESHOLD = 0.35;

let gestureRecognizer = null;
let faceLandmarker = null;

async function ensureGesture(statusEl) {
  if (gestureRecognizer) return;
  if (statusEl) statusEl.textContent = "Cargando modelo de manos...";
  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task", delegate: "GPU" },
    runningMode: "VIDEO", numHands: 2, minHandDetectionConfidence: 0.4, minHandPresenceConfidence: 0.4, minTrackingConfidence: 0.4
  });
}
async function ensureFace(statusEl) {
  if (faceLandmarker) return;
  if (statusEl) statusEl.textContent = "Cargando modelo facial...";
  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", delegate: "GPU" },
    outputFaceBlendshapes: true, runningMode: "VIDEO", numFaces: 1
  });
}

function detectSmile(blendshapes) {
  if (!blendshapes || !blendshapes.length) return false;
  const cats = blendshapes[0].categories;
  const l = cats.find(c => c.categoryName === "mouthSmileLeft");
  const r = cats.find(c => c.categoryName === "mouthSmileRight");
  return (((l ? l.score : 0) + (r ? r.score : 0)) / 2) > 0.4;
}

/* ---- Landmark-based gesture fallback ---- */
// MediaPipe hand landmarks: 0=wrist, 4=thumb_tip, 5=index_mcp, 6=index_pip,
// 7=index_dip, 8=index_tip, 9=middle_mcp, 12=middle_tip, 16=ring_tip, 20=pinky_tip
function isFingerExtended(lm, tipIdx, mcpIdx) {
  return lm[tipIdx].y < lm[mcpIdx].y - 0.04;
}
function isFingerCurled(lm, tipIdx, mcpIdx) {
  return lm[tipIdx].y > lm[mcpIdx].y - 0.02;
}

function detectGestureFromLandmarks(lm) {
  if (!lm || lm.length < 21) return null;
  const indexUp = isFingerExtended(lm, 8, 5);
  const middleUp = isFingerExtended(lm, 12, 9);
  const ringUp = isFingerExtended(lm, 16, 13);
  const pinkyUp = isFingerExtended(lm, 20, 17);
  const thumbOut = Math.abs(lm[4].x - lm[3].x) > 0.04 || lm[4].y < lm[3].y - 0.03;

  // Pointing_Up: index extended, rest curled
  if (indexUp && !middleUp && !ringUp && !pinkyUp) return "Pointing_Up";
  // Victory: index + middle extended, rest curled
  if (indexUp && middleUp && !ringUp && !pinkyUp) return "Victory";
  // Thumb_Up: thumb clearly above its IP joint, all fingers curled
  if (!indexUp && !middleUp && !ringUp && !pinkyUp && lm[4].y < lm[3].y - 0.06) return "Thumb_Up";
  // Open_Palm: 4+ fingers extended
  if (indexUp && middleUp && ringUp && pinkyUp) return "Open_Palm";
  // Closed_Fist: all fingers curled
  if (!indexUp && !middleUp && !ringUp && !pinkyUp && !thumbOut) return "Closed_Fist";

  return null;
}

// Resolve gesture: prefer MediaPipe if confident, else use landmark fallback
function resolveGesture(top, lm) {
  const mpGesture = top?.categoryName || "None";
  const mpScore = top?.score || 0;
  // If MediaPipe is confident, trust it
  if (mpGesture !== "None" && mpScore > 0.55) return mpGesture;
  // Landmark fallback
  const lmGesture = detectGestureFromLandmarks(lm);
  if (lmGesture) return lmGesture;
  // Low-confidence MediaPipe is still better than nothing
  if (mpGesture !== "None" && mpScore > DETECTION_THRESHOLD) return mpGesture;
  return "None";
}

/* ---- Shared drawing helpers ---- */
function drawStar(ctx, cx, cy, outerR, innerR, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / points) * i - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawHandCursor(ctx, pos, active, color) {
  if (!pos) return;
  ctx.strokeStyle = active ? "#3ddc97" : (color || "#4da6ff");
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 10, 0, Math.PI * 2);
  ctx.stroke();
  if (active) {
    ctx.fillStyle = "rgba(61,220,151,0.3)";
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 14, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawProgressBar(ctx, x, y, w, h, progress, color) {
  ctx.fillStyle = "rgba(15,22,38,0.8)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 4);
  ctx.fill();
  ctx.strokeStyle = "rgba(35,48,82,0.8)";
  ctx.lineWidth = 1;
  ctx.stroke();
  if (progress > 0) {
    ctx.fillStyle = color || "#4da6ff";
    ctx.beginPath();
    ctx.roundRect(x + 1, y + 1, (w - 2) * Math.min(progress, 1), h - 2, 3);
    ctx.fill();
  }
}

/* ========================================================================
   MINI-JUEGO BRUJULA — Disparos con el dedo indice
   ======================================================================== */
const BRUJULA_TARGETS_NEEDED = 5;
let brujulaState = null;

function initBrujulaGame(canvas) {
  brujulaState = {
    targets: [], score: 0, needed: BRUJULA_TARGETS_NEEDED,
    lastShot: 0, cooldown: 600, fingerPos: null, shooting: false,
    particles: [], completed: false
  };
  spawnBrujulaTarget(canvas);
}

function spawnBrujulaTarget(canvas) {
  if (!brujulaState || brujulaState.targets.length >= 3) return;
  const margin = 40;
  brujulaState.targets.push({
    x: margin + Math.random() * (canvas.width - margin * 2),
    y: margin + Math.random() * (canvas.height - margin * 2),
    r: 18 + Math.random() * 8, pulse: 0, hit: false
  });
}

function drawBrujulaGame(ctx, canvas) {
  if (!brujulaState) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  for (const t of brujulaState.targets) {
    if (t.hit) continue;
    t.pulse += 0.05;
    const scale = 1 + Math.sin(t.pulse) * 0.15;
    ctx.save(); ctx.translate(t.x, t.y); ctx.scale(scale, scale);
    drawStar(ctx, 0, 0, t.r, t.r * 0.5, 5);
    ctx.fillStyle = "rgba(255,179,71,0.85)"; ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }
  brujulaState.particles = brujulaState.particles.filter(p => p.life > 0);
  for (const p of brujulaState.particles) {
    p.x += p.vx; p.y += p.vy; p.life -= 0.03;
    ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (brujulaState.fingerPos) {
    const fp = brujulaState.fingerPos;
    ctx.strokeStyle = brujulaState.shooting ? "#3ddc97" : "#4da6ff";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(fp.x - 12, fp.y); ctx.lineTo(fp.x + 12, fp.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fp.x, fp.y - 12); ctx.lineTo(fp.x, fp.y + 12); ctx.stroke();
    ctx.beginPath(); ctx.arc(fp.x, fp.y, 8, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = "#fff"; ctx.font = "bold 14px 'Space Mono', monospace"; ctx.textAlign = "left";
  ctx.fillText(`${brujulaState.score}/${brujulaState.needed}`, 10, 22);
  ctx.font = "10px 'Space Mono', monospace"; ctx.fillStyle = "#7c88a8";
  ctx.fillText("OBJETIVOS", 10, 36);
}

function brujulaShoot(fingerX, fingerY, canvas) {
  if (!brujulaState || brujulaState.completed) return false;
  const now = performance.now();
  if (now - brujulaState.lastShot < brujulaState.cooldown) return false;
  brujulaState.lastShot = now;
  brujulaState.shooting = true;
  setTimeout(() => { if (brujulaState) brujulaState.shooting = false; }, 150);
  for (const t of brujulaState.targets) {
    if (t.hit) continue;
    if (Math.hypot(fingerX - t.x, fingerY - t.y) < t.r + 20) {
      t.hit = true; brujulaState.score++;
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI * 2 / 12) * i;
        brujulaState.particles.push({
          x: t.x, y: t.y, vx: Math.cos(a) * (2 + Math.random() * 3),
          vy: Math.sin(a) * (2 + Math.random() * 3), life: 1,
          size: 2 + Math.random() * 3,
          color: ["#ffb347", "#4da6ff", "#3ddc97", "#fff"][(Math.random() * 4) | 0]
        });
      }
      window.AstroScout?.beep(660 + brujulaState.score * 80, 0.08);
      break;
    }
  }
  brujulaState.targets = brujulaState.targets.filter(t => !t.hit);
  if (brujulaState.score < brujulaState.needed) {
    spawnBrujulaTarget(canvas);
    if (brujulaState.targets.length < 2) spawnBrujulaTarget(canvas);
  }
  return true;
}

/* ========================================================================
   MINI-JUEGO CASCO — Agarra el casco y ponlo en el astronauta
   ======================================================================== */
let cascoState = null;

function initCascoGame(canvas) {
  cascoState = {
    phase: "grab", cascoPos: { x: canvas.width * 0.75, y: canvas.height * 0.3 },
    targetZone: { x: canvas.width * 0.28, y: canvas.height * 0.18, r: 35 },
    handPos: null, grabbing: false, completed: false, floatPhase: 0, successAlpha: 0
  };
}

function drawCascoGame(ctx, canvas) {
  if (!cascoState) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  cascoState.floatPhase += 0.03;
  drawAstronaut(ctx, w * 0.28, h * 0.55, h * 0.8);
  if (cascoState.phase === "done") {
    drawHelmetIcon(ctx, cascoState.targetZone.x, cascoState.targetZone.y, 32, 1);
    cascoState.successAlpha = Math.min(cascoState.successAlpha + 0.02, 1);
    ctx.globalAlpha = cascoState.successAlpha;
    ctx.fillStyle = "#3ddc97"; ctx.font = "bold 16px 'Space Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText("CASCO ASEGURADO", w / 2, h - 20);
    ctx.globalAlpha = 1; return;
  }
  const tz = cascoState.targetZone;
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = cascoState.phase === "carry" ? "rgba(61,220,151,0.6)" : "rgba(77,166,255,0.3)";
  ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(tz.x, tz.y, tz.r, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  if (cascoState.phase === "carry") {
    ctx.fillStyle = "rgba(61,220,151,0.15)"; ctx.beginPath(); ctx.arc(tz.x, tz.y, tz.r, 0, Math.PI * 2); ctx.fill();
  }
  if (cascoState.phase === "grab") {
    const floatY = Math.sin(cascoState.floatPhase) * 5;
    drawHelmetIcon(ctx, cascoState.cascoPos.x, cascoState.cascoPos.y + floatY, 28, 0.9);
    ctx.fillStyle = "#ffb347"; ctx.font = "11px 'Space Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText("CIERRA EL PUNO PARA AGARRAR", w / 2, h - 12);
  } else if (cascoState.phase === "carry") {
    if (cascoState.handPos) drawHelmetIcon(ctx, cascoState.handPos.x, cascoState.handPos.y, 28, 0.9);
    ctx.fillStyle = "#4da6ff"; ctx.font = "11px 'Space Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText("LLEVA EL CASCO A LA CABEZA", w / 2, h - 12);
  }
  drawHandCursor(ctx, cascoState.handPos, cascoState.grabbing, "#ffb347");
}

function drawAstronaut(ctx, cx, cy, totalH) {
  const scale = totalH / 200;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(scale, scale);
  ctx.fillStyle = "#1a2540"; ctx.strokeStyle = "#4da6ff"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(-30, -30, 60, 80, 8); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(-48, -20, 16, 55, 6); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(32, -20, 16, 55, 6); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(-25, 50, 20, 50, 6); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(5, 50, 20, 50, 6); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "rgba(77,166,255,0.5)"; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.arc(0, -50, 22, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = "#ffb347"; ctx.font = "8px 'Space Mono', monospace"; ctx.textAlign = "center";
  ctx.fillText("ASTRO", 0, 5); ctx.fillText("SCOUT", 0, 14);
  ctx.restore();
}

function drawHelmetIcon(ctx, x, y, size, alpha) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y);
  ctx.fillStyle = "#2a3a5c"; ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#4da6ff"; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = "rgba(77,166,255,0.5)"; ctx.beginPath(); ctx.arc(0, 2, size * 0.6, -0.3, Math.PI + 0.3); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(-size * 0.25, -size * 0.15, size * 0.3, -0.8, 0.6); ctx.stroke();
  ctx.restore();
}

function updateCascoGame(gesture, handPos) {
  if (!cascoState || cascoState.completed) return false;
  cascoState.handPos = handPos;
  cascoState.grabbing = gesture === "Closed_Fist";
  if (cascoState.phase === "grab") {
    if (cascoState.grabbing && handPos && Math.hypot(handPos.x - cascoState.cascoPos.x, handPos.y - cascoState.cascoPos.y) < 60) {
      cascoState.phase = "carry"; window.AstroScout?.beep(520, 0.06);
    }
  } else if (cascoState.phase === "carry") {
    if (gesture === "Open_Palm" && handPos) {
      const tz = cascoState.targetZone;
      if (Math.hypot(handPos.x - tz.x, handPos.y - tz.y) < tz.r + 15) {
        cascoState.phase = "done"; cascoState.completed = true;
        window.AstroScout?.beep(880, 0.1); return true;
      } else { cascoState.phase = "grab"; cascoState.cascoPos = { x: handPos.x, y: handPos.y }; }
    }
  }
  return false;
}

/* ========================================================================
   MINI-JUEGO BOTIQUIN — Cura al companero herido
   Escenario: Un companero sufrio una herida por impacto de meteorito.
   Paso 1: Retirar 4 fragmentos de la herida (Pointing_Up = pinza,
           acercar el dedo a cada fragmento para extraerlo).
   Paso 2: Agarrar jeringa de la bandeja (Closed_Fist), arrastrarla
           hasta la herida y hacer Thumb_Up para inyectar.
   Paso 3: Vendar deslizando la mano (Open_Palm) de lado a lado sobre
           la herida 4 veces (detecta cambios de direccion).
   ======================================================================== */
let botiquinState = null;

function initBotiquinGame(canvas) {
  const w = canvas.width, h = canvas.height;
  const woundCenter = { x: w * 0.5, y: h * 0.48 };
  const debris = [];
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI * 2 / 4) * i + Math.random() * 0.5;
    debris.push({
      x: woundCenter.x + Math.cos(a) * (15 + Math.random() * 18),
      y: woundCenter.y + Math.sin(a) * (12 + Math.random() * 14),
      r: 3 + Math.random() * 3, removed: false, pulse: Math.random() * 6
    });
  }
  botiquinState = {
    step: 0,  // 0=extraer, 1=inyectar, 2=vendar, 3=done
    woundCenter, debris, debrisRemoved: 0,
    syringePos: { x: w * 0.85, y: h * 0.25 },
    syringeGrabbed: false, syringeAtWound: false, injecting: false, injectProgress: 0,
    swipeCount: 0, swipesNeeded: 4, lastSwipeX: -1, swipeDir: 0, swipeActive: false,
    bandageLines: [],
    handPos: null, completed: false,
    particles: [], successAlpha: 0, patientPulse: 0
  };
}

function drawBotiquinGame(ctx, canvas) {
  if (!botiquinState) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  botiquinState.patientPulse += 0.04;

  drawPatient(ctx, w * 0.5, h * 0.5, w, h, botiquinState.step);

  if (botiquinState.step >= 3) {
    botiquinState.successAlpha = Math.min(botiquinState.successAlpha + 0.02, 1);
    ctx.globalAlpha = botiquinState.successAlpha;
    ctx.fillStyle = "#3ddc97"; ctx.font = "bold 14px 'Space Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText("COMPANERO ESTABILIZADO", w / 2, h - 15);
    ctx.fillStyle = "rgba(61,220,151,0.15)";
    ctx.beginPath(); ctx.arc(w * 0.5, h * 0.48, 50, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    botiquinState.particles = botiquinState.particles.filter(p => p.life > 0);
    for (const p of botiquinState.particles) {
      p.x += p.vx; p.y += p.vy; p.life -= 0.02;
      ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }

  // --- STEP 0: Extract debris ---
  if (botiquinState.step === 0) {
    // wound glow
    const wc = botiquinState.woundCenter;
    const pulse = 1 + Math.sin(botiquinState.patientPulse * 2) * 0.1;
    ctx.fillStyle = "rgba(255,80,80,0.15)";
    ctx.beginPath(); ctx.arc(wc.x, wc.y, 35 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,80,80,0.5)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(wc.x, wc.y, 35, 0, Math.PI * 2); ctx.stroke();
    // debris
    for (const d of botiquinState.debris) {
      if (d.removed) continue;
      d.pulse += 0.08;
      const glow = 0.6 + Math.sin(d.pulse) * 0.3;
      ctx.fillStyle = `rgba(180,120,60,${glow})`;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y - d.r);
      ctx.lineTo(d.x + d.r * 0.8, d.y + d.r * 0.5);
      ctx.lineTo(d.x - d.r * 0.8, d.y + d.r * 0.5);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#ffb347"; ctx.lineWidth = 1; ctx.stroke();
    }
    // tweezer cursor
    if (botiquinState.handPos) {
      const hp = botiquinState.handPos;
      ctx.strokeStyle = "#4da6ff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(hp.x - 2, hp.y - 10); ctx.lineTo(hp.x - 2, hp.y + 4);
      ctx.lineTo(hp.x, hp.y + 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hp.x + 2, hp.y - 10); ctx.lineTo(hp.x + 2, hp.y + 4);
      ctx.lineTo(hp.x, hp.y + 8); ctx.stroke();
    }
    ctx.fillStyle = "#ffb347"; ctx.font = "11px 'Space Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText("INDICE ARRIBA = PINZA. ACERCA A LOS FRAGMENTOS", w / 2, h - 12);
    ctx.fillStyle = "#fff"; ctx.font = "bold 12px 'Space Mono', monospace"; ctx.textAlign = "left";
    ctx.fillText(`PASO 1/3: EXTRAER FRAGMENTOS (${botiquinState.debrisRemoved}/4)`, 10, 18);
  }

  // --- STEP 1: Inject medicine ---
  if (botiquinState.step === 1) {
    const wc = botiquinState.woundCenter;
    ctx.fillStyle = "rgba(255,179,71,0.12)";
    ctx.beginPath(); ctx.arc(wc.x, wc.y, 35, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,179,71,0.5)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(wc.x, wc.y, 35, 0, Math.PI * 2); ctx.stroke();
    // syringe
    const sp = botiquinState.syringeGrabbed && botiquinState.handPos
      ? botiquinState.handPos : botiquinState.syringePos;
    drawSyringe(ctx, sp.x, sp.y, botiquinState.injectProgress);
    if (!botiquinState.syringeGrabbed) {
      ctx.strokeStyle = "#3ddc97"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(botiquinState.syringePos.x, botiquinState.syringePos.y, 22, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#7c88a8"; ctx.font = "8px 'Space Mono', monospace"; ctx.textAlign = "center";
      ctx.fillText("AGARRA", botiquinState.syringePos.x, botiquinState.syringePos.y + 32);
    }
    if (botiquinState.syringeAtWound && !botiquinState.injecting) {
      ctx.fillStyle = "#3ddc97"; ctx.font = "10px 'Space Mono', monospace"; ctx.textAlign = "center";
      ctx.fillText("PULGAR ARRIBA PARA INYECTAR", w / 2, h - 25);
    }
    if (botiquinState.injecting) {
      drawProgressBar(ctx, w * 0.15, h - 38, w * 0.7, 10, botiquinState.injectProgress / 90, "#3ddc97");
    }
    drawHandCursor(ctx, botiquinState.handPos, botiquinState.syringeGrabbed, "#3ddc97");
    ctx.fillStyle = botiquinState.syringeGrabbed ? "#3ddc97" : "#ffb347";
    ctx.font = "11px 'Space Mono', monospace"; ctx.textAlign = "center";
    const msg1 = botiquinState.syringeGrabbed
      ? (botiquinState.syringeAtWound ? "PULGAR ARRIBA PARA INYECTAR" : "LLEVA LA JERINGA A LA HERIDA")
      : "PUNO CERRADO PARA AGARRAR LA JERINGA";
    ctx.fillText(msg1, w / 2, h - 12);
    ctx.fillStyle = "#fff"; ctx.font = "bold 12px 'Space Mono', monospace"; ctx.textAlign = "left";
    ctx.fillText("PASO 2/3: INYECTAR MEDICINA", 10, 18);
  }

  // --- STEP 2: Bandage (swipe) ---
  if (botiquinState.step === 2) {
    const wc = botiquinState.woundCenter;
    ctx.fillStyle = "rgba(77,166,255,0.1)";
    ctx.beginPath(); ctx.arc(wc.x, wc.y, 35, 0, Math.PI * 2); ctx.fill();
    // swipe zone visual
    ctx.strokeStyle = "rgba(77,166,255,0.4)"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.roundRect(wc.x - 55, wc.y - 20, 110, 40, 8); ctx.stroke();
    ctx.setLineDash([]);
    // bandage lines already drawn
    for (const bl of botiquinState.bandageLines) {
      ctx.strokeStyle = `rgba(255,255,255,${0.15 + bl.opacity * 0.2})`; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(bl.x1, bl.y); ctx.lineTo(bl.x2, bl.y); ctx.stroke();
    }
    // swipe arrows
    const arrowY = wc.y;
    ctx.fillStyle = "rgba(77,166,255,0.4)"; ctx.font = "16px 'Space Mono', monospace"; ctx.textAlign = "center";
    const arrowPulse = Math.sin(botiquinState.patientPulse * 3) > 0;
    if (arrowPulse) {
      ctx.fillText("◄►", wc.x, arrowY + 4);
    }
    drawHandCursor(ctx, botiquinState.handPos, botiquinState.swipeActive, "#4da6ff");
    drawProgressBar(ctx, w * 0.15, h - 38, w * 0.7, 10, botiquinState.swipeCount / botiquinState.swipesNeeded, "#4da6ff");
    ctx.fillStyle = "#4da6ff"; ctx.font = "11px 'Space Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText("MANO ABIERTA: DESLIZA IZQUIERDA-DERECHA", w / 2, h - 12);
    ctx.fillStyle = "#fff"; ctx.font = "bold 12px 'Space Mono', monospace"; ctx.textAlign = "left";
    ctx.fillText(`PASO 3/3: VENDAR (${botiquinState.swipeCount}/${botiquinState.swipesNeeded})`, 10, 18);
  }

  // Step indicators (all steps)
  if (botiquinState.step < 3) {
    for (let i = 0; i < 3; i++) {
      const sx = w - 70 + i * 22, sy = 14;
      ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2);
      if (i < botiquinState.step) { ctx.fillStyle = "#3ddc97"; ctx.fill(); }
      else if (i === botiquinState.step) { ctx.fillStyle = ["#ffb347", "#3ddc97", "#4da6ff"][i]; ctx.fill(); }
      else { ctx.strokeStyle = "#233052"; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
  }
}

function drawSyringe(ctx, x, y, injectProg) {
  ctx.save(); ctx.translate(x, y);
  // barrel
  ctx.fillStyle = "#1a3050"; ctx.strokeStyle = "#4da6ff"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(-4, -18, 8, 28, 2); ctx.fill(); ctx.stroke();
  // plunger
  const plungerY = -18 - 10 + (injectProg / 90) * 10;
  ctx.fillStyle = "#233052";
  ctx.beginPath(); ctx.roundRect(-3, plungerY, 6, 10, 1); ctx.fill();
  ctx.strokeStyle = "#4da6ff"; ctx.stroke();
  // needle
  ctx.strokeStyle = "#7c88a8"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, 18); ctx.stroke();
  // liquid
  const liquidH = 20 * (1 - injectProg / 90);
  if (liquidH > 0) {
    ctx.fillStyle = "rgba(61,220,151,0.5)";
    ctx.beginPath(); ctx.roundRect(-3, 10 - liquidH, 6, liquidH, 1); ctx.fill();
  }
  ctx.restore();
}

function drawPatient(ctx, cx, cy, w, h, step) {
  ctx.save();
  ctx.fillStyle = "#1a2540"; ctx.strokeStyle = "#4da6ff"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(cx - 35, cy - 25, 70, 55, 6); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy - 38, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(77,166,255,0.4)";
  ctx.beginPath(); ctx.arc(cx, cy - 36, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#1a2540";
  ctx.beginPath(); ctx.roundRect(cx - 50, cy - 15, 14, 40, 4); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(cx + 36, cy - 15, 14, 40, 4); ctx.fill(); ctx.stroke();
  if (step < 2) {
    ctx.strokeStyle = "rgba(255,80,80,0.7)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8); ctx.stroke();
  }
  // heart monitor
  ctx.fillStyle = step >= 3 ? "#3ddc97" : "#ff6b6b";
  ctx.font = "7px 'Space Mono', monospace"; ctx.textAlign = "right";
  ctx.fillText(step >= 3 ? "♥ ESTABLE" : "♥ CRITICO", cx + 48, cy + 42);
  ctx.fillStyle = "#7c88a8"; ctx.font = "8px 'Space Mono', monospace"; ctx.textAlign = "center";
  ctx.fillText("TRIPULANTE HERIDO", cx, cy + 52);
  ctx.restore();
}

function updateBotiquinGame(gesture, handPos) {
  if (!botiquinState || botiquinState.completed || botiquinState.step >= 3) return false;
  botiquinState.handPos = handPos;
  if (!handPos) return false;

  // STEP 0: Extract debris with Pointing_Up (tweezer)
  if (botiquinState.step === 0) {
    if (gesture === "Pointing_Up") {
      for (const d of botiquinState.debris) {
        if (d.removed) continue;
        if (Math.hypot(handPos.x - d.x, handPos.y - d.y) < 20) {
          d.removed = true; botiquinState.debrisRemoved++;
          window.AstroScout?.beep(600 + botiquinState.debrisRemoved * 100, 0.06);
          // spark particles
          for (let i = 0; i < 6; i++) {
            const a = (Math.PI * 2 / 6) * i;
            botiquinState.particles.push({
              x: d.x, y: d.y, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2,
              life: 1, size: 2, color: "#ffb347"
            });
          }
          if (botiquinState.debrisRemoved >= 4) {
            botiquinState.step = 1;
            window.AstroScout?.beep(700, 0.08);
          }
          break;
        }
      }
    }
    return false;
  }

  // STEP 1: Inject — grab syringe (Closed_Fist), drag to wound, Thumb_Up to inject
  if (botiquinState.step === 1) {
    if (!botiquinState.syringeGrabbed) {
      if (gesture === "Closed_Fist" && Math.hypot(handPos.x - botiquinState.syringePos.x, handPos.y - botiquinState.syringePos.y) < 35) {
        botiquinState.syringeGrabbed = true;
        window.AstroScout?.beep(520, 0.05);
      }
    } else {
      const wc = botiquinState.woundCenter;
      const nearWound = Math.hypot(handPos.x - wc.x, handPos.y - wc.y) < 45;
      botiquinState.syringeAtWound = nearWound;
      if (nearWound && gesture === "Thumb_Up") {
        botiquinState.injecting = true;
        botiquinState.injectProgress += 1.5;
        if (botiquinState.injectProgress >= 90) {
          botiquinState.step = 2;
          botiquinState.injecting = false;
          window.AstroScout?.beep(800, 0.08);
        }
      } else if (gesture !== "Closed_Fist" && gesture !== "Thumb_Up") {
        // dropped syringe
        if (!nearWound) {
          botiquinState.syringeGrabbed = false;
          botiquinState.syringeAtWound = false;
        }
      }
    }
    return false;
  }

  // STEP 2: Bandage — swipe Open_Palm left-right across wound
  if (botiquinState.step === 2) {
    if (gesture === "Open_Palm") {
      const wc = botiquinState.woundCenter;
      const inZone = Math.abs(handPos.y - wc.y) < 35 && Math.abs(handPos.x - wc.x) < 70;
      botiquinState.swipeActive = inZone;
      if (inZone) {
        if (botiquinState.lastSwipeX >= 0) {
          const dx = handPos.x - botiquinState.lastSwipeX;
          const newDir = dx > 3 ? 1 : dx < -3 ? -1 : 0;
          if (newDir !== 0 && newDir !== botiquinState.swipeDir && botiquinState.swipeDir !== 0) {
            botiquinState.swipeCount++;
            window.AstroScout?.beep(440 + botiquinState.swipeCount * 80, 0.05);
            botiquinState.bandageLines.push({
              x1: wc.x - 45, x2: wc.x + 45,
              y: wc.y - 12 + botiquinState.swipeCount * 6, opacity: 1
            });
            if (botiquinState.swipeCount >= botiquinState.swipesNeeded) {
              botiquinState.step = 3; botiquinState.completed = true;
              window.AstroScout?.beep(880, 0.1);
              for (let i = 0; i < 20; i++) {
                const a = (Math.PI * 2 / 20) * i;
                botiquinState.particles.push({
                  x: wc.x, y: wc.y, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2,
                  life: 1, size: 2 + Math.random() * 3, color: "#3ddc97"
                });
              }
              return true;
            }
          }
          if (newDir !== 0) botiquinState.swipeDir = newDir;
        }
        botiquinState.lastSwipeX = handPos.x;
      }
    } else {
      botiquinState.swipeActive = false;
    }
    return false;
  }
  return false;
}

/* ========================================================================
   MINI-JUEGO PANEL O2 — Repara el tanque de oxigeno danado
   Paso 1: Escanear con Pointing_Up (detector). Un haz sigue el dedo.
           Al pasar sobre la grieta oculta, el detector reacciona. Debes
           mantener el haz 1s sobre ella para confirmar ubicacion.
   Paso 2: Soldar la grieta trazando un camino con Closed_Fist.
           La grieta es una linea curva; debes seguirla de un extremo
           al otro sin alejarte mucho.
   Paso 3: Agarrar la manguera de O2 (Closed_Fist), arrastrar al puerto
           del tanque, y hacer Victory para abrir la valvula.
   ======================================================================== */
let panelState = null;

function initPanelGame(canvas) {
  const w = canvas.width, h = canvas.height;
  const tankCx = w * 0.5, tankCy = h * 0.42;
  // crack: a series of points on the tank surface
  const crackStart = { x: tankCx - 15, y: tankCy - 25 };
  const crackPoints = [crackStart];
  let cx = crackStart.x, cy = crackStart.y;
  for (let i = 0; i < 5; i++) {
    cx += 5 + Math.random() * 6;
    cy += (Math.random() - 0.4) * 8;
    crackPoints.push({ x: cx, y: cy });
  }
  panelState = {
    step: 0,  // 0=escanear, 1=soldar, 2=reconectar, 3=done
    tankCx, tankCy,
    crackPoints, crackCenter: { x: (crackStart.x + cx) / 2, y: (crackStart.y + cy) / 2 },
    crackFound: false, scanHoldTime: 0,
    weldProgress: 0, weldPointIdx: 0,
    hosePos: { x: w * 0.12, y: h * 0.7 }, hoseGrabbed: false,
    portPos: { x: tankCx, y: tankCy + 52 },
    hoseAtPort: false, valveOpening: false, valveProgress: 0,
    handPos: null, completed: false,
    bubbles: [], gasPulse: 0, successAlpha: 0, particles: [],
    detectorBeep: 0
  };
  for (let i = 0; i < 5; i++) panelState.bubbles.push(createBubble(panelState.crackCenter));
}

function createBubble(origin) {
  return {
    x: origin.x + (Math.random() - 0.5) * 20, y: origin.y,
    vx: (Math.random() - 0.5) * 1.5, vy: -(1 + Math.random() * 2),
    r: 2 + Math.random() * 4, life: 1
  };
}

function drawPanelGame(ctx, canvas) {
  if (!panelState) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  panelState.gasPulse += 0.04;

  drawO2Tank(ctx, panelState.tankCx, panelState.tankCy, panelState.step);

  if (panelState.step >= 3) {
    panelState.successAlpha = Math.min(panelState.successAlpha + 0.02, 1);
    ctx.globalAlpha = panelState.successAlpha;
    ctx.fillStyle = "#3ddc97"; ctx.font = "bold 14px 'Space Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText("TANQUE REPARADO Y CONECTADO", w / 2, h - 15);
    ctx.globalAlpha = 1;
    panelState.particles = panelState.particles.filter(p => p.life > 0);
    for (const p of panelState.particles) {
      p.x += p.vx; p.y += p.vy; p.life -= 0.015;
      ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }

  // Leak bubbles (steps 0 and 1)
  if (panelState.step < 2) {
    panelState.bubbles = panelState.bubbles.filter(b => b.life > 0);
    while (panelState.bubbles.length < 6) panelState.bubbles.push(createBubble(panelState.crackCenter));
    for (const b of panelState.bubbles) {
      b.x += b.vx; b.y += b.vy; b.life -= 0.01;
      ctx.globalAlpha = b.life * 0.5; ctx.strokeStyle = "#4da6ff"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // --- STEP 0: Scan with detector ---
  if (panelState.step === 0) {
    // crack hidden unless found
    if (panelState.crackFound) {
      drawCrack(ctx, panelState.crackPoints, "rgba(255,80,80,0.8)");
    }
    // detector beam from finger
    if (panelState.handPos) {
      const hp = panelState.handPos;
      const dist = Math.hypot(hp.x - panelState.crackCenter.x, hp.y - panelState.crackCenter.y);
      const intensity = Math.max(0, 1 - dist / 120);
      // detector line
      ctx.strokeStyle = `rgba(77,166,255,${0.3 + intensity * 0.5})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(hp.x, hp.y); ctx.lineTo(hp.x, hp.y + 25); ctx.stroke();
      // scan circle
      ctx.strokeStyle = `rgba(77,166,255,${0.2 + intensity * 0.4})`; ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(hp.x, hp.y, 20, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      // proximity indicator bar
      if (intensity > 0.3) {
        const barColor = intensity > 0.7 ? "#ff6b6b" : "#ffb347";
        drawProgressBar(ctx, hp.x - 20, hp.y - 25, 40, 5, intensity, barColor);
      }
    }
    if (panelState.crackFound) {
      drawProgressBar(ctx, w * 0.15, h - 38, w * 0.7, 10, panelState.scanHoldTime / 60, "#ff6b6b");
    }
    ctx.fillStyle = "#ffb347"; ctx.font = "11px 'Space Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText("INDICE ARRIBA = DETECTOR. BUSCA LA GRIETA", w / 2, h - 12);
    ctx.fillStyle = "#fff"; ctx.font = "bold 12px 'Space Mono', monospace"; ctx.textAlign = "left";
    ctx.fillText("PASO 1/3: ESCANEAR GRIETA", 10, 18);
  }

  // --- STEP 1: Weld along crack ---
  if (panelState.step === 1) {
    // draw crack with welded portion
    const pts = panelState.crackPoints;
    // unwelded part
    if (panelState.weldPointIdx < pts.length - 1) {
      ctx.strokeStyle = "rgba(255,80,80,0.7)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(pts[panelState.weldPointIdx].x, pts[panelState.weldPointIdx].y);
      for (let i = panelState.weldPointIdx + 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    // welded part (green)
    if (panelState.weldPointIdx > 0) {
      ctx.strokeStyle = "rgba(61,220,151,0.8)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i <= panelState.weldPointIdx && i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    // next point to weld indicator
    if (panelState.weldPointIdx < pts.length) {
      const target = pts[panelState.weldPointIdx];
      const pls = 1 + Math.sin(panelState.gasPulse * 4) * 0.3;
      ctx.strokeStyle = "#ff6b6b"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(target.x, target.y, 10 * pls, 0, Math.PI * 2); ctx.stroke();
    }
    // weld sparks near hand
    if (panelState.handPos) {
      const hp = panelState.handPos;
      ctx.fillStyle = "#ffb347"; ctx.globalAlpha = 0.7;
      for (let s = 0; s < 2; s++) {
        ctx.beginPath();
        ctx.arc(hp.x + (Math.random() - 0.5) * 12, hp.y + (Math.random() - 0.5) * 12,
          1 + Math.random() * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    drawProgressBar(ctx, w * 0.15, h - 38, w * 0.7, 10, panelState.weldPointIdx / (pts.length - 1), "#ffb347");
    drawHandCursor(ctx, panelState.handPos, true, "#ffb347");
    ctx.fillStyle = "#ffb347"; ctx.font = "11px 'Space Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText("PUNO CERRADO: SUELDA SIGUIENDO LA GRIETA", w / 2, h - 12);
    ctx.fillStyle = "#fff"; ctx.font = "bold 12px 'Space Mono', monospace"; ctx.textAlign = "left";
    ctx.fillText("PASO 2/3: SOLDAR GRIETA", 10, 18);
  }

  // --- STEP 2: Reconnect hose ---
  if (panelState.step === 2) {
    // hose
    const hPos = panelState.hoseGrabbed && panelState.handPos ? panelState.handPos : panelState.hosePos;
    drawHose(ctx, hPos.x, hPos.y, panelState.hoseGrabbed);
    // port indicator
    const pp = panelState.portPos;
    ctx.setLineDash([4, 4]); ctx.strokeStyle = "rgba(61,220,151,0.6)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(pp.x, pp.y, 18, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#7c88a8"; ctx.font = "8px 'Space Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText("PUERTO", pp.x, pp.y + 28);
    if (!panelState.hoseGrabbed) {
      ctx.strokeStyle = "#3ddc97"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(panelState.hosePos.x, panelState.hosePos.y, 22, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#7c88a8"; ctx.font = "8px 'Space Mono', monospace";
      ctx.fillText("AGARRA", panelState.hosePos.x, panelState.hosePos.y + 30);
    }
    if (panelState.hoseAtPort && !panelState.valveOpening) {
      ctx.fillStyle = "#3ddc97"; ctx.font = "10px 'Space Mono', monospace"; ctx.textAlign = "center";
      ctx.fillText("VICTORIA (V) PARA ABRIR VALVULA", w / 2, h - 25);
    }
    if (panelState.valveOpening) {
      drawProgressBar(ctx, w * 0.15, h - 38, w * 0.7, 10, panelState.valveProgress / 80, "#3ddc97");
    }
    drawHandCursor(ctx, panelState.handPos, panelState.hoseGrabbed, "#3ddc97");
    ctx.fillStyle = "#3ddc97"; ctx.font = "11px 'Space Mono', monospace"; ctx.textAlign = "center";
    const msg2 = panelState.hoseGrabbed
      ? (panelState.hoseAtPort ? "VICTORIA (V) PARA ABRIR VALVULA" : "LLEVA LA MANGUERA AL PUERTO")
      : "PUNO CERRADO PARA AGARRAR MANGUERA";
    ctx.fillText(msg2, w / 2, h - 12);
    ctx.fillStyle = "#fff"; ctx.font = "bold 12px 'Space Mono', monospace"; ctx.textAlign = "left";
    ctx.fillText("PASO 3/3: RECONECTAR O2", 10, 18);
  }

  // Step indicators
  for (let i = 0; i < 3; i++) {
    const sx = w - 70 + i * 22, sy = 14;
    ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2);
    if (i < panelState.step) { ctx.fillStyle = "#3ddc97"; ctx.fill(); }
    else if (i === panelState.step) { ctx.fillStyle = ["#ff6b6b", "#ffb347", "#3ddc97"][i]; ctx.fill(); }
    else { ctx.strokeStyle = "#233052"; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
}

function drawCrack(ctx, points, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
}

function drawHose(ctx, x, y, grabbed) {
  ctx.save(); ctx.translate(x, y);
  // coiled hose
  ctx.strokeStyle = grabbed ? "#3ddc97" : "#4da6ff"; ctx.lineWidth = 4; ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 1.5); ctx.stroke();
  // connector tip
  ctx.fillStyle = "#233052";
  ctx.beginPath(); ctx.roundRect(-5, -14, 10, 8, 2); ctx.fill();
  ctx.strokeStyle = grabbed ? "#3ddc97" : "#4da6ff"; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}

function drawO2Tank(ctx, cx, cy, step) {
  ctx.save();
  ctx.fillStyle = "#1a2540";
  ctx.beginPath(); ctx.roundRect(cx - 30, cy - 45, 60, 90, 12); ctx.fill();
  ctx.strokeStyle = step >= 2 ? "#3ddc97" : "#4da6ff"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = "#233052";
  ctx.beginPath(); ctx.roundRect(cx - 10, cy - 55, 20, 14, 4); ctx.fill();
  ctx.strokeStyle = "#4da6ff"; ctx.stroke();
  ctx.fillStyle = step >= 3 ? "#3ddc97" : "#4da6ff";
  ctx.font = "bold 16px 'Space Mono', monospace"; ctx.textAlign = "center";
  ctx.fillText("O\u2082", cx, cy + 5);
  // pressure gauge
  ctx.strokeStyle = "#233052"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy + 25, 10, 0, Math.PI * 2); ctx.stroke();
  const gaugeAngle = step >= 3 ? -0.8 : 0.5;
  ctx.strokeStyle = step >= 3 ? "#3ddc97" : "#ff6b6b"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, cy + 25);
  ctx.lineTo(cx + Math.cos(gaugeAngle) * 7, cy + 25 + Math.sin(gaugeAngle) * -7); ctx.stroke();
  // connection port
  ctx.fillStyle = "#233052";
  ctx.beginPath(); ctx.roundRect(cx - 12, cy + 45, 24, 10, 3); ctx.fill();
  ctx.strokeStyle = step >= 3 ? "#3ddc97" : "#4da6ff"; ctx.stroke();
  ctx.restore();
}

function updatePanelGame(gesture, handPos) {
  if (!panelState || panelState.completed) return false;
  panelState.handPos = handPos;
  if (!handPos) return false;

  // STEP 0: Scan with Pointing_Up detector
  if (panelState.step === 0) {
    if (gesture === "Pointing_Up") {
      const dist = Math.hypot(handPos.x - panelState.crackCenter.x, handPos.y - panelState.crackCenter.y);
      if (dist < 35) {
        if (!panelState.crackFound) {
          panelState.crackFound = true;
          window.AstroScout?.beep(880, 0.06);
        }
        panelState.scanHoldTime += 1;
        if (panelState.scanHoldTime >= 60) {
          panelState.step = 1;
          window.AstroScout?.beep(600, 0.08);
        }
      } else {
        panelState.scanHoldTime = Math.max(0, panelState.scanHoldTime - 0.5);
      }
    }
    return false;
  }

  // STEP 1: Weld along crack with Closed_Fist
  if (panelState.step === 1) {
    if (gesture === "Closed_Fist") {
      const pts = panelState.crackPoints;
      if (panelState.weldPointIdx < pts.length) {
        const target = pts[panelState.weldPointIdx];
        const dist = Math.hypot(handPos.x - target.x, handPos.y - target.y);
        if (dist < 22) {
          panelState.weldPointIdx++;
          window.AstroScout?.beep(400 + panelState.weldPointIdx * 60, 0.04);
          if (panelState.weldPointIdx >= pts.length) {
            panelState.step = 2;
            window.AstroScout?.beep(700, 0.08);
          }
        }
      }
    }
    return false;
  }

  // STEP 2: Reconnect hose — grab (Closed_Fist), drag to port, Victory to open valve
  if (panelState.step === 2) {
    if (!panelState.hoseGrabbed) {
      if (gesture === "Closed_Fist" && Math.hypot(handPos.x - panelState.hosePos.x, handPos.y - panelState.hosePos.y) < 35) {
        panelState.hoseGrabbed = true;
        window.AstroScout?.beep(520, 0.05);
      }
    } else {
      const nearPort = Math.hypot(handPos.x - panelState.portPos.x, handPos.y - panelState.portPos.y) < 30;
      panelState.hoseAtPort = nearPort;
      if (nearPort && gesture === "Victory") {
        panelState.valveOpening = true;
        panelState.valveProgress += 1.5;
        if (panelState.valveProgress >= 80) {
          panelState.step = 3; panelState.completed = true;
          window.AstroScout?.beep(880, 0.1);
          for (let i = 0; i < 20; i++) {
            const a = (Math.PI * 2 / 20) * i;
            panelState.particles.push({
              x: panelState.portPos.x, y: panelState.portPos.y,
              vx: Math.cos(a) * 2, vy: Math.sin(a) * 2,
              life: 1, size: 2 + Math.random() * 3, color: "#3ddc97"
            });
          }
          return true;
        }
      } else if (gesture !== "Closed_Fist" && gesture !== "Victory") {
        if (!nearPort) {
          panelState.hoseGrabbed = false;
          panelState.hoseAtPort = false;
        }
      }
    }
    return false;
  }
  return false;
}

/* ========================================================================
   MINI-JUEGO GUANTE — Repara el sistema electrico de la nave
   Escenario: Cables desconectados en el panel electrico. El jugador debe
   conectar 3 pares de cables llevando la mano de un extremo al otro.
   Puno para agarrar el cable, mano abierta para soltar/conectar.
   Los conectores de destino tienen el MISMO COLOR que el cable origen,
   con etiquetas claras (ROJO, VERDE, NARANJA) para guiar al usuario.
   Los destinos estan mezclados (no en el mismo orden que los origenes).
   ======================================================================== */
let guanteState = null;

function initGuanteGame(canvas) {
  const w = canvas.width, h = canvas.height;
  const colors = ["#ff6b6b", "#3ddc97", "#ffb347"];
  const names = ["ROJO", "VERDE", "NARANJA"];
  // Shuffle destination order so cables don't align horizontally
  const destOrder = [0, 1, 2];
  for (let i = destOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [destOrder[i], destOrder[j]] = [destOrder[j], destOrder[i]];
  }
  const cables = [];
  for (let i = 0; i < 3; i++) {
    cables.push({
      color: colors[i], name: names[i],
      from: { x: 50, y: 60 + i * 70 },
      to: { x: w - 50, y: 60 + destOrder[i] * 70 },
      connected: false, grabbed: false, grabEnd: null
    });
  }
  guanteState = {
    cables, handPos: null, grabbing: false,
    activeCable: -1, completed: false,
    connectedCount: 0, sparkPhase: 0,
    successAlpha: 0, particles: []
  };
}

function drawGuanteGame(ctx, canvas) {
  if (!guanteState) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  guanteState.sparkPhase += 0.06;

  // Panel background
  ctx.fillStyle = "rgba(15,22,38,0.6)";
  ctx.beginPath(); ctx.roundRect(20, 20, w - 40, h - 40, 10); ctx.fill();
  ctx.strokeStyle = "#233052"; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = "#7c88a8"; ctx.font = "9px 'Space Mono', monospace"; ctx.textAlign = "center";
  ctx.fillText("PANEL ELECTRICO - NAVE", w / 2, 38);

  // Column headers
  ctx.fillStyle = "#4da6ff"; ctx.font = "bold 9px 'Space Mono', monospace";
  ctx.textAlign = "left"; ctx.fillText("ORIGEN", 35, 45);
  ctx.textAlign = "right"; ctx.fillText("DESTINO", w - 35, 45);

  for (let i = 0; i < guanteState.cables.length; i++) {
    const cable = guanteState.cables[i];

    // ---- LEFT: source connector with color + label ----
    // colored background plate
    ctx.fillStyle = "rgba(15,22,38,0.9)";
    ctx.beginPath(); ctx.roundRect(cable.from.x - 18, cable.from.y - 14, 56, 28, 5); ctx.fill();
    ctx.strokeStyle = cable.color; ctx.lineWidth = 1.5; ctx.stroke();
    // colored dot
    ctx.fillStyle = cable.color;
    ctx.beginPath(); ctx.arc(cable.from.x, cable.from.y, 7, 0, Math.PI * 2); ctx.fill();
    // label next to dot
    ctx.fillStyle = cable.color; ctx.font = "bold 9px 'Space Mono', monospace"; ctx.textAlign = "left";
    ctx.fillText(cable.name, cable.from.x + 12, cable.from.y + 3);

    // ---- RIGHT: destination connector with MATCHING color + label ----
    ctx.fillStyle = "rgba(15,22,38,0.9)";
    ctx.beginPath(); ctx.roundRect(cable.to.x - 38, cable.to.y - 14, 56, 28, 5); ctx.fill();
    if (cable.connected) {
      ctx.strokeStyle = cable.color; ctx.lineWidth = 2;
    } else {
      // pulsing border in the cable's color so user knows where it goes
      const pulse = 0.5 + Math.sin(guanteState.sparkPhase + i * 2) * 0.3;
      ctx.strokeStyle = cable.color; ctx.globalAlpha = pulse; ctx.lineWidth = 2;
    }
    ctx.stroke(); ctx.globalAlpha = 1;
    // colored dot on right
    if (cable.connected) {
      ctx.fillStyle = cable.color;
    } else {
      // hollow colored circle
      ctx.strokeStyle = cable.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cable.to.x, cable.to.y, 7, 0, Math.PI * 2); ctx.stroke();
      // faint fill
      ctx.fillStyle = cable.color; ctx.globalAlpha = 0.2;
    }
    ctx.beginPath(); ctx.arc(cable.to.x, cable.to.y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    // label next to right dot
    ctx.fillStyle = cable.color; ctx.font = "bold 9px 'Space Mono', monospace"; ctx.textAlign = "right";
    ctx.fillText(cable.name, cable.to.x - 12, cable.to.y + 3);

    // ---- Cable line ----
    if (cable.connected) {
      ctx.strokeStyle = cable.color; ctx.lineWidth = 3; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(cable.from.x + 7, cable.from.y);
      ctx.bezierCurveTo(cable.from.x + 80, cable.from.y, cable.to.x - 80, cable.to.y, cable.to.x - 7, cable.to.y);
      ctx.stroke(); ctx.globalAlpha = 1;
      // connection sparks
      if (Math.sin(guanteState.sparkPhase + i * 2) > 0.7) {
        ctx.fillStyle = cable.color; ctx.globalAlpha = 0.8;
        for (let s = 0; s < 3; s++) {
          ctx.beginPath();
          ctx.arc(cable.to.x + (Math.random() - 0.5) * 10, cable.to.y + (Math.random() - 0.5) * 10,
            1 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    } else if (cable.grabbed && cable.grabEnd) {
      // dragging
      ctx.strokeStyle = cable.color; ctx.lineWidth = 3; ctx.globalAlpha = 0.7;
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(cable.from.x + 7, cable.from.y);
      ctx.lineTo(cable.grabEnd.x, cable.grabEnd.y); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = cable.color;
      ctx.beginPath(); ctx.arc(cable.grabEnd.x, cable.grabEnd.y, 5, 0, Math.PI * 2); ctx.fill();
      // draw arrow toward matching destination
      const dx = cable.to.x - cable.grabEnd.x, dy = cable.to.y - cable.grabEnd.y;
      const dd = Math.hypot(dx, dy);
      if (dd > 40) {
        const ax = cable.grabEnd.x + (dx / dd) * 25, ay = cable.grabEnd.y + (dy / dd) * 25;
        ctx.fillStyle = cable.color; ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.arc(ax, ay, 3, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else {
      // disconnected, dangling
      const dangle = Math.sin(guanteState.sparkPhase + i) * 8;
      ctx.strokeStyle = cable.color; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(cable.from.x + 7, cable.from.y);
      ctx.quadraticCurveTo(cable.from.x + 40, cable.from.y + 25 + dangle,
        cable.from.x + 60, cable.from.y + 18 + dangle);
      ctx.stroke(); ctx.globalAlpha = 1;
      // loose spark
      if (Math.random() > 0.92) {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(cable.from.x + 60 + (Math.random() - 0.5) * 6,
          cable.from.y + 18 + dangle + (Math.random() - 0.5) * 6,
          1 + Math.random(), 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  if (guanteState.completed) {
    guanteState.successAlpha = Math.min(guanteState.successAlpha + 0.02, 1);
    ctx.globalAlpha = guanteState.successAlpha;
    ctx.fillStyle = "#3ddc97"; ctx.font = "bold 14px 'Space Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText("SISTEMA ELECTRICO REPARADO", w / 2, h - 15);
    ctx.globalAlpha = 1;
    guanteState.particles = guanteState.particles.filter(p => p.life > 0);
    for (const p of guanteState.particles) {
      p.x += p.vx; p.y += p.vy; p.life -= 0.015;
      ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }

  // Status
  ctx.fillStyle = "#fff"; ctx.font = "bold 12px 'Space Mono', monospace"; ctx.textAlign = "left";
  ctx.fillText(`CABLES: ${guanteState.connectedCount}/3`, 10, 18);
  ctx.fillStyle = "#7c88a8"; ctx.font = "10px 'Space Mono', monospace"; ctx.textAlign = "center";
  if (guanteState.activeCable >= 0) {
    const ac = guanteState.cables[guanteState.activeCable];
    ctx.fillStyle = ac.color;
    ctx.fillText(`LLEVA ${ac.name} AL CONECTOR ${ac.name} →`, w / 2, h - 12);
  } else {
    ctx.fillText("PUNO CERRADO CERCA DE UN CABLE PARA AGARRAR", w / 2, h - 12);
  }

  drawHandCursor(ctx, guanteState.handPos, guanteState.grabbing, "#ffb347");
}

function updateGuanteGame(gesture, handPos) {
  if (!guanteState || guanteState.completed) return false;
  guanteState.handPos = handPos;
  const isGrab = gesture === "Closed_Fist";
  const isOpen = gesture === "Open_Palm";
  guanteState.grabbing = isGrab;

  if (!handPos) {
    if (guanteState.activeCable >= 0) {
      guanteState.cables[guanteState.activeCable].grabbed = false;
      guanteState.cables[guanteState.activeCable].grabEnd = null;
      guanteState.activeCable = -1;
    }
    return false;
  }

  if (guanteState.activeCable >= 0) {
    const cable = guanteState.cables[guanteState.activeCable];
    if (isGrab) {
      cable.grabEnd = { x: handPos.x, y: handPos.y };
    } else if (isOpen) {
      const dist = Math.hypot(handPos.x - cable.to.x, handPos.y - cable.to.y);
      if (dist < 35) {
        cable.connected = true; cable.grabbed = false; cable.grabEnd = null;
        guanteState.connectedCount++;
        window.AstroScout?.beep(520 + guanteState.connectedCount * 120, 0.08);
        if (guanteState.connectedCount >= 3) {
          guanteState.completed = true;
          window.AstroScout?.beep(880, 0.1);
          for (let i = 0; i < 20; i++) {
            const a = (Math.PI * 2 / 20) * i;
            guanteState.particles.push({
              x: handPos.x, y: handPos.y,
              vx: Math.cos(a) * (1 + Math.random() * 3),
              vy: Math.sin(a) * (1 + Math.random() * 3),
              life: 1, size: 2 + Math.random() * 3, color: "#3ddc97"
            });
          }
          return true;
        }
      } else { cable.grabbed = false; cable.grabEnd = null; }
      guanteState.activeCable = -1;
    }
  } else {
    if (isGrab) {
      for (let i = 0; i < guanteState.cables.length; i++) {
        const cable = guanteState.cables[i];
        if (cable.connected) continue;
        if (Math.hypot(handPos.x - cable.from.x, handPos.y - cable.from.y) < 45) {
          cable.grabbed = true;
          cable.grabEnd = { x: handPos.x, y: handPos.y };
          guanteState.activeCable = i;
          window.AstroScout?.beep(440, 0.04);
          break;
        }
      }
    }
  }
  return false;
}


/* ========================================================================
   MODO 1 — VALIDACION POR GESTO EN LA ESTACION (con mini-juegos)
   ======================================================================== */
let stVideo, stCanvas, stCtx, stRunning = false, stRaf = null, holdStart = null, confirmedFor = null;

// Stations that have custom mini-games (no generic drawRing)
const MINIGAME_STATIONS = ["casco", "brujula", "botiquin", "panel", "guante"];

function drawRing(progress, ok) {
  if (MINIGAME_STATIONS.includes(window.CURRENT_STATION)) return;
  const w = stCanvas.width, h = stCanvas.height;
  stCtx.clearRect(0, 0, w, h);
  if (progress <= 0) return;
  stCtx.beginPath();
  stCtx.arc(w - 34, 34, 20, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
  stCtx.strokeStyle = ok ? "#3ddc97" : "#4da6ff";
  stCtx.lineWidth = 5; stCtx.stroke();
}

function handleMinigame(station, gesture, res, statusEl) {
  if (!res.landmarks || !res.landmarks.length) {
    // No hand detected - still draw the current state
    if (station === "brujula" && brujulaState) { brujulaState.fingerPos = null; drawBrujulaGame(stCtx, stCanvas); }
    else if (station === "casco" && cascoState) { cascoState.handPos = null; drawCascoGame(stCtx, stCanvas); }
    else if (station === "botiquin" && botiquinState) { botiquinState.handPos = null; drawBotiquinGame(stCtx, stCanvas); }
    else if (station === "panel" && panelState) { panelState.handPos = null; drawPanelGame(stCtx, stCanvas); }
    else if (station === "guante" && guanteState) { guanteState.handPos = null; drawGuanteGame(stCtx, stCanvas); }
    return true; // handled
  }

  const lm = res.landmarks[0];
  const tipIdx = lm[8]; // index fingertip
  const palm = lm[9];   // palm center
  const fx = (1 - tipIdx.x) * stCanvas.width;
  const fy = tipIdx.y * stCanvas.height;
  const px = (1 - palm.x) * stCanvas.width;
  const py = palm.y * stCanvas.height;

  if (station === "brujula") {
    brujulaState.fingerPos = { x: fx, y: fy };
    if (gesture === "Pointing_Up") {
      brujulaShoot(fx, fy, stCanvas);
    }
    if (brujulaState.score >= brujulaState.needed && !brujulaState.completed) {
      brujulaState.completed = true;
      confirmedFor = window.CURRENT_STATION;
      statusEl.textContent = "OBJETIVOS COMPLETADOS";
      window.AstroScoutChatbot?.completeCurrentStation?.();
    }
    drawBrujulaGame(stCtx, stCanvas);
  } else if (station === "casco") {
    const done = updateCascoGame(gesture2, { x: px, y: py });
    if (done && confirmedFor !== window.CURRENT_STATION) {
      confirmedFor = window.CURRENT_STATION;
      statusEl.textContent = "CASCO ASEGURADO";
      window.AstroScoutChatbot?.completeCurrentStation?.();
    }
    drawCascoGame(stCtx, stCanvas);
  } else if (station === "botiquin") {
    const done = updateBotiquinGame(gesture2, { x: px, y: py });
    if (done && confirmedFor !== window.CURRENT_STATION) {
      confirmedFor = window.CURRENT_STATION;
      statusEl.textContent = "COMPANERO ESTABILIZADO";
      window.AstroScoutChatbot?.completeCurrentStation?.();
    }
    drawBotiquinGame(stCtx, stCanvas);
  } else if (station === "panel") {
    const done = updatePanelGame(gesture2, { x: px, y: py });
    if (done && confirmedFor !== window.CURRENT_STATION) {
      confirmedFor = window.CURRENT_STATION;
      statusEl.textContent = "TANQUE REPARADO";
      window.AstroScoutChatbot?.completeCurrentStation?.();
    }
    drawPanelGame(stCtx, stCanvas);
  } else if (station === "guante") {
    const done = updateGuanteGame(gesture2, { x: px, y: py });
    if (done && confirmedFor !== window.CURRENT_STATION) {
      confirmedFor = window.CURRENT_STATION;
      statusEl.textContent = "SISTEMA ELECTRICO REPARADO";
      window.AstroScoutChatbot?.completeCurrentStation?.();
    }
    drawGuanteGame(stCtx, stCanvas);
  }
  return true;
}

function stLoop(statusEl, readEl, confEl) {
  if (!stRunning) return;
  const now = performance.now();
  const expected = GESTURE_MAP[window.CURRENT_STATION];
  let matched = false;
  const station = window.CURRENT_STATION;

  if (expected && stVideo.readyState >= 2) {
    if (expected.type === "hand" && gestureRecognizer) {
      const res = gestureRecognizer.recognizeForVideo(stVideo, now);
      if (res.gestures && res.gestures.length) {
        const top = res.gestures[0][0];
        const lm = res.landmarks && res.landmarks[0];
        const resolved = resolveGesture(top, lm);
        if (readEl) readEl.textContent = "Detectado: " + (GESTURE_ES[resolved] || resolved);
        if (confEl) confEl.style.width = Math.round(top.score * 100) + "%";

        // Check if this station has a mini-game
        if (MINIGAME_STATIONS.includes(station)) {
          handleMinigame(station, resolved, res, statusEl);
          stRaf = requestAnimationFrame(() => stLoop(statusEl, readEl, confEl));
          return;
        }

        // Default gesture matching for stations without mini-games
        matched = resolved === expected.value;
        if (!matched && res.gestures[0].length > 1) {
          const alt = res.gestures[0][1];
          if (alt.categoryName === expected.value && alt.score > 0.25) matched = true;
        }
      } else {
        if (readEl) { readEl.textContent = "Detectado: —"; if (confEl) confEl.style.width = "0%"; }
        // Still draw mini-game even without gestures
        if (MINIGAME_STATIONS.includes(station)) {
          handleMinigame(station, null, { landmarks: [], gestures: [] }, statusEl);
          stRaf = requestAnimationFrame(() => stLoop(statusEl, readEl, confEl));
          return;
        }
      }
    } else if (expected.type === "face" && faceLandmarker) {
      const res = faceLandmarker.detectForVideo(stVideo, now);
      matched = detectSmile(res.faceBlendshapes);
      if (readEl) readEl.textContent = matched ? "Detectado: Sonrisa" : "Detectado: rostro neutro";
      if (confEl) confEl.style.width = matched ? "100%" : "20%";
    }
  }

  // Generic hold-based completion (for any stations not using mini-games)
  if (matched) {
    if (holdStart === null) holdStart = now;
    const elapsed = now - holdStart;
    drawRing(Math.min(elapsed / HOLD_MS, 1), false);
    if (elapsed >= HOLD_MS && confirmedFor !== window.CURRENT_STATION) {
      confirmedFor = window.CURRENT_STATION;
      drawRing(1, true);
      statusEl.textContent = "Gesto confirmado: " + expected.label;
      window.AstroScoutChatbot?.completeCurrentStation?.();
    }
  } else {
    holdStart = null;
    if (confirmedFor !== window.CURRENT_STATION) {
      drawRing(0, false);
      if (expected) statusEl.textContent = "Esperando gesto: " + expected.label + "...";
    }
  }
  stRaf = requestAnimationFrame(() => stLoop(statusEl, readEl, confEl));
}

async function startStationCamera(container) {
  const statusEl = container.querySelector("#tk-status");
  const readEl = container.querySelector("#tk-read");
  const confEl = container.querySelector("#tk-conf-fill");
  stVideo = container.querySelector("#tk-video");
  stCanvas = container.querySelector("#tk-canvas");
  stCtx = stCanvas.getContext("2d");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 360, height: 270 } });
    stVideo.srcObject = stream; await stVideo.play();
  } catch (e) { statusEl.textContent = "No se pudo acceder a la camara. Revisa los permisos."; return false; }

  const expected = GESTURE_MAP[window.CURRENT_STATION];
  try {
    if (expected?.type === "hand") await ensureGesture(statusEl);
    else await ensureFace(statusEl);
    await ensureGesture(statusEl);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error cargando modelos de deteccion.";
    return false;
  }

  stRunning = true; confirmedFor = null; holdStart = null;
  const station = window.CURRENT_STATION;

  // Init mini-games
  if (station === "brujula") { initBrujulaGame(stCanvas); statusEl.textContent = "Apunta con el indice y dispara a las estrellas"; }
  else if (station === "casco") { initCascoGame(stCanvas); statusEl.textContent = "Cierra el puno para agarrar el casco"; }
  else if (station === "botiquin") { initBotiquinGame(stCanvas); statusEl.textContent = "Indice arriba = pinza. Extrae los fragmentos"; }
  else if (station === "panel") { initPanelGame(stCanvas); statusEl.textContent = "Indice arriba = detector. Busca la grieta"; }
  else if (station === "guante") { initGuanteGame(stCanvas); statusEl.textContent = "Conecta cada cable al conector de su color"; }
  else { statusEl.textContent = "Camara activa. Realiza el gesto..."; }

  stLoop(statusEl, readEl, confEl);
  return true;
}

function stopStationCamera(container) {
  stRunning = false;
  if (stRaf) cancelAnimationFrame(stRaf);
  if (stVideo && stVideo.srcObject) stVideo.srcObject.getTracks().forEach(t => t.stop());
  const s = container?.querySelector("#tk-status"); if (s) s.textContent = "Camara apagada.";
  brujulaState = null; cascoState = null; botiquinState = null; panelState = null; guanteState = null;
}

function buildStationUI(container) {
  const expected = GESTURE_MAP[window.CURRENT_STATION];
  const station = window.CURRENT_STATION;
  let extraInstructions = "";
  if (station === "brujula") extraInstructions = "<br><small style='color:#4da6ff'>Apunta con el dedo indice a las estrellas para disparar.</small>";
  else if (station === "casco") extraInstructions = "<br><small style='color:#4da6ff'>Cierra el puno para agarrar el casco y llevalo a la cabeza del astronauta.</small>";
  else if (station === "botiquin") extraInstructions = "<br><small style='color:#3ddc97'>3 pasos: extraer fragmentos (indice=pinza), inyectar (puno+pulgar arriba), vendar (mano abierta desliza).</small>";
  else if (station === "panel") extraInstructions = "<br><small style='color:#8a7dff'>3 pasos: escanear grieta (indice=detector), soldar (puno sigue linea), reconectar manguera (puno+victoria).</small>";
  else if (station === "guante") extraInstructions = "<br><small style='color:#ff6fae'>Agarra cable (puno) y llevalo al conector del MISMO COLOR. Mano abierta suelta.</small>";

  container.innerHTML = `
    <div class="tk-wrap">
      <div class="tk-expected">${expected ? "MISION: " + expected.label.toUpperCase() : ""}${extraInstructions}</div>
      <div class="tk-stage">
        <video id="tk-video" muted playsinline></video>
        <canvas id="tk-canvas" width="360" height="270"></canvas>
      </div>
      <div class="tk-conf"><div class="tk-conf-fill" id="tk-conf-fill"></div></div>
      <div class="tk-gesture-read" id="tk-read"></div>
      <div class="tk-status" id="tk-status">Camara apagada.</div>
      <div class="tk-controls">
        <button class="ai-btn" id="tk-start">Activar camara</button>
      </div>
    </div>`;
  const startBtn = container.querySelector("#tk-start");
  startBtn.addEventListener("click", async () => {
    if (!stRunning) {
      startBtn.textContent = "... iniciando";
      const ok = await startStationCamera(container);
      startBtn.textContent = ok ? "Apagar camara" : "Activar camara";
    } else {
      stopStationCamera(container);
      startBtn.textContent = "Activar camara";
    }
  });
}

/* ========================================================================
   MODO 2 — NAVEGACION CON LA MANO EN EL PANEL (HUB)
   ======================================================================== */
let navVideo, navRunning = false, navRaf = null, cursorEl, hintEl, pinchStart = null, focusedCard = null;

function ensureNavOverlay() {
  if (!cursorEl) { cursorEl = document.createElement("div"); cursorEl.className = "hand-cursor"; document.body.appendChild(cursorEl); }
  if (!hintEl) { hintEl = document.createElement("div"); hintEl.className = "hand-hint"; document.body.appendChild(hintEl); }
  if (!navVideo) {
    navVideo = document.createElement("video"); navVideo.muted = true; navVideo.playsInline = true;
    navVideo.style.cssText = "position:fixed;left:16px;bottom:16px;width:150px;border:1px solid var(--line);border-radius:10px;transform:scaleX(-1);z-index:60;background:#000;";
    document.body.appendChild(navVideo);
  }
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function navLoop() {
  if (!navRunning) return;
  const now = performance.now();
  if (navVideo.readyState >= 2 && gestureRecognizer) {
    const res = gestureRecognizer.recognizeForVideo(navVideo, now);
    if (res.landmarks && res.landmarks.length) {
      const lm = res.landmarks[0];
      const tip = lm[8], thumb = lm[4];
      const x = (1 - tip.x) * window.innerWidth;
      const y = tip.y * window.innerHeight;
      cursorEl.style.display = "block"; cursorEl.style.left = x + "px"; cursorEl.style.top = y + "px";
      cursorEl.style.pointerEvents = "none";
      const el = document.elementFromPoint(x, y);
      const card = el ? el.closest(".station-card") : null;
      if (card !== focusedCard) {
        document.querySelectorAll(".station-card.hand-focus").forEach(c => c.classList.remove("hand-focus"));
        if (card && !card.classList.contains("locked")) { card.classList.add("hand-focus"); window.AstroScout?.beep(560, 0.04); }
        focusedCard = card;
      }
      const pinching = dist(tip, thumb) < 0.08;
      cursorEl.classList.toggle("pinch", pinching);
      if (pinching && focusedCard && !focusedCard.classList.contains("locked")) {
        if (pinchStart === null) pinchStart = now;
        hintEl.textContent = "Seleccionando " + (focusedCard.querySelector(".station-name")?.textContent || "");
        if (now - pinchStart > 350) {
          const key = focusedCard.dataset.key;
          stopHandNav(); window.AstroScout?.beep(880, 0.1); window.AstroScout?.navigateTo(key); return;
        }
      } else { pinchStart = null; hintEl.textContent = "Mueve el indice - junta pulgar e indice para seleccionar"; }
    } else { cursorEl.style.display = "none"; hintEl.textContent = "Muestra tu mano a la camara..."; }
  }
  navRaf = requestAnimationFrame(navLoop);
}

async function startHandNav() {
  ensureNavOverlay(); hintEl.style.display = "block"; hintEl.textContent = "Cargando camara...";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
    navVideo.srcObject = stream; await navVideo.play();
  } catch (e) { hintEl.textContent = "No se pudo acceder a la camara."; return; }
  navVideo.style.display = "block"; await ensureGesture(null);
  navRunning = true; pinchStart = null; focusedCard = null; navLoop();
  window.AstroScout?.toast("NAVEGACION CON LA MANO", "Apunta a una estacion y pellizca para entrar.", "amber");
}

function stopHandNav() {
  navRunning = false; if (navRaf) cancelAnimationFrame(navRaf);
  if (navVideo && navVideo.srcObject) navVideo.srcObject.getTracks().forEach(t => t.stop());
  if (navVideo) navVideo.style.display = "none";
  if (cursorEl) cursorEl.style.display = "none";
  if (hintEl) hintEl.style.display = "none";
  document.querySelectorAll(".station-card.hand-focus").forEach(c => c.classList.remove("hand-focus"));
  const btn = document.getElementById("btn-handnav"); if (btn) btn.textContent = "Navegar con la mano";
}

/* ---------------------------- INTEGRACION ------------------------------- */
function initStationTracking() {
  const container = document.getElementById("tracking-widget");
  if (!container) return;
  stopStationCamera(container);
  buildStationUI(container);
}

window.AstroScoutTracking = {
  init: initStationTracking, startHandNav, stopHandNav,
  toggleHandNav: () => {
    const btn = document.getElementById("btn-handnav");
    if (navRunning) { stopHandNav(); }
    else { startHandNav(); if (btn) btn.textContent = "Detener mano"; }
  }
};

document.addEventListener("astro:station", initStationTracking);
document.addEventListener("astro:hub", () => stopStationCamera(document.getElementById("tracking-widget")));
