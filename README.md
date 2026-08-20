# Quoridor server

Servidor WebSocket Node.js para Quoridor. Escucha en `/ws` y conserva la compatibilidad del protocolo existente.

## Mejoras incluidas
- Temporizador autoritativo por turno (30 s por defecto, `QUORIDOR_TURN_SECONDS` configurable); el servidor valida el vencimiento y adjudica la victoria por tiempo.
- Reconexión mediante token de sesión con ventana de 120 s.
- Chat rápido con mensajes predefinidos (`chat`).
- Estadísticas persistentes en `stats.json` y ranking consultable con `stats`.
- Revancha (`rematch`) reinicia tablero y reloj sin romper sala.

No se despliega ni se modifica Render desde este paquete.

```bash
npm install
QUORIDOR_API_KEY=... npm start
```
