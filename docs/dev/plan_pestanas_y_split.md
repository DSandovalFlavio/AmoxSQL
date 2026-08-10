# Plan — Interactividad de pestañas y modo pantalla dividida

> **Estado: Fase 0, 1, 2, 3, 4 y 5 A/B/C IMPLEMENTADAS** (2026-08-10), rama
> `claude/tabs-split-ux` (aún sin PR — por instrucción del usuario, solo commits
> por fase; el PR se abre completo cuando el usuario lo apruebe). Ver "Registro
> de implementación" al final del documento. Fase 5 D–H (scroll sincronizado,
> pestañas fijadas, split horizontal, menú de desbordamiento, `Ctrl+1`/`Ctrl+2`)
> queda como backlog — eran el alcance explícitamente descartado del plan
> original para esta ronda.
>
> Origen: reporte del usuario — "al añadir una pestaña a la sección de la izquierda
> en realidad aparece en la derecha", falta de menú contextual en pestañas, y
> necesidad de enlazar la altura de las áreas de resultados en split.

---

## 0. Cómo está armado hoy

Tres piezas, con una separación poco habitual que explica casi todos los síntomas:

| Pieza | Archivo | Rol |
|---|---|---|
| Estado de pestañas y paneles | [LayoutManager.jsx](../../client/src/components/LayoutManager.jsx) | Dueño de `leftTabs`/`rightTabs`, `leftActiveId`/`rightActiveId`, `activePane`, `splitEnabled` |
| Chrome de pestañas | [TabBar.jsx](../../client/src/components/TabBar.jsx) | Solo presentación |
| Contenido del panel | [EditorPane.jsx](../../client/src/components/EditorPane.jsx) | Editor + resultados, uno por panel |

