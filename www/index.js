import init from "./wasm/wasm_game_of_life.js";

async function run() {
  // Load the WASM so we can use the functions defined therein
  let wasm = await init();
}
run();

// Set constants for the grid's display
// const CELL_SIZE = 5;
// const GRID_COLOR = "#CCCCCC";
// const ALIVE_COLOR = "#000000";
// const DEAD_COLOR = "#FFFFFF";

// Create a new universe in WASM memory
// const universe = Universe.new(60, 60);
// const width = universe.width();
// const height = universe.height();

// Grab & Initialize canvas + context
// const canvas = document.getElementById("game-of-life-canvas");
// const ctx = canvas.getContext("2d");
// canvas.height = (CELL_SIZE + 1) * (height + 1);
// canvas.width = (CELL_SIZE + 1) * (width + 1);
// // Toggle on click
// canvas.addEventListener("click", (event) => {
//   const boundingRect = canvas.getBoundingClientRect();
//
//   const scaleX = canvas.width / boundingRect.width;
//   const scaleY = canvas.height / boundingRect.height;
//
//   const canvasLeft = (event.clientX - boundingRect.left) * scaleX;
//   const canvasTop = (event.clientY - boundingRect.top) * scaleY;
//
//   const row = Math.min(Math.floor(canvasTop / (CELL_SIZE + 1)), height - 1);
//   const col = Math.min(Math.floor(canvasLeft / (CELL_SIZE + 1)), width - 1);
//
//   universe.toggle_cell(row, col);
//
//   drawGrid();
//   drawCells();
// });
//
// Main Render Loop
//   let paused = false;
//   let last_tick_time = new Date();
//   document.onkeypress = (event) => {
//     if (event.code == "Space") {
//       paused = !paused;
//     } else if (event.code == "Digit1") {
//       console.log("girls");
//       universe.all_alive();
//       drawGrid();
//       drawCells();
//     } else if (event.code == "Digit0") {
//       console.log("gay");
//       universe.all_dead();
//       drawGrid();
//       drawCells();
//     }
//   };
//   const renderLoop = () => {
//     let current_time = new Date();
//     let time_elapsed = current_time - last_tick_time;
//
//     if (!paused && time_elapsed > 500) {
//       universe.tick();
//       drawGrid();
//       drawCells();
//       last_tick_time = current_time;
//     }
//
//     requestAnimationFrame(renderLoop);
//   };
//
//   const drawGrid = () => {
//     ctx.beginPath();
//     ctx.strokeStyle = GRID_COLOR;
//     // Vertical lines.
//     for (let i = 0; i <= width; i++) {
//       ctx.moveTo(i * (CELL_SIZE + 1) + 1, 0);
//       ctx.lineTo(i * (CELL_SIZE + 1) + 1, (CELL_SIZE + 1) * height + 1);
//     }
//
//     // Horizontal lines.
//     for (let j = 0; j <= height; j++) {
//       ctx.moveTo(0, j * (CELL_SIZE + 1) + 1);
//       ctx.lineTo((CELL_SIZE + 1) * width + 1, j * (CELL_SIZE + 1) + 1);
//     }
//
//     ctx.stroke();
//   };
//
//   // Get linear index of a cell's position in a 2D universe
//   const getIndex = (row, column) => {
//     return row * width + column;
//   };
//
//   const drawCells = () => {
//     const cellsPtr = universe.cells();
//     const cells = new Uint8Array(wasm.memory.buffer, cellsPtr, width * height);
//
//     ctx.beginPath();
//
//     for (let row = 0; row < height; row++) {
//       for (let col = 0; col < width; col++) {
//         const idx = getIndex(row, col);
//
//         ctx.fillStyle = cells[idx] === Cell.Dead ? DEAD_COLOR : ALIVE_COLOR;
//
//         ctx.fillRect(
//           col * (CELL_SIZE + 1) + 1,
//           row * (CELL_SIZE + 1) + 1,
//           CELL_SIZE,
//           CELL_SIZE,
//         );
//       }
//     }
//
//     ctx.stroke();
//   };
//
//   // Kick off the animation
//   requestAnimationFrame(renderLoop);
// }
//
