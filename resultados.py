from reactpy import component, html, hooks
import conexion as bd


@component
def PantallaResultados(estado, on_nueva_partida):
    ranking, set_ranking = hooks.use_state([])

    @hooks.use_effect(dependencies=[])
    async def cargar_ranking():
        datos = await bd.obtener_ranking()
        set_ranking(datos)

    jugadores = estado.get("jugadores", {})
    ganador_id = estado.get("ganador_id")
    motivo_fin = estado.get("motivo_fin", "")

    ganador_nombre = jugadores.get(ganador_id, {}).get("nombre", "—") if ganador_id else "—"

    motivo_texto = {
        "ultimo_en_pie": "🏆 ¡Último jugador en pie!",
        "tiempo_agotado": "⏱️ Tiempo agotado — gana por puntaje",
    }.get(motivo_fin, motivo_fin)

                                                           
    clasificacion = sorted(
        jugadores.items(),
        key=lambda kv: kv[1]["puntaje"],
        reverse=True
    )

    medallas = ["🥇", "🥈", "🥉"]

    async def handle_nueva_partida(_ev):
        await on_nueva_partida()

    return html.div(
        {"class": "resultados-container"},
        html.div(
            {"class": "resultados-card"},

                     
            html.div(
                {"class": "winner-section"},
                html.div({"class": "winner-crown"}, "👑"),
                html.h1({"class": "winner-name"}, ganador_nombre),
                html.p({"class": "winner-reason"}, motivo_texto),
            ),

                                           
            html.div(
                {"class": "clasificacion-section"},
                html.h2({}, "Clasificación Final"),
                html.div(
                    {"class": "clasificacion-list"},
                    *[
                        html.div(
                            {"class": f"clas-row {'clas-winner' if jid == ganador_id else ''}", "key": jid},
                            html.span({"class": "clas-pos"}, medallas[i] if i < 3 else f"#{i+1}"),
                            html.span({"class": "clas-nombre"}, j["nombre"]),
                            html.span({"class": "clas-puntaje"}, f"⭐ {j['puntaje']}"),
                            html.span(
                                {"class": f"clas-estado {'vivo' if j['vivo'] else 'eliminado'}"},
                                "Sobrevivió" if j["vivo"] else f"Eliminado ({j.get('causa_eliminacion', '?')})"
                            ),
                        )
                        for i, (jid, j) in enumerate(clasificacion)
                    ]
                ),
            ),

                            
            html.div(
                {"class": "ranking-section"},
                html.h2({}, "🌐 Ranking Global"),
                html.div(
                    {"class": "ranking-table"},
                    html.div(
                        {"class": "ranking-header"},
                        html.span({}, "#"),
                        html.span({}, "Jugador"),
                        html.span({}, "Victorias"),
                        html.span({}, "Partidas"),
                        html.span({}, "Mejor Pts"),
                    ),
                    *[
                        html.div(
                            {"class": "ranking-row", "key": r["jugador_id"]},
                            html.span({"class": "rk-pos"}, medallas[i] if i < 3 else f"#{i+1}"),
                            html.span({"class": "rk-nombre"}, r["nombre"]),
                            html.span({"class": "rk-victorias"}, f"🏆 {r['victorias_totales']}"),
                            html.span({"class": "rk-partidas"}, r["partidas_jugadas"]),
                            html.span({"class": "rk-mejor"}, f"⭐ {r['mejor_puntaje']}"),
                        )
                        for i, r in enumerate(ranking)
                    ]
                ) if ranking else html.p({"class": "empty-msg"}, "Cargando ranking..."),
            ),

                                 
            html.div(
                {"class": "actions-section"},
                html.button(
                    {
                        "on_click": handle_nueva_partida,
                        "class": "btn btn-nueva",
                        "type": "button",
                    },
                    "🔄 Nueva Partida"
                ),
            ),
        )
    )
