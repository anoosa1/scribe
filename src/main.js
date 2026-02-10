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

    // Remote cursor state
    const remoteCursors = new Map(); // userId -> { element, timeout }
    const cursorColors = ['#ef4444', '#3b82f6', '#22c55e', '#f97316', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b'];
    let colorIndex = 0;
    const cursorColorMap = new Map(); // userId -> color
    const remoteCursorsContainer = document.getElementById('remote-cursors');

    const getCursorColor = (userId) => {
        if (!cursorColorMap.has(userId)) {
            cursorColorMap.set(userId, cursorColors[colorIndex % cursorColors.length]);
            colorIndex++;
        }
        return cursorColorMap.get(userId);
    };

    const socket = new WebSocketClient(roomId, {
        onDraw: (action) => canvas && canvas.drawRemote(action),
        onCursorMove: (data) => {
            if (!canvas || !remoteCursorsContainer) return;
            const { userId, position } = data;
            if (!userId || !position) return;

            let cursor = remoteCursors.get(userId);
            if (!cursor) {
                // Create cursor element using DOM API (avoid innerHTML for XSS safety)
                const el = document.createElement('div');
                el.className = 'remote-cursor';
                const color = getCursorColor(userId);

                const pointer = document.createElement('div');
                pointer.className = 'remote-cursor-pointer';
                pointer.style.color = color;

                const label = document.createElement('div');
                label.className = 'remote-cursor-label';
                label.style.background = color;
                label.textContent = userId.substring(0, 4);

                el.appendChild(pointer);
                el.appendChild(label);
                remoteCursorsContainer.appendChild(el);
                cursor = { element: el, timeout: null };
                remoteCursors.set(userId, cursor);
            }

            // Position cursor using canvas transform
            const px = position.x * canvas.scale + canvas.offsetX;
            const py = position.y * canvas.scale + canvas.offsetY;
            cursor.element.style.left = px + 'px';
            cursor.element.style.top = py + 'px';
            cursor.element.style.display = 'block';

            // Auto-hide after 5s of inactivity
            clearTimeout(cursor.timeout);
            cursor.timeout = setTimeout(() => {
                cursor.element.style.display = 'none';
            }, 5000);
        },
        onUserCount: (count) => { document.getElementById('user-count').textContent = count; },
        onClear: () => canvas && canvas.clear(),
        onReloadState: (drawings) => canvas && canvas.reloadFromState(drawings),
        onConnectionChange: (status) => {
            const statusEl = document.getElementById('connection-status');
            if (!statusEl) return;
            const dot = statusEl.querySelector('.status-dot');
            dot.className = 'status-dot ' + (status === 'connected' ? 'connected' : status === 'connecting' ? 'connecting' : 'disconnected');
            const labels = { connected: 'Connected', connecting: 'Reconnecting...', disconnected: 'Disconnected' };
            statusEl.title = labels[status] || status;
        }
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
    const canvasSizeOverlay = document.getElementById('canvas-size-overlay');
    const canvasWidthInput = document.getElementById('canvas-width-input');
    const canvasHeightInput = document.getElementById('canvas-height-input');
    const canvasSizeConfirm = document.getElementById('canvas-size-confirm');
    const canvasSizeCancel = document.getElementById('canvas-size-cancel');

    const openCanvasSizeModal = () => {
        canvasWidthInput.value = canvas.virtualWidth;
        canvasHeightInput.value = canvas.virtualHeight;
        canvasSizeOverlay.classList.remove('hidden');
        canvasWidthInput.focus();
        canvasWidthInput.select();
    };

    const closeCanvasSizeModal = () => {
        canvasSizeOverlay.classList.add('hidden');
        // Reset select to current size
        const current = `${canvas.virtualWidth}x${canvas.virtualHeight}`;
        const option = [...canvasSizeSelect.options].find(o => o.value === current);
        canvasSizeSelect.value = option ? current : 'custom';
    };

    const applyCanvasSize = () => {
        const width = Math.min(Math.max(parseInt(canvasWidthInput.value, 10) || 3000, 100), 10000);
        const height = Math.min(Math.max(parseInt(canvasHeightInput.value, 10) || 2000, 100), 10000);
        canvas.resizeCanvas(width, height);
        closeCanvasSizeModal();
    };

    canvasSizeSelect.addEventListener('change', (e) => {
        const value = e.target.value;
        if (value === 'custom') {
            openCanvasSizeModal();
        } else {
            const [width, height] = value.split('x').map(Number);
            canvas.resizeCanvas(width, height);
        }
    });

    canvasSizeConfirm.addEventListener('click', applyCanvasSize);
    canvasSizeCancel.addEventListener('click', closeCanvasSizeModal);

    canvasSizeOverlay.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            applyCanvasSize();
        } else if (e.key === 'Escape') {
            closeCanvasSizeModal();
        }
    });

    // 8b. Dark Mode Toggle
    const darkModeCheckbox = document.getElementById('dark-mode-checkbox');
    const savedDarkMode = localStorage.getItem('scribe-dark-mode') === 'true';

    if (savedDarkMode) {
        darkModeCheckbox.checked = true;
        canvas.setDarkMode(true);
    }

    darkModeCheckbox.addEventListener('change', () => {
        const enabled = darkModeCheckbox.checked;
        canvas.setDarkMode(enabled);
        localStorage.setItem('scribe-dark-mode', enabled);
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
            't': 'text',
            'h': 'pan'
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

    // ======== 11. Mobile Toolbar Logic ========
    const isMobileQuery = window.matchMedia('(max-width: 768px)');
    const toolbar = document.getElementById('toolbar');
    const mobileBackdrop = document.getElementById('mobile-backdrop');
    const panelToggle = document.getElementById('mobile-panel-toggle');
    const mobileToolBtns = document.querySelectorAll('.mobile-tool-btn[data-tool]');

    let panelOpen = false;

    const openPanel = () => {
        panelOpen = true;
        toolbar.classList.add('open');
        mobileBackdrop.classList.add('visible');
        mobileBackdrop.classList.remove('hidden');
        panelToggle.classList.add('panel-open');
    };

    const closePanel = () => {
        panelOpen = false;
        toolbar.classList.remove('open');
        mobileBackdrop.classList.remove('visible');
        mobileBackdrop.classList.add('hidden');
        panelToggle.classList.remove('panel-open');
    };

    if (panelToggle) {
        panelToggle.addEventListener('click', () => {
            panelOpen ? closePanel() : openPanel();
        });
    }

    if (mobileBackdrop) {
        mobileBackdrop.addEventListener('click', closePanel);
    }

    // Mobile tool buttons sync with desktop sidebar
    mobileToolBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tool = btn.dataset.tool;

            // Update mobile active state
            mobileToolBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Trigger matching desktop button
            const desktopBtn = document.getElementById(tool);
            if (desktopBtn) desktopBtn.click();

            // Close panel if open
            closePanel();
        });
    });

    // Sync desktop tool button clicks back to mobile buttons
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const toolId = btn.id;
            mobileToolBtns.forEach(mb => {
                mb.classList.toggle('active', mb.dataset.tool === toolId);
            });
        });
    });

    // Mobile undo button
    const mobileUndo = document.getElementById('mobile-undo');
    if (mobileUndo) {
        mobileUndo.addEventListener('click', () => {
            socket.emitUndo();
        });
    }
};

init();
