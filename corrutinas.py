import asyncio
import random
import time
from datetime import datetime

from estado import update, calcular_ganador
from bots import decidir_movimiento_bot
import conexion as bd


                                                                                
                                                                   

_get_estado = None
_set_estado = None


def set_state_ref(getter, setter):
                                                                        
    global _get_estado, _set_estado
    _get_estado = getter
    _set_estado = setter


def _aplicar(accion: dict):
                                                                                           
    estado_actual = _get_estado()
    nuevo_estado = update(estado_actual, accion)
    _set_estado(nuevo_estado)
    return nuevo_estado


                                                                                

async def loop_zona_letal(intervalo: float = 15.0):
    try:
        while True:
            await asyncio.sleep(intervalo)
            estado = _get_estado()
            if estado["fase"] != "en_curso":
                break

            nuevo_estado = _aplicar({"tipo": "reducir_zona", "payload": {}})

                                    
            if nuevo_estado["partida_id"]:
                zona = nuevo_estado["zona_segura"]
                eliminados = [
                    jid for jid, j in nuevo_estado["jugadores"].items()
                    if not j["vivo"] and j.get("causa_eliminacion") == "zona"
                                                              
                ]
                await bd.registrar_evento(
                    nuevo_estado["partida_id"],
                    "reduccion_zona",
                    {
                        "radio_nuevo": zona["radio_actual"],
                        "eliminados_este_ciclo": eliminados,
                        "timestamp": datetime.utcnow().isoformat(),
                    }
                )
    except asyncio.CancelledError:
        pass                                           


                                                                                

async def loop_generacion_recursos(intervalo: float = 8.0):
    try:
        while True:
            await asyncio.sleep(intervalo)
            estado = _get_estado()
            if estado["fase"] != "en_curso":
                break

            nuevo_estado = _aplicar({"tipo": "generar_recurso", "payload": {}})

            if nuevo_estado["partida_id"]:
                recursos = nuevo_estado["mapa"]["recursos"]
                await bd.registrar_evento(
                    nuevo_estado["partida_id"],
                    "recurso_generado",
                    {
                        "total_recursos": len(recursos),
                        "timestamp": datetime.utcnow().isoformat(),
                    }
                )
    except asyncio.CancelledError:
        pass


                                                                                

EVENTOS_POSIBLES = ["tormenta", "niebla", "bonus_doble"]

async def loop_eventos_aleatorios(intervalo: float = 20.0):
    try:
        while True:
            await asyncio.sleep(intervalo)
            estado = _get_estado()
            if estado["fase"] != "en_curso":
                break

            tipo_ev = random.choice(EVENTOS_POSIBLES)
            nuevo_estado = _aplicar({
                "tipo": "evento_aleatorio",
                "payload": {"tipo_evento": tipo_ev}
            })

            if nuevo_estado["partida_id"]:
                await bd.registrar_evento(
                    nuevo_estado["partida_id"],
                    "evento_aleatorio",
                    {
                        "tipo": tipo_ev,
                        "timestamp": datetime.utcnow().isoformat(),
                    }
                )
    except asyncio.CancelledError:
        pass


                                                                                

async def loop_expirar_efectos(intervalo: float = 3.0):
                                                                        
    try:
        while True:
            await asyncio.sleep(intervalo)
            estado = _get_estado()
            if estado["fase"] != "en_curso":
                break
            _aplicar({"tipo": "expirar_efectos", "payload": {}})
    except asyncio.CancelledError:
        pass


                                                                                

async def loop_bots(intervalo: float = 1.6):
    try:
        while True:
            await asyncio.sleep(intervalo)
            estado = _get_estado()
            if estado["fase"] != "en_curso":
                break

            for jid, j in estado["jugadores"].items():
                if not j.get("es_bot") or not j["vivo"]:
                    continue
                direccion = decidir_movimiento_bot(estado, jid)
                if direccion:
                    estado = _aplicar({
                        "tipo": "mover",
                        "payload": {"jugador_id": jid, "direccion": direccion},
                    })
    except asyncio.CancelledError:
        pass


                                                                                

async def loop_verificacion_fin(intervalo: float = 2.0, tareas_a_cancelar: list = None):
    try:
        while True:
            await asyncio.sleep(intervalo)
            estado = _get_estado()
            if estado["fase"] != "en_curso":
                break

            jugadores = estado["jugadores"]
            vivos = [jid for jid, j in jugadores.items() if j["vivo"]]
            tiempo_transcurrido = time.time() - (estado["tiempo_inicio"] or time.time())
            tiempo_agotado = tiempo_transcurrido >= estado["duracion_maxima_segundos"]

            debe_terminar = (len(vivos) <= 1) or tiempo_agotado
            if not debe_terminar:
                continue

                              
            ganador_id, motivo_fin = calcular_ganador(estado)

                                            
            nuevo_estado = _aplicar({
                "tipo": "finalizar_partida",
                "payload": {"ganador_id": ganador_id, "motivo_fin": motivo_fin}
            })

                                                                                 
            partida_id = nuevo_estado["partida_id"]
            if partida_id:
                fecha_fin = datetime.utcnow()
                duracion = int(tiempo_transcurrido)

                await bd.finalizar_partida(
                    partida_id, fecha_fin, duracion, ganador_id, motivo_fin
                )

                                                                     
                jugadores_ordenados = sorted(
                    jugadores.items(),
                    key=lambda kv: kv[1]["puntaje"],
                    reverse=True
                )
                for posicion, (jid, j) in enumerate(jugadores_ordenados, start=1):
                    await bd.guardar_resultado_jugador(
                        partida_id, jid,
                        j["puntaje"],
                        posicion,
                        j["vivo"],
                        j.get("causa_eliminacion")
                    )
                    await bd.actualizar_ranking(
                        jid, j["nombre"],
                        gano=(jid == ganador_id),
                        puntaje=j["puntaje"]
                    )

                await bd.registrar_evento(
                    partida_id, "fin_partida",
                    {"ganador_id": ganador_id, "motivo_fin": motivo_fin,
                     "duracion_segundos": duracion}
                )

                                           
            if tareas_a_cancelar:
                for tarea in tareas_a_cancelar:
                    if not tarea.done():
                        tarea.cancel()
            break

    except asyncio.CancelledError:
        pass


                                                                                

_tareas_activas: list[asyncio.Task] = []


async def iniciar_corrutinas():
    global _tareas_activas

                                             
    t_zona = asyncio.create_task(loop_zona_letal(10.0), name="zona_letal")
    t_recursos = asyncio.create_task(loop_generacion_recursos(8.0), name="generacion_recursos")
    t_eventos = asyncio.create_task(loop_eventos_aleatorios(20.0), name="eventos_aleatorios")
    t_efectos = asyncio.create_task(loop_expirar_efectos(3.0), name="expirar_efectos")
    t_bots = asyncio.create_task(loop_bots(1.6), name="bots")

    t_verificacion = asyncio.create_task(
        loop_verificacion_fin(2.0, tareas_a_cancelar=[t_zona, t_recursos, t_eventos, t_efectos, t_bots]),
        name="verificacion_fin"
    )

    _tareas_activas = [t_zona, t_recursos, t_eventos, t_efectos, t_bots, t_verificacion]
    return _tareas_activas


async def detener_corrutinas():
                                                                        
    global _tareas_activas
    for t in _tareas_activas:
        if not t.done():
            t.cancel()
    if _tareas_activas:
        await asyncio.gather(*_tareas_activas, return_exceptions=True)
    _tareas_activas = []
