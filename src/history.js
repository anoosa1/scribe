export class History {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = 50;
    }

    saveState() {
        if (this.undoStack.length >= this.maxHistory) {
            this.undoStack.shift();
        }
        // We save the image data as a snapshot
        this.undoStack.push(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height));
        this.redoStack = []; // Clear redo stack on new action
    }

    undo() {
        if (this.undoStack.length === 0) return null;

        // Save current state to redo stack before undoing
        this.redoStack.push(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height));

        const previousState = this.undoStack.pop();
        this.ctx.putImageData(previousState, 0, 0);
        return previousState; // Signal that undo happened
    }
}
