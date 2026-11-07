# Plan — El Assistant donde está el trabajo

**Sale de:** [auditoria_ux_assistant.md](auditoria_ux_assistant.md) (A1–A13)
**Estado:** propuesta, sin implementar (2026-11-07). Mockups en el artifact «El Assistant donde está el trabajo».

## La idea

```
 editor ─────────────────────────────────────────────┬─ Assistant (chat) ──────┐
 18  round(100 * (venta / venta_mes_anterior - 1), 1) │ Explain · Fix · Chart   │
 - 20 round(100 * (venta / venta_mes_anterior - 1)…   │  (según el archivo)     │
 + 20 round(100 * (venta / nullif(venta_mes_anter…    │                         │
      [ Accept ] [ Reject ]   1 of 1 change           │ Proposed 1 change in    │
 ┌─ selección ─┐                                      │ lines 20 · Review ↑     │
 │ Explain  Fix  Optimize  Ask… │                      │                         │
 └──────────────┘                                     │ [caja]                  │
 resultados: ✗ Binder Error … [ Fix with Assist ]     └─────────────────────────┘
```

- **Acciones en contexto** sin abrir el chat a mano: una barra pequeña sobre la selección; «Fix with Assist» en el
  error; «Explain» y «Chart it» en el resultado. Abren el panel con la pregunta y su contexto ya puestos.
- **Cambios dentro del editor:** la propuesta se ve como diff en el propio archivo (lo que sale y lo que entra), con
  Accept / Reject por bloque. El chat solo la anuncia («Proposed 1 change in line 20 · Review»).
- **El chat, para conversar:** la respuesta primero, el trabajo plegado en una línea, un inicio que sabe qué archivo
  tienes y en qué estado está.

## En qué archivos trabaja hoy (revisado el 2026-11-07)

El panel se liga a **cualquier pestaña con archivo** (`activeFilePath`): con **Ctrl+L** se abre sobre todos. El botón
**Assist** solo está en cuatro editores. Lo que ve es `getActiveTabInfo` (el texto entero de la pestaña, y en un `.sql`
también su resultado y su gráfico). Lo que cambia es `write_file`, que en modo `overwrite` **reescribe el archivo
completo**, sea del tipo que sea. El prompt solo le habla de «the SQL editor or notebook».

| Archivo | Botón | Qué ve | Qué puede cambiar hoy | Riesgo |
|---|---|---|---|---|
| `.sql` | sí | consulta, objetos que lee, resultado, gráfico | reescribe el archivo; aplica un gráfico al de sus resultados | medio (A1, A2) |
| `.sqlnb` notebook | sí | el texto entero del cuaderno; **no** la celda activa ni sus resultados (el cuaderno ejecuta por su cuenta) | reescribe **todo** el cuaderno (celdas, marcas, parámetros) | alto |
| `.md` | sí | el documento | reescribe todo el documento | medio |
| `.amoxdeck` Report Flow | sí | el markdown del deck | reescribe todo el deck | alto |
| `.amoxvis`, `.sqlchain`, `.amoxcanvas`, `.amoxdiagram`, texto | no (solo Ctrl+L) | el archivo **crudo** (JSON o mermaid) | lo reescribiría entero: puede dejar un JSON roto | alto |
| cualquiera | — | — | `write_file` con `create` o `append` **escribe en disco sin revisión** | **alto** |

**A14 (Alta, nuevo).** `write_file` en modo `create` o `append` escribe en disco directamente, sin Accept ni aviso
(`server/ai/tools.js:1105`). Todo lo demás del Assistant pasa por el editor y se guarda a mano; esto no.

**A15 (Media, nuevo).** El Assistant no sabe qué es cada archivo: no tiene instrucciones para un notebook, un deck o
un `.amoxvis`, ni ve la celda o la lámina en la que estás.

### Qué cambia el plan por tipo

- **E1** se amplía: `create` y `append` piden confirmación como cualquier propuesta (A14); en archivos estructurados
  (`.amoxvis`, `.sqlchain`, `.amoxcanvas`, `.amoxdiagram`) el Assistant **explica pero no reescribe** hasta tener
  herramientas propias; el prompt dice qué tipo de archivo es y qué puede tocar (A15).
- **E2** por tipo: en el **notebook**, el Assistant ve la celda activa, su resultado y su error, y las puertas
  (selección, Fix, Explain) viven en cada celda; en **Report Flow**, la lámina en la que estás; en **Markdown**, la
  selección del texto.
