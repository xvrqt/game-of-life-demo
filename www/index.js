import init, { greet } from "./wasm/wasm_game_of_life.js";

async function run() {
  // Load the WASM so we can use the functions defined therein
  await init();
  greet();
}

run();
