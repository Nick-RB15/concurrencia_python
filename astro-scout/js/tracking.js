/* =========================================================================
   ASTRO SCOUT — TRACKING DE GESTOS (MediaPipe, 100% en el navegador)
   -------------------------------------------------------------------------
   Dos modos:
   1) NAVEGACION CON LA MANO (en el panel principal): mueve un cursor con el
      dedo indice sobre las tarjetas y "pellizca" (pulgar+indice) para
      SELECCIONAR una estacion.
   2) VALIDACION POR GESTO (dentro de cada estacion): detecta el gesto
      esperado y, al sostenerlo, completa la estacion.
      - Brujula: mini-juego de disparos con el dedo indice.
      - Casco: agarra visualmente el casco y ponlo en el traje de astronauta.
      - Resto: deteccion clasica de gesto sostenido.

   Requiere camara + WebAssembly (Chrome/Edge) sobre http/https.
   ========================================================================= */
import {
  GestureRecognizer,
  FaceLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const GESTURE_MAP = {
  casco:    { type: "hand", value: "Open_Palm",   label: "Mano abierta (agarra el casco)" },
  brujula:  { type: "hand", value: "Pointing_Up", label: "Apunta y dispara con el indice" },
  botiquin: { type: "face", value: "smile",       label: "Sonrisa" },
  panel:    { type: "hand", value: "Closed_Fist", label: "Puno cerrado" },
  guante:   { type: "hand", value: "Open_Palm",   label: "Choque de manos (mano abierta)" }
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

/* ========================================================================
   MINI-JUEGO BRUJULA — Disparos con el dedo indice
   El cadete apunta con el dedo indice y "dispara" a objetivos (estrellas)
   que aparecen en pantalla. Al acertar N objetivos, se completa.
   ======================================================================== */
const BRUJULA_TARGETS_NEEDED = 5;
let brujulaState = null;

function initBrujulaGame(canvas) {
  brujulaState = {
    targets: [],
    score: 0,
    needed: BRUJULA_TARGETS_NEEDED,
    lastShot: 0,
    cooldown: 600,
    fingerPos: null,
    shooting: false,
    particles: [],
    completed: false
  };
  spawnBrujulaTarget(canvas);
}

function spawnBrujulaTarget(canvas) {
  if (!brujulaState || brujulaState.targets.length >= 3) return;
  const w = canvas.width, h = canvas.height;
  const margin = 40;
  brujulaState.targets.push({
    x: margin + Math.random() * (w - margin * 2),
    y: margin + Math.random() * (h - margin * 2),
    r: 18 + Math.random() * 8,
    pulse: 0,
    hit: false
  });
}

function drawBrujulaGame(ctx, canvas, now) {
  if (!brujulaState) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // draw targets (stars)
  for (const t of brujulaState.targets) {
    if (t.hit) continue;
    t.pulse += 0.05;
    const scale = 1 + Math.sin(t.pulse) * 0.15;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(scale, scale);
    drawStar(ctx, 0, 0, t.r, t.r * 0.5, 5);
    ctx.fillStyle = "rgba(255, 179, 71, 0.85)";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // draw particles
  brujulaState.particles = brujulaState.particles.filter(p => p.life > 0);
  for (const p of brujulaState.particles) {
    p.x += p.vx; p.y += p.vy; p.life -= 0.03;
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // draw crosshair at finger position
  if (brujulaState.fingerPos) {
    const fp = brujulaState.fingerPos;
    ctx.strokeStyle = brujulaState.shooting ? "#3ddc97" : "#4da6ff";
    ctx.lineWidth = 2;
    const cSize = 12;
    ctx.beginPath(); ctx.moveTo(fp.x - cSize, fp.y); ctx.lineTo(fp.x + cSize, fp.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fp.x, fp.y - cSize); ctx.lineTo(fp.x, fp.y + cSize); ctx.stroke();
    ctx.beginPath(); ctx.arc(fp.x, fp.y, 8, 0, Math.PI * 2); ctx.stroke();

    if (brujulaState.shooting) {
      ctx.fillStyle = "rgba(61, 220, 151, 0.4)";
      ctx.beginPath(); ctx.arc(fp.x, fp.y, 14, 0, Math.PI * 2); ctx.fill();
    }
  }

  // score HUD
  ctx.fillStyle = "#fff";
  ctx.font = "bold 14px 'Space Mono', monospace";
  ctx.textAlign = "left";
  ctx.fillText(`${brujulaState.score}/${brujulaState.needed}`, 10, 22);
  ctx.font = "10px 'Space Mono', monospace";
  ctx.fillStyle = "#7c88a8";
  ctx.fillText("OBJETIVOS", 10, 36);
}

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

function brujulaShoot(fingerX, fingerY, canvas) {
  if (!brujulaState || brujulaState.completed) return false;
  const now = performance.now();
  if (now - brujulaState.lastShot < brujulaState.cooldown) return false;
  brujulaState.lastShot = now;
  brujulaState.shooting = true;
  setTimeout(() => { if (brujulaState) brujulaState.shooting = false; }, 150);

  let hitAny = false;
  for (const t of brujulaState.targets) {
    if (t.hit) continue;
    const dist = Math.hypot(fingerX - t.x, fingerY - t.y);
    if (dist < t.r + 20) {
      t.hit = true;
      hitAny = true;
      brujulaState.score++;
      // explosion particles
      for (let i = 0; i < 12; i++) {
        const angle = (Math.PI * 2 / 12) * i;
        brujulaState.particles.push({
          x: t.x, y: t.y,
          vx: Math.cos(angle) * (2 + Math.random() * 3),
          vy: Math.sin(angle) * (2 + Math.random() * 3),
          life: 1, size: 2 + Math.random() * 3,
          color: ["#ffb347", "#4da6ff", "#3ddc97", "#fff"][(Math.random() * 4) | 0]
        });
      }
      window.AstroScout?.beep(660 + brujulaState.score * 80, 0.08);
      break;
    }
  }

  // remove hit targets and spawn new ones
  brujulaState.targets = brujulaState.targets.filter(t => !t.hit);
  if (brujulaState.score < brujulaState.needed) {
    spawnBrujulaTarget(canvas);
    if (brujulaState.targets.length < 2) spawnBrujulaTarget(canvas);
  }

  return hitAny;
}

/* ========================================================================
   MINI-JUEGO CASCO — Agarra el casco y ponlo en el astronauta
   El cadete hace gesto de agarrar (puno) para tomar el casco, luego lo
   mueve hasta la cabeza del astronauta y suelta (mano abierta) para
   colocarlo.
   ======================================================================== */
let cascoState = null;

function initCascoGame(canvas) {
  cascoState = {
    phase: "grab",    // "grab" -> "carry" -> "place" -> "done"
    cascoPos: { x: canvas.width * 0.75, y: canvas.height * 0.3 },
    targetZone: { x: canvas.width * 0.28, y: canvas.height * 0.18, r: 35 },
    handPos: null,
    grabbing: false,
    completed: false,
    floatPhase: 0,
    successAlpha: 0
  };
}

function drawCascoGame(ctx, canvas) {
  if (!cascoState) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  cascoState.floatPhase += 0.03;

  // Draw astronaut suit (2D)
  drawAstronaut(ctx, canvas.width * 0.28, canvas.height * 0.55, canvas.height * 0.8);

  if (cascoState.phase === "done") {
    // Draw casco on astronaut head
    drawHelmetIcon(ctx, cascoState.targetZone.x, cascoState.targetZone.y, 32, 1);
    cascoState.successAlpha = Math.min(cascoState.successAlpha + 0.02, 1);
    ctx.globalAlpha = cascoState.successAlpha;
    ctx.fillStyle = "#3ddc97";
    ctx.font = "bold 16px 'Space Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText("CASCO ASEGURADO", w / 2, h - 20);
    ctx.globalAlpha = 1;
    return;
  }

  // draw target zone indicator
  const tz = cascoState.targetZone;
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = cascoState.phase === "carry" ? "rgba(61,220,151,0.6)" : "rgba(77,166,255,0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(tz.x, tz.y, tz.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  if (cascoState.phase === "carry") {
    ctx.fillStyle = "rgba(61,220,151,0.15)";
    ctx.beginPath();
    ctx.arc(tz.x, tz.y, tz.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // floating casco icon
  if (cascoState.phase === "grab") {
    const floatY = Math.sin(cascoState.floatPhase) * 5;
    drawHelmetIcon(ctx, cascoState.cascoPos.x, cascoState.cascoPos.y + floatY, 28, 0.9);
    // instruction
    ctx.fillStyle = "#ffb347";
    ctx.font = "11px 'Space Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText("CIERRA EL PUNO PARA AGARRAR", w / 2, h - 12);
  } else if (cascoState.phase === "carry") {
    // casco follows hand
    if (cascoState.handPos) {
      drawHelmetIcon(ctx, cascoState.handPos.x, cascoState.handPos.y, 28, 0.9);
    }
    ctx.fillStyle = "#4da6ff";
    ctx.font = "11px 'Space Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText("LLEVA EL CASCO A LA CABEZA", w / 2, h - 12);
  }

  // draw hand indicator
  if (cascoState.handPos && cascoState.phase !== "done") {
    ctx.strokeStyle = cascoState.grabbing ? "#ffb347" : "#4da6ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cascoState.handPos.x, cascoState.handPos.y, 10, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawAstronaut(ctx, cx, cy, totalH) {
  const scale = totalH / 200;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  // body (suit)
  ctx.fillStyle = "#1a2540";
  ctx.strokeStyle = "#4da6ff";
  ctx.lineWidth = 1.5;
  // torso
  ctx.beginPath();
  ctx.roundRect(-30, -30, 60, 80, 8);
  ctx.fill(); ctx.stroke();
  // arms
  ctx.beginPath();
  ctx.roundRect(-48, -20, 16, 55, 6);
  ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(32, -20, 16, 55, 6);
  ctx.fill(); ctx.stroke();
  // legs
  ctx.beginPath();
  ctx.roundRect(-25, 50, 20, 50, 6);
  ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(5, 50, 20, 50, 6);
  ctx.fill(); ctx.stroke();
  // helmet area (empty circle)
  ctx.strokeStyle = "rgba(77,166,255,0.5)";
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(0, -50, 22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // badge
  ctx.fillStyle = "#ffb347";
  ctx.font = "8px 'Space Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillText("ASTRO", 0, 5);
  ctx.fillText("SCOUT", 0, 14);

  ctx.restore();
}

function drawHelmetIcon(ctx, x, y, size, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  // dome
  ctx.fillStyle = "#2a3a5c";
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#4da6ff";
  ctx.lineWidth = 2;
  ctx.stroke();
  // visor
  ctx.fillStyle = "rgba(77, 166, 255, 0.5)";
  ctx.beginPath();
  ctx.arc(0, 2, size * 0.6, -0.3, Math.PI + 0.3);
  ctx.fill();
  // glare
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(-size * 0.25, -size * 0.15, size * 0.3, -0.8, 0.6);
  ctx.stroke();
  ctx.restore();
}

function updateCascoGame(gesture, handPos) {
  if (!cascoState || cascoState.completed) return false;

  cascoState.handPos = handPos;
  const isGrab = gesture === "Closed_Fist";
  const isOpen = gesture === "Open_Palm";
  cascoState.grabbing = isGrab;

  if (cascoState.phase === "grab") {
    if (isGrab && handPos) {
      const dist = Math.hypot(handPos.x - cascoState.cascoPos.x, handPos.y - cascoState.cascoPos.y);
      if (dist < 60) {
        cascoState.phase = "carry";
        window.AstroScout?.beep(520, 0.06);
      }
    }
  } else if (cascoState.phase === "carry") {
    if (!isGrab && isOpen && handPos) {
      const tz = cascoState.targetZone;
      const dist = Math.hypot(handPos.x - tz.x, handPos.y - tz.y);
      if (dist < tz.r + 15) {
        cascoState.phase = "done";
        cascoState.completed = true;
        window.AstroScout?.beep(880, 0.1);
        return true;
      } else {
        cascoState.phase = "grab";
        cascoState.cascoPos = { x: handPos.x, y: handPos.y };
      }
    }
  }
  return false;
}


/* ========================================================================
   MODO 1 — VALIDACION POR GESTO EN LA ESTACION (generico + mini-juegos)
   ======================================================================== */
let stVideo, stCanvas, stCtx, stRunning = false, stRaf = null, holdStart = null, confirmedFor = null;

function drawRing(progress, ok) {
  if (window.CURRENT_STATION === "brujula" || window.CURRENT_STATION === "casco") return;
  const w = stCanvas.width, h = stCanvas.height;
  stCtx.clearRect(0, 0, w, h);
  if (progress <= 0) return;
  stCtx.beginPath();
  stCtx.arc(w - 34, 34, 20, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
  stCtx.strokeStyle = ok ? "#3ddc97" : "#4da6ff";
  stCtx.lineWidth = 5; stCtx.stroke();
}

function stLoop(statusEl, readEl, confEl) {
  if (!stRunning) return;
  const now = performance.now();
  const expected = GESTURE_MAP[window.CURRENT_STATION];
  let matched = false;

  if (expected && stVideo.readyState >= 2) {
    if (expected.type === "hand" && gestureRecognizer) {
      const res = gestureRecognizer.recognizeForVideo(stVideo, now);
      if (res.gestures && res.gestures.length) {
        const top = res.gestures[0][0];
        if (readEl) readEl.textContent = "Detectado: " + (GESTURE_ES[top.categoryName] || top.categoryName);
        if (confEl) confEl.style.width = Math.round(top.score * 100) + "%";

        // BRUJULA: mini-juego de disparo
        if (window.CURRENT_STATION === "brujula") {
          if (res.landmarks && res.landmarks.length) {
            const lm = res.landmarks[0];
            const tip = lm[8]; // punta del indice
            const fx = (1 - tip.x) * stCanvas.width;
            const fy = tip.y * stCanvas.height;
            brujulaState.fingerPos = { x: fx, y: fy };

            const isPointing = top.categoryName === "Pointing_Up" && top.score > DETECTION_THRESHOLD;
            if (isPointing) {
              const wasHit = brujulaShoot(fx, fy, stCanvas);
            }
            if (brujulaState.score >= brujulaState.needed && !brujulaState.completed) {
              brujulaState.completed = true;
              matched = false;
              confirmedFor = window.CURRENT_STATION;
              statusEl.textContent = "OBJETIVOS COMPLETADOS";
              window.AstroScoutChatbot?.completeCurrentStation?.();
            }
          }
          drawBrujulaGame(stCtx, stCanvas, now);
          stRaf = requestAnimationFrame(() => stLoop(statusEl, readEl, confEl));
          return;
        }

        // CASCO: mini-juego de agarre
        if (window.CURRENT_STATION === "casco") {
          if (res.landmarks && res.landmarks.length) {
            const lm = res.landmarks[0];
            const palm = lm[9]; // centro palma
            const hx = (1 - palm.x) * stCanvas.width;
            const hy = palm.y * stCanvas.height;

            const done = updateCascoGame(top.categoryName, { x: hx, y: hy });
            if (done && confirmedFor !== window.CURRENT_STATION) {
              confirmedFor = window.CURRENT_STATION;
              statusEl.textContent = "CASCO ASEGURADO";
              window.AstroScoutChatbot?.completeCurrentStation?.();
            }
          }
          drawCascoGame(stCtx, stCanvas);
          stRaf = requestAnimationFrame(() => stLoop(statusEl, readEl, confEl));
          return;
        }

        // Default gesture matching
        matched = top.categoryName === expected.value && top.score > DETECTION_THRESHOLD;

        // also accept if the second-best gesture matches with decent confidence
        if (!matched && res.gestures[0].length > 1) {
          const alt = res.gestures[0][1];
          if (alt.categoryName === expected.value && alt.score > 0.25) {
            matched = true;
          }
        }
      } else {
        if (readEl) { readEl.textContent = "Detectado: —"; if (confEl) confEl.style.width = "0%"; }

        // If we're in brujula or casco mini-game, keep drawing even without gestures
        if (window.CURRENT_STATION === "brujula" && brujulaState) {
          brujulaState.fingerPos = null;
          drawBrujulaGame(stCtx, stCanvas, now);
          stRaf = requestAnimationFrame(() => stLoop(statusEl, readEl, confEl));
          return;
        }
        if (window.CURRENT_STATION === "casco" && cascoState) {
          cascoState.handPos = null;
          drawCascoGame(stCtx, stCanvas);
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
    statusEl.textContent = "Error cargando modelos de deteccion. Revisa conexion y abre la app por http(s).";
    return false;
  }

  stRunning = true; confirmedFor = null; holdStart = null;

  // Init mini-games if needed
  if (window.CURRENT_STATION === "brujula") {
    initBrujulaGame(stCanvas);
    statusEl.textContent = "Apunta con el indice y dispara a las estrellas";
  } else if (window.CURRENT_STATION === "casco") {
    initCascoGame(stCanvas);
    statusEl.textContent = "Cierra el puno para agarrar el casco";
  } else {
    statusEl.textContent = "Camara activa. Realiza el gesto...";
  }

  stLoop(statusEl, readEl, confEl);
  return true;
}
function stopStationCamera(container) {
  stRunning = false;
  if (stRaf) cancelAnimationFrame(stRaf);
  if (stVideo && stVideo.srcObject) stVideo.srcObject.getTracks().forEach(t => t.stop());
  const s = container?.querySelector("#tk-status"); if (s) s.textContent = "Camara apagada.";
  brujulaState = null;
  cascoState = null;
}

function buildStationUI(container) {
  const expected = GESTURE_MAP[window.CURRENT_STATION];
  let extraInstructions = "";
  if (window.CURRENT_STATION === "brujula") {
    extraInstructions = "<br><small style='color:#4da6ff'>Apunta con el dedo indice a las estrellas para disparar.</small>";
  } else if (window.CURRENT_STATION === "casco") {
    extraInstructions = "<br><small style='color:#4da6ff'>Cierra el puno para agarrar el casco y llevalo a la cabeza del astronauta.</small>";
  }
  container.innerHTML = `
    <div class="tk-wrap">
      <div class="tk-expected">${expected ? "GESTO REQUERIDO: " + expected.label.toUpperCase() : ""}${extraInstructions}</div>
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
   Cursor con el dedo indice + pellizco para seleccionar la estacion.
   ======================================================================== */
let navVideo, navRunning = false, navRaf = null, cursorEl, hintEl, pinchStart = null, focusedCard = null;

function ensureNavOverlay() {
  if (!cursorEl) {
    cursorEl = document.createElement("div");
    cursorEl.className = "hand-cursor";
    document.body.appendChild(cursorEl);
  }
  if (!hintEl) {
    hintEl = document.createElement("div");
    hintEl.className = "hand-hint";
    document.body.appendChild(hintEl);
  }
  if (!navVideo) {
    navVideo = document.createElement("video");
    navVideo.muted = true; navVideo.playsInline = true;
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
      cursorEl.style.display = "block";
      cursorEl.style.left = x + "px";
      cursorEl.style.top = y + "px";

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
          stopHandNav();
          window.AstroScout?.beep(880, 0.1);
          window.AstroScout?.navigateTo(key);
          return;
        }
      } else {
        pinchStart = null;
        hintEl.textContent = "Mueve el indice - junta pulgar e indice para seleccionar";
      }
    } else {
      cursorEl.style.display = "none";
      hintEl.textContent = "Muestra tu mano a la camara...";
    }
  }
  navRaf = requestAnimationFrame(navLoop);
}

async function startHandNav() {
  ensureNavOverlay();
  hintEl.style.display = "block";
  hintEl.textContent = "Cargando camara...";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
    navVideo.srcObject = stream; await navVideo.play();
  } catch (e) { hintEl.textContent = "No se pudo acceder a la camara."; return; }
  navVideo.style.display = "block";
  await ensureGesture(null);
  navRunning = true; pinchStart = null; focusedCard = null;
  navLoop();
  window.AstroScout?.toast("NAVEGACION CON LA MANO", "Apunta a una estacion y pellizca para entrar.", "amber");
}
function stopHandNav() {
  navRunning = false;
  if (navRaf) cancelAnimationFrame(navRaf);
  if (navVideo && navVideo.srcObject) navVideo.srcObject.getTracks().forEach(t => t.stop());
  if (navVideo) navVideo.style.display = "none";
  if (cursorEl) cursorEl.style.display = "none";
  if (hintEl) hintEl.style.display = "none";
  document.querySelectorAll(".station-card.hand-focus").forEach(c => c.classList.remove("hand-focus"));
  const btn = document.getElementById("btn-handnav");
  if (btn) btn.textContent = "Navegar con la mano";
}

/* ---------------------------- INTEGRACION ------------------------------- */
function initStationTracking() {
  const container = document.getElementById("tracking-widget");
  if (!container) return;
  stopStationCamera(container);
  buildStationUI(container);
}

window.AstroScoutTracking = {
  init: initStationTracking,
  startHandNav, stopHandNav,
  toggleHandNav: () => {
    const btn = document.getElementById("btn-handnav");
    if (navRunning) { stopHandNav(); }
    else { startHandNav(); if (btn) btn.textContent = "Detener mano"; }
  }
};

document.addEventListener("astro:station", initStationTracking);
document.addEventListener("astro:hub", () => stopStationCamera(document.getElementById("tracking-widget")));
