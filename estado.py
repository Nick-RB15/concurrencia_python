import copy
import math
import random
import time
import uuid
from datetime import datetime
from typing import Any


                                                                                 

def crear_estado_inicial() -> dict:
    return {
        "fase": "lobby",                                                    
        "partida_id": None,
        "tiempo_inicio": None,
        "duracion_maxima_segundos": 180,
        "bonus_doble_activo": False,
        "bonus_doble_hasta": None,
        "niebla_activa": False,
        "niebla_hasta": None,
        "mapa": {
            "ancho": 15,
            "alto": 15,
            "recursos": [],
        },
        "zona_segura": {
            "centro_x": 7,
            "centro_y": 7,
            "radio_actual": 10.0,
            "radio_minimo": 1.5,
            "reduccion_por_ciclo": 0.8,
            "ultima_reduccion": None,
        },
        "jugadores": {},
        "eventos_recientes": [],                                   
        "ganador_id": None,
        "motivo_fin": None,
    }


                                                                                 

def distancia(x1, y1, x2, y2) -> float:
    return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)


def celda_dentro_zona(x, y, zona) -> bool:
    return distancia(x, y, zona["centro_x"], zona["centro_y"]) <= zona["radio_actual"]


def agregar_evento(estado: dict, tipo: str, detalle: dict) -> dict:
                                                          
    evento = {
        "id": str(uuid.uuid4())[:8],
        "timestamp": datetime.utcnow().isoformat(),
        "tipo": tipo,
        "detalle": detalle,
    }
    nuevos = [evento] + estado["eventos_recientes"]
    return {**estado, "eventos_recientes": nuevos[:20]}


def posicion_libre(estado: dict) -> tuple[int, int] | None:
                                                                                           
    ancho = estado["mapa"]["ancho"]
    alto = estado["mapa"]["alto"]
    zona = estado["zona_segura"]
    ocupadas = set()
    for j in estado["jugadores"].values():
        ocupadas.add((j["x"], j["y"]))
    for r in estado["mapa"]["recursos"]:
        ocupadas.add((r["x"], r["y"]))

    candidatos_dentro = []
    candidatos_fuera = []
    for x in range(ancho):
        for y in range(alto):
            if (x, y) not in ocupadas:
                if celda_dentro_zona(x, y, zona):
                    candidatos_dentro.append((x, y))
                else:
                    candidatos_fuera.append((x, y))

    if candidatos_dentro:
        return random.choice(candidatos_dentro)
    if candidatos_fuera:
        return random.choice(candidatos_fuera)
    return None


def calcular_ganador(estado: dict):
                                            
    jugadores = estado["jugadores"]
    vivos = [jid for jid, j in jugadores.items() if j["vivo"]]
    if len(vivos) == 1:
        return vivos[0], "ultimo_en_pie"
    if len(vivos) == 0:
                                                 
        if not jugadores:
            return None, "tiempo_agotado"
        ganador = max(jugadores.items(), key=lambda kv: kv[1]["puntaje"])[0]
        return ganador, "tiempo_agotado"
                        
    ganador = max(
        [(jid, j) for jid, j in jugadores.items() if j["vivo"]],
        key=lambda kv: kv[1]["puntaje"],
        default=(None, None)
    )
    return (ganador[0] if ganador[0] else None), "tiempo_agotado"


                                                                                 

DELTAS = {
    "arriba":    (0, -1),
    "abajo":     (0,  1),
    "izquierda": (-1, 0),
    "derecha":   (1,  0),
}

MAX_RECURSOS = 12


def _accion_unirse(estado: dict, payload: dict) -> dict:
    if estado["fase"] != "lobby":
        return estado

    jugador_id = payload["jugador_id"]
    nombre = payload["nombre"]
    if jugador_id in estado["jugadores"]:
        return estado

                                                 
    ancho, alto = estado["mapa"]["ancho"], estado["mapa"]["alto"]
    ocupadas = {(j["x"], j["y"]) for j in estado["jugadores"].values()}
    while True:
        sx, sy = random.randint(0, ancho - 1), random.randint(0, alto - 1)
        if (sx, sy) not in ocupadas:
            break

    nuevo_jugador = {
        "nombre": nombre,
        "x": sx, "y": sy,
        "vida": 100,
        "escudo": 0,
        "puntaje": 0,
        "vivo": True,
        "ultima_accion": None,
        "causa_eliminacion": None,
        "es_bot": payload.get("es_bot", False),
        "en_zona_segura": True,
    }
    nuevos_jugadores = {**estado["jugadores"], jugador_id: nuevo_jugador}
    nuevo_estado = {**estado, "jugadores": nuevos_jugadores}
    return agregar_evento(nuevo_estado, "jugador_unido", {"jugador_id": jugador_id, "nombre": nombre})


