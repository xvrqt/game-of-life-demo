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

async function run() {
  // Load the WASM so we can use the functions defined therein
  let wasm = await init();

  // Create WebGL program & context
  const [canvas, gl, program] = quickCreateWebGLProgram(
    "canvas",
    vertex_shader_source,
    fragment_shader_source,
  );
  if (!canvas || !gl || !program) {
    // Quit if something went wrong
    return null;
  }

  const min_grid_dimension = 8;
  const xy_ratio = (1.0 * canvas.width) / canvas.height;
  let width = min_grid_dimension;
  let height = min_grid_dimension;
  if (xy_ratio > 1) {
    // Wide Screen
    width = Math.round(min_grid_dimension * xy_ratio);
  } else if (xy_ratio < 1) {
    // Tall Screen
    height = Math.round(min_grid_dimension * xy_ratio);
  }
  console.log(width, height, xy_ratio);
  let universe = Universe.new(width, height);
  console.log(universe);

  // Initialize Uniforms
  startUniformTimer();
  updateUniformTime(gl, program);
  enableMouseEventListener(gl, program);
  enableCanvasWindowResizeEvent(gl, program, "resolution");

  // Kick off the render
  renderLoop(gl, program, universe, wasm);
}

let paused = false;
let start_time = Date.now();
let last_tick_time = Date.now();
function renderLoop(gl, program, universe, wasm) {
  let current_time = Date.now();
  let time_elapsed = current_time - start_time;
  let time_elapsed_since_last_tick = current_time - last_tick_time;

  if (!paused && time_elapsed_since_last_tick > 1000) {
    // universe.tick();
    updateActiveBlocks(gl, program, universe, wasm.memory);
    last_tick_time = current_time;
  }
  if (!paused && time_elapsed > 1000 / 60) {
    updateTimeUniform(gl, program, time_elapsed);
    draw(gl);
  }
  requestAnimationFrame(() => {
    renderLoop(gl, program, universe, wasm);
  });
}

function updateActiveBlocks(gl, program, universe, memory) {
  const height = universe.height();
  const width = universe.width();
  const cells_ptr = universe.cells();
  const cells = new Uint8Array(memory.buffer, cells_ptr, width * height);
  // console.log(cells);
  let cells_location = gl.getUniformLocation(program, "cells");
  gl.uniform1uiv(cells_location, cells, 0, cells.length);
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
