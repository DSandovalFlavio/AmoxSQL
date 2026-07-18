# Installation

**🌐 English · [Español](../../es/user-guide/installation.md)**

> Two paths: download the pre-built Windows installer, or build from source (always free, on any platform with the build tools).

## Option A — Download the installer

Go to [GitHub Releases](https://github.com/dsandovalflavio/amoxsql/releases/latest) and download the installer for your platform.

### Windows
1. Download `AmoxSQL Setup <version>.exe`.
2. Run it. The NSIS installer lets you pick the install folder (no admin rights required).

### macOS (Apple Silicon · M1–M4)
1. Download `AmoxSQL-<version>-arm64.dmg`.
2. Open it and drag **AmoxSQL** into **Applications**.
3. **First launch:** because the build isn't yet signed with an Apple Developer ID, macOS flags anything downloaded from the internet and may say *"AmoxSQL is damaged / can't be opened."* It isn't damaged — you just need to clear the quarantine flag. Open **Terminal** and run once:
   ```bash
   xattr -cr /Applications/AmoxSQL.app
   ```
   Then open it normally. (On macOS Sequoia the right-click → Open bypass was removed, so the Terminal command is the reliable path.)

> **Note:** the macOS installer targets **Apple Silicon (arm64)**. Official signing/notarization (double-click launch without the Terminal step) will come later. Continuous pre-built installers are available to [GitHub Sponsors](https://github.com/sponsors/dsandovalflavio); building from source is always free.

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
