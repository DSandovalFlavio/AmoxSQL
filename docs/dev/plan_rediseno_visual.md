# Plan de Implementación — Rediseño visual

> **Estado**: plan de trabajo · **Fecha**: 2026-09-06
> **Contexto**: ver [`discovery_rediseno_visual.md`](./discovery_rediseno_visual.md) y el mockup interactivo [`mockup_rediseno_visual.html`](./mockup_rediseno_visual.html).
> **Objetivo**: que la interfaz se sienta menos "matrix" y más moderna, sin perder la identidad.

> **Estado (2026-09-07)**: fases **0 a 7 y 9 implementadas** en la rama
> `claude/rediseno-visual`. Queda **solo la fase 8** (omnibox: búsqueda de
> archivos y esquema). Nada mergeado a `main` todavía.

Fases ordenadas por **riesgo ascendente / valor descendente**. Cada fase es entregable por sí sola, salvo la dependencia explícita de F1 sobre F0.

## Principios de ejecución
- **No virtualizar** listas/tablas (regla del proyecto).
- **Sin emojis**: iconos Lucide (`react-icons/lu`) siempre.
- **Sin referencias a tecnologías externas** en código, comentarios, UI ni docs.
- Verificación: no hay tests ni linters en `package.json`. Validar corriendo la app (`pnpm start`) y ejercitando la ruta afectada. **No afirmar que se corrieron pruebas.**
- Todo cambio de color pasa por tokens. Nada de literales en componentes.
- Cada fase debe dejar funcionando los **16 presets de acento** y los **temas** (`theme-onyx`, `theme-amoxdark`, `mode-light`, …).

---

## Resumen de fases

| Fase | Nombre | Riesgo | Valor | Núcleo |
|---|---|:--:|:--:|---|
| 0 | Superficies y tipografía del shell | Bajo | Alto | Profundidad y "caja normal" — sin tocar JS |
| 1 | Resplandor de acento en el fondo | Bajo | Alto | El gradiente. **Depende de F0** |
| 2 | Iluminación configurable | Medio | Alto | Intensidad, esquina y fuerza del resplandor |
| 3 | Barra de ventana | Medio | Medio | Logo-menú, breadcrumb, omnibox (carcasa) |
| 4 | Bienvenida 50/50 | Medio | Alto | Recomposición completa de `WelcomeScreen` |
| 5 | Animación de partículas | Medio | Medio | El lienzo derecho de la bienvenida |
| 6 | Data Flow — pulido del nodo | Bajo | Alto | Puertos nombrados, run por nodo, clúster de zoom |
| 7 | Data Flow — nodos expandibles | Alto | Muy alto | Configuración inline; altura dinámica |
| 8 | Omnibox — archivos y esquema | Medio | Alto | La búsqueda real detrás del campo de la F3 |

---

## FASE 0 — Superficies y tipografía del shell ✅ IMPLEMENTADA (2026-09-06)

**Objetivo**: que las regiones se distingan y el chrome deje de leerse como consola. Todo es CSS; ningún componente React cambia.

**Archivos**: `client/src/index.css`.

| # | Cambio | Dónde | Detalle |
|---|---|---|---|
| 0.1 | Escala de elevación en el shell | `.activity-bar` (~1980), `.sidebar` (~2093) | `background-color: transparent` → `--surface-base` en el rail y `--surface-raised` en el panel lateral. Idem panel de resultados y barra de estado (`--surface-inset`). |
| 0.2 | Paneles como tarjetas | contenedor del shell (~1975) | `border-radius: 8px` + `1px solid var(--border-subtle)` + canal de `6px` de fondo entre regiones. Extender el `margin: 6px 0 6px 6px` existente a las cuatro caras y a todas las regiones. |
| 0.3 | Bordes estructurales visibles | `--border-subtle` | `rgba(255,255,255,.06)` → `.085`. **Solo el token global**; si algún divisor interno queda muy marcado, bajarlo localmente en esa regla, no revertir el token. |
| 0.4 | Encabezados en caja normal | `.side-hd h3`, agrupadores del explorador, `th` de resultados | Quitar `text-transform: uppercase` y `letter-spacing`. Subir 1px el tamaño para compensar. |
| 0.5 | Monoespaciada fuera del chrome | `.chain-node-duration`, `.chain-node-config-summary`, tamaños de archivo del explorador | Pasar a `var(--font-sans)`. **Conservar** mono en Monaco y en columnas numéricas de resultados. |
| 0.6 | Nodos de Data Flow planos | `.chain-node` (~13550) | `background: var(--surface-raised)`, `border: 1px solid var(--border-default)`. El `--node-accent` se reserva para el icono, el badge y el handle. |
| 0.7 | Neutros con tinte | `--surface-*` (~17) | Croma `0.006` → `0.012` en la escala de `:root`. **Revisar tema por tema**: `theme-onyx` usa hex planos y no debe tocarse (es true black por diseño). |

**Riesgos**: 0.3 y 0.7 son tokens globales — tocan toda la app. Revisar como mínimo Obsidian, Onyx, AmoxDark y un tema claro.

**Aceptación**: el rail, el panel lateral, el editor y los resultados se distinguen sin esfuerzo; ningún encabezado de panel en mayúsculas; los 16 acentos y todos los temas siguen legibles.

