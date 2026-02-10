/**
 * Room Durable Object
 * Manages WebSocket connections and drawing state for a single room
 */
export class Room {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.drawings = [];

        // Load persisted state
        this.state.blockConcurrencyWhile(async () => {
            const stored = await this.state.storage.get('drawings');
            if (stored) {
                this.drawings = stored;
            }
        });
    }

    async fetch(request) {
        // Handle WebSocket upgrade
        const upgradeHeader = request.headers.get('Upgrade');
        if (!upgradeHeader || upgradeHeader !== 'websocket') {
            return new Response('Expected WebSocket', { status: 426 });
        }

        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);

        // Generate a unique ID for this session
        const sessionId = crypto.randomUUID();

        // Accept the WebSocket with hibernation support
        this.state.acceptWebSocket(server, [sessionId]);

        // Get current connection count
        const sockets = this.state.getWebSockets();
        const userCount = sockets.length;

        // Send current state to new client (after accept)
        server.send(JSON.stringify({
            type: 'load-state',
            drawings: this.drawings,
            userCount: userCount
        }));

        // Notify others of new user
        this.broadcast({
            type: 'user-count',
            count: userCount
        }, server);

        return new Response(null, { status: 101, webSocket: client });
    }

    async webSocketMessage(ws, message) {
        try {
            const data = JSON.parse(message);
            const tags = this.state.getTags(ws);
            const sessionId = tags[0] || 'unknown';

            switch (data.type) {
                case 'draw':
                    // Guard against oversized payloads (e.g. uncompressed images)
                    const actionStr = JSON.stringify(data.action);
                    if (actionStr.length > 900 * 1024) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Draw action too large to sync'
                        }));
                        break;
                    }
                    // Attach userId so clients can isolate per-user paths
                    const action = { ...data.action, userId: sessionId };
                    this.drawings.push(action);
                    // Persist immediately for images (high-value), otherwise every 10 actions
                    if (action.type === 'image' || this.drawings.length % 10 === 0) {
                        await this.state.storage.put('drawings', this.drawings);
                    }
                    this.broadcast({ type: 'draw', action }, ws);
                    break;

                case 'cursor-move':
                    this.broadcast({
                        type: 'cursor-move',
                        userId: sessionId,
                        position: data.position
                    }, ws);
                    break;

                case 'undo':
                    if (this.drawings.length > 0) {
                        this.drawings.pop();
                        await this.state.storage.put('drawings', this.drawings);
                        this.broadcastAll({
                            type: 'reload-state',
                            drawings: this.drawings
                        });
                    }
                    break;

                case 'clear':
                    this.drawings = [];
                    await this.state.storage.put('drawings', this.drawings);
                    this.broadcastAll({ type: 'clear' });
                    break;
            }
        } catch (e) {
            console.error('WebSocket message error:', e);
        }
    }

    async webSocketClose(ws, code, reason, wasClean) {
        // Close the socket explicitly so it's cleaned up
        try { ws.close(code, 'Durable Object is closing WebSocket'); } catch (e) { }

        // Get remaining connected WebSockets (exclude the one that just closed)
        const sockets = this.state.getWebSockets();
        const remaining = sockets.filter(s => s !== ws);
        const userCount = remaining.length;

        // Notify remaining users
        for (const socket of remaining) {
            try {
                socket.send(JSON.stringify({ type: 'user-count', count: userCount }));
            } catch (e) { }
        }

        // If room is empty, clear persisted state
        if (userCount === 0) {
            await this.state.storage.deleteAll();
            this.drawings = [];
        }
    }

    async webSocketError(ws, error) {
        console.error('WebSocket error:', error);
    }

    // Broadcast to all except sender
    broadcast(message, sender) {
        const sockets = this.state.getWebSockets();
        const msg = JSON.stringify(message);
        for (const socket of sockets) {
            if (socket !== sender) {
                try {
                    socket.send(msg);
                } catch (e) {
                    // Socket might be closed
                }
            }
        }
    }

    // Broadcast to all including sender
    broadcastAll(message) {
        const sockets = this.state.getWebSockets();
        const msg = JSON.stringify(message);
        for (const socket of sockets) {
            try {
                socket.send(msg);
            } catch (e) {
                // Socket might be closed
            }
        }
    }
}
