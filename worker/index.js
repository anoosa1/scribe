import { Room } from './room.js';

export { Room };

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // WebSocket endpoint: /ws/:roomId
        if (url.pathname.startsWith('/ws/')) {
            const roomId = url.pathname.slice(4); // Remove '/ws/'

            if (!roomId) {
                return new Response('Room ID required', { status: 400 });
            }

            // Get the Durable Object for this room
            const roomObjectId = env.ROOM.idFromName(roomId);
            const roomObject = env.ROOM.get(roomObjectId);

            // Forward the request to the Durable Object
            return roomObject.fetch(request);
        }

        // Serve static files from the site bucket
        return env.ASSETS.fetch(request);
    }
};
