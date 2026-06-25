# 🏟 Arena de Supervivencia

**Battle Royale multijugador en tiempo real**, desarrollado en Python con una arquitectura
asíncrona basada en *event loop*, interfaz reactiva en el navegador (ReactPy + FastAPI) y
persistencia en SQLite.

---

## 1. Descripción del proyecto

Arena de Supervivencia es un juego tipo *battle royale* por turnos en tiempo real jugado
sobre una cuadrícula de 15×15. Varios jugadores (humanos y/o bots con IA) compiten dentro de
una **zona segura que se reduce progresivamente**: quien quede fuera recibe daño hasta morir.
Gana el último jugador en pie o, si se agota el tiempo, el de mayor puntaje.

El juego combina:
- Recolección de **recursos** (salud, puntaje, escudo) que aparecen dinámicamente en el mapa.
- **Eventos aleatorios** (tormenta, niebla, bonus de puntaje x2).
- **Bots con IA** que persiguen recursos y huyen de la zona letal.
- **Ranking global** persistente con historial de partidas y eventos.

---

## 2. Características principales

| Característica | Descripción |
|---|---|
| ⚔️ Multijugador en tiempo real | Estado compartido sincronizado entre todos los clientes conectados. |
| 🤖 Bots con IA | 3 bots (Alpha, Beta, Gamma) con lógica de persecución de recursos y supervivencia. |
| 🔴 Zona segura decreciente | El radio se reduce por ciclos; fuera de la zona se aplica daño (mitigable con escudo). |
| 💊 ⭐ 🛡 Recursos | Salud (+25), puntaje (+20, x2 con bonus) y escudo (+30). |
| 🌩️ Eventos aleatorios | Tormenta (daño global), niebla (visibilidad reducida) y bonus doble de puntaje. |
| 🏆 Ranking global | Victorias, partidas jugadas, puntaje acumulado y mejor puntaje por jugador. |
| 📜 Historial de eventos | Cada partida registra sus eventos y resultados en la base de datos. |
| 🎮 Controles | Movimiento con WASD, flechas o D-pad en pantalla. |

---

## 3. Arquitectura

El proyecto sigue un patrón de **estado inmutable + reductor** (estilo Redux) gobernado por
corrutinas asíncronas, todo expuesto vía una interfaz declarativa ReactPy montada en FastAPI.

```
┌──────────────────────────────────────────────────────────────┐
│                        Navegador (cliente)                     │
│            UI declarativa ReactPy  ←→  styles.css              │
└───────────────────────────▲──────────────────────────────────┘
                            │ WebSocket (ReactPy)
┌───────────────────────────┴──────────────────────────────────┐
│                       main.py  (FastAPI)                        │
│  Estado global + suscriptores + ruteo de fases (lobby/juego/   │
│  resultados)                                                    │
│                                                                │
│  estado.py      →  modelo + reductor `update()` (acciones)     │
│  corrutinas.py  →  loops async: zona, recursos, eventos, bots, │
│                    expiración de efectos, verificación de fin   │
│  bots.py        →  IA de decisión de movimiento                │
│  conexion.py    →  capa de datos async (aiosqlite)             │
│  lobby/mapa/resultados.py → componentes de UI por fase         │
└───────────────────────────▲──────────────────────────────────┘
                            │
                  arena_supervivencia.db (SQLite)
```

### Flujo de fases
`lobby` → (≥2 jugadores) → `en_curso` → (1 vivo o tiempo agotado) → `finalizada`

---

## 4. Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `main.py` | Punto de entrada. Configura FastAPI + ReactPy, estado global, suscriptores y enruta las 3 pantallas. |
| `estado.py` | Modelo de datos y reductor puro `update(estado, accion)` con todas las acciones del juego. |
| `corrutinas.py` | Tareas `asyncio` en segundo plano: reducción de zona, generación de recursos, eventos, IA de bots y fin de partida. |
| `bots.py` | Bots disponibles y `decidir_movimiento_bot()` (IA). |
| `conexion.py` | Conexión `aiosqlite`, creación de tablas y operaciones de persistencia/ranking. |
| `lobby.py` | Pantalla de sala: unirse, agregar/quitar bots, iniciar partida. |
| `mapa.py` | Pantalla de juego: cuadrícula, jugadores, recursos, panel de stats y controles. |
| `resultados.py` | Pantalla final: ganador, clasificación y ranking global. |
| `static/styles.css` | Estilos de la interfaz. |
| `arena_supervivencia.db` | Base de datos SQLite (se crea automáticamente al iniciar). |

---

## 5. Modelo de datos (SQLite)

- **partidas** — metadatos de cada partida (fechas, duración, nº jugadores, ganador, motivo de fin).
- **resultados_jugador** — puntaje, posición, supervivencia y causa de eliminación por jugador y partida.
- **historial_eventos** — log de eventos (reducción de zona, recursos, eventos aleatorios, fin de partida).
- **ranking_global** — acumulado por jugador: victorias, partidas, puntaje histórico y mejor puntaje.

---

## 6. Conceptos técnicos destacados

- **Programación asíncrona (`asyncio`)**: múltiples corrutinas concurrentes orquestan la lógica del juego en tiempo real.
- **Estado inmutable + reductor puro**: `update()` deriva siempre un nuevo estado, facilitando trazabilidad y consistencia.
- **UI reactiva en Python (ReactPy)**: componentes y *hooks* sin escribir JavaScript.
- **Persistencia asíncrona (`aiosqlite`)** con modo WAL y claves foráneas.
- **IA sencilla basada en heurísticas** para los bots (distancias, prioridad de recursos, escape de zona).

---

## 7. Cómo ejecutar

> Requiere **Python 3.10+** (el código usa la sintaxis de tipos `tipo | None`).

```bash
# 1. Instalar dependencias dentro de un entorno
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
# 2. Ejecutar el servidor
python main.py

# 3. Abrir en el navegador
#    http://localhost:8000
```

Dependencias externas: `reactpy[fastapi]`, `fastapi`, `uvicorn`, `aiosqlite`
(el resto son módulos de la librería estándar de Python).

### Cómo jugar
1. Escribe tu nombre y pulsa **Unirse**.
2. (Opcional) Agrega **3 bots IA** para jugar en solitario.
3. Con **2 o más jugadores**, pulsa **¡Iniciar Partida!**
4. Muévete con **WASD / flechas / D-pad**, recoge recursos y mantente dentro de la zona segura.
5. Sobrevive hasta ser el último en pie o liderar el puntaje cuando se agote el tiempo.

---

## 8. Posibles mejoras futuras

- Más tipos de eventos, recursos y modos de juego.
- Bots con IA más avanzada (predicción de zona, evasión de oponentes).
- Pantalla de estadísticas históricas y gráficas a partir de `historial_eventos`.
- Tests automatizados del reductor `update()` y de la IA de bots.

---

*Proyecto educativo de programación asíncrona y desarrollo web en Python.*
