# Pendientes — Backlog por sesión

Lista viva de cosas por hacer/validar que se van acumulando sesión a sesión.
No es el roadmap formal (ese vive en `plan_profesionalizacion.md`); esto es el
cajón de "lo dejamos para después" para no perderlo.

## Cómo usar
- Añade un ítem nuevo bajo **Abiertos** con un id `PEND-NNN`, qué es, por qué,
  dónde (archivo:línea si aplica) y la fecha.
- Estados: `Pendiente de validar` · `Por hacer` · `En progreso` · `Hecho`.
- Cuando se cierre, muévelo a **Cerrados** con la fecha y una nota corta.

---

## Abiertos

### [PEND-001] Promover los contenedores de lista del sidebar a su propia capa (scroll jank residual)
- **Estado:** Pendiente de validar
- **Fecha:** 2026-06-26
- **Contexto:** Con un gráfico (`.amoxvis` / Story Flow) abierto, el scroll del sidebar
  daba saltos. Ya se mitigó bastante: el gráfico se aisló con `contain: layout paint`
  y se promovió a capa GPU con `transform: translateZ(0)` en
  `client/src/components/DataVisualizer/renderers/ChartRenderer.jsx` (wrapChart) y
  `client/src/components/AmoxvisPane.jsx` (chart area). El usuario lo siente "mejor".
- **Pendiente:** Si todavía se nota micro-tirón, promover también los contenedores de
  lista del sidebar a su propia capa de composición (`.file-list`, `.db-tree`, etc.
  con `will-change: transform` / `translateZ(0)`).
- **Riesgo/nota:** OJO con `position: fixed` dentro de un ancestro transformado — un
  `transform` crea un containing block para los hijos `fixed`, lo que **rompería** la
  posición de menús contextuales. Verificar que los menús (FileExplorer, DatabaseExplorer)
  se rendericen FUERA del contenedor que se transforme (en FileExplorer el context menu
  es hermano de `.file-list`, así que sería seguro). NO transformar `.sidebar` entero.

---

## Cerrados

(vacío por ahora)
