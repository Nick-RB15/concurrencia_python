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
   Escenario: Un companero sufrio una herida por radiacion/impacto.
   3 pasos: 1) Limpiar herida (mano abierta sobre zona), 2) Aplicar
   medicina (puno cerrado = inyeccion), 3) Vendar (mano abierta desliza).
   ======================================================================== */
let botiquinState = null;

function initBotiquinGame(canvas) {
  const w = canvas.width, h = canvas.height;
  botiquinState = {
    step: 0,     // 0=limpiar, 1=medicina, 2=vendar, 3=done
    steps: [
      { label: "LIMPIAR HERIDA", gesture: "Open_Palm", desc: "Mano abierta sobre la herida", zone: { x: w * 0.5, y: h * 0.45, r: 40 }, holdTime: 0, holdNeeded: 1500, color: "#4da6ff" },
      { label: "APLICAR MEDICINA", gesture: "Closed_Fist", desc: "Puno cerrado = inyeccion", zone: { x: w * 0.5, y: h * 0.45, r: 40 }, holdTime: 0, holdNeeded: 1200, color: "#3ddc97" },
      { label: "VENDAR", gesture: "Open_Palm", desc: "Mano abierta, desliza sobre la herida", zone: { x: w * 0.5, y: h * 0.45, r: 50 }, holdTime: 0, holdNeeded: 1800, color: "#ffb347" }
    ],
    handPos: null, completed: false, heartbeat: 0,
    particles: [], successAlpha: 0,
    patientPulse: 0
  };
}

