const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for simplicity in this demo
        methods: ["GET", "POST"]
    }
});

// Store room state in memory
// Map<roomId, { users: Set<socketId>, drawings: Array<DrawingAction> }>
const rooms = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (roomId) => {
        socket.join(roomId);

        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                users: new Set(),
                drawings: []
            });
            console.log(`Created room: ${roomId}`);
        }

        const room = rooms.get(roomId);
        room.users.add(socket.id);

        // Send existing state to new user
        socket.emit('load-state', room.drawings);

        // Notify others
        socket.to(roomId).emit('user-joined', { userId: socket.id, count: room.users.size });
        io.to(roomId).emit('room-people-count', room.users.size);

        console.log(`User ${socket.id} joined room ${roomId}`);
    });

    socket.on('draw', (data) => {
        const { roomId, action } = data;
        if (rooms.has(roomId)) {
            const room = rooms.get(roomId);
            room.drawings.push(action);
            // Broadcast to others in the room
            socket.to(roomId).emit('draw', action);
        }
    });

    socket.on('cursor-move', (data) => {
        const { roomId, position } = data;
        socket.to(roomId).emit('cursor-move', { userId: socket.id, position });
    });

    socket.on('undo', ({ roomId }) => {
        if (rooms.has(roomId)) {
            const room = rooms.get(roomId);
            if (room.drawings.length > 0) {
                room.drawings.pop();
                // Broadcast undo event to reload state without the last action
                io.to(roomId).emit('reload-state', room.drawings);
            }
        }
    });

    socket.on('clear-canvas', ({ roomId }) => {
        if (rooms.has(roomId)) {
            const room = rooms.get(roomId);
            room.drawings = [];
            io.to(roomId).emit('clear-canvas');
        }
    });

    socket.on('disconnecting', () => {
        const roomsJoined = socket.rooms;
        for (const roomId of roomsJoined) {
            if (rooms.has(roomId)) {
                const room = rooms.get(roomId);
                room.users.delete(socket.id);
                socket.to(roomId).emit('user-left', { userId: socket.id, count: room.users.size });
                io.to(roomId).emit('room-people-count', room.users.size);

                // Delete room when everyone leaves
                if (room.users.size === 0) {
                    rooms.delete(roomId);
                    console.log(`Room ${roomId} deleted (all users left)`);
                }
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
