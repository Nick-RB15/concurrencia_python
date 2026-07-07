/* =========================================================================
   ASTRO SCOUT — DATOS DE LA ACADEMIA
   -------------------------------------------------------------------------
   Todo el contenido editable vive aqui: estaciones, modelos 3D, puntos
   interactivos (hotspots), base de conocimiento para el Instructor IA y
   los gestos esperados. No hace falta tocar el codigo para cambiar textos.
   ========================================================================= */

// Orden oficial de la mision (define el progreso y el desbloqueo)
export const STATION_ORDER = ["casco", "brujula", "botiquin", "panel", "guante"];

export const STATIONS = {
  casco: {
    key: "casco",
    callsign: "ESTACIÓN 01 · SUJECIÓN DE EQUIPO",
    name: "Casco de vuelo",
    icon: "🪖",
    color: "#4da6ff",
    skill: "Asegurar correctamente el equipo antes de una salida espacial. Agarra el casco y colocalo en el astronauta.",
    src: "models/casco.glb",
    mission:
      "Agarra el casco con el puño y colócalo sobre la cabeza del astronauta. Abre la mano sobre la zona de la cabeza para asegurarlo.",
    gesture:
      "Cierra el puño para agarrar el casco, llévalo a la cabeza del astronauta y abre la mano para colocarlo.",
    hotspots: [
      { pos: "0 0.55 0.5", normal: "0 0 1", title: "Visor", text: "Protege del sol directo y de micrometeoritos." },
      { pos: "0.55 0 0.2", normal: "1 0 0", title: "Broche lateral", text: "Debe quedar trabado, no solo apoyado." },
      { pos: "0 -0.6 0.3", normal: "0 -1 0", title: "Anillo de sellado", text: "Conecta el casco al traje y mantiene la presión." }
    ],
    xp: 100
  },
  brujula: {
    key: "brujula",
    callsign: "ESTACIÓN 02 · ORIENTACIÓN",
    name: "Brújula de navegación",
    icon: "🧭",
    color: "#ffb347",
    skill: "Trazar una ruta segura disparando a objetivos estelares con el dedo índice.",
    src: "models/brujula.glb",
    mission:
      "Apunta con el dedo índice a las estrellas que aparecen en pantalla y dispara. Derriba 5 objetivos para completar la misión.",
    gesture:
      "Levanta el dedo índice apuntando hacia arriba para disparar a las estrellas objetivo.",
    hotspots: [
      { pos: "0 0.7 0.2", normal: "0 1 0", title: "Aguja", text: "Apunta a la referencia estelar principal." },
      { pos: "0.9 0 0.2", normal: "1 0 0", title: "Anillo graduado", text: "Marca los grados para trazar el rumbo." }
    ],
    xp: 120
  },
  botiquin: {
    key: "botiquin",
    callsign: "ESTACIÓN 03 · PRIMEROS AUXILIOS",
    name: "Botiquín espacial",
    icon: "🧰",
    color: "#3ddc97",
    skill: "Atender a un compañero herido: limpiar herida, aplicar medicina y vendar.",
    src: "models/botiquin.glb",
    mission:
      "Un compañero fue impactado por un meteorito. Extrae los fragmentos con la pinza (índice arriba), inyecta medicina (agarra jeringa y pulgar arriba), y véndalo deslizando la mano.",
    gesture:
      "Paso 1: índice arriba = pinza, toca fragmentos. Paso 2: puño agarra jeringa, pulgar arriba inyecta. Paso 3: mano abierta desliza izq-der.",
    hotspots: [
      { pos: "0 0 0.4", normal: "0 0 1", title: "Cruz médica", text: "Identifica el kit de emergencia de la tripulación." },
      { pos: "0.7 0 0.2", normal: "1 0 0", title: "Cierre hermético", text: "Mantiene el contenido estéril en vacío." }
    ],
    xp: 140
  },
  panel: {
    key: "panel",
    callsign: "ESTACIÓN 04 · MANEJO DE RECURSOS",
    name: "Panel de oxígeno",
    icon: "🫧",
    color: "#8a7dff",
    skill: "Reparar un tanque de oxígeno dañado: localizar fuga, sellar y reconectar.",
    src: "models/panel_oxigeno.glb",
    mission:
      "El tanque de O₂ tiene una grieta. Escanea con el detector (índice arriba), suelda la grieta siguiendo la línea (puño), y reconecta la manguera (agarra + victoria para abrir válvula).",
    gesture:
      "Paso 1: índice arriba = detector, busca grieta. Paso 2: puño sigue la grieta soldando. Paso 3: puño agarra manguera, victoria abre válvula.",
    hotspots: [
      { pos: "-0.55 0.2 0.15", normal: "0 0 1", title: "Reserva O₂", text: "Nunca bajes de la reserva mínima de emergencia." },
      { pos: "0.55 0.2 0.15", normal: "0 0 1", title: "Energía", text: "Prioriza el oxígeno si tienes que elegir." }
    ],
    xp: 160
  },
  guante: {
    key: "guante",
    callsign: "ESTACIÓN 05 · TRABAJO EN EQUIPO",
    name: "Guante de sincronización",
    icon: "🧤",
    color: "#ff6fae",
    skill: "Reparar el sistema eléctrico de la nave reconectando cables.",
    src: "models/guante.glb",
    mission:
      "El sistema eléctrico está dañado. Agarra cada cable suelto (puño cerrado) y llévalo al conector correcto (mano abierta para soltar). Conecta los 3 cables.",
    gesture:
      "Puño cerrado para agarrar un cable, llévalo al conector derecho y abre la mano para conectarlo.",
    hotspots: [
      { pos: "0 0.75 0.2", normal: "0 0 1", title: "Sensores de dedo", text: "Miden la posición de cada dedo para sincronizar." },
      { pos: "0 0 0.25", normal: "0 0 1", title: "Palma háptica", text: "Vibra cuando la maniobra se completa." }
    ],
    xp: 180
  }
};

