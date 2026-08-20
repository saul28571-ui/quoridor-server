# Servidor Quoridor para Render

## Configuración en Render
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Variable de entorno: `QUORIDOR_API_KEY` = `qrd_7F2m9K8x4P1v6L3`

Cuando Render cree la URL `https://NOMBRE.onrender.com`, el WebSocket será:
`wss://NOMBRE.onrender.com/ws`

Este servidor mantiene salas en memoria. Está pensado para partidas activas de dos jugadores; si el servicio se reinicia, las salas se borran.

## Protocolo y seguridad
El servidor valida turno, movimientos, saltos, paredes, cruces y caminos disponibles. Las salas son de dos jugadores y permanecen en memoria; los tokens de reconexión permiten volver a ocupar el mismo asiento tras una desconexión.
