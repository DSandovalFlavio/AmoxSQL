# Installation

**🌐 English · [Español](../../es/user-guide/installation.md)**

> Two paths: download the pre-built Windows installer, or build from source (always free, on any platform with the build tools).

## Option A — Download the installer (Windows)

1. Go to [GitHub Releases](https://github.com/dsandovalflavio/amoxsql/releases/latest).
2. Download `AmoxSQL Setup <version>.exe`.
3. Run it. The NSIS installer lets you pick the install folder (no admin rights required).

> **Note:** continuous pre-built installers are available to [GitHub Sponsors](https://github.com/sponsors/dsandovalflavio). Building from source is always free.

## Option B — Build from source

### Requirements
- **Node.js 20+**
- **pnpm 11+** (mandatory — do not use `npm` or `yarn`)
- C++ build tools (for DuckDB's native bindings). On Windows, Visual Studio Build Tools' "Desktop development with C++".

### Steps
```bash
# 1. Clone the repository
git clone https://github.com/dsandovalflavio/amoxsql.git
cd amoxsql

# 2. Install dependencies at the root AND inside client/
pnpm install
pnpm --dir client install

# 3. Launch the app in development mode
pnpm start
```

`pnpm start` boots the dev server, waits until it's ready, and opens the desktop app.

### Why pnpm
pnpm 11 enforces a **24-hour quarantine** on freshly published versions and an explicit install-script allowlist — a defense against supply-chain attacks. Using `npm`/`yarn` bypasses these protections and is not supported.

### Native modules
The `postinstall` hook rebuilds native modules (notably the DuckDB binding) against Electron's Node ABI. If DuckDB fails to load after `pnpm install`, run again:
```bash
pnpm run postinstall
```

### Build an installer
```bash
pnpm dist   # client build + electron-builder (NSIS on Windows)
```

> Self-built versions don't include auto-updates or signed binaries.

## Related
- [First steps](first-steps.md) · [Introduction](introduction.md)
