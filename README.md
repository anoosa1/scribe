# Collaboard

A real-time collaborative whiteboard. Create a room, share the link, draw together.

Built on Cloudflare Workers + Durable Objects for the backend, vanilla JS for the frontend.

## What it does

- Freehand drawing, shapes (lines, rectangles, circles), text, eraser
- Import images onto the canvas
- Export the canvas as a PNG
- Real-time collaboration
- Pan & zoom (scroll wheel or Space + drag)
- Room state persists in Durable Object storage so late joiners see existing drawings
- Rooms clean up automatically when everyone leaves

## Running locally

```bash
npm install
npm run build
npm run dev
```

Opens on `http://localhost:8787`. Open it in two tabs to test collab.

## Deploying

```bash
npm run deploy
```

This builds with Vite and deploys to Cloudflare via Wrangler. You'll need a Cloudflare account with Workers paid plan (for Durable Objects).

## Project structure

```
index.html          — the whole UI, single page
src/
  main.js           — app init, event wiring, keyboard shortcuts
  canvas.js         — drawing engine, pan/zoom, import/export
  websocket.js      — WebSocket client with auto-reconnect
  tools.js          — tool constants
  style.css         — styles
worker/
  index.js          — Cloudflare Worker entry, routes /ws/:roomId to Durable Objects
  room.js           — Room Durable Object, manages WebSocket connections + drawing state
wrangler.toml       — Cloudflare config
```

## Keyboard shortcuts

| Key | Tool |
|-----|------|
| P | Pencil |
| E | Eraser |
| L | Line |
| R | Rectangle |
| C | Circle |
| T | Text |
| Space + drag | Pan |
| Ctrl+Z | Undo |
