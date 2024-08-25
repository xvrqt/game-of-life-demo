{
  pkgs,
  rustPlatform,
  ...
}: let
  pkgName = "game_of_life";

  # Rust Settings
  rust_src = ./.;

  # WASM Settings
  wasm_target = "wasm32-unknown-unknown";
  wasm_flags = "--no-typescript --target web";
  wasm_src_dir = "./target/${wasm_target}/release/*.wasm";
  wasm_out_dir = "wasm"; # No './' because we use it in the install phase too
in {
  default = pkgs.stdenv.mkDerivation {
    pname = "wasm-${pkgName}";
    version = "1.0.0";
    src = rust_src;

    buildInputs = with pkgs; [
      # Rust Nightly Toolchain
      rustToolchain

      # Required to take WASM targets and create JS bindings
      wasm-bindgen-cli

      # Used to build the crate with wasm-pack
      rustPlatform.cargoSetupHook
      rustPlatform.cargoBuildHook

      cargo-generate
      llvmPackages.bintools
    ];

    # Rust Env Variables
    RUST_LOG = "debug";
    CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_LINKER = "lld";
    # Pre-download Cargo Dependencies
    cargoDeps = rustPlatform.importCargoLock {
      lockFile = ./Cargo.lock;
    };

    buildPhase = ''
      cargo fetch
      cargo build --release --target=${wasm_target}
      wasm-bindgen --out-dir ./${wasm_out_dir} ${wasm_flags} ${wasm_src_dir}
    '';

    installPhase = ''
      mkdir -p $out/${wasm_out_dir}
      cp ./${wasm_out_dir}/*.wasm $out/${wasm_out_dir}/
      cp ./${wasm_out_dir}/*.js $out/${wasm_out_dir}/
    '';
  };
}
