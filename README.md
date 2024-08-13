# xvrqt graphics demos website

My personal webpage displaying my computer graphics projects.

## Installation

Given this is a static website, it is trivial to serve.
Using Nix makes it more complicated because of course it does, so here's how to use Nix Flakes to serve it.

### Setup

First, you need to use my [websites](https://github.com/xvrqt/website-flake) flake to setup the appropriate options, and configurations to serve this website.
<TODO>
Add this flake to the [websites](https://github.com/xvrqt/website-flake) flake inputs, and add its NixOS Module to the outputs:

```nix
{
  inputs = {
    homepage.url = "github:xvrqt/xvrqt_homepage";
  };

  outputs = {...} @ sites: {
    nixosModules.default.imports = [
      # ... other sites
      sites.homepage.nixosModules.default
    ];
  };
}
```

### Options

Fortunately, this should already be included because you wrote both flakes. When you have added this flake as an input to the `website` flake, and then added the `website` flake to your NixOS Configuration flake modules list, then you can enable it in your main NixOS module via the following options:

```nix
services = {
  websites = {
    enable = true;
    email = "my@email.com";
    dnsProvider = "cloudflare";
    dnsTokenFile = ./path/to/secret;
    sites = {
      homepage = {
        enable = true;
        domain = "xvrqt.com";
      };
    };
  };
};
```
