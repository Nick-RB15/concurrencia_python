import math
import time
import asyncio
from reactpy import component, html, hooks


ICONOS_RECURSO = {"salud": "💊", "puntaje": "⭐", "escudo": "🛡️"}
COLORES_RECURSO = {"salud": "#22c55e", "puntaje": "#eab308", "escudo": "#3b82f6"}

AVATARES = ["🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪"]


def _color_avatar(jugador_id: str) -> str:
    idx = hash(jugador_id) % len(AVATARES)
    return AVATARES[idx]


def _distancia(x1, y1, x2, y2):
    return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)


@component
def MapaJuego(estado, jugador_id_local, on_mover, on_salir):
    _, set_timer_tick = hooks.use_state(0)

    @hooks.use_effect(dependencies=[])
    async def actualizar_reloj():
        while True:
            await asyncio.sleep(1)
            set_timer_tick(lambda t: t + 1)

    mapa = estado.get("mapa", {})
    zona = estado.get("zona_segura", {})
    jugadores = estado.get("jugadores", {})
    eventos = estado.get("eventos_recientes", [])
    niebla = estado.get("niebla_activa", False)
    bonus = estado.get("bonus_doble_activo", False)

    ancho = mapa.get("ancho", 15)
    alto = mapa.get("alto", 15)
    recursos_map = {(r["x"], r["y"]): r for r in mapa.get("recursos", [])}
    jugadores_map = {(j["x"], j["y"]): (jid, j) for jid, j in jugadores.items() if j["vivo"]}

    jugador_local = jugadores.get(jugador_id_local)
    tiempo_inicio = estado.get("tiempo_inicio") or time.time()
    duracion = estado.get("duracion_maxima_segundos", 180)
    tiempo_restante = max(0, int(duracion - (time.time() - tiempo_inicio)))

    CELL = 36                

    async def handle_key(ev):
        key = ev.get("key", "")
        mapa_teclas = {
            "ArrowUp": "arriba", "w": "arriba", "W": "arriba",
            "ArrowDown": "abajo", "s": "abajo", "S": "abajo",
            "ArrowLeft": "izquierda", "a": "izquierda", "A": "izquierda",
            "ArrowRight": "derecha", "d": "derecha", "D": "derecha",
        }
        if key in mapa_teclas:
            await on_mover(mapa_teclas[key])

    def btn_mover(dir_):
        async def handler(ev):
            await on_mover(dir_)
        return handler

                               
    celdas = []
    for y in range(alto):
        for x in range(ancho):
            dist_centro = _distancia(x, y, zona.get("centro_x", 7), zona.get("centro_y", 7))
            fuera_zona = dist_centro > zona.get("radio_actual", 10)

                            
            if fuera_zona:
                bg = "rgba(239,68,68,0.35)"
            else:
                bg = "rgba(30,41,59,0.7)" if (x + y) % 2 == 0 else "rgba(15,23,42,0.7)"

            contenido = []

                              
            if (x, y) in recursos_map:
                r = recursos_map[(x, y)]
                contenido.append(
                    html.span(
                        {"class": "recurso-icon", "title": r["tipo"]},
                        ICONOS_RECURSO.get(r["tipo"], "?")
                    )
                )

                              
            if (x, y) in jugadores_map:
                jid, j = jugadores_map[(x, y)]
                es_local = jid == jugador_id_local
                contenido.append(
                    html.span(
                        {
                            "class": f"jugador-icon {'jugador-local' if es_local else ''}",
                            "title": j["nombre"],
                        },
                        _color_avatar(jid)
                    )
                )

            celdas.append(
                html.div(
                    {
                        "key": f"{x}-{y}",
                        "class": f"celda {'celda-fuera' if fuera_zona else 'celda-dentro'}",
                        "style": {
                            "background": bg,
                            "width": f"{CELL}px",
                            "height": f"{CELL}px",
                            "position": "relative",
                        }
                    },
                    *contenido
                )
            )

                             
    panel_jugador = html.div({"class": "panel-jugador"})
    if jugador_local:
        vida_pct = jugador_local["vida"]
        escudo = jugador_local.get("escudo", 0)
        panel_jugador = html.div(
            {"class": "panel-jugador"},
            html.div({"class": "pj-nombre"}, f"{_color_avatar(jugador_id_local)} {jugador_local['nombre']}"),
            html.div(
                {"class": "pj-stats"},
                html.div(
                    {"class": "stat-bar"},
                    html.span({"class": "stat-label"}, "❤️"),
                    html.div(
                        {"class": "bar-bg"},
                        html.div({
                            "class": "bar-fill bar-vida",
                            "style": {"width": f"{vida_pct}%"}
                        })
                    ),
                    html.span({"class": "stat-val"}, f"{vida_pct}"),
                ),
                html.div(
                    {"class": "stat-bar"},
                    html.span({"class": "stat-label"}, "🛡️"),
                    html.div(
                        {"class": "bar-bg"},
                        html.div({
                            "class": "bar-fill bar-escudo",
                            "style": {"width": f"{min(100, escudo * 100 // 60)}%"}
                        })
                    ),
                    html.span({"class": "stat-val"}, f"{escudo}"),
                ),
                html.div(
                    {"class": "pj-puntaje"},
                    html.span({}, "⭐ Puntaje: "),
                    html.span({"class": "puntaje-val"}, str(jugador_local["puntaje"])),
                ),
            ),
        )

                     
    efectos = []
    if niebla:
        efectos.append(html.div({"class": "efecto efecto-niebla"}, "🌫️ Niebla activa"))
    if bonus:
        efectos.append(html.div({"class": "efecto efecto-bonus"}, "⚡ ¡Puntaje x2!"))

    return html.div(
        {
            "class": "game-container",
            "tabIndex": 0,
            "on_key_down": handle_key,
            "style": {"outline": "none"},
        },
        html.div(
            {"class": "game-header"},
            html.div(
                {"class": "game-header-brand"},
                html.div({"class": "game-title-small"}, "🏟️ Arena de Supervivencia"),
                html.div(
                    {"class": f"timer {'timer-urgente' if tiempo_restante <= 30 else ''}"},
                    f"⏱️ {tiempo_restante}s",
                ),
            ),
            html.div(
                {"class": "zona-info"},
                html.span({"class": "zona-badge"}, f"Zona segura · r={zona.get('radio_actual', 0):.1f}"),
            ),
            html.button({"on_click": on_salir, "class": "btn btn-salir"}, "🚪 Salir"),
        ),

        html.div(
            {"class": "game-body"},
            html.div(
                {"class": "mapa-wrapper"},
                html.div(
                    {
                        "class": f"mapa {'mapa-niebla' if niebla else ''}",
                        "style": {
                            "display": "grid",
                            "gridTemplateColumns": f"repeat({ancho}, {CELL}px)",
                            "gridTemplateRows": f"repeat({alto}, {CELL}px)",
                            "gap": "1px",
                        }
                    },
                    *celdas
                ),
            ),

                           
            html.div(
                {"class": "panel-lateral"},

                panel_jugador,

                                 
                html.div({"class": "efectos-container"}, *efectos) if efectos else html.span({}),

                                   
                html.div(
                    {"class": "controles"},
                    html.p({"class": "controles-label"}, "Mover:"),
                    html.div(
                        {"class": "dpad"},
                        html.div({"class": "dpad-row"},
                                 html.button({"on_click": btn_mover("arriba"), "class": "dpad-btn", "type": "button"}, "▲")),
                        html.div(
                            {"class": "dpad-row"},
                            html.button({"on_click": btn_mover("izquierda"), "class": "dpad-btn", "type": "button"}, "◄"),
                            html.button({"on_click": btn_mover("abajo"), "class": "dpad-btn", "type": "button"}, "▼"),
                            html.button({"on_click": btn_mover("derecha"), "class": "dpad-btn", "type": "button"}, "►"),
                        ),
                    ),
                    html.p({"class": "controles-hint"}, "También: WASD / Flechas"),
                ),

                                 
                html.div(
                    {"class": "jugadores-sidebar"},
                    html.h4({}, "Jugadores"),
                    *[
                        html.div(
                            {
                                "class": f"jug-row {'jug-local' if jid == jugador_id_local else ''} {'jug-bot' if j.get('es_bot') else ''}",
                                "key": jid,
                            },
                            html.span({}, "🤖" if j.get("es_bot") else _color_avatar(jid)),
                            html.span({"class": "jug-nombre"}, j["nombre"]),
                            html.span({"class": "jug-vida"}, f"❤️{j['vida']}"),
                            html.span({"class": "jug-pts"}, f"⭐{j['puntaje']}"),
                        )
                        for jid, j in sorted(
                            jugadores.items(), key=lambda kv: kv[1]["puntaje"], reverse=True
                        )
                        if j["vivo"]
                    ]
                ),

                                
                html.div(
                    {"class": "eventos-log"},
                    html.h4({}, "Eventos"),
                    *[
                        html.div(
                            {"class": f"evento-item evento-{ev['tipo']}", "key": ev["id"]},
                            html.span({"class": "ev-tipo"}, ev["tipo"].replace("_", " ")),
                        )
                        for ev in eventos[:8]
                    ]
                ),
            ),
        )
    )