---

## FASE 1 — Resplandor de acento en el fondo ✅ IMPLEMENTADA (2026-09-06)

> **Depende de F0.2.** Sin las tarjetas y su canal, el resplandor no tiene por dónde asomar y el efecto se pierde.

**Objetivo**: que el acento tiña la aplicación, no solo los botones. El resplandor vive en el **fondo**, detrás de todos los paneles, y sube desde detrás del panel lateral atravesando la barra de ventana.

**Archivos**: `client/src/index.css`, `client/src/components/WindowTitleBar.jsx` (solo si hace falta un contenedor).

```css
/* la capa de fondo, detrás de los paneles */
.app-shell {
  background:
    radial-gradient(52% 42% at var(--glow-x) var(--glow-y),
      color-mix(in oklch, var(--accent-primary) var(--glow-strength), transparent) 0%,
      transparent 68%),
    radial-gradient(30% 26% at var(--glow-x2) var(--glow-y2),
      color-mix(in oklch, var(--accent-primary) var(--glow-strength-2), transparent) 0%,
      transparent 72%),
    var(--surface-base);
}
.window-title-bar { background: transparent; }
```

Las variables se dejan **parametrizadas desde el inicio** aunque en F1 tengan valor fijo — F2 solo les cambia el valor, sin volver a tocar esta regla.

| Token | Valor en F1 |
|---|---|
| `--glow-x` / `--glow-y` | `3%` / `-8%` |
| `--glow-x2` / `--glow-y2` | `26%` / `-4%` |
| `--glow-strength` | `30%` |
| `--glow-strength-2` | `13%` |

**Riesgos**: en **modo claro** un resplandor del 30% sobre fondo claro se ve sucio. Definir un juego de valores propio bajo `.mode-light` (arrancar en ~12%/6%). Ojo también con `theme-onyx`: su gracia es el negro puro, quizá quiera un resplandor más discreto.

**Aceptación**: el acento asoma por la barra de ventana, los canales entre tarjetas y los bordes; los paneles opacos lo tapan. Cambiar de acento cambia el resplandor. Nada se ve sucio en claro ni en Onyx.

---

## FASE 2 — Iluminación configurable ✅ IMPLEMENTADA (2026-09-06)

**Objetivo**: que el usuario module la luz. Tres controles nuevos, una sola sección de ajustes ("Iluminación", junto al selector de acento).

**Archivos**: `client/src/index.css`, `client/src/App.jsx` (estado + persistencia), `client/src/components/SettingsModal.jsx` (UI).

### 2.1 — Intensidad del acento

| | |
|---|---|
| Token | `--acc-l` |
| Default | **`0.730`** |
| Rango | **`0.600` – `0.950`**, paso `0.005` |
| Clave | `amoxsql-accent-l` |

**Obstáculo real**: los ~16 presets codifican el `oklch()` completo en una sola declaración —
`.accent-amox-6 { --accent-primary: oklch(0.77 0.140 228); }` (`index.css:782`) — así que hoy la L no es direccionable. Hay que descomponerlos:

```css
.accent-amox-6 { --acc-l: 0.77; --acc-c: 0.140; --acc-h: 228; }
/* y una sola composición en el derivador de body */
body { --accent-primary: oklch(var(--acc-l) var(--acc-c) var(--acc-h)); }
```

Dos detalles que van a morder si se ignoran:

1. **`.accent-islands` es hex plano** (`#548af7`, `index.css:763`), no `oklch()`. Hay que convertirlo a L/C/H a mano o dejarlo como excepción que no responde al slider.
2. **El derivador vive en `body`, no en `:root`** (ver el comentario de `index.css:37-45`): una custom property cuyo valor es `var(...)` resuelve en el elemento donde se declara. Si `--accent-primary` se compone en `:root`, se congela en el acento por defecto y **todos los acentos volverán a verse cian** — que es exactamente el bug ya arreglado en PR #70. La composición va en `body`.

**Precedencia**: la preferencia del usuario se aplica como estilo inline en `body`
(`body.style.setProperty('--acc-l', v)`), que gana a la clase del preset.

**Decisión de comportamiento** — al elegir un preset nuevo, el slider **salta a la L propia de ese preset** en vez de conservar el valor anterior. Razón: los presets `amox-2…amox-10` son una rampa que varía L y tono a la vez; forzarles una L ajena les borra la identidad. Así el swatch elige el color y el slider es una desviación deliberada. El default `.730` aplica al cian por defecto.

### 2.2 — Esquina del resplandor

Preset de posición, no coordenadas libres. Cada opción fija los cuatro tokens de F1:

| Opción | `--glow-x` / `--glow-y` | `--glow-x2` / `--glow-y2` |
|---|---|---|
| **Superior izquierda** (default) | `3%` / `-8%` | `26%` / `-4%` |
| Superior centro | `50%` / `-8%` | `28%` / `-4%` |
| Superior derecha | `97%` / `-8%` | `74%` / `-4%` |
| Inferior izquierda | `3%` / `108%` | `26%` / `104%` |
| Inferior derecha | `97%` / `108%` | `74%` / `104%` |

