from reactpy import component, html, hooks

from bots import BOTS_DISPONIBLES


@component
def PantallaLobby(estado, on_unirse, on_iniciar, on_agregar_bots, on_quitar_bots):
    nombre, set_nombre = hooks.use_state("")
    error, set_error = hooks.use_state("")

    jugadores = estado.get("jugadores", {})
    num_jugadores = len(jugadores)
    num_bots = sum(1 for j in jugadores.values() if j.get("es_bot"))
    num_humanos = num_jugadores - num_bots
    puede_iniciar = num_jugadores >= 2
    bots_completos = num_bots >= len(BOTS_DISPONIBLES)

    async def handle_unirse(ev):
        n = nombre.strip()
        if not n:
            set_error("Ingresa tu nombre para unirte.")
            return
        if len(n) > 20:
            set_error("El nombre debe tener máximo 20 caracteres.")
            return
        set_error("")
        await on_unirse(n)

    def handle_nombre(ev):
        set_nombre(ev["target"]["value"])
        set_error("")

    async def handle_keydown(ev):
        if ev.get("key") == "Enter":
            await handle_unirse(ev)

    async def handle_iniciar(ev):
        await on_iniciar()

    async def handle_agregar_bots(ev):
        await on_agregar_bots()

    async def handle_quitar_bots(ev):
        await on_quitar_bots()

    return html.div(
        {"class": "lobby-container"},
        html.div(
            {"class": "lobby-card"},

            html.div(
                {"class": "lobby-header"},
                html.h1({"class": "game-title"}, "🏟️ Arena de Supervivencia"),
                html.p({"class": "game-subtitle"}, "Battle Royale • Multijugador en Tiempo Real"),
            ),

            html.div(
                {"class": "join-section"},
                html.h2({"class": "section-title"}, "Unirse a la Partida"),
                html.div(
                    {"class": "input-group"},
                    html.input({
                        "type": "text",
                        "placeholder": "Tu nombre de jugador...",
                        "value": nombre,
                        "on_change": handle_nombre,
                        "on_key_down": handle_keydown,
                        "class": "name-input",
                        "maxLength": 20,
                    }),
                    html.button(
                        {"on_click": handle_unirse, "class": "btn btn-join", "type": "button"},
                        "⚔️ Unirse"
                    ),
                ),
                html.p({"class": "error-msg"}, error) if error else html.span({}),
            ),

            html.div(
                {"class": "bots-section"},
                html.h3({"class": "section-title"}, "🤖 Práctica con Bots"),
                html.p(
                    {"class": "bots-desc"},
                    "¿Sin oponentes? Agrega 3 bots IA para jugar en solitario.",
                ),
                html.div(
                    {"class": "bots-actions"},
                    html.button(
                        {
                            "on_click": handle_agregar_bots,
                            "class": f"btn btn-bot-add {'btn-disabled' if bots_completos else ''}",
                            "disabled": bots_completos,
                            "type": "button",
                        },
                        "➕ Agregar 3 Bots" if not bots_completos else "✓ Bots listos",
                    ),
                    html.button(
                        {
                            "on_click": handle_quitar_bots,
                            "class": f"btn btn-bot-remove {'btn-disabled' if num_bots == 0 else ''}",
                            "disabled": num_bots == 0,
                            "type": "button",
                        },
                        "Quitar Bots",
                    ),
                ),
                html.p(
                    {"class": "bots-status"},
                    f"Bots en sala: {num_bots}/{len(BOTS_DISPONIBLES)}",
                ),
            ),

            html.div(
                {"class": "players-section"},
                html.h3(
                    {"class": "section-title"},
                    f"Jugadores en sala: {num_jugadores} ({num_humanos} humanos, {num_bots} bots)",
                ),
                html.div(
                    {"class": "players-list"},
                    *[
                        html.div(
                            {
                                "class": f"player-chip {'player-chip-bot' if j.get('es_bot') else ''}",
                                "key": jid,
                            },
                            html.span(
                                {"class": "player-avatar"},
                                "🤖" if j.get("es_bot") else "👤",
                            ),
                            html.span({"class": "player-name"}, j["nombre"]),
                        )
                        for jid, j in jugadores.items()
                    ]
                ) if jugadores else html.p({"class": "empty-msg"}, "Esperando jugadores..."),
            ),

            html.div(
                {"class": "start-section"},
                html.button(
                    {
                        "on_click": handle_iniciar,
                        "class": f"btn btn-start {'btn-disabled' if not puede_iniciar else ''}",
                        "disabled": not puede_iniciar,
                        "type": "button",
                    },
                    "¡Iniciar Partida!" if puede_iniciar else f"⏳ Esperando ({max(0, 2 - num_jugadores)} más...)"
                ),
                html.p(
                    {"class": "hint"},
                    "Únete y agrega bots, o espera a más jugadores humanos.",
                ) if not puede_iniciar else html.span({}),
            ),
        )
    )
