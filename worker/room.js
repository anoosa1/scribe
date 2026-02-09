/**
 * Room Durable Object
 * Manages WebSocket connections and drawing state for a single room
 */
export class Room {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.sessions = new Map(); // Map<WebSocket, { id: string }>
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

        // Accept the WebSocket with hibernation support
        this.state.acceptWebSocket(server);

        // Generate a unique ID for this session
        const sessionId = crypto.randomUUID();
        server.serializeAttachment({ id: sessionId });

        // Send current state to new client
        server.send(JSON.stringify({
            type: 'load-state',
            drawings: this.drawings,
            userCount: this.sessions.size + 1
        }));

        // Notify others of new user
        this.broadcast({
            type: 'user-count',
            count: this.sessions.size + 1
        }, server);

        return new Response(null, { status: 101, webSocket: client });
    }

    async webSocketMessage(ws, message) {
        try {
            const data = JSON.parse(message);
            const session = ws.deserializeAttachment();

            switch (data.type) {
                case 'draw':
                    this.drawings.push(data.action);
                    // Persist drawings periodically (every 10 actions)
                    if (this.drawings.length % 10 === 0) {
                        await this.state.storage.put('drawings', this.drawings);
                    }
                    this.broadcast({ type: 'draw', action: data.action }, ws);
                    break;

                case 'cursor-move':
                    this.broadcast({
                        type: 'cursor-move',
                        userId: session.id,
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
        // Get all connected WebSockets
        const sockets = this.state.getWebSockets();
        const userCount = sockets.length;

        // Notify remaining users
        this.broadcastAll({
            type: 'user-count',
            count: userCount
        });

        // If room is empty, optionally clear state
        if (userCount === 0) {
            await this.state.storage.delete('drawings');
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