function drawBotiquinGame(ctx, canvas) {
  if (!botiquinState) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  botiquinState.patientPulse += 0.04;

  // Draw patient (crewmate lying down)
  drawPatient(ctx, w * 0.5, h * 0.5, w, h);

  if (botiquinState.step >= 3) {
    // Done - patient healed
    botiquinState.successAlpha = Math.min(botiquinState.successAlpha + 0.02, 1);
    ctx.globalAlpha = botiquinState.successAlpha;
    ctx.fillStyle = "#3ddc97"; ctx.font = "bold 14px 'Space Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText("COMPANERO ESTABILIZADO", w / 2, h - 15);
    // green glow over patient
    ctx.fillStyle = "rgba(61,220,151,0.15)";
    ctx.beginPath(); ctx.arc(w * 0.5, h * 0.45, 50, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // draw particles
    botiquinState.particles = botiquinState.particles.filter(p => p.life > 0);
    for (const p of botiquinState.particles) {
      p.x += p.vx; p.y += p.vy; p.life -= 0.02;
      ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }

  const currentStep = botiquinState.steps[botiquinState.step];

  // Draw wound zone
  const zone = currentStep.zone;
  const woundPulse = 1 + Math.sin(botiquinState.patientPulse * 2) * 0.1;
  if (botiquinState.step === 0) {
    // wound - red glow
    ctx.fillStyle = "rgba(255,80,80,0.2)";
    ctx.beginPath(); ctx.arc(zone.x, zone.y, zone.r * woundPulse, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,80,80,0.6)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(zone.x, zone.y, zone.r, 0, Math.PI * 2); ctx.stroke();
  } else if (botiquinState.step === 1) {
    // cleaned, needs medicine - yellow
    ctx.fillStyle = "rgba(255,179,71,0.15)";
    ctx.beginPath(); ctx.arc(zone.x, zone.y, zone.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,179,71,0.6)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(zone.x, zone.y, zone.r, 0, Math.PI * 2); ctx.stroke();
  } else {
    // medicated, needs bandage - blue
    ctx.fillStyle = "rgba(77,166,255,0.15)";
    ctx.beginPath(); ctx.arc(zone.x, zone.y, zone.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(77,166,255,0.6)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(zone.x, zone.y, zone.r, 0, Math.PI * 2); ctx.stroke();
  }

  // Draw step progress bar
  const prog = currentStep.holdTime / currentStep.holdNeeded;
  drawProgressBar(ctx, w * 0.15, h - 35, w * 0.7, 10, prog, currentStep.color);

  // Step label and instruction
  ctx.fillStyle = "#fff"; ctx.font = "bold 12px 'Space Mono', monospace"; ctx.textAlign = "left";
  ctx.fillText(`PASO ${botiquinState.step + 1}/3: ${currentStep.label}`, 10, 18);
  ctx.fillStyle = currentStep.color; ctx.font = "10px 'Space Mono', monospace";
  ctx.fillText(currentStep.desc, 10, 32);

  // Step indicators (top-right)
  for (let i = 0; i < 3; i++) {
    const sx = w - 70 + i * 22, sy = 14;
    ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2);
    if (i < botiquinState.step) { ctx.fillStyle = "#3ddc97"; ctx.fill(); }
    else if (i === botiquinState.step) { ctx.fillStyle = currentStep.color; ctx.fill(); }
    else { ctx.strokeStyle = "#233052"; ctx.lineWidth = 1.5; ctx.stroke(); }
  }

  // Hand cursor
  drawHandCursor(ctx, botiquinState.handPos, prog > 0, currentStep.color);
}

function drawPatient(ctx, cx, cy, w, h) {
  ctx.save();
  // body outline (lying crewmate seen from above/front)
  ctx.fillStyle = "#1a2540"; ctx.strokeStyle = "#4da6ff"; ctx.lineWidth = 1;
  // torso
  ctx.beginPath(); ctx.roundRect(cx - 35, cy - 25, 70, 55, 6); ctx.fill(); ctx.stroke();
  // head
  ctx.beginPath(); ctx.arc(cx, cy - 38, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // visor on helmet
  ctx.fillStyle = "rgba(77,166,255,0.4)";
  ctx.beginPath(); ctx.arc(cx, cy - 36, 9, 0, Math.PI * 2); ctx.fill();
  // arms
  ctx.fillStyle = "#1a2540";
  ctx.beginPath(); ctx.roundRect(cx - 50, cy - 15, 14, 40, 4); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(cx + 36, cy - 15, 14, 40, 4); ctx.fill(); ctx.stroke();
  // wound indicator (red cross)
  ctx.strokeStyle = "rgba(255,80,80,0.7)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8); ctx.stroke();
  // label
  ctx.fillStyle = "#7c88a8"; ctx.font = "8px 'Space Mono', monospace"; ctx.textAlign = "center";
  ctx.fillText("TRIPULANTE HERIDO", cx, cy + 45);
  ctx.restore();
}

function updateBotiquinGame(gesture, handPos) {
  if (!botiquinState || botiquinState.completed || botiquinState.step >= 3) return false;
  botiquinState.handPos = handPos;

  const currentStep = botiquinState.steps[botiquinState.step];
  const gestureMatch = gesture === currentStep.gesture;

  if (gestureMatch && handPos) {
    const zone = currentStep.zone;
    const dist = Math.hypot(handPos.x - zone.x, handPos.y - zone.y);
    if (dist < zone.r + 25) {
      currentStep.holdTime += 16.67; // ~60fps
      if (currentStep.holdTime >= currentStep.holdNeeded) {
        botiquinState.step++;
        window.AstroScout?.beep(520 + botiquinState.step * 120, 0.08);
        if (botiquinState.step >= 3) {
          botiquinState.completed = true;
          // success particles
          for (let i = 0; i < 20; i++) {
            const a = (Math.PI * 2 / 20) * i;
            botiquinState.particles.push({
              x: zone.x, y: zone.y, vx: Math.cos(a) * (1 + Math.random() * 2),
              vy: Math.sin(a) * (1 + Math.random() * 2), life: 1,
              size: 2 + Math.random() * 3, color: "#3ddc97"
            });
          }
          return true;
        }
      }
    } else {
      currentStep.holdTime = Math.max(0, currentStep.holdTime - 8);
    }
  } else {
    currentStep.holdTime = Math.max(0, currentStep.holdTime - 8);
  }
  return false;
}

/* ========================================================================
   MINI-JUEGO PANEL O2 — Repara el tanque de oxigeno danado
   Escenario: El tanque tiene una fuga. 3 pasos:
   1) Localizar fuga (mover mano abierta hasta encontrarla),
   2) Sellar fuga (puno cerrado sostenido sobre la fuga),
   3) Reconectar tanque (mano abierta sobre la conexion).
   ======================================================================== */
let panelState = null;

function initPanelGame(canvas) {
  const w = canvas.width, h = canvas.height;
  panelState = {
    step: 0,  // 0=localizar, 1=sellar, 2=reconectar, 3=done
    leakPos: { x: w * 0.35 + Math.random() * w * 0.3, y: h * 0.3 + Math.random() * h * 0.2 },
    connectPos: { x: w * 0.5, y: h * 0.72 },
    handPos: null, holdTime: 0, completed: false,
    bubbles: [], scanRadius: 0, scanFound: false,
    sealProgress: 0, connectProgress: 0,
    gasPulse: 0, successAlpha: 0,
    particles: []
  };
  // generate initial leak bubbles
  for (let i = 0; i < 5; i++) {
    panelState.bubbles.push(createBubble(panelState.leakPos));
  }
}

function createBubble(origin) {
  return {
    x: origin.x + (Math.random() - 0.5) * 20,
    y: origin.y,
    vx: (Math.random() - 0.5) * 1.5,
    vy: -(1 + Math.random() * 2),
    r: 2 + Math.random() * 4,
    life: 1
  };
}

function drawPanelGame(ctx, canvas) {
  if (!panelState) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  panelState.gasPulse += 0.04;

  // Draw O2 tank
  drawO2Tank(ctx, w * 0.5, h * 0.42, w, h);

  if (panelState.step >= 3) {
    panelState.successAlpha = Math.min(panelState.successAlpha + 0.02, 1);
    ctx.globalAlpha = panelState.successAlpha;
    ctx.fillStyle = "#3ddc97"; ctx.font = "bold 14px 'Space Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText("TANQUE REPARADO", w / 2, h - 15);
    // green glow
    ctx.fillStyle = "rgba(61,220,151,0.1)";
    ctx.beginPath(); ctx.arc(w * 0.5, h * 0.42, 60, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    // particles
    panelState.particles = panelState.particles.filter(p => p.life > 0);
    for (const p of panelState.particles) {
      p.x += p.vx; p.y += p.vy; p.life -= 0.015;
      ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }

  // Draw leak bubbles (steps 0 and 1)
  if (panelState.step < 2) {
    panelState.bubbles = panelState.bubbles.filter(b => b.life > 0);
    while (panelState.bubbles.length < 6) panelState.bubbles.push(createBubble(panelState.leakPos));
    for (const b of panelState.bubbles) {
      b.x += b.vx; b.y += b.vy; b.life -= 0.01;
      ctx.globalAlpha = b.life * 0.6;
      ctx.strokeStyle = "#4da6ff"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Step 0: scan for leak
  if (panelState.step === 0) {
    if (panelState.scanFound) {
      // Show found leak
      const lp = panelState.leakPos;
      const pulse = 1 + Math.sin(panelState.gasPulse * 3) * 0.2;
      ctx.strokeStyle = "rgba(255,80,80,0.8)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(lp.x, lp.y, 18 * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(255,80,80,0.15)";
      ctx.beginPath(); ctx.arc(lp.x, lp.y, 18, 0, Math.PI * 2); ctx.fill();
    }
    // scan ring from hand
    if (panelState.handPos) {
      ctx.strokeStyle = "rgba(77,166,255,0.3)"; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(panelState.handPos.x, panelState.handPos.y, 35, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = "#ffb347"; ctx.font = "11px 'Space Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText("MUEVE LA MANO PARA ENCONTRAR LA FUGA", w / 2, h - 12);
  }

  // Step 1: seal leak
  if (panelState.step === 1) {
    const lp = panelState.leakPos;
    ctx.strokeStyle = "rgba(255,80,80,0.6)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(lp.x, lp.y, 18, 0, Math.PI * 2); ctx.stroke();
    drawProgressBar(ctx, w * 0.15, h - 35, w * 0.7, 10, panelState.sealProgress / 1500, "#ff6b6b");
    ctx.fillStyle = "#ff6b6b"; ctx.font = "11px 'Space Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText("PUNO CERRADO SOBRE LA FUGA PARA SELLAR", w / 2, h - 12);
  }

  // Step 2: reconnect
  if (panelState.step === 2) {
    const cp = panelState.connectPos;
    ctx.setLineDash([5, 5]); ctx.strokeStyle = "rgba(61,220,151,0.6)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cp.x, cp.y, 25, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "rgba(61,220,151,0.1)";
    ctx.beginPath(); ctx.arc(cp.x, cp.y, 25, 0, Math.PI * 2); ctx.fill();
    drawProgressBar(ctx, w * 0.15, h - 35, w * 0.7, 10, panelState.connectProgress / 1200, "#3ddc97");
    ctx.fillStyle = "#3ddc97"; ctx.font = "11px 'Space Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText("MANO ABIERTA SOBRE LA CONEXION", w / 2, h - 12);
  }

  // Step label
  const stepLabels = ["LOCALIZAR FUGA", "SELLAR FUGA", "RECONECTAR"];
  ctx.fillStyle = "#fff"; ctx.font = "bold 12px 'Space Mono', monospace"; ctx.textAlign = "left";
  ctx.fillText(`PASO ${panelState.step + 1}/3: ${stepLabels[panelState.step]}`, 10, 18);

  // Step indicators
  for (let i = 0; i < 3; i++) {
    const sx = w - 70 + i * 22, sy = 14;
    ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2);
    if (i < panelState.step) { ctx.fillStyle = "#3ddc97"; ctx.fill(); }
    else if (i === panelState.step) { ctx.fillStyle = "#4da6ff"; ctx.fill(); }
    else { ctx.strokeStyle = "#233052"; ctx.lineWidth = 1.5; ctx.stroke(); }
  }

  drawHandCursor(ctx, panelState.handPos, false);
}

function drawO2Tank(ctx, cx, cy, w, h) {
  ctx.save();
  // Tank body (cylindrical)
  ctx.fillStyle = "#1a2540";
  ctx.beginPath(); ctx.roundRect(cx - 30, cy - 45, 60, 90, 12); ctx.fill();
  ctx.strokeStyle = "#4da6ff"; ctx.lineWidth = 1.5; ctx.stroke();
  // Top valve
  ctx.fillStyle = "#233052";
  ctx.beginPath(); ctx.roundRect(cx - 10, cy - 55, 20, 14, 4); ctx.fill();
  ctx.strokeStyle = "#4da6ff"; ctx.stroke();
  // O2 label
  ctx.fillStyle = "#4da6ff"; ctx.font = "bold 16px 'Space Mono', monospace"; ctx.textAlign = "center";
  ctx.fillText("O\u2082", cx, cy + 5);
  // Pressure gauge
  ctx.strokeStyle = "#233052"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy + 25, 10, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "#ff6b6b"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, cy + 25); ctx.lineTo(cx + 6, cy + 20); ctx.stroke();
  // connection port at bottom
  ctx.fillStyle = "#233052";
  ctx.beginPath(); ctx.roundRect(cx - 12, cy + 45, 24, 10, 3); ctx.fill();
  ctx.strokeStyle = "#4da6ff"; ctx.stroke();
  ctx.restore();
}

function updatePanelGame(gesture, handPos) {
  if (!panelState || panelState.completed) return false;
  panelState.handPos = handPos;
  if (!handPos) return false;

  if (panelState.step === 0) {
    // Scan for leak with open palm
    if (gesture === "Open_Palm") {
      const dist = Math.hypot(handPos.x - panelState.leakPos.x, handPos.y - panelState.leakPos.y);
      if (dist < 40) {
        if (!panelState.scanFound) {
          panelState.scanFound = true;
          window.AstroScout?.beep(880, 0.06);
        }
        panelState.holdTime += 16.67;
        if (panelState.holdTime > 800) {
          panelState.step = 1; panelState.holdTime = 0;
          window.AstroScout?.beep(600, 0.08);
        }
      }
    }
  } else if (panelState.step === 1) {
    // Seal with closed fist
    if (gesture === "Closed_Fist") {
      const dist = Math.hypot(handPos.x - panelState.leakPos.x, handPos.y - panelState.leakPos.y);
      if (dist < 40) {
        panelState.sealProgress += 16.67;
        if (panelState.sealProgress >= 1500) {
          panelState.step = 2;
          window.AstroScout?.beep(700, 0.08);
        }
      } else { panelState.sealProgress = Math.max(0, panelState.sealProgress - 8); }
    } else { panelState.sealProgress = Math.max(0, panelState.sealProgress - 8); }
  } else if (panelState.step === 2) {
    // Reconnect with open palm
    if (gesture === "Open_Palm") {
      const dist = Math.hypot(handPos.x - panelState.connectPos.x, handPos.y - panelState.connectPos.y);
      if (dist < 40) {
        panelState.connectProgress += 16.67;
        if (panelState.connectProgress >= 1200) {
          panelState.step = 3; panelState.completed = true;
          window.AstroScout?.beep(880, 0.1);
          // success particles
          for (let i = 0; i < 20; i++) {
            const a = (Math.PI * 2 / 20) * i;
            panelState.particles.push({
              x: panelState.connectPos.x, y: panelState.connectPos.y,
              vx: Math.cos(a) * (1 + Math.random() * 2),
              vy: Math.sin(a) * (1 + Math.random() * 2),
              life: 1, size: 2 + Math.random() * 3, color: "#3ddc97"
            });
          }
          return true;
        }
      } else { panelState.connectProgress = Math.max(0, panelState.connectProgress - 8); }
    } else { panelState.connectProgress = Math.max(0, panelState.connectProgress - 8); }
  }
  return false;
}

/* ========================================================================
   MINI-JUEGO GUANTE — Repara el sistema electrico de la nave
   Escenario: Cables desconectados en el panel electrico. El jugador debe
   conectar 3 pares de cables llevando la mano de un extremo al otro.
   Puno para agarrar el cable, mano abierta para soltar/conectar.
   ======================================================================== */
let guanteState = null;

function initGuanteGame(canvas) {
  const w = canvas.width, h = canvas.height;
  const colors = ["#ff6b6b", "#3ddc97", "#ffb347"];
  const cables = [];
  for (let i = 0; i < 3; i++) {
    cables.push({
      color: colors[i],
      from: { x: 50, y: 55 + i * 65 },
      to: { x: w - 50, y: 55 + i * 65 + (Math.random() - 0.5) * 40 },
      connected: false,
      grabbed: false,
      grabEnd: null  // the loose end position while dragging
    });
  }
  guanteState = {
    cables, handPos: null, grabbing: false,
    activeCable: -1, completed: false,
    connectedCount: 0, sparkPhase: 0,
    sparks: [], successAlpha: 0, particles: []
  };
}

function drawGuanteGame(ctx, canvas) {
  if (!guanteState) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  guanteState.sparkPhase += 0.06;

  // Draw panel background
  ctx.fillStyle = "rgba(15,22,38,0.6)";
  ctx.beginPath(); ctx.roundRect(20, 20, w - 40, h - 40, 10); ctx.fill();
  ctx.strokeStyle = "#233052"; ctx.lineWidth = 1; ctx.stroke();
  // Panel label
  ctx.fillStyle = "#7c88a8"; ctx.font = "9px 'Space Mono', monospace"; ctx.textAlign = "center";
  ctx.fillText("PANEL ELECTRICO - NAVE", w / 2, 38);

  // Draw cables
  for (let i = 0; i < guanteState.cables.length; i++) {
    const cable = guanteState.cables[i];
    // left connector (fixed)
    ctx.fillStyle = "#233052";
    ctx.beginPath(); ctx.roundRect(cable.from.x - 15, cable.from.y - 10, 20, 20, 4); ctx.fill();
    ctx.fillStyle = cable.color;
    ctx.beginPath(); ctx.arc(cable.from.x, cable.from.y, 6, 0, Math.PI * 2); ctx.fill();

    // right connector (target)
    ctx.fillStyle = "#233052";
    ctx.beginPath(); ctx.roundRect(cable.to.x - 5, cable.to.y - 10, 20, 20, 4); ctx.fill();
    if (cable.connected) {
      ctx.fillStyle = cable.color;
    } else {
      ctx.fillStyle = "#555";
    }
    ctx.beginPath(); ctx.arc(cable.to.x, cable.to.y, 6, 0, Math.PI * 2); ctx.fill();

    // Draw cable line
    if (cable.connected) {
      // connected cable: straight line
      ctx.strokeStyle = cable.color; ctx.lineWidth = 3; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(cable.from.x, cable.from.y); ctx.lineTo(cable.to.x, cable.to.y); ctx.stroke();
      ctx.globalAlpha = 1;
      // sparks at connection point
      if (Math.sin(guanteState.sparkPhase + i * 2) > 0.7) {
        ctx.fillStyle = cable.color; ctx.globalAlpha = 0.8;
        for (let s = 0; s < 3; s++) {
          ctx.beginPath();
          ctx.arc(cable.to.x + (Math.random() - 0.5) * 10, cable.to.y + (Math.random() - 0.5) * 10,
            1 + Math.random() * 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    } else if (cable.grabbed && cable.grabEnd) {
      // being dragged
      ctx.strokeStyle = cable.color; ctx.lineWidth = 3; ctx.globalAlpha = 0.7;
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(cable.from.x, cable.from.y);
      ctx.lineTo(cable.grabEnd.x, cable.grabEnd.y); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      // cable end follows hand
      ctx.fillStyle = cable.color;
      ctx.beginPath(); ctx.arc(cable.grabEnd.x, cable.grabEnd.y, 5, 0, Math.PI * 2); ctx.fill();
    } else {
      // disconnected, dangling
      const dangle = Math.sin(guanteState.sparkPhase + i) * 8;
      ctx.strokeStyle = cable.color; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(cable.from.x, cable.from.y);
      ctx.quadraticCurveTo(cable.from.x + 40, cable.from.y + 30 + dangle,
        cable.from.x + 60, cable.from.y + 20 + dangle);
      ctx.stroke(); ctx.globalAlpha = 1;
      // loose end spark
      if (Math.random() > 0.92) {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(cable.from.x + 60 + (Math.random() - 0.5) * 6,
          cable.from.y + 20 + dangle + (Math.random() - 0.5) * 6,
          1 + Math.random(), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Cable label
    ctx.fillStyle = cable.color; ctx.font = "8px 'Space Mono', monospace"; ctx.textAlign = "left";
    ctx.fillText(`CABLE ${i + 1}`, cable.from.x + 10, cable.from.y - 15);
  }

  if (guanteState.completed) {
    guanteState.successAlpha = Math.min(guanteState.successAlpha + 0.02, 1);
    ctx.globalAlpha = guanteState.successAlpha;
    ctx.fillStyle = "#3ddc97"; ctx.font = "bold 14px 'Space Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText("SISTEMA ELECTRICO REPARADO", w / 2, h - 15);
    ctx.globalAlpha = 1;
    // particles
    guanteState.particles = guanteState.particles.filter(p => p.life > 0);
    for (const p of guanteState.particles) {
      p.x += p.vx; p.y += p.vy; p.life -= 0.015;
      ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }

  // Status bar
  ctx.fillStyle = "#fff"; ctx.font = "bold 12px 'Space Mono', monospace"; ctx.textAlign = "left";
  ctx.fillText(`CABLES: ${guanteState.connectedCount}/3`, 10, 18);
  ctx.fillStyle = "#7c88a8"; ctx.font = "10px 'Space Mono', monospace";
  const hint = guanteState.activeCable >= 0
    ? "LLEVA EL CABLE AL CONECTOR DERECHO"
    : "PUNO CERRADO CERCA DE UN CABLE PARA AGARRAR";
  ctx.textAlign = "center"; ctx.fillText(hint, w / 2, h - 12);

  // Hand cursor
  drawHandCursor(ctx, guanteState.handPos, guanteState.grabbing, "#ffb347");
}

function updateGuanteGame(gesture, handPos) {
  if (!guanteState || guanteState.completed) return false;
  guanteState.handPos = handPos;
  const isGrab = gesture === "Closed_Fist";
  const isOpen = gesture === "Open_Palm";
  guanteState.grabbing = isGrab;

  if (!handPos) {
    // release if no hand
    if (guanteState.activeCable >= 0) {
      guanteState.cables[guanteState.activeCable].grabbed = false;
      guanteState.cables[guanteState.activeCable].grabEnd = null;
      guanteState.activeCable = -1;
    }
    return false;
  }

  if (guanteState.activeCable >= 0) {
    // Currently dragging a cable
    const cable = guanteState.cables[guanteState.activeCable];
    if (isGrab) {
      // keep dragging
      cable.grabEnd = { x: handPos.x, y: handPos.y };
    } else if (isOpen) {
      // release - check if near target
      const dist = Math.hypot(handPos.x - cable.to.x, handPos.y - cable.to.y);
      if (dist < 35) {
        cable.connected = true;
        cable.grabbed = false;
        cable.grabEnd = null;
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
      } else {
        cable.grabbed = false;
        cable.grabEnd = null;
      }
      guanteState.activeCable = -1;
    }
  } else {
    // Not dragging - check for grab near cable starts
    if (isGrab) {
      for (let i = 0; i < guanteState.cables.length; i++) {
        const cable = guanteState.cables[i];
        if (cable.connected) continue;
        const dist = Math.hypot(handPos.x - cable.from.x, handPos.y - cable.from.y);
        if (dist < 45) {
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
  const top = res.gestures[0][0];
  const tipIdx = lm[8]; // index fingertip
  const palm = lm[9];   // palm center
  const fx = (1 - tipIdx.x) * stCanvas.width;
  const fy = tipIdx.y * stCanvas.height;
  const px = (1 - palm.x) * stCanvas.width;
  const py = palm.y * stCanvas.height;

  if (station === "brujula") {
    brujulaState.fingerPos = { x: fx, y: fy };
    if (top.categoryName === "Pointing_Up" && top.score > DETECTION_THRESHOLD) {
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
    const done = updateCascoGame(top.categoryName, { x: px, y: py });
    if (done && confirmedFor !== window.CURRENT_STATION) {
      confirmedFor = window.CURRENT_STATION;
      statusEl.textContent = "CASCO ASEGURADO";
      window.AstroScoutChatbot?.completeCurrentStation?.();
    }
    drawCascoGame(stCtx, stCanvas);
  } else if (station === "botiquin") {
    const done = updateBotiquinGame(top.categoryName, { x: px, y: py });
    if (done && confirmedFor !== window.CURRENT_STATION) {
      confirmedFor = window.CURRENT_STATION;
      statusEl.textContent = "COMPANERO ESTABILIZADO";
      window.AstroScoutChatbot?.completeCurrentStation?.();
    }
    drawBotiquinGame(stCtx, stCanvas);
  } else if (station === "panel") {
    const done = updatePanelGame(top.categoryName, { x: px, y: py });
    if (done && confirmedFor !== window.CURRENT_STATION) {
      confirmedFor = window.CURRENT_STATION;
      statusEl.textContent = "TANQUE REPARADO";
      window.AstroScoutChatbot?.completeCurrentStation?.();
    }
    drawPanelGame(stCtx, stCanvas);
  } else if (station === "guante") {
    const done = updateGuanteGame(top.categoryName, { x: px, y: py });
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
        if (readEl) readEl.textContent = "Detectado: " + (GESTURE_ES[top.categoryName] || top.categoryName);
        if (confEl) confEl.style.width = Math.round(top.score * 100) + "%";

        // Check if this station has a mini-game
        if (MINIGAME_STATIONS.includes(station)) {
          handleMinigame(station, top.categoryName, res, statusEl);
          stRaf = requestAnimationFrame(() => stLoop(statusEl, readEl, confEl));
          return;
        }

        // Default gesture matching for stations without mini-games
        matched = top.categoryName === expected.value && top.score > DETECTION_THRESHOLD;
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
  else if (station === "botiquin") { initBotiquinGame(stCanvas); statusEl.textContent = "Cura al companero: paso 1 - limpia la herida"; }
  else if (station === "panel") { initPanelGame(stCanvas); statusEl.textContent = "Localiza la fuga con la mano abierta"; }
  else if (station === "guante") { initGuanteGame(stCanvas); statusEl.textContent = "Agarra los cables y conectalos"; }
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
  else if (station === "botiquin") extraInstructions = "<br><small style='color:#3ddc97'>3 pasos: limpiar herida (mano abierta), aplicar medicina (puno), vendar (mano abierta).</small>";
  else if (station === "panel") extraInstructions = "<br><small style='color:#8a7dff'>Localiza la fuga, sellala con el puno, y reconecta el tanque.</small>";
  else if (station === "guante") extraInstructions = "<br><small style='color:#ff6fae'>Agarra cada cable (puno) y llevalo al conector (mano abierta para soltar).</small>";

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