def _accion_mover(estado: dict, payload: dict) -> dict:
    if estado["fase"] != "en_curso":
        return estado

    jugador_id = payload["jugador_id"]
    direccion = payload["direccion"]
    jugadores = estado["jugadores"]

    if jugador_id not in jugadores:
        return estado
    jugador = jugadores[jugador_id]
    if not jugador["vivo"]:
        return estado

    dx, dy = DELTAS.get(direccion, (0, 0))
    ancho, alto = estado["mapa"]["ancho"], estado["mapa"]["alto"]
    nuevo_x = max(0, min(ancho - 1, jugador["x"] + dx))
    nuevo_y = max(0, min(alto - 1, jugador["y"] + dy))

    jugador_actualizado = {
        **jugador,
        "x": nuevo_x, "y": nuevo_y,
        "ultima_accion": datetime.utcnow().isoformat(),
    }

                                       
    recursos = estado["mapa"]["recursos"]
    recursos_restantes = []
    puntaje_extra = 0
    vida_extra = 0
    escudo_extra = 0
    eventos_recoleccion = []
    bonus = estado.get("bonus_doble_activo", False)

    for r in recursos:
        if r["x"] == nuevo_x and r["y"] == nuevo_y:
            tipo = r["tipo"]
            if tipo == "salud":
                vida_extra += 25
            elif tipo == "puntaje":
                pts = 20 * (2 if bonus else 1)
                puntaje_extra += pts
            elif tipo == "escudo":
                escudo_extra += 30
            eventos_recoleccion.append({"recurso_id": r["id"], "tipo": tipo, "jugador_id": jugador_id})
        else:
            recursos_restantes.append(r)

                       
    nueva_vida = min(100, jugador_actualizado["vida"] + vida_extra)
    nuevo_escudo = min(60, jugador_actualizado.get("escudo", 0) + escudo_extra)
    nuevo_puntaje = jugador_actualizado["puntaje"] + puntaje_extra

    jugador_actualizado = {
        **jugador_actualizado,
        "vida": nueva_vida,
        "escudo": nuevo_escudo,
        "puntaje": nuevo_puntaje,
    }

    nuevos_jugadores = {**jugadores, jugador_id: jugador_actualizado}
    nuevo_mapa = {**estado["mapa"], "recursos": recursos_restantes}
    nuevo_estado = {**estado, "jugadores": nuevos_jugadores, "mapa": nuevo_mapa}

    for ev in eventos_recoleccion:
        nuevo_estado = agregar_evento(nuevo_estado, "recurso_recolectado", ev)

    return nuevo_estado


def _accion_salir(estado: dict, payload: dict) -> dict:
    jugador_id = payload["jugador_id"]
    jugadores = estado["jugadores"]
    if jugador_id not in jugadores:
        return estado
    if jugadores[jugador_id].get("es_bot"):
        return estado
    nuevos_jugadores = {k: v for k, v in jugadores.items() if k != jugador_id}
    nuevo_estado = {**estado, "jugadores": nuevos_jugadores}
    return agregar_evento(nuevo_estado, "jugador_salio", {"jugador_id": jugador_id})


def _accion_agregar_bots(estado: dict, payload: dict) -> dict:
    if estado["fase"] != "lobby":
        return estado

    from bots import BOTS_DISPONIBLES

    nuevo_estado = estado
    for bot in BOTS_DISPONIBLES:
        if bot["id"] in nuevo_estado["jugadores"]:
            continue
        nuevo_estado = _accion_unirse(nuevo_estado, {
            "jugador_id": bot["id"],
            "nombre": bot["nombre"],
            "es_bot": True,
        })
    return nuevo_estado