Clave: `amoxsql-glow-corner`. Nota de diseño: las opciones inferiores **no tocan la barra de ventana** — el resplandor sale por detrás de la barra de estado. Es un efecto legítimo pero distinto; conviene que la UI de ajustes lo insinúe con una miniatura, no solo con el nombre.

### 2.3 — Fuerza del resplandor

| | |
|---|---|
| Token | `--glow-strength` (el secundario se deriva: `calc(var(--glow-strength) * 0.43)`) |
| Default | **`30%`** |
| Rango | **`0%` – `50%`**, paso `1%` |
| Clave | `amoxsql-glow-strength` |

`0%` lo apaga por completo — no hace falta un interruptor aparte de encendido/apagado. En `.mode-light` el mismo porcentaje pesa más, así que el token debe escalarse (~40% del valor) o guardarse por modo.

> `color-mix()` acepta una custom property como porcentaje siempre que resuelva a un `<percentage>` **con el símbolo `%` incluido**. Guardar `30`, no `0.30`, y concatenar el `%` al escribir el token.

> **Notas de implementación.**
> - Los presets resultaron ser **17**, no 16, y hay **44** declaraciones de
>   `--accent-primary` en total. Las otras 27 son overrides **por tema**
>   (`.theme-nord:not([class*="accent-"])`, `.theme-mist`, y una tabla completa
>   de variantes claras tipo `.theme-amoxlight.accent-sage`). No se tocaron: su
>   especificidad (≥ 0-1-0) gana sobre `body` (0-0-1), así que conservan su color
>   afinado a mano y el ajuste de L **no les aplica**. Eso es lo correcto — en
>   claro el acento necesita una L baja para contrastar y los offsets respecto al
>   oscuro no son constantes (van de 0.16 a 0.28), no hay fórmula que los replique.
>   Consecuencia: **el control es de modo oscuro**. En claro se muestra
>   deshabilitado con una línea que explica por qué.
> - La fuerza del resplandor se partió en dos tokens: `--glow-strength-user` (lo
>   que fija el usuario) y `--glow-strength` (el efectivo, que `.mode-light`
>   escala al 40%). Con un solo token, la preferencia del usuario pisaba la
>   corrección de claro.
> - `accentL` se guarda como `null` cuando no está personalizado, en vez de un
>   número. Así la rampa `amox-2..amox-10` conserva su identidad hasta que el
>   usuario decide apartarse de ella.
> - **Dos bugs encontrados al validar**, ambos de ciclo de vida de React:
>   (a) el modal leía el estilo calculado para mostrar la L efectiva, pero React
>   corre los efectos de hijo **antes** que los del padre, así que leía el valor
>   anterior; se movió el cálculo a `App`, que es quien manda sobre las clases.
>   (b) el "salto al cambiar de preset" estaba en un efecto con un ref de montaje;
>   en **StrictMode los efectos corren dos veces** y la segunda pasada borraba la
>   preferencia guardada al recargar. Se ató a la acción del usuario
>   (`handleAccentChange`) en vez de al ciclo de vida.

**Riesgos**: la descomposición de los 16 presets es el punto frágil de todo el plan — un error ahí reaparece como "todos los acentos se ven iguales". Verificar los 16 uno por uno tras el cambio.

**Aceptación**: los tres controles persisten entre reinicios; los 16 presets se ven distintos entre sí; con fuerza `0%` no queda rastro del resplandor; en modo claro ningún valor del rango ensucia el fondo.

---

## FASE 3 — Barra de ventana ✅ IMPLEMENTADA (2026-09-06)

**Objetivo**: que el slot izquierdo deje de ser espacio muerto y que el centro tenga una razón de existir.

**Archivos**: `client/src/components/WindowTitleBar.jsx`, `client/src/components/MenuBar.jsx`, `client/src/index.css`.

| # | Cambio | Detalle |
|---|---|---|
| 3.1 | Slot izquierdo | Sustituir el wordmark estático `AMOXSQL` (`WindowTitleBar.jsx:86`) por la marca del logo a 16px **como botón de menú de aplicación**. `MenuBar.jsx` existe (71 líneas) y **no está importado en ningún archivo** — es código muerto reciclable como contenido de ese menú. |
| 3.2 | Breadcrumb | Mover el widget de workspace del centro a la izquierda, junto al logo, como `Proyecto › base.duckdb [RW]`. El dropdown de workspaces recientes se conserva tal cual. |
| 3.3 | Altura | `--titlebar-height: 32px` → `36px`. |
| 3.4 | Slot central: omnibox (carcasa) | **Decidido.** El campo, con `Ctrl+K`, abriendo el `CommandPalette.jsx` que ya existe. **Solo comandos** en esta fase. La búsqueda de archivos y esquema es la F8. |

### 3.4 — El omnibox, partido en dos

Criterio que resolvió la decisión: **al centro solo sube lo que es global Y no tiene otro lugar donde verse.** `Run` lo falla (ya está en la barra del editor); `Assist` lo falla parcialmente (ya tiene icono en el rail). El omnibox lo pasa con holgura: la paleta hoy es un secreto de teclado y la búsqueda de esquema no existe.

Pero el omnibox **no es solo un cambio de barra** — necesita un índice que no existe. Partirlo evita que la F3 se convierta en un pozo:

