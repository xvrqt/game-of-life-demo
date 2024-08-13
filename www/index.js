import init, { Universe } from "./wasm/wasm_game_of_life.js";

async function run() {
  // Load the WASM so we can use the functions defined therein
  await init();
  const pre = document.getElementById("game-of-life-canvas");
  const universe = Universe.new();

  const renderLoop = () => {
    pre.textContent = universe.render();
    universe.tick();

    requestAnimationFrame(renderLoop);
  };

  requestAnimationFrame(renderLoop);
}

run();
