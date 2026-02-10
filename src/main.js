import { WebSocketClient } from './websocket.js';
import { Canvas } from './canvas.js';
import { TOOLS } from './tools.js';

const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

const init = () => {
    // 1. Room ID from URL or generate new one
    const path = window.location.pathname;
    let roomId = path.substring(1);

    if (!roomId || roomId.length < 5) {
        roomId = generateUUID();
        window.history.pushState({}, '', `/${roomId}`);
    }

    document.getElementById('room-id-display').textContent = roomId.substring(0, 8) + '...';
    document.getElementById('room-id-display').title = roomId;

    // 2. Initialize WebSocket and Canvas
    const canvasEl = document.getElementById('whiteboard');
    const zoomLevelEl = document.getElementById('zoom-level');

    const onZoomChange = (level) => {
        zoomLevelEl.textContent = level + '%';
    };

    let canvas;

    const socket = new WebSocketClient(roomId, {
        onDraw: (action) => canvas && canvas.drawRemote(action),
        onCursorMove: (data) => { /* Remote cursors */ },
        onUserCount: (count) => { document.getElementById('user-count').textContent = count; },
        onClear: () => canvas && canvas.clear(),
        onReloadState: (drawings) => canvas && canvas.reloadFromState(drawings)
    });

    canvas = new Canvas(canvasEl, socket, onZoomChange);

    // 3. Tool buttons
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tool = btn.id;

            // Update active state
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Set tool
            if (TOOLS[tool.toUpperCase()]) {
                canvas.currentTool = TOOLS[tool.toUpperCase()];

                // Update cursor for pan tool
                if (tool === 'pan') {
                    canvasEl.classList.add('panning');
                } else {
                    canvasEl.classList.remove('panning');
                }
            }
        });
    });

    // 4. Action buttons
    document.getElementById('undo').addEventListener('click', () => {
        socket.emitUndo();
    });

    document.getElementById('clear').addEventListener('click', () => {
        if (confirm('Clear entire canvas for everyone?')) {
            socket.emitClear();
        }
    });

    document.getElementById('reset-view').addEventListener('click', () => {
        canvas.resetView();
    });

    // Import Image
    const imageFileInput = document.getElementById('image-file-input');
    document.getElementById('import-image').addEventListener('click', () => {
        imageFileInput.click();
    });
    imageFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            canvas.importImage(file);
            imageFileInput.value = ''; // Reset so same file can be imported again
        }
    });

    // Export PNG
    document.getElementById('export-png').addEventListener('click', () => {
        canvas.exportAsImage();
    });

    // 5. Zoom controls
    document.getElementById('zoom-in').addEventListener('click', () => {
        canvas.zoomIn();
    });

    document.getElementById('zoom-out').addEventListener('click', () => {
        canvas.zoomOut();
    });

    // 6. Color Picker
    const colorPicker = document.getElementById('color-picker');
    const swatches = document.querySelectorAll('.color-swatch');

    const setColor = (color) => {
        canvas.color = color;
        colorPicker.value = color;
        swatches.forEach(s => {
            s.classList.toggle('active', s.dataset.color === color);
        });
    };

    colorPicker.addEventListener('input', (e) => setColor(e.target.value));
    swatches.forEach(swatch => {
        swatch.addEventListener('click', () => setColor(swatch.dataset.color));
    });

    // 7. Brush Size
    const sizeSlider = document.getElementById('brush-size');
    const sizeValue = document.getElementById('size-value');

    sizeSlider.addEventListener('input', (e) => {
        const size = parseInt(e.target.value, 10);
        canvas.size = size;
        sizeValue.textContent = size;
    });

    // 8. Canvas Size
    const canvasSizeSelect = document.getElementById('canvas-size');
    canvasSizeSelect.addEventListener('change', (e) => {
        const value = e.target.value;
        if (value === 'custom') {
            const widthInput = prompt('Enter width (px):', '3000');
            const heightInput = prompt('Enter height (px):', '2000');
            const width = parseInt(widthInput, 10) || 3000;
            const height = parseInt(heightInput, 10) || 2000;
            canvas.resizeCanvas(width, height);
        } else {
            const [width, height] = value.split('x').map(Number);
            canvas.resizeCanvas(width, height);
        }
    });

    // 9. Copy Room Link
    document.getElementById('copy-room-link').addEventListener('click', () => {
        navigator.clipboard.writeText(window.location.href).then(() => {
            const toast = document.getElementById('toast');
            toast.classList.remove('hidden');
            setTimeout(() => toast.classList.add('hidden'), 2000);
        });
    });

    // 10. Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;

        const shortcuts = {
            'p': 'pencil',
            'e': 'eraser',
            'l': 'line',
            'r': 'rectangle',
            'c': 'circle',
            't': 'text'
        };

        if (shortcuts[e.key.toLowerCase()]) {
            const btn = document.getElementById(shortcuts[e.key.toLowerCase()]);
            if (btn) btn.click();
        }

        // Ctrl+Z for undo
        if (e.ctrlKey && e.key === 'z') {
            e.preventDefault();
            socket.emitUndo();
        }
    });
};

init();