- **F3 (aquí)**: el campo en la barra, `Ctrl+K` como alias de `Ctrl+Shift+P`, abriendo la paleta actual sin tocar su contenido. Barato, y ya entrega el valor principal: **hacer visible la paleta**, que hoy no lo es.
- **F8 (aparte)**: la búsqueda real sobre archivos y esquema.

Placeholder en F3: `Buscar comandos…`. No prometer archivos ni tablas antes de que existan — un campo que dice "tablas" y no las encuentra es peor que no tenerlo.

> **Notas de implementación.**
> - `MenuBar.jsx` **se borró en vez de reciclarse**. Traía emojis (dos, y el
>   proyecto los prohíbe), un cierre por clic-fuera que su propio comentario
>   admitía incompleto, y solo tres acciones. El menú se escribió de cero con
>   iconos Lucide: paleta, ajustes, atajos y recargar ventana.
> - El dropdown estaba centrado (`left: 50%; transform: translateX(-50%)`),
>   que funcionaba con el widget en el centro de la barra. Con los dos menús
>   colgando del slot izquierdo se salía por el borde, así que la regla base
>   pasó a `left: 0`.
> - Los dos menús comparten un solo estado (`'app' | 'workspace' | null`) y un
>   único cierre por clic-fuera que ignora los clics dentro de cualquiera de los
>   dos. Con un listener por menú, abrir uno cerraría al otro a destiempo.
> - **Se quitó la X suelta de cerrar workspace.** El dropdown conserva "Close
>   Workspace"; una X pegada al breadcrumb, arriba a la izquierda, se confunde
>   con cerrar la aplicación. Coincide con el mockup aprobado.
> - `-webkit-app-region` **no se puede verificar en un navegador normal** (es de
>   Electron): el valor calculado sale siempre `no-drag`. Se comprobó que las
>   reglas están bien en la hoja de estilos — `.drag-region` en `drag`, y los
>   anclajes nuevos y el omnibox en `no-drag`.

**Aceptación**: el menú de aplicación abre y sus acciones funcionan; el breadcrumb conserva el dropdown de recientes y el cierre de workspace; `Ctrl+K` y `Ctrl+Shift+P` abren la misma paleta; la zona de arrastre de la ventana sigue funcionando (`-webkit-app-region`) y los elementos interactivos siguen marcados `no-drag`.

---

## FASE 4 — Bienvenida 50/50 ✅ IMPLEMENTADA (2026-09-06)

**Objetivo**: eliminar los ~340px de decoración previa al primer campo y devolverle el alto a los proyectos recientes.

**Archivos**: `client/src/components/WelcomeScreen.jsx` (528 líneas, hoy **todo estilo inline**), `client/src/index.css`.

| # | Cambio | Detalle |
|---|---|---|
| 4.1 | Extraer estilos | Pasar el inline a clases `.ws-*` en `index.css`. Prerrequisito real: el layout actual es inmanejable inline. |
| 4.2 | Rejilla | `display: grid; grid-template-columns: 1fr 1fr; height: 100vh`. Izquierda: `padding: 64px 72px`, contenido `max-width: 440px`, alineado arriba. |
| 4.3 | Marca | Logo de 250×250 con `marginBottom: -55px` (`WelcomeScreen.jsx:141-142`) → marca de 32px **en línea** con el wordmark. |
| 4.4 | Recientes | Sacarlos de la tarjeta del Paso 1 y volverlos la lista principal con `flex: 1; overflow: auto`. Eliminar el `maxHeight: 60vh` compartido (`WelcomeScreen.jsx:171`). Mostrar nombre y ruta apilados, más la fecha a la derecha. |
| 4.5 | Panel derecho | Lienzo a sangre con esquinas interiores redondeadas. En F4 basta un fondo con el resplandor de F1; la animación llega en F5. |

> **Notas de implementacion.**
> - `Logo.jsx` arrastraba el mismo viewBox descentrado que la marca de la barra:
>   0 0 400 400 para un trazo que solo ocupa x 115-285 e y 60-285. A 32px se
>   notaba mucho. Se cine a un cuadro de lado 290 centrado en (200, 173), con
>   margen suficiente para que el glow no se recorte. Solo se usa en la
>   bienvenida (dos veces), asi que el cambio no tiene efectos colaterales.
> - El `<form>` NO usa `display: contents` para repartir sus hijos en la columna
>   flex: eso saca al form del arbol de accesibilidad. Es un hijo flex normal con
>   su propia direccion de columna.
> - `.ws-step2 > * { flex: none; }` es necesario: en un contenedor en columna,
>   flex-shrink actua sobre la ALTURA, y sin el la fila de pestanas se aplastaba
>   y quedaba recortada cuando el alto apretaba.
> - Medido a 1080p: el primer campo queda a 198px del borde (antes ~340px de
>   decoracion) y caben 13 recientes sin scroll — el criterio pedia 6.

**Riesgos**: el flujo de dos pasos (workspace → base de datos) y `WorkspaceWizard.jsx` tienen que seguir funcionando. Verificar también con ventana angosta: por debajo de ~900px conviene colapsar a una sola columna y ocultar el panel derecho.

**Aceptación**: el primer campo es visible sin scroll; se ven al menos 6 recientes sin scroll en 1080p; abrir un workspace reciente y crear uno nuevo siguen funcionando.