def _accion_quitar_bots(estado: dict, payload: dict) -> dict:
    if estado["fase"] != "lobby":
        return estado

    nuevos_jugadores = {
        k: v for k, v in estado["jugadores"].items() if not v.get("es_bot")
    }
    if len(nuevos_jugadores) == len(estado["jugadores"]):
        return estado

    nuevo_estado = {**estado, "jugadores": nuevos_jugadores}
    return agregar_evento(nuevo_estado, "bots_removidos", {})


def _accion_iniciar_partida(estado: dict, payload: dict) -> dict:
    if estado["fase"] != "lobby" or len(estado["jugadores"]) < 2:
        return estado
    partida_id = payload.get("partida_id")
    nuevo_estado = {
        **estado,
        "fase": "en_curso",
        "partida_id": partida_id,
        "tiempo_inicio": time.time(),
    }
    return agregar_evento(nuevo_estado, "partida_iniciada", {"partida_id": partida_id})


                                                                                 

def _accion_reducir_zona(estado: dict, payload: dict) -> dict:
                                                      
    zona = estado["zona_segura"]

    nuevo_radio = max(
        zona["radio_minimo"],
        zona["radio_actual"] - zona["reduccion_por_ciclo"]
    )

    nueva_zona = {
        **zona,
        "radio_actual": nuevo_radio,
        "ultima_reduccion": datetime.utcnow().isoformat()
    }

    jugadores = dict(estado["jugadores"])
    eliminados = []

    for jid, j in jugadores.items():
        if not j["vivo"]:
            continue

        dist = distancia(j["x"], j["y"], zona["centro_x"], zona["centro_y"])

        if dist > nuevo_radio:
            escudo_actual = j.get("escudo", 0)

            dano = 10
            if escudo_actual > 0:
                absorbe = min(escudo_actual, dano)
                dano -= absorbe
                escudo_actual -= absorbe

            nueva_vida = max(0, j["vida"] - dano)

            nuevo_j = {
                **j,
                "vida": nueva_vida,
                "escudo": escudo_actual
            }

            if nueva_vida <= 0:
                nuevo_j["vivo"] = False
                nuevo_j["causa_eliminacion"] = "zona"
                eliminados.append(jid)

            jugadores[jid] = nuevo_j

    nuevo_estado = {
        **estado,
        "zona_segura": nueva_zona,
        "jugadores": jugadores
    }

    return agregar_evento(
        nuevo_estado,
        "reduccion_zona",
        {
            "nuevo_radio": nuevo_radio,
            "eliminados": eliminados
        }
    )
    nueva_zona = {**zona, "radio_actual": nuevo_radio, "ultima_reduccion": datetime.utcnow().isoformat()}

    jugadores = dict(estado["jugadores"])
    eliminados = []
    for jid, j in jugadores.items():
        if not j["vivo"]:
            continue
        dist = distancia(j["x"], j["y"], zona["centro_x"], zona["centro_y"])
        if dist > nuevo_radio:
                                    
            escudo_actual = j.get("escudo", 0)
            dano = 10
            if escudo_actual > 0:
                absorbe = min(escudo_actual, dano)
                dano -= absorbe
                escudo_actual -= absorbe
            nueva_vida = max(0, j["vida"] - dano)
            nuevo_j = {**j, "vida": nueva_vida, "escudo": escudo_actual}
            if nueva_vida <= 0:
                nuevo_j = {**nuevo_j, "vivo": False, "causa_eliminacion": "zona"}
                eliminados.append(jid)
            jugadores[jid] = nuevo_j

    nuevo_estado = {**estado, "zona_segura": nueva_zona, "jugadores": jugadores}
    nuevo_estado = agregar_evento(nuevo_estado, "reduccion_zona",
                                  {"nuevo_radio": nuevo_radio, "eliminados": eliminados})
    for jid in eliminados:
        nuevo_estado = agregar_evento(nuevo_estado, "eliminacion",
                                      {"jugador_id": jid, "causa": "zona"})
    return nuevo_estado


def _accion_generar_recurso(estado: dict, payload: dict) -> dict:
    recursos = estado["mapa"]["recursos"]
    if len(recursos) >= MAX_RECURSOS:
        return estado

    pos = posicion_libre(estado)
    if pos is None:
        return estado

    tipo = random.choice(["salud", "puntaje", "puntaje", "escudo"])
    nuevo_r = {"id": f"r{uuid.uuid4().hex[:6]}", "x": pos[0], "y": pos[1], "tipo": tipo}
    nuevos_recursos = recursos + [nuevo_r]
    nuevo_mapa = {**estado["mapa"], "recursos": nuevos_recursos}
    nuevo_estado = {**estado, "mapa": nuevo_mapa}
    return agregar_evento(nuevo_estado, "recurso_generado", {"recurso": nuevo_r})


