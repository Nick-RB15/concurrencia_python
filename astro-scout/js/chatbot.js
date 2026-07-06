/* =========================================================================
   ASTRO SCOUT — INSTRUCTOR IA
   Chatbot local (sin costo de API) que ahora entiende PREGUNTAS reales
   mediante una base de conocimiento por estación con puntuación de palabras
   clave. Habla y escucha (voz), da pistas, lanza un mini-quiz, cuenta datos
   curiosos y permite BORRAR mensajes o limpiar toda la conversación.
   ========================================================================= */
import { KNOWLEDGE, GENERIC, STATIONS, FACTS } from "./data.js";

let hintIndex = 0;
let lastBotMessage = "";
let quizActive = false;

/* --------- normalización para comparar sin acentos ni mayúsculas -------- */
function norm(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function includesAny(text, list) {
  const t = norm(text);
  return list.some(k => t.includes(norm(k)));
}
function getScript() { return KNOWLEDGE[window.CURRENT_STATION] || null; }

/* ------------------------- MOTOR DE RESPUESTA --------------------------- */
// Devuelve { text, quiz? } — busca la mejor coincidencia en la FAQ.
function respond(userText) {
  const script = getScript();
  if (!script) return { text: "Selecciona una estación desde el panel principal para comenzar tu entrenamiento." };
  const text = norm(userText);

  if (includesAny(text, GENERIC.quiz)) return { quiz: true, text: "Vamos con una pregunta rápida, cadete:" };
  if (includesAny(text, GENERIC.completado)) return { text: script.completado };
  if (includesAny(text, GENERIC.pista)) {
    const msg = script.pistas[Math.min(hintIndex, script.pistas.length - 1)];
    hintIndex = Math.min(hintIndex + 1, script.pistas.length - 1);
    return { text: msg };
  }
  if (includesAny(text, GENERIC.repetir)) return { text: lastBotMessage || script.saludo };
  if (includesAny(text, GENERIC.gesto)) {
    const s = STATIONS[window.CURRENT_STATION];
    return { text: s ? s.gesture : "Haz el gesto indicado frente a la cámara para validar la estación." };
  }
  if (includesAny(text, GENERIC.siguiente)) return { text: "Cuando valides el gesto de esta estación, la siguiente se desbloquea sola en el panel." };
  if (includesAny(text, GENERIC.saludo)) return { text: script.saludo };
  if (includesAny(text, GENERIC.gracias)) return { text: "Para eso estoy, cadete. Sigue así." };

  // Búsqueda en la base de conocimiento (puntúa por palabras clave)
  let best = null, bestScore = 0;
  for (const item of script.faq) {
    const score = item.k.reduce((acc, kw) => acc + (text.includes(norm(kw)) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = item; }
  }
  if (best && bestScore > 0) return { text: best.a };

  // Datos curiosos si preguntan algo general del espacio
  if (includesAny(text, ["espacio", "planeta", "estrella", "curioso", "dato", "sol", "luna", "marte"])) {
    return { text: "Dato curioso: " + FACTS[(Math.random() * FACTS.length) | 0] };
  }

  return { text: "Buena pregunta, cadete. Prueba a preguntarme por el funcionamiento del equipo, pídeme una 'pista', un 'quiz', o di 'listo' cuando termines." };
}

/* ------------------------------- VOZ ----------------------------------- */
let voicePref = null;
function pickVoice() {
  if (!("speechSynthesis" in window)) return null;
  const vs = window.speechSynthesis.getVoices();
  return vs.find(v => /es(-|_)/i.test(v.lang)) || vs[0] || null;
}
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  if (!window.AstroScout || !window.AstroScout.getState().sound) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  voicePref = voicePref || pickVoice();
  if (voicePref) u.voice = voicePref;
  u.lang = "es-ES"; u.rate = 1; u.pitch = 1;
  window.speechSynthesis.speak(u);
}
if ("speechSynthesis" in window) window.speechSynthesis.onvoiceschanged = () => { voicePref = pickVoice(); };

let recognition = null, listening = false, micBtnRef = null;
function setupRecognition(onResult) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = "es-ES"; rec.continuous = false; rec.interimResults = false;
  rec.onresult = (e) => onResult(e.results[0][0].transcript);
  rec.onend = () => { listening = false; updateMic(); };
  rec.onerror = () => { listening = false; updateMic(); };
  return rec;
}
function updateMic() {
  if (!micBtnRef) return;
  micBtnRef.textContent = listening ? "● Escuchando…" : "🎙 Hablar";
  micBtnRef.classList.toggle("listening", listening);
}

/* ------------------------------- UI ------------------------------------ */
let logRef = null;
function addMsg(text, who) {
  const div = document.createElement("div");
  div.className = "ai-msg " + who;
  div.textContent = text;
  const del = document.createElement("button");
  del.className = "del-msg"; del.textContent = "×"; del.title = "Borrar mensaje";
  del.addEventListener("click", () => div.remove());
  div.appendChild(del);
  logRef.appendChild(div);
  logRef.scrollTop = logRef.scrollHeight;
  return div;
}