---

## FASE 5 — Animación de partículas ✅ IMPLEMENTADA (2026-09-06)

**Objetivo**: el lienzo derecho de la bienvenida. Un **único sistema** que se transforma, no varias animaciones apiladas.

**Archivos**: nuevo `client/src/components/welcome/LogoMorph.jsx`.

Prueba de concepto **ya funcionando** en el mockup (`mockup_rediseno_visual.html`, bloque `Animación de partículas`); es portable casi tal cual.

| # | Detalle |
|---|---|
| 5.1 | ~430 partículas en un `<canvas>`. Ciclo: marca → filas de tabla → barras → grafo de nodos → celdas de notebook → marca. `HOLD 2600ms`, `MORPH 1500ms`, easing cúbico con retardo por partícula. |
| 5.2 | El logo se **muestrea del path SVG real**: `getTotalLength()` / `getPointAtLength()` sobre los dos paths de `Logo.jsx`, aplicando su `translate(50,0) scale(0.8)`. Nada de aproximar la forma a mano. |
| 5.3 | Color leído de `--accent-primary` en vivo, cacheado e invalidado al cambiar de acento. Así la animación sigue el acento y la L de F2. |
| 5.4 | `prefers-reduced-motion: reduce` → congelar en el fotograma de la marca. `ResizeObserver` para el `devicePixelRatio` (tope 2). |
| 5.5 | **Detener el `requestAnimationFrame` al salir de la bienvenida.** Es la fase con más riesgo de fuga: un bucle vivo tras entrar al IDE cuesta batería y CPU para siempre. |

> **Notas de implementacion.**
> - El color NO sale de `--accent-primary` como decia el plan, sino del degradado
>   del logo (`--logo-grad-a`/`-b`), interpolado por la altura de cada particula.
>   Asi el enjambre se ve del mismo material que la marca. La paleta se precalcula
>   en 24 pasos y se revisa cada 500 ms, porque el acento puede cambiar desde
>   ajustes sin que el componente se desmonte.
> - Las generadoras de forma se calibraron para rendir 200-260 puntos (tabla 260,
>   barras 258, grafo 214, notebook 204). Con muchos menos, `fit()` repetia cada
>   posicion 4 o 5 veces y las particulas quedaban exactamente superpuestas: se
>   veia como una reticula de puntos brillantes en vez de un enjambre.
> - El muestreo del logo usa el viewBox nuevo (55 28 290 290) y las coordenadas
>   crudas de los paths, no el `translate(50,0) scale(0.8)` que el plan mencionaba
>   — ese wrapper desaparecio al cenir el viewBox en la fase 4.
>
> **Limite de verificacion.** El panel de navegador de la sesion no compone entre
> llamadas, asi que `requestAnimationFrame` no dispara ni un frame (medido: 0 en
> 1200 ms de reloj real, con `visibilityState` en visible) y `ResizeObserver`
> tampoco entrega. **El ciclo de formas y el respeto a prefers-reduced-motion no
> se pudieron ver en movimiento aqui.** Si se verifico: que las cinco formas se
> generan y se leen (render estatico de cada una), que el lienzo se dimensiona y
> pinta al forzar composicion (buffer 720x860, 4028 pixeles), y que al entrar al
> IDE el canvas se desmonta, se llama a cancelAnimationFrame y el observador se
> desconecta.

**Aceptación**: la marca se reconoce claramente en el primer ciclo; con movimiento reducido queda estática; el bucle no sigue corriendo tras abrir un workspace (verificar en el panel de rendimiento).

---

## FASE 6 — Data Flow, pulido del nodo ✅ IMPLEMENTADA (2026-09-06)

**Objetivo**: las mejoras baratas del nodo. Los nodos planos ya entraron en F0.6.

**Archivos**: `client/src/components/chains/nodes/`, `chainNodeTypes.js`, `ChainCanvas.jsx`, `index.css`.

| # | Cambio | Detalle |
|---|---|---|
| 6.1 | Puertos nombrados | Etiqueta junto a cada handle (`Input`, `System Message`, …) en vez de handles genéricos izquierda/derecha. Hace el grafo autoexplicativo sin abrir nada. |
| 6.2 | Run por nodo en la cabecera | Botón `▸` en la cabecera + duración de la última ejecución en la misma línea. `.chain-node-duration` ya existe pero está fuera de la cabecera. |
| 6.3 | Icono de categoría | Sustituir el badge de texto (`SOURCE`, `TRANSFORM`) por el icono Lucide de la categoría, coloreado con `--node-accent`. |
| 6.4 | Retícula del lienzo | Calibrar `BackgroundVariant.Dots` (`ChainCanvas.jsx:151`): espaciado, tamaño y opacidad para que lea como papel técnico y no como ruido. |
| 6.5 | Clúster de control | Zoom %, ajustar, bloquear y ayuda abajo a la derecha. Revisar antes qué trae ya react-flow para no duplicar. |

