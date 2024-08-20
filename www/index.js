import {
  enableCanvasWindowResizeEvent,
  quickCreateWebGLProgram,
  updateUniformTime,
  startUniformTimer,
  enableMouseEventListener,
} from "./scripts/webgl.js";
import {
  vertex_shader_source,
  fragment_shader_source,
} from "./scripts/shaders.js";
import init, { Universe, Cell } from "./wasm/wasm_game_of_life.js";

let universe = null;
async function run() {
  // Load the WASM so we can use the functions defined therein
  let wasm = await init();

  // Create WebGL program & context
  const [canvas, gl, program] = quickCreateWebGLProgram(
    "canvas",
    vertex_shader_source,
    fragment_shader_source,
  );
  // Quit if something went wrong
  if (!canvas || !gl || !program) {
    return null;
  }

  // Calculate the Game of Life cell grid dimensions
  let [width, height] = calculateGridDimensions(canvas);
  universe = Universe.new(width, height);
  console.log(width, height);
  console.log(universe);

  // Initialize Uniforms
  startUniformTimer();
  updateUniformTime(gl, program);
  // Sets a uniform that moves the light with the mouse
  enableMouseEventListener(gl, program);
  // Reset the view, canvas size, and grid size on a resize
  enableCanvasWindowResizeEvent(gl, program, "resolution", () => {
    let [width, height] = calculateGridDimensions(canvas);
    updateUniformGridDimension(gl, program, width, height);
    draw(gl);
  });
  updateUniformGridDimension(gl, program, width, height);

  // Initialize key event handlers
  window.addEventListener("keydown", onKeyDown);
  // Kick off the render
  renderLoop(gl, program, universe, wasm);
}

// Handles keyboard input
let onKeyDown = function (event) {
  if (event.key == " ") {
    paused = !paused;
  }
};

let paused = false;
const FPS = 30.0;
const min_frame_time = 1000 / FPS;
// Timestamp of when the simulation began
let start_time = Date.now();
// Timestamp of the last frame
let last_frame_time = Date.now();
// Time the Universe of Cells last updated
let last_tick_time = Date.now();
function renderLoop(gl, program, universe, wasm) {
  let current_time = Date.now();
  let time_elapsed = current_time - start_time;
  let time_elapsed_since_last_frame = current_time - last_frame_time;
  let time_elapsed_since_last_tick = current_time - last_tick_time;

  // Update the simulation every second
  if (!paused && time_elapsed_since_last_tick > 1000) {
    last_tick_time = current_time;
    // universe.tick();
    updateActiveBlocks(gl, program, universe, wasm.memory);
  }
  // Draw every frame
  if (time_elapsed_since_last_frame >= min_frame_time) {
    last_frame_time = current_time;
    updateTimeUniform(gl, program, time_elapsed);
    draw(gl);
  }
  // Call ourselves again
  requestAnimationFrame(() => {
    renderLoop(gl, program, universe, wasm);
  });
}

// Updates the "grid_dimensions" ivec2 uniform in the shader
function updateUniformGridDimension(webgl, program, width, height) {
  let location = webgl.getUniformLocation(program, "grid_dimensions");
  webgl.uniform2i(location, width, height);
}

// Calculate the grid dimensions from the canvas size
// Input: Canvas Element
// Output: Width (number of cells left to right)
//         Height (number of cells up to down)
let min_grid_dimension = 8;
function calculateGridDimensions(canvas) {
  const xy_ratio = (1.0 * canvas.width) / canvas.height;
  let width = min_grid_dimension;
  let height = min_grid_dimension;
  if (xy_ratio > 1) {
    // Wide Screen
    width = Math.round(min_grid_dimension * xy_ratio);
    width -= width % 2; // Ensure even dimensions
  } else if (xy_ratio < 1) {
    // Tall Screen
    height = Math.round(min_grid_dimension * (1 / xy_ratio));
    height -= height % 2; // Ensure even dimensions
  }
  console.log(xy_ratio);
  return [width, height];
}

function updateActiveBlocks(gl, program, universe, memory) {
  const height = universe.height();
  const width = universe.width();
  const cells_ptr = universe.cells();
  console.log(width, height);
  const cells = new Uint32Array(memory.buffer, cells_ptr, (width * height) / 4);

  console.log(cells);
  let cells_location = gl.getUniformLocation(program, "cells");
  gl.uniform1uiv(cells_location, cells);
  // let lol = new Uint32Array(cells);
  // console.log(lol);
  // gl.uniform1uiv(cells_location, lol);
}

function updateTimeUniform(gl, program, secs_elapsed) {
  const time_location = gl.getUniformLocation(program, "time");
  gl.uniform1f(time_location, secs_elapsed);
}

function draw(gl) {
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// Let the show begin!
run();