- **E3** por tipo: en `.sql` el diff va en el editor; en el **notebook** la propuesta es **por celda** (cambia una
  celda o añade una nueva), nunca el cuaderno entero; en **Report Flow**, por lámina; en **Markdown**, en la vista de
  código. «Insert at cursor» significa en el notebook «nueva celda debajo» y en el deck «nueva lámina después».
- **E4** igual para todos.
- Fuera de este plan, como trabajo propio: herramientas del Assistant para `.amoxvis` (cambiar el gráfico por sus
  paneles) y `.sqlchain` (proponer pasos de Data Flow).

## Fases

### E1 — Que no engañe ni rompa (sin cambiar la forma)
- **A1** una propuesta se guarda con su estado (`propuesta | aplicada | rechazada`) y al reabrir se ve como lo que
  es: pendiente con Accept / Reject, o aplicada, o rechazada. Nunca «Write file ✓» si no se aplicó.
- **A2** «Apply to editor» deja de reemplazar todo: **Insert at cursor** (o **Replace selection** si hay selección),
  con deshacer y un aviso de dónde entró.
- **A7** «Run» corre la consulta en la pestaña de resultados de una sola pestaña «Assist» reutilizada, no una nueva
  cada vez.
- **A8** cabecera: historial, nuevo y un menú «…» (exportar, Deep Dive, ayuda); cerrar con título; la papelera pasa a
  «New chat»; fuera el «Close Assist» repetido.
- **A10, A11** un solo idioma; «CLOUD» con cualquier proveedor en la nube.
- **Guía:** quitar «Selección = alcance» hasta que sea verdad (E2).

### E2 — Las puertas donde ocurre el trabajo
- **A3** la selección del editor viaja con cada pregunta (`getActiveTabInfo` gana `seleccion: { texto, desde,
  hasta }`), y el servidor la pone en el prompt como el alcance.
- Una barra flotante sobre la selección: **Explain · Fix · Optimize · Ask…** (Ask abre la caja con la selección como
  referencia). **Ctrl+L con selección** hace lo mismo que Ask.
- **Fix with Assist** en el mensaje de error de una consulta (editor SQL y celda de notebook): manda la consulta, el
  error y el esquema de lo que lee; la respuesta llega como propuesta (E3).
- **Explain this result** y **Chart it** en la barra de resultados.
- **A6** el inicio según el archivo: con consulta → Explain / Optimize / Comment it; con error → Fix the error; con
  resultado → Chart the result / What stands out?; notebook, `.amoxvis` y `.sqlchain` con las suyas.

### E3 — El diff en el editor
- **A4** diff de verdad por líneas (LCS), puro y probado aparte.
- La propuesta se pinta **en el editor** (decoraciones de líneas quitadas y añadidas, como en la vista de diferencias
  del propio editor) con una barra: **Accept · Reject · Next change**, por bloque. Mientras hay una propuesta, el
  archivo no se puede editar en esas líneas sin descartarla antes.
- El chat la anuncia con su resumen y «Review», que lleva al editor.
- Aceptar sigue sin guardar en disco.

### E4 — El chat, más corto
- **A5** la respuesta primero; el trabajo plegado en una línea («Ran 1 query · drew 1 chart · proposed 1 change»),
  que se abre si se quiere. La consulta del propio archivo no se repite entera.
- **A12** el gráfico del chat con sus acciones en un menú y «Apply to this file's chart».
- **A9** el nombre del archivo al que pertenece la conversación, arriba del chat; el historial muestra las del
  archivo y las recientes.

## Orden sugerido

**E1** primero (pequeño, evita perder trabajo). **E2 + E3** juntas: las puertas sin el diff en el editor dejarían las
propuestas igual de lejos. **E4** al final.

## Cómo se verifica

- `scripts/probarAssist.mjs`: el diff (líneas que entran, salen, se mueven, se repiten), la propuesta que sobrevive a
  recargar con su estado, «Insert at cursor» que no toca el resto del archivo, la selección en el prompt.
- En la app, con conversaciones sembradas como en esta auditoría. Lo que dependa del modelo, con tu prueba.

## Decisiones que te tocan

1. **¿Barra flotante sobre la selección o solo Ctrl+L?** Propuesta: las dos; la barra aparece solo con una selección
   de más de una palabra y se cierra con Escape, para no estorbar al escribir.
2. **¿El diff en el editor bloquea editar esas líneas mientras está pendiente?** Propuesta: sí, con «Reject» a mano;
   editar encima de una propuesta da resultados confusos.
3. **«Run» desde el chat:** ¿una pestaña «Assist» reutilizada, o correrla en el panel del chat como hace Deep Dive?
   Propuesta: en el chat, con «Open in editor» para llevarla a una pestaña.
