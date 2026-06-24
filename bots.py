import random
from estado import DELTAS, celda_dentro_zona, distancia


# =========================
# BOTS DISPONIBLES (OBLIGATORIO)
# =========================
BOTS_DISPONIBLES = [
    {"id": "bot_alpha", "nombre": "Alpha 🤖"},
    {"id": "bot_beta", "nombre": "Beta 🤖"},
    {"id": "bot_gamma", "nombre": "Gamma 🤖"},
]


# =========================
# IA DEL BOT (RÁPIDA)
# =========================
def decidir_movimiento_bot(estado: dict, jugador_id: str) -> str | None:
    jugadores = estado.get("jugadores", {})
    if jugador_id not in jugadores:
        return None

    j = jugadores[jugador_id]
    if not j.get("vivo"):
        return None

    x, y = j["x"], j["y"]

    zona = estado.get("zona_segura", {})
    mapa = estado.get("mapa", {})

    ancho = mapa.get("ancho", 15)
    alto = mapa.get("alto", 15)

    cx, cy = zona.get("centro_x", 0), zona.get("centro_y", 0)

    ocupadas = {
        (p["x"], p["y"])
        for jid, p in jugadores.items()
        if jid != jugador_id and p["vivo"]
    }

    movimientos = []
    for direccion, (dx, dy) in DELTAS.items():
        nx, ny = x + dx, y + dy
        if 0 <= nx < ancho and 0 <= ny < alto and (nx, ny) not in ocupadas:
            movimientos.append((direccion, nx, ny))

    if not movimientos:
        return None

    dentro_zona = celda_dentro_zona(x, y, zona)
    recursos = mapa.get("recursos", [])

    # 🔥 salir de zona si estás fuera
    if not dentro_zona:
        movimientos.sort(key=lambda m: distancia(m[1], m[2], cx, cy))
        return movimientos[0][0]

    # 🔥 persecución agresiva de recursos
    recursos_cercanos = [
        r for r in recursos
        if abs(r["x"] - x) + abs(r["y"] - y) <= 8
    ]

    if recursos_cercanos and random.random() < 0.97:
        objetivo = min(
            recursos_cercanos,
            key=lambda r: distancia(x, y, r["x"], r["y"])
        )

        movimientos.sort(
            key=lambda m: distancia(m[1], m[2], objetivo["x"], objetivo["y"])
        )
        return movimientos[0][0]

    # 🔥 movimiento agresivo constante
    if random.random() < 0.60:
        return random.choice(movimientos)[0]

    # fallback rápido
    movimientos.sort(key=lambda m: distancia(m[1], m[2], cx, cy))
    return movimientos[0][0]