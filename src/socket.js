import { io } from "socket.io-client";

class SocketClient {
    constructor(url, roomId, onDraw, onCursorMove, onUserCount, onClear, onReloadState) {
        this.socket = io(url);
        this.roomId = roomId;
        this.userId = null;

        this.onDraw = onDraw;
        this.onCursorMove = onCursorMove;
        this.onUserCount = onUserCount;
        this.onClear = onClear;
        this.onReloadState = onReloadState; // New handler for reloading full state

        this.init();
    }

    init() {
        this.socket.on("connect", () => {
            console.log("Connected to server");
            this.userId = this.socket.id;
            this.socket.emit("join-room", this.roomId);
        });

        this.socket.on("draw", (data) => {
            this.onDraw(data);
        });

        this.socket.on("cursor-move", (data) => {
            this.onCursorMove(data);
        });

        this.socket.on("load-state", (drawings) => {
            // Initial load of all drawings
            drawings.forEach(action => this.onDraw(action));
        });

        this.socket.on("reload-state", (drawings) => {
            // Clear and redraw everything (used for undo)
            this.onReloadState(drawings);
        });

        this.socket.on("user-joined", ({ count }) => {
            this.onUserCount(count);
        });

        this.socket.on("user-left", ({ count }) => {
            this.onUserCount(count);
        });

        this.socket.on("room-people-count", (count) => {
            this.onUserCount(count);
        });

        this.socket.on("clear-canvas", () => {
            this.onClear();
        });
    }

    emitDraw(action) {
        this.socket.emit("draw", { roomId: this.roomId, action });
    }

    emitCursorMove(position) {
        this.socket.emit("cursor-move", { roomId: this.roomId, position });
    }

    emitUndo() {
        this.socket.emit("undo", { roomId: this.roomId });
    }

    emitClear() {
        this.socket.emit("clear-canvas", { roomId: this.roomId });
    }
}

export default SocketClient;
