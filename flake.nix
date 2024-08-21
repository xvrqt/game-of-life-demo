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
  }: let
    # DevShell for developing the website
    # Installs Nightly Rust Toolchain (because we are using WASM targets)
    # Also installs and runs a local server for previewing changes
    devShells =
      flake-utils.lib.eachDefaultSystem
      (
        system: let
          overlays = [(import rust-overlay)];
          pkgs = import nixpkgs {
            inherit system overlays;
          };
          project_path = "/home/xvrqt/dev/game_of_life_webpage";
        in
          with pkgs; {
            devShells.default = mkShell {
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
                alias rebuild-wasm='wasm-pack build ${project_path}/wasm-game-of-life --target web --out-dir ${project_path}/www/wasm'
              '';
            };
          }
      );
  in {
    # Unwrap the set created by flake-utils: devShells = { devShells = {...}; };
    devShells = devShells.devShells;
    # Parent flake import the default module to install the site's package, and configure serving it with nginx
    nixosModules = {
      default = {
        lib,
        pkgs,
        config,
        ...
      }: let
        # Convenience
        pkgName = "game_of_life";
        # Create a new derivation which simply copies the static site contents to the /nix/store
        website = pkgs.stdenv.mkDerivation {
          name = "website-${pkgName}";
          src = ./.;

          installPhase = ''
            cp -r $src/www $out
          '';
        };

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
                  enable = lib.mkEnableOption "Webpage displaying my graphics prowress.";
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
            extraConfig = ''
              charset utf-8;
              etag on;
              index index.html;
              http2_push_preload on;
              expires $expires;
            '';
            locations."/" = {
              root = "${website}";
              extraConfig = ''
                try_files $uri $uri/ =404;

                 http2_push /styles.css;
                 http2_push /index.js;
              '';
            };
          };
        };
      };
    };
  };
}