> **Notas de implementacion — la fase se reencuadro contra la realidad del codigo.**
>
> - **6.5 (cluster de zoom) YA ESTABA HECHO.** ChainCanvas.jsx ya monta el
>   Controls en bottom-right y el MiniMap en bottom-left de react-flow. El plan
>   pedia revisarlo antes de duplicar; la respuesta es que no habia nada que hacer.
> - **6.1 (puertos nombrados) NO SE IMPLEMENTO, y no deberia hacerse aqui.** No
>   existe modelo de aridad: TODOS los tipos tienen exactamente un handle de
>   entrada y uno de salida. Incluso merge_tables y join_tables reciben varios
>   nodos por el MISMO handle y resuelven las tablas por nombre en su config.
>   Etiquetar handles unicos como "Input"/"Output" no aporta nada; hacerlo de
>   verdad exige anadir aridad a NODE_TYPES, handles con id, validacion por puerto
>   y targetHandle en las aristas — o sea, migrar el formato .sqlchain. Eso es
>   cambio de modelo de datos: pertenece a la fase 7, que ya lo toca.
> - **La duracion ya estaba en la cabecera**, al contrario de lo que decia el plan.
> - **Bug encontrado al validar**: la accion run-only existia solo en
>   handleMenuAction (el despachador del menu contextual, que lee nodeMenu.nodeId).
>   El boton nuevo despacha por nodeActionRef, que es OTRO switch, y ahi no estaba
>   el caso: el boton no hacia nada, en silencio y sin error. Anadido tambien alli.

**Riesgo**: la anatomía del nodo tiene un checklist de 8 puntos documentado; cualquier tipo nuevo o cambio estructural debe pasarlo o el render se rompe.

**Aceptación**: los 28 tipos de nodo siguen renderizando; ejecutar un nodo suelto desde su cabecera respeta el `only_node` del servidor.

---

## FASE 7 — Data Flow, nodos expandibles ✅ IMPLEMENTADA (2026-09-06)

**Objetivo**: la configuración vive **dentro** del nodo. Colapsado: cabecera + etiqueta + resumen. Expandido: los campos etiquetados reales; el nodo crece y las aristas se re-enrutan. Elimina el popover para los casos comunes.

**Archivos**: `chains/nodes/`, `ChainNodeConfigPopover.jsx`, `ChainCanvas.jsx`, `ChainEditor.jsx`.

| # | Cambio | Detalle |
|---|---|---|
| 7.1 | Estado de expansión | Por nodo, persistido en el `.sqlchain`. Decidir si es dato del archivo o estado de sesión — **si va al archivo, es un cambio de formato** y necesita migración retrocompatible. |
| 7.2 | Altura dinámica | La altura del nodo deja de ser fija. react-flow tiene que re-medir (`measured`) y re-enrutar las aristas en vivo. |
| 7.3 | Campos inline | Reutilizar los editores de campo que ya viven en `ChainNodeConfigPopover.jsx` en vez de duplicarlos. |
| 7.4 | Degradación | Los nodos con muchos campos muestran los 2–3 principales y un "N campos más" que abre el panel completo. No todo cabe en una tarjeta. |
| 7.5 | Popover | Se conserva para los tipos con configuración pesada. No se borra. |

> **Notas de implementacion.**
>
> - **7.1 — el estado de expansion NO se guarda en el archivo.** Es estado de
>   sesion (un Set de ids en ChainEditor). Razones: es una preferencia de lectura
>   y no parte de la definicion del pipeline; guardarlo obligaria a migrar el
>   formato .sqlchain; y marcaria el archivo como sucio cada vez que se abre o
>   cierra una tarjeta. Se verifico que serialize() no lo arrastra: lee del array
>   `nodes` crudo, mientras que `expanded` y `onConfigChange` se inyectan en el
>   array derivado que consume el lienzo.
> - **7.3 — NO se reutiliza ChainNodeConfigPanel, al contrario de lo que decia el
>   plan.** Son 2234 lineas y hace tres fetch al montarse (tablas, archivos,
>   columnas aguas arriba). Montarlo dentro de CADA nodo multiplicaria eso por el
>   numero de nodos del lienzo, y ademas no cabe en una tarjeta de 214px. En su
>   lugar hay un espectro declarativo (INLINE_FIELDS) y un render minimo.
> - **Que entra inline y que no.** Solo campos de TEXTO LIBRE. Los de opciones
>   cerradas (format, joinType, aggFunc) exigirian replicar aqui sus listas, y una
>   lista desincronizada del ejecutor produce configuraciones que fallan al
>   correr. Los que son arrays (conditions, aggregations, operations, casts,
>   windows) necesitan su propio editor con altas y bajas. Ambos siguen en el
>   panel, que es su fuente unica.
> - Los campos llevan las clases `nodrag` y `nowheel` de react-flow. Sin la
>   primera, arrastrar para seleccionar texto mueve el nodo; sin la segunda, la
>   rueda dentro del campo hace zoom del lienzo — el mismo fallo que ya aparecio
>   en el selector de tipos de nodo.
> - **7.2 no necesito nada:** react-flow re-mide el nodo solo. Medido con la
>   composicion forzada: expandido 193.8px con la arista saliendo en y=260 y
>   curvando hasta y=194; contraido 84.2px con la arista casi recta.
>
> **Limite de verificacion.** El panel de navegador de la sesion no compone entre
> llamadas, asi que el ResizeObserver de react-flow no entrega y los nodos quedan
> sin medir (`internals: false`, sin aristas en el DOM) hasta que una captura
> fuerza el pintado. No es un fallo de la app; es el mismo limite que impidio ver
> la animacion de la fase 5.

