# Instalación

**🌐 [English](../../en/user-guide/installation.md) · Español**

> Dos caminos: descargar el instalador pre-construido para Windows, o compilar desde el código fuente (siempre gratis, en cualquier plataforma con las herramientas de build).

## Opción A — Descargar el instalador (Windows)

1. Ve a [GitHub Releases](https://github.com/dsandovalflavio/amoxsql/releases/latest).
2. Descarga `AmoxSQL Setup <versión>.exe`.
3. Ejecútalo. El instalador NSIS te deja elegir la carpeta de instalación (no requiere permisos de administrador).

> **Nota:** los instaladores pre-construidos continuos están disponibles para [GitHub Sponsors](https://github.com/sponsors/dsandovalflavio). Compilar desde fuente es siempre gratis.

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
