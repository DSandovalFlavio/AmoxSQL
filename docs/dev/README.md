# AmoxSQL — Documentación Interna para Desarrolladores

> **Versión:** 3.8.3 · **Última actualización:** 2026-07-13
> Docs de uso **interno** (desarrollo). La **documentación de usuario** vive en
> [`docs/`](../) (guía bilingüe ES/EN). El README raíz ([`README.md`](../../README.md)) es la landing.

---

## Índice de Documentos

### `docs/dev/` — Transversales

| Documento | Propósito | Actualizar cuando... |
|-----------|-----------|----------------------|
| [arquitectura.md](arquitectura.md) | Los 3 procesos, IPC, flujo dev vs prod, debugging | Cambies la topología de procesos o el IPC bridge |
| [mapa_aplicacion.md](mapa_aplicacion.md) | Mapa completo: features, componentes, endpoints, flujos, estado, formatos | Agregues features, endpoints o formatos de archivo |
| [auditoria_rendimiento_2026-07.md](auditoria_rendimiento_2026-07.md) | Auditoría a fondo de rendimiento (tecleo, streaming, server) + plan de corrección por fases | Cierres hallazgos del plan de corrección |
| [guia_estilos.md](guia_estilos.md) | CSS tokens, theming, acentos, convenciones de clases, DO/DON'T | Agregues tokens, temas, acentos o patrones CSS nuevos |
| [auditoria_temas_2026-07.md](auditoria_temas_2026-07.md) | Auditoría del sistema de temas (hardcodes, Monaco, capa de modo, light vs dark, consolidación) + plan por fases | Cierres hallazgos del plan o rediseñes temas/acentos |
| [patrones_react.md](patrones_react.md) | State management, lazy loading, keep-alive, refs, RAF | Introduzcas un nuevo patrón de componente |
| [decisiones_tecnicas.md](decisiones_tecnicas.md) | ADRs: qué se decidió, por qué y consecuencias | Tomes una decisión técnica significativa |
| [auditoria_visualizaciones.md](auditoria_visualizaciones.md) · [plan_story_flow.md](plan_story_flow.md) | **Story Flow** (la sección de visualización): auditoría de capacidades + plan/estado de implementación por fases | Toques el visualizador / Story Flow |

### `contexto_caracteristicas/` — Por Feature

| Documento | Propósito | Actualizar cuando... |
|-----------|-----------|----------------------|
| [sistema_ai.md](../../contexto_caracteristicas/sistema_ai.md) | Agentic loop, tools completas, planner, self-correction, NarrativeCard | Agregues/modifiques tools o el loop agentic |
| [contexto_codigo_ai.md](../../contexto_caracteristicas/contexto_codigo_ai.md) | `context/`, `RULES.md`, skills — semantic layer local | Cambies los formatos de context o la UI de AI Context |
| [formatos_archivo.md](../../contexto_caracteristicas/formatos_archivo.md) | `.sqlnb`, `.amoxvis`, `.sqlnb.state.json`, `metrics.yml`, `joins.yml` | Cambies el schema de cualquier formato propio |
| [autocompletado_editor.md](../../contexto_caracteristicas/autocompletado_editor.md) | Arquitectura del autocompletado SQL (Monaco + Worker + Backend) | Toques el sistema de autocompletado |
| [notebook_sql.md](../../contexto_caracteristicas/notebook_sql.md) | Formato `.sqlnb`, celdas, ejecución, sidecar state | Cambies el formato de notebook o su parser |
| [layout_tabs_resultados.md](../../contexto_caracteristicas/layout_tabs_resultados.md) | LayoutManager, tabs, ResultsTable, DataVisualizer ("Story Flow"), DataProfiler | Toques el sistema de tabs o la visualización |
| [database_operations.md](../../contexto_caracteristicas/database_operations.md) | DatabaseManager, importación, endpoints DB | Cambies la capa de DuckDB o endpoints `/api/db/*` |

---

## Regla de Mantenimiento

**Cada commit que toca un área listada arriba debe incluir la actualización del doc correspondiente.** No como PR separado — como parte del mismo commit.

```
feat(ai): add detect_anomalies tool

- Added detect_anomalies tool in server/ai/tools.js
- Returns IQR outliers, Z-score, temporal gaps
- Updated contexto_caracteristicas/sistema_ai.md with tool docs
```

---

## Archivos que NO están aquí (y dónde buscarlos)

| Info | Dónde está |
|------|-----------|
| Guía para Claude Code | [`CLAUDE.md`](../../CLAUDE.md) — no modificar |
| **Documentación de usuario (bilingüe)** | [`docs/`](../) — guía detallada por feature |
| Landing pública | [`README.md`](../../README.md) |
| Guía de contribución | [`CONTRIBUTING.md`](../../CONTRIBUTING.md) |
| Backlog / roadmap | [`pendientes.md`](pendientes.md) · [`plan_profesionalizacion.md`](plan_profesionalizacion.md) |

---

## Quick Reference — Comandos de Desarrollo

```bash
# pnpm 11+ obligatorio (no usar npm ni yarn)
pnpm start              # Dev: Vite :5173 + Electron
pnpm client:dev         # Solo frontend (Vite)
pnpm client:build       # Build → client/dist/
pnpm dist               # client:build + electron-builder (NSIS)
pnpm run postinstall    # Rebuild módulos nativos (DuckDB) para Electron ABI
```

**Validar iconos Lu\* antes de commit:**
```bash
node -e "
const fs = require('fs'), path = require('path');
function walk(dir) { let f=[]; for(const e of fs.readdirSync(dir)){const p=path.join(dir,e); fs.statSync(p).isDirectory()?f=f.concat(walk(p)):(/\.(jsx|js)$/.test(e)&&f.push(p))} return f; }
const used = new Set();
for(const f of walk('client/src')){ const c=fs.readFileSync(f,'utf8'); if(!c.includes(\"react-icons/lu\"))continue; (c.match(/Lu[A-Z][A-Za-z0-9]*/g)||[]).forEach(m=>used.add(m)); }
const icons = require('./node_modules/react-icons/lu/index.js');
const available = new Set(Object.keys(icons));
const missing = [...used].filter(i=>!available.has(i));
console.log(missing.length===0?'OK — todos válidos':'MISSING: '+missing.join(', '));
"
```