**Riesgos**: es la fase de mayor riesgo del plan. Toca el modelo de datos (7.1), el layout del lienzo (7.2) y la ruta de edición completa. **No mezclarla con ninguna otra fase en el mismo PR.** El auto-arrange y el deshacer tienen que seguir funcionando con alturas variables.

**Aceptación**: expandir y contraer no descoloca las aristas; el auto-arrange respeta las alturas reales; los `.sqlchain` anteriores abren sin perder configuración.

---

## FASE 8 — Omnibox: archivos y esquema

> Depende de la F3.4, que ya deja el campo y el atajo en su sitio. Aquí solo cambia lo que hay **detrás**.

**Objetivo**: que el campo de la barra encuentre las tres cosas, no solo comandos. Es la fase donde el omnibox deja de ser cosmético y se vuelve la razón por la que existe.

**Archivos**: `client/src/components/CommandPalette.jsx`, `client/src/api.js`, `server/index.js`.

| # | Cambio | Detalle |
|---|---|---|
| 8.1 | Resultados por categoría | Una sola lista con secciones: Comandos · Archivos · Tablas y columnas. Ranking entre categorías, no tres listas pegadas. |
| 8.2 | Índice de archivos | Reutilizar lo que ya alimenta a `FileExplorer.jsx`. No abrir una segunda vía de listado del proyecto. |
| 8.3 | Índice de esquema | Tablas y columnas de la conexión activa. DuckDB es local y responde en milisegundos: **consultar directo, sin caché ni indicadores de carga** (regla del proyecto). Invalidar al cambiar de base o tras un `IMPORT`. |
| 8.4 | Prefijos opcionales | `>` comandos, `#` tablas y columnas, sin prefijo busca en todo. Descubribles desde una línea de ayuda en el campo vacío, no ocultos. |
| 8.5 | Acción por resultado | Archivo → abrir pestaña. Tabla → previsualizar. Columna → previsualizar su tabla con la columna resaltada. |
| 8.6 | Placeholder | Recién aquí pasa a `Buscar comandos, archivos, tablas…`. |

**Riesgos**: bases con muchas tablas y columnas. Medir antes de asumir que hace falta optimizar — y si hace falta, **no virtualizar la lista** (regla del proyecto): acotar el número de resultados.

**Aceptación**: escribir el nombre de una columna la encuentra sin saber en qué tabla vive; abrir un archivo desde el omnibox equivale a abrirlo desde el explorador; el orden de resultados es sensato con consultas de una y dos letras.

---

---

## FASE 9 — Data Flow, el reparto de la pantalla ✅ IMPLEMENTADA (2026-09-07)

> **Origen**: revisión del usuario sobre las fases 6 y 7 ya construidas
> (2026-09-07). El nodo mejoró, pero la pantalla alrededor no: sigue habiendo
> demasiado cromo compitiendo con el lienzo, y configurar un nodo acabó
> teniendo **tres formas distintas**. Esta fase revisa el reparto entero.
> Maqueta en `mockup_rediseno_visual.html` → pantalla **Data Flow**.

### El diagnóstico, en palabras del usuario

1. Al abrir un flujo el nodo se ve **demasiado grande**.
2. Hay **tres vistas** para configurar el mismo nodo — compacta, campos en
   línea, y una ventana flotante que **se corta** según dónde esté el nodo. No
   se entiende por qué hacen falta tres toques para lo mismo.
3. La interfaz **no está a la par** de otros formatos de Amox (Story Flow como
   referencia): demasiadas divisiones, botones y secciones mal ordenadas.
4. Con el `+` del nodo, el **raíl de nodos de la izquierda sobra**. Lo único
   que queda huérfano es *añadir una fuente* cuando el flujo no parte de un
   solo archivo.
5. El panel de datos gasta **tres filas de cabecera** (nombre · pestañas ·
   estado y filas) antes de enseñar un dato. Cabe en una.
6. En la cabecera, `DATA FLOW / New Chain` **no sirve para editar el nombre**.
   Guardar sí hace falta.
7. Cuantas más cosas hay, **menos espacio visual queda para construir el
   flujo**.

### Las decisiones

