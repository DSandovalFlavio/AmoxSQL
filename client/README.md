# AmoxSQL — Cliente (frontend)

Este directorio es la SPA de React (Vite) que actúa como **renderer** de AmoxSQL.
No es una app independiente: se ejecuta dentro del shell de Electron y habla con el
servidor Express local por HTTP.

- **Documentación de usuario:** [`../docs/`](../docs/)
- **README principal:** [`../README.md`](../README.md)
- **Guía de arquitectura:** [`../docs/dev/arquitectura.md`](../docs/dev/arquitectura.md) y [`../CLAUDE.md`](../CLAUDE.md)

## Desarrollo

`client/` es un proyecto pnpm independiente (tiene su propio `package.json` y
`pnpm-workspace.yaml`). Desde la **raíz** del repositorio:

```bash
pnpm install            # instala deps de la raíz
pnpm --dir client install   # instala deps del cliente
pnpm start              # levanta Vite + espera :5173 + lanza Electron
```

Solo-frontend (Vite en :5173, sin Electron): `pnpm client:dev`.
Build de producción → `client/dist/`: `pnpm client:build`.

> Para todo lo demás (comandos, formatos de archivo, endpoints, convenciones),
> ver [`../CLAUDE.md`](../CLAUDE.md).
