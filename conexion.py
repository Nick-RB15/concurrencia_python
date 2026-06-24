import aiosqlite
import asyncio
import json
from datetime import datetime
from contextlib import asynccontextmanager

DB_PATH = "arena_supervivencia.db"

                             
_conexion: aiosqlite.Connection | None = None
_lock = asyncio.Lock()


async def obtener_conexion() -> aiosqlite.Connection:
                                                       
    global _conexion
    if _conexion is None:
        _conexion = await aiosqlite.connect(DB_PATH)
        _conexion.row_factory = aiosqlite.Row
        await _conexion.execute("PRAGMA journal_mode=WAL")
        await _conexion.execute("PRAGMA foreign_keys=ON")
    return _conexion


async def cerrar_conexion():
                                    
    global _conexion
    if _conexion:
        await _conexion.close()
        _conexion = None


async def inicializar_tablas():
                                        
    conn = await obtener_conexion()
    async with _lock:
        await conn.executescript("""
            CREATE TABLE IF NOT EXISTS partidas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fecha_inicio TEXT NOT NULL,
                fecha_fin TEXT,
                duracion_segundos INTEGER,
                num_jugadores INTEGER NOT NULL,
                ganador_id TEXT,
                motivo_fin TEXT
            );

            CREATE TABLE IF NOT EXISTS resultados_jugador (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                partida_id INTEGER NOT NULL,
                jugador_id TEXT NOT NULL,
                puntaje_final INTEGER DEFAULT 0,
                posicion_final INTEGER,
                sobrevivio INTEGER DEFAULT 0,
                causa_eliminacion TEXT,
                FOREIGN KEY (partida_id) REFERENCES partidas(id)
            );

            CREATE TABLE IF NOT EXISTS historial_eventos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                partida_id INTEGER NOT NULL,
                timestamp TEXT NOT NULL,
                tipo_evento TEXT NOT NULL,
                detalle TEXT,
                FOREIGN KEY (partida_id) REFERENCES partidas(id)
            );

            CREATE TABLE IF NOT EXISTS ranking_global (
                jugador_id TEXT PRIMARY KEY,
                nombre TEXT NOT NULL,
                victorias_totales INTEGER DEFAULT 0,
                partidas_jugadas INTEGER DEFAULT 0,
                puntaje_acumulado_historico INTEGER DEFAULT 0,
                mejor_puntaje INTEGER DEFAULT 0,
                ultima_partida_fecha TEXT
            );
        """)
        await conn.commit()


                                                                                 

async def registrar_evento(partida_id: int, tipo_evento: str, detalle: dict) -> None:
                                                                                       
    conn = await obtener_conexion()
    async with _lock:
        await conn.execute(
            "INSERT INTO historial_eventos (partida_id, timestamp, tipo_evento, detalle) VALUES (?, ?, ?, ?)",
            (partida_id, datetime.utcnow().isoformat(), tipo_evento, json.dumps(detalle))
        )
        await conn.commit()


async def crear_partida(num_jugadores: int, fecha_inicio: datetime) -> int:
                                                    
    conn = await obtener_conexion()
    async with _lock:
        cursor = await conn.execute(
            "INSERT INTO partidas (fecha_inicio, num_jugadores) VALUES (?, ?)",
            (fecha_inicio.isoformat(), num_jugadores)
        )
        await conn.commit()
        return cursor.lastrowid


async def finalizar_partida(partida_id: int, fecha_fin: datetime, duracion: int,
                             ganador_id: str | None, motivo_fin: str) -> None:
                                                        
    conn = await obtener_conexion()
    async with _lock:
        await conn.execute(
            """UPDATE partidas SET fecha_fin=?, duracion_segundos=?, ganador_id=?, motivo_fin=?
               WHERE id=?""",
            (fecha_fin.isoformat(), duracion, ganador_id, motivo_fin, partida_id)
        )
        await conn.commit()


async def guardar_resultado_jugador(partida_id: int, jugador_id: str, puntaje: int,
                                    posicion: int, sobrevivio: bool,
                                    causa_eliminacion: str | None) -> None:
                                                   
    conn = await obtener_conexion()
    async with _lock:
        await conn.execute(
            """INSERT INTO resultados_jugador
               (partida_id, jugador_id, puntaje_final, posicion_final, sobrevivio, causa_eliminacion)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (partida_id, jugador_id, puntaje, posicion, int(sobrevivio), causa_eliminacion)
        )
        await conn.commit()


async def actualizar_ranking(jugador_id: str, nombre: str, gano: bool,
                              puntaje: int) -> None:
                                   
    conn = await obtener_conexion()
    async with _lock:
        existing = await (await conn.execute(
            "SELECT * FROM ranking_global WHERE jugador_id=?", (jugador_id,)
        )).fetchone()

        ahora = datetime.utcnow().isoformat()
        if existing:
            victorias = existing["victorias_totales"] + (1 if gano else 0)
            partidas = existing["partidas_jugadas"] + 1
            puntaje_acum = existing["puntaje_acumulado_historico"] + puntaje
            mejor = max(existing["mejor_puntaje"], puntaje)
            await conn.execute(
                """UPDATE ranking_global SET nombre=?, victorias_totales=?, partidas_jugadas=?,
                   puntaje_acumulado_historico=?, mejor_puntaje=?, ultima_partida_fecha=?
                   WHERE jugador_id=?""",
                (nombre, victorias, partidas, puntaje_acum, mejor, ahora, jugador_id)
            )
        else:
            await conn.execute(
                """INSERT INTO ranking_global
                   (jugador_id, nombre, victorias_totales, partidas_jugadas,
                    puntaje_acumulado_historico, mejor_puntaje, ultima_partida_fecha)
                   VALUES (?, ?, ?, 1, ?, ?, ?)""",
                (jugador_id, nombre, int(gano), puntaje, puntaje, ahora)
            )
        await conn.commit()


async def obtener_ranking() -> list[dict]:
                                                                     
    conn = await obtener_conexion()
    cursor = await conn.execute(
        """SELECT * FROM ranking_global
           ORDER BY victorias_totales DESC, puntaje_acumulado_historico DESC
           LIMIT 20"""
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def obtener_partidas_recientes() -> list[dict]:
                                      
    conn = await obtener_conexion()
    cursor = await conn.execute(
        "SELECT * FROM partidas ORDER BY id DESC LIMIT 10"
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]
