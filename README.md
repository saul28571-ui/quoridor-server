# Quoridor online server (Node.js + ws)

Replacement-ready Render service for the Quoridor Godot online client. This is a normal Node.js WebSocket server; it intentionally does **not** use Cloudflare `worker.js`.

## Deploy on Render

Push the four root files in this package to the existing GitHub Render repository (or replace its contents), then deploy the Web Service. Render uses `render.yaml`; set `QUORIDOR_API_KEY` to the same key compiled/configured in the client. The WebSocket endpoint is:

`wss://YOUR-SERVICE.onrender.com/ws`

`/health` returns a small JSON health response.

## Protocol/features

Preserves API-key validation, `/ws`, room creation/join, five-character room codes, moves, jump/side-step rules, walls and path validation, turns, authoritative per-turn timer, names, reconnect tokens, opponent disconnect notification, chat, and `rematch`.

Also supports the current expansion messages: `profile_get`, `stats`, `ranking_get`, `friend_request`, `invite`, `challenge_create`, `rematch_request`, `replay_save`, `replay_list`, `tournament_create`, and `tournament_join`. Notifications are delivered as `{type:"notification", event:...}`. Replay records are also captured server-side for online games.

## Local validation

```bash
npm install
npm run check
npm start
```

## Persistence and limitations

Profiles, ratings, invitations, tournament metadata, and saved replay payloads are written to `quoridor-data.json`. Render's free filesystem is ephemeral: data can be lost on restart/redeploy, and this single-process in-memory room state is not suitable for multiple instances. For production durability/scale, replace the JSON store and room maps with Postgres/Redis (or another shared store), and add authentication/rate limiting as appropriate. No deployment is performed by this package.
