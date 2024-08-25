{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs = {
        nixpkgs.follows = "nixpkgs";
      };
    };
  };

  outputs = {
    nixpkgs,
    flake-utils,
    rust-overlay,
    ...
  }:
    flake-utils.lib.eachDefaultSystem (
      system: let
        # Used to ensure we build our Rust packages with Nightly
        rustToolchainFile = ./rust-toolchain.toml;
        rustToolchainSettings = {
          extensions = ["rust-src"];
          targets = ["wasm32-unknown-unknown"];
        };
        rustToolchain.default = final: _: {
          rustToolchain =
            (final.rust-bin.fromRustupToolchainFile rustToolchainFile).override rustToolchainSettings;
        };
        # Setup pkgs with Rust overlays
        pkgs = import nixpkgs {
          inherit system;
          overlays = [
            (import rust-overlay)
            rustToolchain.default
          ];
        };
      in
        with pkgs; rec {
          ##############
          ## PACKAGES ##
          ##############
          packages = let
            # Build with a custom Rust builder
            rustPlatform = pkgs.makeRustPlatform {
              cargo = pkgs.rustToolchain;
              rustc = pkgs.rustToolchain;
            };
            # Compiles the WASM code used by the website, and the JS Bindings
            wasm = (pkgs.callPackage ./wasm-game-of-life {inherit pkgs rustPlatform;}).default;
            # Simple copy of the website source into the Nix Store
            website = (pkgs.callPackage ./www {inherit pkgs;}).default;
          in {
            inherit wasm website;
            # Combine them into a single Nix Store path
            all = pkgs.symlinkJoin {
              name = "gol_website";
              paths = [wasm website];
            };
            default = packages.all;
          };

          ############
          ## SHELLS ##
          ############
          devShells = let
          in
            mkShell {
              buildInputs = [
                # Rust Nightly Toolchain
                ((rust-bin.fromRustupToolchainFile ./rust-toolchain.toml).override {extensions = ["rust-src"];})

                # Required to create the WASM targets, and pack them for web
                wasm-pack
                cargo-generate
                llvmPackages.bintools
                wasm-bindgen-cli

                # Local Webserver
                python3
              ];

              CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_LINKER = "lld";

              shellHook = ''
                project_directory=$(pwd)

                clear
                if pgrep -x python3 >> /dev/null
                then
                  echo "Server already running."
                else
                  # Start the server, set a trap on exit
                  python3 -m http.server 6969 -d ./www > logs/server.log 2>&1 &
                  WEB_PID=$!
                  # Clean up the server on exit
                  trap "kill -9 $WEB_PID" EXIT
                fi
                # Convenience function
                alias rebuild-wasm='wasm-pack build $project_directory/wasm-game-of-life --target web --out-dir $project_directory/www/wasm'
              '';
            };
          nixosModules = {
            lib,
            config,
            ...
          }: let
            # Check if both the website service is enabled, and this specific site is enabled.
            cfgcheck = config.services.websites.enable && config.services.websites.sites.${pkgName}.enable;
            # Website url
            domain = config.services.websites.sites.${pkgName}.domain;
          in {
            # Create the option to enable this site, and set its domain name
            options = {
              services = {
                websites = {
                  sites = {
                    "${pkgName}" = {
                      enable = lib.mkEnableOption "Webpage displaying Conway's Game of Life in a WebGL rendered grid.";
                      domain = lib.mkOption {
                        type = lib.types.str;
                        default = "gol.xvrqt.com";
                        example = "gateway.xvrqt.com";
                        description = "Domain name for the website. In the form: sub.domain.tld, domain.tld";
                      };
                    };
                  };
                };
              };
            };

            config = {
              # Add the website to the system's packages
              environment.systemPackages = [website];

              # Configure a virtual host on nginx
              services.nginx.virtualHosts.${domain} = lib.mkIf cfgcheck {
                forceSSL = true;
                enableACME = true;
                acmeRoot = null;
                locations."/" = {
                  root = "${website}";
                };
              };
            };
          };
        }
    );
}