function addQuiz() {
  const script = getScript();
  if (!script || !script.quiz) { addMsg("No hay quiz para esta estación.", "bot"); return; }
  quizActive = true;
  const q = script.quiz;
  const box = document.createElement("div");
  box.className = "ai-msg bot"; box.style.maxWidth = "96%";
  const inner = document.createElement("div");
  inner.className = "quiz-box";
  inner.innerHTML = `<div class="q">🛰 ${q.q}</div>`;
  q.opciones.forEach((opt, i) => {
    const b = document.createElement("button");
    b.className = "quiz-opt"; b.textContent = opt;
    b.addEventListener("click", () => {
      [...inner.querySelectorAll(".quiz-opt")].forEach(x => x.disabled = true);
      if (i === q.correcta) {
        b.classList.add("correct");
        addMsg(q.exito, "bot"); speak(q.exito);
        window.AstroScout?.beep(880, 0.1);
      } else {
        b.classList.add("wrong");
        inner.querySelectorAll(".quiz-opt")[q.correcta].classList.add("correct");
        const m = "Casi. La respuesta correcta está marcada en verde. ¡Sigue aprendiendo!";
        addMsg(m, "bot"); speak(m);
        window.AstroScout?.beep(200, 0.12, "square");
      }
      quizActive = false;
    });
    inner.appendChild(b);
  });
  box.appendChild(inner);
  logRef.appendChild(box);
  logRef.scrollTop = logRef.scrollHeight;
}

function buildUI(container) {
  container.innerHTML = `
    <div class="ai-chat">
      <div class="ai-log" id="ai-log"></div>
      <div class="ai-chips" id="ai-chips"></div>
      <div class="ai-row">
        <input class="ai-input" id="ai-input" type="text" placeholder="Escribe una pregunta o usa el micrófono…" />
        <button class="ai-btn" id="ai-send">Enviar</button>
        <button class="ai-btn" id="ai-mic">🎙 Hablar</button>
      </div>
      <div class="ai-toolbar">
        <button class="ai-mini" id="ai-quiz">🛰 Quiz</button>
        <button class="ai-mini" id="ai-hint">💡 Pista</button>
        <button class="ai-mini" id="ai-fact">✨ Dato</button>
        <button class="ai-mini danger" id="ai-clear">🗑 Limpiar chat</button>
      </div>
    </div>`;

  logRef = container.querySelector("#ai-log");
  const input = container.querySelector("#ai-input");
  const sendBtn = container.querySelector("#ai-send");
  const micBtn = container.querySelector("#ai-mic");
  micBtnRef = micBtn;

  function handleUserText(text) {
    if (!text.trim()) return;
    addMsg(text, "user");
    const r = respond(text);
    if (r.quiz) { if (r.text) { addMsg(r.text, "bot"); speak(r.text); } addQuiz(); return; }
    lastBotMessage = r.text;
    addMsg(r.text, "bot");
    speak(r.text);
  }

  sendBtn.addEventListener("click", () => { handleUserText(input.value); input.value = ""; });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { handleUserText(input.value); input.value = ""; } });

  recognition = setupRecognition((said) => handleUserText(said));
  micBtn.addEventListener("click", () => {
    if (!recognition) { addMsg("Tu navegador no soporta reconocimiento de voz. Prueba en Chrome.", "bot"); return; }
    if (listening) { recognition.stop(); listening = false; }
    else { try { recognition.start(); listening = true; } catch (_) {} }
    updateMic();
  });

  container.querySelector("#ai-quiz").addEventListener("click", () => { if (!quizActive) addQuiz(); });
  container.querySelector("#ai-hint").addEventListener("click", () => handleUserText("pista"));
  container.querySelector("#ai-fact").addEventListener("click", () => handleUserText("dato curioso"));
  container.querySelector("#ai-clear").addEventListener("click", () => {
    logRef.innerHTML = "";
    window.speechSynthesis?.cancel();
    window.AstroScout?.beep(300, 0.08);
  });

  // Chips de preguntas sugeridas (interacción de un toque)
  const chips = container.querySelector("#ai-chips");
  const suggestions = ["¿Para qué sirve?", "Dame una pista", "¿Cómo lo confirmo?", "Hazme un quiz", "Cuéntame un dato"];
  suggestions.forEach(s => {
    const c = document.createElement("button");
    c.className = "ai-chip"; c.textContent = s;
    c.addEventListener("click", () => handleUserText(s));
    chips.appendChild(c);
  });

  // Bienvenida
  const script = getScript();
  if (script) { lastBotMessage = script.saludo; addMsg(script.saludo, "bot"); speak(script.saludo); }
}

/* ---------------------------- INTEGRACIÓN ------------------------------- */
function initChatbot() {
  const container = document.getElementById("chatbot-widget");
  if (!container) return;
  hintIndex = 0; quizActive = false;
  buildUI(container);
}

function completeCurrentStation() {
  const script = getScript();
  if (!script) return;
  if (logRef) { addMsg(script.completado, "bot"); }
  lastBotMessage = script.completado;
  speak(script.completado);
  window.AstroScoutMarkComplete?.(window.CURRENT_STATION);
}

window.AstroScoutChatbot = { init: initChatbot, completeCurrentStation };

// Re-inicia el chat cada vez que entras a una estación
document.addEventListener("astro:station", initChatbot);