| # | Decisión | Por qué |
|---|---|---|
| 9.1 | **Dos vistas del lienzo y ninguna más**: el flujo entero, y el nodo en el que trabajas **expandido y centrado**. | Es la corrección directa de las tres vistas. Configurar deja de ser un sitio nuevo y pasa a ser un **estado** del mismo nodo. |
| 9.2 | El nodo **compacto** es la forma por defecto: icono, nombre, tiempo y una línea de resumen. Nada más. | Responde a "se ve demasiado grande". El resumen ya dice lo que el nodo hace; el detalle se pide. |
| 9.3 | Al configurar, el nodo **crece y se centra** en el lienzo, y el resto se atenúa. Se sale con `Esc`, con *Listo* o pulsando fuera. | Centrarlo es lo que garantiza que **quepa**: la ventana flotante se cortaba precisamente por nacer pegada al nodo. Que el tamaño sea grande deja de importar. |
| 9.4 | **Fuera el raíl de nodos de la izquierda.** El `+` del puerto de salida cubre "añadir un paso"; queda un botón **Fuente** en la barra para el caso de un flujo con varios orígenes. | Es el mayor trozo de lienzo que se recupera, y el raíl duplicaba lo que el `+` ya hace mejor (en contexto, en el sitio donde va el nodo). |
| 9.5 | **Barra flotante inferior** con lo que hoy está repartido arriba: ejecutar, herramientas de lienzo, fuente, ordenar, zoom, conmutar los datos, y un `…` para lo secundario (variables, SQL, exportar, importar, registro, historial). | Menos cromo fijo, y lo secundario deja de ocupar sitio permanente. Flota sobre el lienzo en vez de restarle altura. |
| 9.6 | El **asistente vive en la misma barra**, como segunda fila. | Hoy es una franja propia a lo ancho de la pantalla. Al lado de las acciones se lee como una forma más de actuar sobre el flujo. |
| 9.7 | El panel de datos pasa a **tarjeta flotante** a la derecha, con **una sola línea** de cabecera: estado · nombre · pestañas · nº de filas. | Recupera las dos filas que sobraban y deja de partir el lienzo en dos columnas duras. |
| 9.8 | La cabecera se queda en **una línea de identidad**: nombre **editable en el sitio**, estado de guardado, y Guardar. | El nombre se edita donde se lee. Todo lo demás se fue a la barra inferior. |

### Riesgos y límites

- **La barra flotante tapa nodos.** Hay que reservar el alto de la barra al
  ajustar la vista (`fit`) y al colocar nodos nuevos, o el usuario acabará
  moviendo el lienzo cada vez.
- **El estado expandido y el lienzo con zoom** pueden pelearse. La expansión
  no debe depender del zoom del lienzo: es una capa por encima, no un nodo más
  grande dentro del grafo.
- **`Esc` ya lo usan otras cosas** (paleta de comandos, menús). El orden de
  atención tiene que quedar claro: si hay un nodo expandido, `Esc` lo cierra a
  él primero.
- Quitar el raíl deja sin sitio la **búsqueda de nodos** por nombre. El `+`
  debe traerla dentro (ya lo hace en la captura del usuario).

### Notas de implementación (2026-09-07)

Piezas nuevas: `ChainHeader.jsx` (la línea de identidad), `ChainBottomBar.jsx`
(la barra flotante, con el asistente como segunda fila) y
`ChainNodeConfigSurface.jsx` (el nodo expandido y centrado). Desaparecen
`ChainToolbar.jsx`, `ChainNodePalette.jsx`, `ChainAiPrompt.jsx` y
`ChainNodeConfigPopover.jsx`, y con ellos **76 reglas CSS** que se quedaron sin
dueño. `INLINE_FIELDS` se va también: era el catálogo de la vista intermedia.

**Desvíos y hallazgos**

- `fitView` de react-flow es **asíncrono** *y* devuelve `false` cuando no puede
  encuadrar. La primera versión leía el viewport sin esperarlo, así que el
  desplazamiento de media barra se aplicaba sobre la vista anterior y el
  encuadre no llegaba a verse. Ahora se espera y no se toca la vista si el
  encuadre no ocurrió.
- react-flow **no encuadra ni dibuja aristas hasta haber medido los nodos**, y
  esa medición depende de que la página se pinte. En un panel que no compone,
  el flujo aparece sin ninguna arista y `fitView` no hace nada — no es un fallo
  del producto, pero cuesta un rato descartarlo. Señal barata para
  diagnosticarlo: contar aristas dibujadas frente a las del archivo.
- El `Esc` de la superficie se registra **en captura** y detiene la
  propagación, para cerrar el nodo expandido antes que cualquier menú de
  detrás. Respeta `defaultPrevented` por si un campo abierto reclama su propio
  `Esc`.
- El estado del panel de datos y el nombre del flujo no tocan el `.sqlchain`:
  el primero vive en `localStorage`, el segundo es parte de la definición y sí
  marca el archivo como sucio, que es lo correcto.

**Comprobado en la app**: superficie centrada con desvío 0,0 y dentro del
lienzo; `Esc`, fondo y *Listo* la cierran; cabecera del panel en una sola fila;
conmutación del panel desde la barra; menú «…» por encima de la barra y dentro
de la ventana, que cierra al pulsar fuera y con `Esc`; selector de fuentes con
solo fuentes; zoom de la barra siguiendo al lienzo; y, una vez forzado el
repintado, 2 de 2 aristas dibujadas y el encuadre dejando el contenido por
encima de la barra.

## Notas transversales

- **Modo claro en cada fase.** El plan está pensado en oscuro. Ninguna fase se da por cerrada sin revisar `.mode-light`.
- **Los 16 acentos.** F0.3, F0.7, F1 y sobre todo F2 los tocan a todos. La verificación de los 16 es parte de la definición de "hecho" en esas fases.
- **Orden de PRs.** F0 y F1 pueden ir juntas (son CSS y F1 depende de F0). F2 sola. F3, F4+F5, F6 sueltas. **F7 siempre sola.** F8 al final, cuando la barra ya esté asentada.
- **Rama nueva desde `main`** para cada tanda, según la convención del proyecto.