/* -------------------------------------------------------------------------
   BASE DE CONOCIMIENTO DEL INSTRUCTOR IA
   Cada estacion tiene: saludo, pistas progresivas, mensaje de completado,
   y una lista de preguntas/respuestas (faq) con palabras clave.
   El motor de respuestas puntua por coincidencia de palabras clave, asi que
   el cadete puede "hacerle preguntas" reales, no solo comandos fijos.
   ------------------------------------------------------------------------- */
export const KNOWLEDGE = {
  casco: {
    saludo:
      "Cadete, bienvenido. Debes agarrar el casco y colocarlo sobre el traje del astronauta. Cierra el puño para agarrarlo y ábrelo sobre la cabeza para asegurarlo. Pregúntame lo que quieras o di 'pista'.",
    pistas: [
      "Primera pista: revisa que el sello del visor esté firme, sin espacios de aire.",
      "Segunda pista: los broches laterales deben estar trabados, no solo apoyados.",
      "Última pista: lleva el casco hasta el círculo punteado sobre la cabeza del astronauta y abre la mano."
    ],
    completado:
      "Excelente trabajo, cadete. Equipo asegurado correctamente. Puedes avanzar a la siguiente estación.",
    quiz: {
      q: "Antes de salir al espacio, ¿qué debes revisar primero en el casco?",
      opciones: ["El color del visor", "El sellado y los broches", "La batería de la radio"],
      correcta: 1,
      exito: "¡Correcto! Sin un buen sellado no hay presión ni oxígeno seguro."
    },
    faq: [
      { k: ["para que", "sirve", "casco", "funcion"], a: "El casco mantiene la presión, aporta oxígeno respirable y protege tu cabeza de la radiación y los micrometeoritos." },
      { k: ["visor", "vidrio", "cristal"], a: "El visor filtra la luz solar directa (muy intensa en el espacio) y está reforzado contra impactos. Debe quedar perfectamente sellado." },
      { k: ["oxigeno", "respirar", "aire"], a: "El oxígeno llega por el anillo de sellado que conecta el casco con el traje. Por eso el sellado es tan importante." },
      { k: ["broche", "traba", "seguro", "cierre"], a: "Los broches laterales deben quedar trabados con un clic firme, no solo apoyados. Si quedan flojos, pierdes presión." },
      { k: ["radiacion", "sol", "rayos"], a: "El casco bloquea gran parte de la radiación solar y ultravioleta, que en el espacio no tiene la atmósfera de la Tierra para frenarla." },
      { k: ["temperatura", "frio", "calor"], a: "El casco ayuda a aislar la temperatura: en el espacio se pasa de más de 120 °C al sol a menos de -100 °C en sombra." }
    ]
  },
  brujula: {
    saludo:
      "Estación de orientación activada. Necesitas trazar la ruta correcta hacia la base usando el mapa estelar. Pregúntame lo que quieras o di 'pista' si te trabas.",
    pistas: [
      "Primera pista: observa el punto más brillante del mapa, ahí suele estar la referencia principal.",
      "Segunda pista: la base siempre está en la dirección opuesta a la estrella de emergencia.",
      "Última pista: levanta el índice apuntando arriba, el sistema dispara automáticamente al objetivo más cercano."
    ],
    completado:
      "Ruta confirmada, cadete. Buena orientación. Continúa a la siguiente estación.",
    quiz: {
      q: "¿Qué usas para orientarte cuando no hay campo magnético como en la Tierra?",
      opciones: ["Las estrellas de referencia", "El viento", "El GPS del móvil"],
      correcta: 0,
      exito: "¡Exacto! En el espacio profundo navegamos con estrellas guía y giroscopios."
    },
    faq: [
      { k: ["para que", "sirve", "brujula", "funcion"], a: "La brújula de navegación te ayuda a trazar un rumbo usando referencias estelares y el anillo graduado en grados." },
      { k: ["aguja", "apunta", "norte"], a: "En el espacio no hay 'norte' magnético como en la Tierra; la aguja se alinea con una estrella de referencia elegida." },
      { k: ["estrella", "referencia", "guia"], a: "Se elige una estrella brillante y estable como referencia. Los astronautas históricamente usaron estrellas guía para navegar." },
      { k: ["grados", "anillo", "rumbo", "ruta"], a: "El anillo graduado marca los 360°. Fijas el rumbo alineando la aguja con el grado hacia tu destino." },
      { k: ["gps", "satelite"], a: "El GPS solo funciona cerca de la Tierra. Lejos se usa navegación inercial (giroscopios) y observación de estrellas." },
      { k: ["base", "lunar", "destino"], a: "Para llegar a la base, fija la dirección opuesta a la estrella de emergencia y mantén el rumbo con el anillo graduado." }
    ]
  },
  botiquin: {
    saludo:
      "¡Emergencia médica! Un compañero fue alcanzado por radiación. Debes curarlo en 3 pasos con tus manos. Pregúntame o di 'pista' si necesitas guía.",
    pistas: [
      "Primera pista: levanta el índice (pinza) y acércalo a los fragmentos triangulares para extraerlos.",
      "Segunda pista: cierra el puño sobre la jeringa para agarrarla, llévala a la herida y haz pulgar arriba para inyectar.",
      "Última pista: abre la mano y deslízala de izquierda a derecha sobre la herida para vendar. Repite 4 veces."
    ],
    completado:
      "Procedimiento completado con éxito. Tu compañero está estable. Avanza a la siguiente estación.",
    quiz: {
      q: "¿Cuál es el primer paso al atender a un compañero herido?",
      opciones: ["Moverlo rápido", "Ver si está consciente y respira", "Darle agua"],
      correcta: 1,
      exito: "¡Bien! Primero evalúas consciencia y respiración antes de actuar."
    },
    faq: [
      { k: ["para que", "sirve", "botiquin", "funcion"], a: "El botiquín contiene lo básico para estabilizar a un compañero herido hasta llegar a atención médica completa." },
      { k: ["primer paso", "primero", "empiezo", "empezar"], a: "El primer paso siempre es comprobar si la persona está consciente y respira, sin moverla bruscamente." },
      { k: ["respira", "respiracion", "consciente"], a: "Comprueba respiración y consciencia. Si no respira, se inicia el protocolo de reanimación adaptado al traje." },
      { k: ["mover", "trasladar"], a: "No muevas a la persona hasta estabilizarla, salvo peligro inmediato. Un mal traslado puede empeorar una lesión." },
      { k: ["herida", "sangre", "corte"], a: "Ante una herida, aplica presión para detener el sangrado y cubre para evitar contaminación en el ambiente." },
      { k: ["marte", "gravedad", "espacio"], a: "En baja gravedad los objetos y fluidos flotan; por eso los kits médicos espaciales van sujetos y sellados." }
    ]
  },
  panel: {
    saludo:
      "¡Alerta! El tanque de O₂ tiene una fuga y se está perdiendo oxígeno. Debes repararlo en 3 pasos. Pregúntame o di 'pista'.",
    pistas: [
      "Primera pista: levanta el índice como detector y muévelo por el tanque. La barra se pone roja cuando estás cerca de la grieta.",
      "Segunda pista: cierra el puño y sigue los puntos rojos de la grieta uno por uno para soldarla.",
      "Última pista: agarra la manguera (puño), llévala al puerto del tanque, y haz victoria (V) para abrir la válvula."
    ],
    completado:
      "Recursos administrados correctamente. La nave está estable. Avanza a la siguiente estación.",
    quiz: {
      q: "Si tienes que elegir entre gastar oxígeno o energía, ¿qué priorizas?",
      opciones: ["La energía", "El oxígeno", "Da igual"],
      correcta: 1,
      exito: "¡Correcto! Sin oxígeno no hay tripulación que valga."
    },
    faq: [
      { k: ["para que", "sirve", "panel", "funcion"], a: "El panel de oxígeno controla las reservas de aire y energía de la nave y te avisa cuando bajan de niveles seguros." },
      { k: ["oxigeno", "aire", "o2"], a: "El oxígeno es el recurso crítico: siempre debes mantener una reserva mínima de emergencia intocable." },
      { k: ["energia", "bateria", "electricidad"], a: "La energía alimenta soporte vital, comunicaciones y propulsión. Se raciona, pero por debajo del oxígeno en prioridad." },
      { k: ["prioridad", "elegir", "priorizar"], a: "Regla de oro: primero el oxígeno, luego la energía. Sin aire no hay misión." },
      { k: ["reserva", "minimo", "cuanto", "20"], a: "No consumas más del 20% de una reserva en un solo paso y nunca toques la reserva de emergencia." },
      { k: ["reciclar", "co2", "dioxido"], a: "Las naves reciclan el CO₂ y parte del agua para estirar las reservas en viajes largos." }
    ]
  },
  guante: {
    saludo:
      "¡El sistema eléctrico de la nave falló! Hay 3 cables desconectados. Debes agarrar cada uno y llevarlo a su conector. Pregúntame o di 'pista'.",
    pistas: [
      "Primera pista: cierra el puño cerca de un cable suelto del lado izquierdo para agarrarlo.",
      "Segunda pista: arrastra el cable hasta el conector del mismo color en el lado derecho.",
      "Última pista: abre la mano sobre el conector para soltar el cable y conectarlo."
    ],
    completado:
      "¡Sincronización perfecta! Has completado el entrenamiento de la Academia Espacial, cadete.",
    quiz: {
      q: "¿Por qué es clave el trabajo en equipo en una misión espacial?",
      opciones: ["Para competir", "Para coordinar maniobras y seguridad", "No es importante"],
      correcta: 1,
      exito: "¡Perfecto! En el espacio, la coordinación salva vidas."
    },
    faq: [
      { k: ["para que", "sirve", "guante", "funcion"], a: "El guante de sincronización mide la posición de tus dedos y coordina tus movimientos con los de tu compañero en tiempo real." },
      { k: ["sensor", "dedo", "mide"], a: "Sensores en cada dedo detectan la postura de tu mano para replicar maniobras exactas entre miembros de la tripulación." },
      { k: ["haptico", "vibra", "vibracion"], a: "La palma háptica vibra para confirmar que la maniobra conjunta se completó correctamente." },
      { k: ["equipo", "coordinar", "compañero", "sincroniz"], a: "El trabajo en equipo permite ejecutar maniobras que una sola persona no podría hacer con seguridad." },
      { k: ["señal", "cuando", "actuar"], a: "Espera siempre la señal visual acordada antes de actuar: la sincronización requiere que ambos confirmen a la vez." }
    ]
  }
};

