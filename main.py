import asyncio
import uuid
import time
from pathlib import Path

from reactpy import component, html, hooks
from reactpy.backend.fastapi import Options, configure

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from estado import crear_estado_inicial, update
from corrutinas import set_state_ref, iniciar_corrutinas, detener_corrutinas
import conexion as bd
from lobby import PantallaLobby
from mapa import MapaJuego
from resultados import PantallaResultados

_estado_global: dict = crear_estado_inicial()
_suscriptores: list = []                                  
_tareas_activas: list = []

def get_estado() -> dict:
    return _estado_global


def set_estado(nuevo: dict):
    global _estado_global
    _estado_global = nuevo
                                                                     
    for cb in list(_suscriptores):
        try:
            cb()
        except Exception:
            pass


def aplicar_accion(accion: dict) -> dict:
                                                                             
    nuevo = update(get_estado(), accion)
    set_estado(nuevo)
    return nuevo


                                                          
set_state_ref(get_estado, set_estado)

@component
def ArenaApp():
                                                         
    mi_jugador_id, set_mi_jugador_id = hooks.use_state(None)
                                                               
    tick, set_tick = hooks.use_state(0)

    def forzar_rerender():
        set_tick(lambda t: t + 1)

                                  
    @hooks.use_effect(dependencies=[])
    def suscribir():
        _suscriptores.append(forzar_rerender)
        def desuscribir():
            if forzar_rerender in _suscriptores:
                _suscriptores.remove(forzar_rerender)
        return desuscribir

    estado = get_estado()
    fase = estado.get("fase", "lobby")

                                                                   

    async def on_unirse(nombre: str):
        jugador_id = str(uuid.uuid4())[:8]
        set_mi_jugador_id(jugador_id)
        aplicar_accion({
            "tipo": "unirse_partida",
            "payload": {"jugador_id": jugador_id, "nombre": nombre}
        })

    async def on_agregar_bots():
        aplicar_accion({"tipo": "agregar_bots", "payload": {}})

    async def on_quitar_bots():
        aplicar_accion({"tipo": "quitar_bots", "payload": {}})

    async def on_iniciar():
        global _tareas_activas
        estado_actual = get_estado()
        if estado_actual["fase"] != "lobby" or len(estado_actual["jugadores"]) < 2:
            return

                              
        partida_id = await bd.crear_partida(
            num_jugadores=len(estado_actual["jugadores"]),
            fecha_inicio=__import__("datetime").datetime.utcnow()
        )

        aplicar_accion({
            "tipo": "iniciar_partida",
            "payload": {"partida_id": partida_id}
        })

                                     
        _tareas_activas = await iniciar_corrutinas()

    async def on_mover(direccion: str):
        if mi_jugador_id:
            aplicar_accion({
                "tipo": "mover",
                "payload": {"jugador_id": mi_jugador_id, "direccion": direccion}
            })

    async def on_salir(event):
        if mi_jugador_id:
            aplicar_accion({
                "tipo": "salir_partida",
                "payload": {"jugador_id": mi_jugador_id}
            })
            set_mi_jugador_id(None)

    async def on_nueva_partida():
        global _tareas_activas
        await detener_corrutinas()
        _tareas_activas = []
        set_estado(crear_estado_inicial())
        set_mi_jugador_id(None)

                                                                    

    if fase == "lobby":
        return html.div(
            {"id": "app"},
            PantallaLobby(
                estado=estado,
                on_unirse=on_unirse,
                on_iniciar=on_iniciar,
                on_agregar_bots=on_agregar_bots,
                on_quitar_bots=on_quitar_bots,
            )
        )

    elif fase == "en_curso":
        return html.div(
            {"id": "app"},
            MapaJuego(
                estado=estado,
                jugador_id_local=mi_jugador_id or "",
                on_mover=on_mover,
                on_salir=on_salir,
            )
        )

    else:                
        return html.div(
            {"id": "app"},
            PantallaResultados(
                estado=estado,
                on_nueva_partida=on_nueva_partida,
            )
        )


BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="Arena de Supervivencia")

app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


@app.on_event("startup")
async def startup():
    await bd.inicializar_tablas()
    print(" BD inicializada")
    print("  Arena de Supervivencia lista en http://localhost:8000")

@app.on_event("shutdown")
async def shutdown():
    await detener_corrutinas()
    await bd.cerrar_conexion()
    print(" Servidor cerrado correctamente")

configure(
    app,
    ArenaApp,
    options=Options(
        head=(
            html.title("Arena de Supervivencia"),
            html.link({"rel": "preconnect", "href": "https://fonts.googleapis.com"}),
            html.link({
                "rel": "preconnect",
                "href": "https://fonts.gstatic.com",
                "crossOrigin": "anonymous",
            }),
            html.link({
                "rel": "stylesheet",
                "href": "https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap",
            }),
            html.link({
                "rel": "stylesheet",
                "href": "/static/styles.css",
            }),
        ),
    ),
)

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,                                                               
        log_level="info",
    )