def _accion_evento_aleatorio(estado: dict, payload: dict) -> dict:
    tipo_ev = payload.get("tipo_evento")
    detalle = {}

    if tipo_ev == "tormenta":
        jugadores = dict(estado["jugadores"])
        for jid, j in jugadores.items():
            if j["vivo"]:
                escudo_actual = j.get("escudo", 0)
                dano = 15
                if escudo_actual > 0:
                    absorbe = min(escudo_actual, dano)
                    dano -= absorbe
                    escudo_actual -= absorbe
                nueva_vida = max(0, j["vida"] - dano)
                vivo = nueva_vida > 0
                causa = j.get("causa_eliminacion") or ("evento" if not vivo else None)
                jugadores[jid] = {**j, "vida": nueva_vida, "escudo": escudo_actual,
                                  "vivo": vivo, "causa_eliminacion": causa}
        nuevo_estado = {**estado, "jugadores": jugadores}
        detalle = {"descripcion": "¡Tormenta! Todos reciben 15 de daño"}

    elif tipo_ev == "niebla":
        hasta = time.time() + 30                         
        nuevo_estado = {**estado, "niebla_activa": True, "niebla_hasta": hasta}
        detalle = {"descripcion": "¡Niebla! Visibilidad reducida por 30 segundos"}

    elif tipo_ev == "bonus_doble":
        hasta = time.time() + 20                        
        nuevo_estado = {**estado, "bonus_doble_activo": True, "bonus_doble_hasta": hasta}
        detalle = {"descripcion": "¡Bonus doble! Puntaje x2 por 20 segundos"}

    else:
        nuevo_estado = estado
        detalle = {"descripcion": tipo_ev}

    return agregar_evento(nuevo_estado, "evento_aleatorio", {**detalle, "tipo": tipo_ev})


def _accion_expirar_efectos(estado: dict, payload: dict) -> dict:
                                                       
    ahora = time.time()
    nuevo_estado = dict(estado)
    if estado.get("niebla_activa") and estado.get("niebla_hasta") and ahora >= estado["niebla_hasta"]:
        nuevo_estado["niebla_activa"] = False
        nuevo_estado["niebla_hasta"] = None
    if estado.get("bonus_doble_activo") and estado.get("bonus_doble_hasta") and ahora >= estado["bonus_doble_hasta"]:
        nuevo_estado["bonus_doble_activo"] = False
        nuevo_estado["bonus_doble_hasta"] = None
    return nuevo_estado


def _accion_finalizar_partida(estado: dict, payload: dict) -> dict:
    ganador_id = payload.get("ganador_id")
    motivo_fin = payload.get("motivo_fin")
    nuevo_estado = {
        **estado,
        "fase": "finalizada",
        "ganador_id": ganador_id,
        "motivo_fin": motivo_fin,
    }
    return agregar_evento(nuevo_estado, "fin_partida",
                          {"ganador_id": ganador_id, "motivo_fin": motivo_fin})


                                                                                 

_ACCIONES = {
    "unirse_partida":      _accion_unirse,
    "mover":               _accion_mover,
    "salir_partida":       _accion_salir,
    "iniciar_partida":     _accion_iniciar_partida,
    "agregar_bots":        _accion_agregar_bots,
    "quitar_bots":         _accion_quitar_bots,
               
    "reducir_zona":        _accion_reducir_zona,
    "generar_recurso":     _accion_generar_recurso,
    "evento_aleatorio":    _accion_evento_aleatorio,
    "expirar_efectos":     _accion_expirar_efectos,
    "finalizar_partida":   _accion_finalizar_partida,
}


def update(estado: dict, accion: dict) -> dict:
    tipo = accion.get("tipo")
    payload = accion.get("payload", {})
    handler = _ACCIONES.get(tipo)
    if handler is None:
        return estado
                                                  
    nuevo_estado = handler(copy.deepcopy(estado), payload)
    return nuevo_estado