**Lo inusual:** las `TabBar` **no viven dentro de `EditorPane`**. Se renderizan en
[App.jsx:1246-1270](../../client/src/App.jsx#L1246), y hablan con `LayoutManager` a través de un
handle imperativo (`getTabBarProps(pane)`, [LayoutManager.jsx:672](../../client/src/components/LayoutManager.jsx#L672)).
Esto se hizo por rendimiento (memoización), pero rompió el vínculo entre "la barra que toqué"
y "el panel al que pertenece".

---

## 1. Diagnóstico — qué está roto y por qué

### 1.1 BUG RAÍZ — `createNew` ignora el panel desde el que se le llama

`getTabBarProps(pane)` recibe un `pane` y lo respeta para `tabs`, `activeTabId` y
`onTabClick`… pero `onCreateNew` devuelve `createNew` a secas
([LayoutManager.jsx:685](../../client/src/components/LayoutManager.jsx#L685)):

```js
onCreateNew: createNew,   // <-- no recibe targetPane
```

Y `createNew` decide el destino leyendo el panel **activo**, no el que pidió la acción
([LayoutManager.jsx:660](../../client/src/components/LayoutManager.jsx#L660)):

```js
if (stateRef.current.activePane === 'left') { setLeftTabs(...) }
else { setRightTabs(...) }
```

**Consecuencia exacta del reporte:** el `+` de la barra izquierda crea la pestaña en la
derecha siempre que el panel activo sea el derecho. La barra que tocaste es irrelevante.

Mismo patrón, mismo defecto, en todas estas rutas — todas escriben en `activePane`
ignorando el origen de la acción:

| Función | Línea |
|---|---|
| `createNew` | [660](../../client/src/components/LayoutManager.jsx#L660) |
| `openFile` (handle imperativo) | [741](../../client/src/components/LayoutManager.jsx#L741) |
| `handleQueryFile` (abrir CSV/Parquet/XLSX) | [991](../../client/src/components/LayoutManager.jsx#L991) |
| `openAmoxvisAsSql` | [954](../../client/src/components/LayoutManager.jsx#L954) |
| `handleEditChart` / `handleEditChartWithSql` | [882](../../client/src/components/LayoutManager.jsx#L882), [917](../../client/src/components/LayoutManager.jsx#L917) |
| `finishSaveAs` (¡escribe la ruta nueva en el panel activo!) | [795](../../client/src/components/LayoutManager.jsx#L795) |

`finishSaveAs` es el más peligroso: si guardas "Guardar como…" y el panel activo cambió,
la ruta nueva se le asigna **a la pestaña equivocada**.

### 1.2 Un panel vacío nunca puede volverse activo

`EditorPane` marca su panel como activo con
`onClickCapture={() => onTabClick(activeTabId)}` ([EditorPane.jsx:430](../../client/src/components/EditorPane.jsx#L430)).
Si el panel no tiene pestañas, `activeTabId` es `null` → el handler no hace nada →
**hacer clic en un panel vacío no lo activa**. Y las tarjetas del estado vacío
("SQL Query" / "SQL Notebook", [EditorPane.jsx:338](../../client/src/components/EditorPane.jsx#L338))
llaman a `onCreateNew` → que va a `activePane` → **el otro panel**.

Es decir: un panel vacío es un callejón sin salida. No puedes llenarlo desde él mismo.

### 1.3 Soltar una pestaña en la barra del otro panel no hace nada

`TabBar.handleDrop` llama a `onReorder(null, targetTabId, paneId)` con `paneId` =
el panel **destino** ([TabBar.jsx:29](../../client/src/components/TabBar.jsx#L29)),
y hace `stopPropagation()`. `handleReorder` entonces busca la pestaña arrastrada dentro
del panel destino, no la encuentra (`dragIdx === -1`) y **retorna sin hacer nada**
([LayoutManager.jsx:1184](../../client/src/components/LayoutManager.jsx#L1184)).

Resultado: arrastrar de un panel a otro **solo** funciona por las zonas de borde,
nunca soltando sobre la barra de pestañas destino — que es el gesto que todo el mundo
intenta primero.

### 1.4 Las zonas de arrastre están medidas contra la ventana, no contra el área de edición

`handleGlobalDragOver` ([LayoutManager.jsx:1080](../../client/src/components/LayoutManager.jsx#L1080)):

```js
const width = window.innerWidth;
const x = e.clientX;
const edgeThreshold = 100;
if (x > width - edgeThreshold) → 'right-edge'
if (x < edgeThreshold)         → 'left-edge'
```

Pero `window.innerWidth` incluye la barra de actividad (~48px) y el explorador de archivos
(~200-300px) a la izquierda, y la barra lateral de IA a la derecha cuando está abierta.
Entonces:

- La franja `x < 100` cae **encima del explorador de archivos** → la zona "left-edge" es
  prácticamente inalcanzable.
- Con la IA abierta, `x > width - 100` cae **dentro de la barra de IA** → "right-edge" tampoco.
- El overlay visual `.lm-drop-zone` es `width: 50%` **del contenedor** ([index.css:4182](../../client/src/index.css#L4182)),
  así que el resaltado ni siquiera coincide con la zona que se está detectando.

### 1.5 No hay divisor entre los dos paneles

`.lm-panes` es un flex con dos `.ep-container { flex: 1 }`
([index.css:4202](../../client/src/index.css#L4202), [3610](../../client/src/index.css#L3610)).
El split es **50/50 rígido**. No se puede dar más espacio a la query de la izquierda.
Para un IDE de comparación esto es una limitación seria.

### 1.6 No hay indicación visual de cuál panel está activo

`isActive` llega a `EditorPane` y se aplica a `.ep-editor-wrapper.active`… que está
**vacío a propósito** ([index.css:3741](../../client/src/index.css#L3741)):

```css
.ep-editor-wrapper.active {
  /* No outline — the card border handles focus state */
}
```

…pero el borde de la tarjeta no distingue activo de inactivo. Solo los notebooks
(`.ep-notebook-wrapper.active`) tienen un `outline` de acento.

**Este es el multiplicador de todos los bugs anteriores.** Aunque `activePane` sea
correcto internamente, el usuario no tiene forma de saber cuál es, así que cada acción
"a dónde fue mi pestaña" se siente aleatoria.

### 1.7 Las áreas de resultados son independientes, en píxeles, y efímeras

`resultsHeight` / `resultsWidth` son `useState` **locales de cada `EditorPane`**
([EditorPane.jsx:92-93](../../client/src/components/EditorPane.jsx#L92)):

- En split, cada panel tiene su propia altura → **quedan desalineados** (lo que reportas).
- Están en **px absolutos**, no en fracción → al redimensionar la ventana o abrir/cerrar
  la barra de IA, la proporción se descuadra.
- **No se persisten**: cada recarga vuelve a 300px.

### 1.8 No hay menú contextual en las pestañas

`TabBar` no tiene `onContextMenu` en ningún lado. El clic derecho sobre una pestaña
no hace nada. No hay renombrar, ni cerrar otras, ni mover de panel.

Hay infraestructura reutilizable ya en el repo:
- `POST /api/file/rename` ([server/index.js:3315](../../server/index.js#L3315)) — ya lo usa `FileExplorer`
- `dialog.promptAsync` ([DialogProvider.jsx:30](../../client/src/components/dialogs/DialogProvider.jsx#L30))
- Estilos `.ctx-menu` ([index.css:4210](../../client/src/index.css#L4210)) — los usan `DatabaseExplorer` y `GitPanel`

---

## 2. Principio de diseño: **la acción manda, no el foco**

Todos los bugs de la sección 1.1 son la misma decisión equivocada: *inferir* el destino
del panel activo en lugar de *recibirlo* de quien dispara la acción.

La regla para todo el plan:

> Toda acción que crea o mueve una pestaña recibe un `targetPane` explícito.
> `activePane` solo se usa como **valor por defecto** cuando de verdad no hay origen
> (atajo de teclado global, comando de la paleta, herramienta de la IA).

---

## 3. Fases

### Fase 0 — Enrutado correcto de paneles *(bug fix, base de todo)*

Sin esto, cualquier funcionalidad nueva hereda la aleatoriedad.

1. **`createNew(type, initialContent, targetPane)`** — tercer parámetro. Cae a
   `activePane` solo si viene `undefined`.
2. **`getTabBarProps(pane).onCreateNew`** pasa `pane` como `targetPane`.
   Igual en `App.jsx` `makeTabBarHandlers` — ya recibe `pane`, solo hay que reenviarlo.
3. **Mismo tratamiento** para `openFile`, `handleQueryFile`, `openAmoxvisAsSql`,
   `handleEditChart`, `handleEditChartWithSql`.
4. **`finishSaveAs`** deja de usar `activePane`: busca la pestaña por `id` en ambos
   paneles (como ya hace `handleContentChange`, [LayoutManager.jsx:218](../../client/src/components/LayoutManager.jsx#L218)).
   Extraer un helper `findTabPane(tabId)` y usarlo en todos lados.
5. **Panel vacío activable**: `EditorPane` recibe `onPaneFocus(paneId)` y lo llama en
   `onClickCapture` **siempre**, no solo cuando hay `activeTabId`. Las tarjetas del estado
   vacío pasan `paneId` a `onCreateNew`.
6. **Drop en la barra del otro panel**: `TabBar.handleDrop` debe distinguir. Si
   `draggedTab.sourcePane !== paneId` → mover de panel (e insertar en la posición del
   `targetTabId`); si es el mismo → reordenar. Requiere que `TabBar` conozca el
   `sourcePane`, vía `dataTransfer.setData('amox/tab', JSON.stringify({tabId, sourcePane}))`
   en `handleDragStart`.
7. **Zonas de arrastre relativas al contenedor**: medir contra
   `lmContainerRef.current.getBoundingClientRect()` en lugar de `window.innerWidth`, y
   usar un umbral proporcional (`Math.min(120, rect.width * 0.12)`). Así el overlay
   `.lm-drop-zone` y la detección coinciden.

**Verificación:** en split, el `+` de cada barra crea en su barra; abrir un CSV desde el
explorador cae en el panel activo *señalizado*; arrastrar una pestaña a la barra opuesta
la mueve; el resaltado de la zona de drop coincide con dónde se soltará.

---

### Fase 1 — Panel activo visible

Pequeña pero desbloquea la comprensión de todo lo demás.

- `.tab-bar-card` gana una variante `.active` con `border-color: var(--accent-primary)`
  (sutil, no un outline grueso). App ya sabe cuál es: `titleBarTabs.paneId`.
- `.ep-editor-card` con un borde de acento tenue cuando `isActive && splitEnabled`
  (fuera de split no aporta nada y solo mete ruido).
- `EditorPane` recibe `splitEnabled` para poder condicionar.

---

### Fase 2 — Menú contextual de pestaña

`TabBar` gana `onContextMenu` por pestaña → un `.ctx-menu` posicionado con `position: fixed`
(mismo patrón que `column-context-menu` en `ResultsTable`, con cierre por
`click` / `contextmenu` / `scroll` capture).

Ítems propuestos, agrupados:

| Grupo | Ítem | Notas |
|---|---|---|
| Archivo | **Renombrar…** | `dialog.promptAsync` → `POST /api/file/rename` → actualizar `path`+`name` de la pestaña. Si `path` está vacío (sin guardar), redirige a "Guardar como…" |
| | Guardar / Guardar como… | Reutiliza handlers existentes |
| | Copiar ruta | |
| | Revelar en el explorador | `window.electronAPI.showItemInFolder` si existe |
| Panel | **Mover al panel izquierdo / derecho** | Lo que pediste. Activa el split si hace falta |
| | **Abrir una copia al lado** | Duplica la pestaña en el otro panel — *el flujo clave para comparar dos variantes de una query* |
| Cerrar | Cerrar | |
| | Cerrar las demás | |
| | Cerrar las de la derecha | |
| | Cerrar todas | |

Notas de implementación:
- "Mover al panel X" es `moveTabToPane` ([LayoutManager.jsx:1140](../../client/src/components/LayoutManager.jsx#L1140)),
  que ya existe y funciona; solo hay que exponerlo por el handle imperativo.
- "Cerrar las demás/derecha/todas" debe respetar pestañas con `dirty` → confirmación
  agrupada (`dialog.confirmAsync` listando los archivos sin guardar).
- El menú se renderiza en `App.jsx` (donde vive `TabBar`), no dentro de `TabBar`, para
  no romper su `memo`.

También: **doble clic sobre el nombre de la pestaña = renombrar en línea** (como hace
`FileExplorer`), que es más rápido que ir al menú.

---

### Fase 3 — Split usable: divisor arrastrable + persistencia

1. **Divisor vertical entre paneles.** `.lm-panes` pasa de `flex:1 / flex:1` a
   `flex: <fracción>` gobernado por un estado `splitRatio` (0.2–0.8). Un
   `.lm-splitter` de 6px entre ambos, con el mismo patrón de "ghost line" que ya usa
   `EditorPane` ([EditorPane.jsx:191-256](../../client/src/components/EditorPane.jsx#L191))
   para no re-renderizar durante el arrastre.
   - **Doble clic → 50/50.**
2. **Alturas de resultados en fracción, no en px.** `resultsHeight` → `resultsRatio`
   (0.1–0.8 del alto del contenedor). Sobrevive a cambios de tamaño de ventana y a
   abrir/cerrar la barra de IA.
3. **Persistencia** en `localStorage` (`amoxsql-split-v1`): `splitRatio`,
   `resultsRatio` por panel, y el flag de enlace de la Fase 4.

---

### Fase 4 — Enlace de las áreas de resultados *(lo que pediste explícitamente)*

**Dónde va el control.** El punto donde se cruzan el divisor vertical (entre paneles) y
los dos divisores horizontales (editor/resultados) es la "cruz". Ahí va un botón redondo
pequeño, anclado sobre el `.lm-splitter`, alineado verticalmente con el resizer del panel
izquierdo.

**Comportamiento.**

- Estado `resultsLinked` (bool, persistido, **activo por defecto en split** — es lo que
  quieres el 90% del tiempo al comparar).
- Enlazado: arrastrar cualquiera de los dos resizers horizontales actualiza **el mismo**
  `resultsRatio` compartido → las dos tablas quedan siempre a la misma altura.
- Desenlazado: cada panel conserva su propio ratio (comportamiento actual).
- Icono: `LuLink` / `LuUnlink` (Lucide, sin emojis).
- Al enlazar, el ratio compartido toma el del **panel activo**, y el otro se anima hasta
  igualarlo (transición corta; sin animación se siente como un salto).

**Detalle de implementación.** Hoy el ratio vive dentro de `EditorPane`. Para enlazarlos
hay que **levantarlo a `LayoutManager`**: `EditorPane` pasa a recibir
`resultsRatio` + `onResultsRatioChange(paneId, ratio)`. Cuando `resultsLinked` está
activo, `LayoutManager` escribe un solo valor para ambos; cuando no, mantiene un mapa
`{left, right}`. Es un cambio de props contenido y quita estado duplicado.

**Ojo con el rendimiento:** el arrastre no debe hacer `setState` por cada `mousemove`.
Se conserva el patrón actual (ghost line durante el arrastre, commit del valor en
`mouseup`), que ya está resuelto en el código.

---

### Fase 5 — Funcionalidades que aprovechan el split *(recomendaciones)*

Ordenadas por relación valor/esfuerzo para un IDE de análisis:

**A. Duplicar al lado — `Ctrl+\` sobre la pestaña activa** ⭐ *la más alta*
Clona la pestaña activa en el otro panel (mismo SQL, resultados independientes) y activa
el split. Es literalmente el gesto de "quiero comparar esta query con una variante".
Hoy hay que crear archivo nuevo, copiar, pegar, arrastrar. Con esto es una tecla.

**B. Ejecutar ambos paneles — `Ctrl+Shift+Enter`** ⭐
Corre la query de los dos paneles a la vez. Comparación A/B en un gesto.
Requiere que `executeQuery` ya sea por `tabId` (lo es), así que es barato.

**C. Comparar con el panel de al lado** ⭐
`ResultsTable` ya tiene "Store A" + "Compare" ([ResultsTable.jsx:550-579](../../client/src/components/ResultsTable.jsx#L550)),
pero obliga a un paso manual de snapshot. En split, un botón directo
"Comparar con el otro panel" salta el paso intermedio y usa el `CompareResults` que ya existe.
Prácticamente gratis en implementación.

**D. Scroll horizontal sincronizado entre las dos tablas**
Cuando ambos paneles muestran resultados con el mismo esquema, sincronizar el
`scrollLeft` de los dos `.rt-content` permite comparar columna a columna sin perder el
hilo. Combina muy bien con las columnas fijables que acabamos de añadir.
Toggle al lado del botón de enlace.

**E. Pestañas fijadas (pin)**
Una pestaña fijada se encoge al icono, va al principio de la barra y sobrevive a
"cerrar todas". Útil para la query de referencia que no quieres cerrar por accidente.

**F. Split horizontal (arriba/abajo) además de izquierda/derecha**
En pantallas anchas comparar arriba/abajo a veces es mejor para tablas anchas.
`.lm-panes` ya es flex; es un `flex-direction` más un toggle. Barato.

**G. Menú de desbordamiento de pestañas**
Con 8+ pestañas la barra se satura y no hay scroll ni menú de "ver todas".
Un chevron con la lista completa (y búsqueda) resuelve.

**H. `Ctrl+1` / `Ctrl+2` para enfocar panel izquierdo / derecho**
Complementa `Ctrl+Tab` (que hoy solo navega dentro del panel activo).

**No recomendado ahora:** más de dos paneles (grid NxM). El estado actual es
`left`/`right` explícito en decenas de lugares; generalizar a un árbol de paneles es una
refactorización grande y el caso de uso (comparar 2 queries) se cubre con dos.

---

## 4. Orden sugerido y alcance por PR

| PR | Fases | Por qué juntas |
|---|---|---|
| 1 | Fase 0 + Fase 1 | Los bugs de enrutado y la señal visual de panel activo son el mismo problema para el usuario. No tiene sentido separarlos. |
| 2 | Fase 2 | Menú contextual, autocontenido. |
| 3 | Fase 3 + Fase 4 | El enlace de resultados necesita que el ratio esté levantado y persistido; van en el mismo cambio estructural. |
| 4 | Fase 5 A/B/C | Las tres de más valor, todas apoyadas en lo anterior. |
| — | Fase 5 D–H | Backlog, según qué se sienta más necesario al usarlo. |

---

## 5. Riesgos

- **Memoización.** `TabBar`, `EditorPane` y `LayoutManager` están todos bajo `memo` con
  callbacks deliberadamente estables vía `stateRef`
  ([LayoutManager.jsx:72-81](../../client/src/components/LayoutManager.jsx#L72)).
  Al añadir props nuevas (`targetPane`, `resultsRatio`, `onPaneFocus`) hay que
  mantenerlas identity-stable o se pierde el trabajo de rendimiento de auditorías previas.
- **Arrastre y rendimiento.** El patrón de ghost line existente no debe romperse al mover
  el estado del ratio hacia arriba.
- **Persistencia.** `amoxsql-layout-v1` ya guarda pestañas
  ([LayoutManager.jsx:15](../../client/src/components/LayoutManager.jsx#L15)); los tamaños
  van en una clave aparte para no invalidar la restauración de pestañas si cambia el esquema.
- **Sin tests.** El repo no tiene suite; cada fase se valida ejercitando la app
  (servidor Express + Vite en el navegador, como en las últimas sesiones).

---

## Registro de implementación (2026-08-10)

### Fase 0 + Fase 1 — commits `59fff62`, `28e58fc`

Los 7 bugs de la sección 1 quedaron corregidos (`createNew`/`handleQueryFile`/
`openAmoxvisAsSql`/`finishSaveAs` con panel destino explícito, panel vacío
activable, drop cruzado entre barras, zonas de arrastre relativas al
contenedor). La señal visual de panel activo de la Fase 1 se **implementó y
luego se retiró** por feedback directo del usuario: se veía sobrecargada
encima del `:focus-within` que ya existía solo en la tarjeta del editor desde
antes. Se mantiene únicamente ese borde original; el resto de la Fase 0
(el enrutado correcto) sigue intacto — solo se quitó la capa visual añadida,
no la lógica de foco de panel.

### Fase 2 — commit `127f889`

Menú contextual completo (clic derecho + doble clic para renombrar), con las
correcciones de enrutado documentadas en el commit. Añade un IPC nuevo,
`shell:showItemInFolder` (`electron/main.js` + `electron/preload.js`), para
"Revelar en el explorador" — no existía antes, es cheap y coherente con el
resto de acciones de archivo del menú.

De paso se corrigió el mismo bug de fondo en `handleSaveActive`: usaba
`activePane` para decidir dónde actualizar `dirty:false` tras guardar, en vez
de `findTabPane(tab.id)`. Extraído a `saveTabInternal(tab)`, reutilizado por
el trigger global (Ctrl+S) y por el "Guardar" del menú contextual (tab
explícito, no necesariamente activo).

Validado en el navegador contra el servidor real: renombrado end-to-end
(confirmado por listado de directorio, no solo por el estado de React),
duplicar-al-lado activa split y crea una copia sin path, mover colapsa el
split al vaciar un panel, cierre en bloque pide confirmación listando los
archivos con cambios sin guardar, y — el caso más importante — "Guardar
como…" disparado sobre una pestaña inactiva (con otra pestaña activa y con
cambios sin guardar en el otro panel) guarda el archivo correcto sin tocar
la pestaña activa.

### Fase 3 + 4 — commit `8045c31`

**Fase 3.** Divisor vertical arrastrable entre paneles (antes 50/50 rígido),
mismo patrón de línea fantasma que ya usaba `EditorPane` para no re-renderizar
en cada `mousemove`. Doble clic resetea a 50/50. `resultsHeight`/`resultsWidth`
(estado local en píxeles dentro de `EditorPane`) se reemplazan por un
`resultsRatio` (0-1) controlado por `LayoutManager` y renderizado como
porcentaje CSS — sobrevive a resize de ventana y a abrir/cerrar la barra de
IA sin necesitar un `ResizeObserver`. Todo persiste en `amoxsql-split-v1`.

**Fase 4 — el enlace de resultados, el pedido original del usuario.** Botón
redondo (`LuLink`/`LuUnlink`) en el divisor vertical, aproximado a la altura
donde arrancan los dos paneles de resultados. Enlazado por defecto en split:
arrastrar el resizer de CUALQUIER panel actualiza la misma altura compartida
en los dos. Al enlazar, el valor compartido adopta la proporción del panel
activo (el otro anima hasta igualarlo); al desenlazar, ambos conservan el
tamaño que tenían en ese momento — nada salta.

**Bug encontrado y corregido durante la validación en navegador:** la
restauración de la geometría del split usaba un efecto post-montaje + un ref
de "restaurado", con una condición de carrera clásica — el ref se marcaba
`true` en el mismo tick que las llamadas a `setState`, antes de que React las
aplicara, así que el efecto de persistencia (que corre en el mismo commit de
montaje) veía el ref ya en `true` pero con los valores POR DEFECTO todavía en
su closure, y sobreescribía el `localStorage` recién leído con esos defaults.
Se cambió a inicializadores perezosos de `useState` (leen `localStorage`
sincrónicamente en el primer render, sin ventana de carrera posible).
Confirmado con un ciclo completo: guardar dos archivos reales en ambos
paneles, fijar una geometría distinta (proporción de split, enlace apagado,
dos alturas de resultados diferentes), recargar la app entera, reabrir el
proyecto — los cuatro valores sobreviven exactamente, no vuelven a defaults.

### Ajustes de pulido tras feedback visual (commits `eb4f590`, `4e91dff`)

Antes de seguir a Fase 5, dos rondas de feedback directo sobre capturas reales:

1. El botón de enlace se movió del divisor vertical (entre editores) a un
   icono suelto entre las dos cintas de pestañas, arriba — sin círculo ni
   fondo, más pequeño. Vivir en el divisor lo obligaba a un círculo de 22px
   que ensanchaba visualmente esa separación.
2. El texto "Edited Xs ago · Ran Ys ago" se solapaba con los botones al
   angostar un panel. Primer umbral de `@container` (560px) resultó
   insuficiente al medir con texto REAL (no el placeholder "—" inicial) —
   subido a 760px, más una capa de `flex-shrink`+`overflow:hidden` como red
   de seguridad real contra el solape, sea cual sea el largo del texto.
3. **Bug real encontrado después de "corregir" el punto 1**: las cintas de
   pestañas quedaron visiblemente desalineadas de sus editores de abajo. La
   fila de pestañas y la fila de paneles son regiones de DOM separadas con
   modelos de padding/margin distintos (gap+botón vs. un splitter de 6px);
   el mismo `splitRatio` como porcentaje CSS en ambas no garantiza que el
   segundo panel de cada fila termine en el mismo píxel. Se resolvió
   midiendo el ancho real de `.lm-panes` con `ResizeObserver` y calculando
   en App.jsx el ancho en píxeles de cada tarjeta con la misma aritmética
   exacta que usa LayoutManager — confirmado con un barrido de ratio
   0.2–0.8, diferencia de 0px en cada punto.

### Fase 5 A/B/C — commit `1125e56`

Las tres recomendaciones de mayor valor del plan original:

- **A. Duplicar al otro panel** — `Ctrl+Shift+\`, mismo gesto que "Abrir una
  copia al lado" del menú contextual (Fase 2), ahora también por teclado.
- **B. Ejecutar ambos paneles** — `Ctrl+Shift+R` (NO `Ctrl+Shift+Enter`: ese
  combo ya pertenece a `SqlNotebook` para "Run All Cells" — es un listener
  global en `window`, con cualquier notebook montado se habría disparado
  junto con el nuevo atajo).
- **C. Comparar con el otro panel** — botón nuevo en `ResultsTable`, junto a
  "Store A", visible solo en split. Lee el otro panel BAJO DEMANDA (callback
  estable, no un prop reactivo — pasar los resultados del otro panel como
  prop normal habría roto la memoización G4 que evita que un panel se
  re-renderice cuando cambia el otro) y abre el modal de comparación en un
  clic.

**Bug real encontrado en pruebas**: la implementación de "duplicar" de la
Fase 2 vivía como propiedad inline dentro del objeto de
`useImperativeHandle`. El atajo nuevo la llamaba por su nombre a secas desde
OTRA propiedad del mismo objeto — no es una referencia válida en JS
(`ReferenceError` en cada `Ctrl+Shift+\`). Se extrajo a una función
standalone en el cuerpo del componente (mismo patrón que
`moveTabToPane`/`openAmoxvisAsSql`), reutilizada por ambos.

Validado en el navegador: `Ctrl+Shift+\` duplica y activa split;
`Ctrl+Shift+R` ejecuta las dos queries (contenido distinto por panel)
simultáneamente, confirmado por los datos reales de cada tabla; "Comparar
con el otro panel" abre el modal en un clic con el otro panel como lado A.

---

Con esto, Fase 0 a 5 (A/B/C) del plan original están implementadas. Fase 5
D–H (scroll sincronizado, pestañas fijadas, split horizontal, menú de
desbordamiento, `Ctrl+1`/`Ctrl+2`) queda como backlog — era el alcance
explícitamente descartado para esta ronda ("Fase 5 D–H: Backlog, según qué se
sienta más necesario al usarlo"). El PR se abre cuando el usuario decida
cerrar esta ronda.