/* Respuestas generales (funcionan en cualquier estacion) */
export const GENERIC = {
  pista: ["pista", "ayuda", "no se", "no sé", "trabado", "atascado", "help", "hint"],
  completado: ["listo", "termine", "terminé", "completado", "hecho", "ya esta", "ya está", "acabe", "acabé"],
  repetir: ["repite", "repetir", "otra vez", "no entendi", "no entendí", "de nuevo"],
  saludo: ["hola", "buenas", "hey", "instructor", "buenos dias", "buenas tardes"],
  gracias: ["gracias", "genial", "perfecto", "excelente"],
  quiz: ["quiz", "examen", "pregunta", "preguntame", "pruebame", "test"],
  siguiente: ["siguiente", "continuar", "avanzar", "proxima", "próxima"],
  gesto: ["gesto", "camara", "cámara", "como confirmo", "cómo confirmo", "confirmar"]
};

/* Datos curiosos del espacio para el modo "dato curioso" del instructor */
export const FACTS = [
  "En el espacio no se puede silbar ni hablar: el sonido necesita aire para viajar.",
  "Un día en Venus dura más que su año: gira sobre sí mismo muy despacio.",
  "Los astronautas pueden crecer hasta 3 cm en el espacio por la falta de gravedad.",
  "El Sol representa el 99,8% de la masa de todo el sistema solar.",
  "Neptuno tarda 165 años terrestres en dar una vuelta al Sol.",
  "La Estación Espacial Internacional viaja a unos 28.000 km/h.",
  "En Marte, los atardeceres se ven de color azul.",
  "Hay más estrellas en el universo que granos de arena en todas las playas de la Tierra.",
  "El olor del espacio, según los astronautas, recuerda a metal quemado y carne asada.",
  "La huella de Neil Armstrong sigue en la Luna: no hay viento que la borre."
];
