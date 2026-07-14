# Instalación

**🌐 [English](../../en/user-guide/installation.md) · Español**

> Dos caminos: descargar el instalador pre-construido para Windows, o compilar desde el código fuente (siempre gratis, en cualquier plataforma con las herramientas de build).

## Opción A — Descargar el instalador

Ve a [GitHub Releases](https://github.com/dsandovalflavio/amoxsql/releases/latest) y descarga el instalador de tu plataforma.

### Windows
1. Descarga `AmoxSQL Setup <versión>.exe`.
2. Ejecútalo. El instalador NSIS te deja elegir la carpeta de instalación (no requiere permisos de administrador).

### macOS (Apple Silicon · M1–M4)
1. Descarga `AmoxSQL-<versión>-arm64.dmg`.
2. Ábrelo y arrastra **AmoxSQL** a la carpeta **Aplicaciones**.
3. **La primera vez:** como el build aún no está firmado con un Apple Developer ID, macOS lo marca al descargarlo de internet y puede decir *"AmoxSQL está dañado / no se puede abrir"*. No está dañado — solo hay que quitarle la marca de cuarentena. Abre **Terminal** y ejecuta una vez:
   ```bash
   xattr -cr /Applications/AmoxSQL.app
   ```
   Luego ábrelo normal. (En macOS Sequoia ya no funciona el clic-derecho → Abrir; por eso el comando de Terminal es el camino confiable.)

> **Nota:** el instalador de macOS es para chips **Apple Silicon (arm64)**. La firma/notarización oficial (para abrir con doble clic sin el paso de Terminal) llegará más adelante. Los instaladores pre-construidos continuos están disponibles para [GitHub Sponsors](https://github.com/sponsors/dsandovalflavio); compilar desde fuente es siempre gratis.

## Opción B — Compilar desde el código fuente

### Requisitos
- **Node.js 20+**
- **pnpm 11+** (obligatorio — no uses `npm` ni `yarn`)
- Herramientas de compilación de C++ (para los bindings nativos de DuckDB). En Windows, "Desktop development with C++" de Visual Studio Build Tools.

### Pasos
```bash
# 1. Clona el repositorio
git clone https://github.com/dsandovalflavio/amoxsql.git
cd amoxsql

# 2. Instala dependencias en la raíz Y dentro de client/
pnpm install
pnpm --dir client install

# 3. Lanza la app en modo desarrollo
pnpm start
```

`pnpm start` levanta el servidor de desarrollo, espera a que esté listo, y abre la app de escritorio.

### Por qué pnpm
pnpm 11 aplica una **cuarentena de 24 h** para versiones recién publicadas y una allowlist explícita de scripts de instalación — una defensa contra ataques de cadena de suministro. Usar `npm`/`yarn` se salta estas protecciones y no está soportado.

### Módulos nativos
El hook `postinstall` recompila los módulos nativos (notablemente el binding de DuckDB) contra el ABI de Node de Electron. Si DuckDB no carga tras `pnpm install`, corre de nuevo:
```bash
pnpm run postinstall
```

### Generar un instalador
```bash
pnpm dist   # build del cliente + electron-builder (NSIS en Windows)
```

> Las versiones auto-compiladas no incluyen auto-updates ni binarios firmados.

## Relacionado
- [Primeros pasos](first-steps.md) · [Introducción](introduction.md)
