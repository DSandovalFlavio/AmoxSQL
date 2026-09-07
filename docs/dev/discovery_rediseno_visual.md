# Discovery — Rediseño visual de AmoxSQL

**Estado:** abierto / acumulativo. Se irán añadiendo referencias conforme lleguen.
**Objetivo declarado:** que la interfaz se sienta **menos "matrix"** y más moderna, sin perder la identidad que ya gusta.
**Mockup interactivo:** [`mockup_rediseno_visual.html`](mockup_rediseno_visual.html) — cada propuesta es un interruptor independiente.

## Decisiones tomadas (revisión del mockup, ronda 1)

| Propuesta | Veredicto | Nota |
|---|---|---|
| P2.1 gradiente de acento | **Replanteada** | La versión original (banda sobre la barra) se rechazó. Ver P2.1 reescrita. |
| P2.2 workspace a la izquierda | **Aprobada** | |
| P2.3 clúster central | **Resuelta → Omnibox** | Run rechazado por redundante. Gana el candidato B. |
| P3.1 / P3.2 elevación y tarjetas | **Aprobadas** | Ya casi implementado; falta un pase de matices. |
| P4.1 luminosidad del acento | **Replanteada** | Pasa a ser **ajuste del usuario**, no un token fijo. Ver P4.1 reescrita. |
| P5 bienvenida 50/50 + animación | **Aprobada** | Sin cambios. |
| P6 Data Flow | **Aprobada** | Sin cambios. |

> **Nota sobre nomenclatura.** Por la convención del proyecto (no referenciar productos
> ni tecnologías externas en código, prompts, UI ni documentación), las capturas de
> referencia se identifican aquí por rol, no por nombre comercial:
> - **REF-A** — cliente SQL de escritorio para bases transaccionales.
> - **REF-B** — editor de flujos por nodos (constructor de agentes).
> - **REF-C** — página de producto con layout partido 50/50.

---

## 0. Encuadre: AmoxSQL no es un cliente de base de datos

Esto condiciona todo lo que sigue y conviene tenerlo escrito.

REF-A y la mayoría de los IDEs SQL están diseñados para **administrar** bases
transaccionales: el trabajo es el objeto (tabla, índice, constraint, grant) y la
UI es un árbol de objetos + una consola. AmoxSQL trabaja sobre un motor analítico
local: el trabajo es el **resultado** (la tabla resultante, el perfil, el gráfico,
la narrativa, el flujo). Consecuencia práctica:

- **De REF-A hay que tomar el _oficio_, no el modelo mental**: la definición de las
  superficies, la madurez de la barra superior, el manejo de la profundidad. No su
  jerarquía centrada en el explorador de objetos.
- **De REF-B hay que tomar el modelo mental completo** para Data Flow: es
  literalmente el mismo problema (lienzo de nodos con configuración por nodo) y
  está mejor resuelto que lo nuestro hoy.
- **De REF-C hay que tomar la composición** de la pantalla de bienvenida.

---

## 1. Diagnóstico: qué produce exactamente la sensación "matrix"

No es una impresión difusa; son cinco decisiones concretas, ordenadas por impacto.

### 1.1 El acento es cian de luminosidad muy alta

```css
--accent-primary: oklch(0.905 0.155 195);   /* client/src/index.css:45 */
```

`L = 0.905` sobre `--surface-base: oklch(0.145 …)` es, casi literalmente, la firma
de un monitor de fósforo. Un cian brillante sobre negro **es** el look terminal.
Es el factor individual que más pesa.

### 1.2 Mayúsculas + tracking en todo el chrome

`AMOXSQL`, `FILES`, `FOLDERS`, `.AMOXVIS`, `.SQL`, `.SQLCHAIN`. Los encabezados de
panel usan `text-transform: uppercase` + `letter-spacing`. Es tipografía de consola.
REF-A escribe *"Database Explorer"*, *"Files"*, *"Services"* en caja normal.

### 1.3 Monoespaciada fuera del editor

`JetBrains Mono` aparece en duraciones de nodo, resúmenes de configuración, tamaños
de archivo, metadatos. Debería vivir **solo** en el código y en columnas numéricas.

### 1.4 Neutros sin tinte

```css
--surface-base: oklch(0.145 0.006 270);
```

`C = 0.006` es gris prácticamente puro. Un gris puro se lee como "no elegido".
Subirlo a `0.010–0.014` en el mismo tono (270) da un neutro frío deliberado sin
que nadie perciba "azul".

### 1.5 Cero gradientes, superficies planas y sin separar

`.activity-bar` y `.sidebar` son `background-color: transparent` con
`border-right: none`. Toda la ventana es un único plano negro. La escala de
elevación de 4 pasos **ya existe** (`base / inset / raised / overlay`) y el shell
casi no la usa.

---

## 2. Barra de ventana

### Estado actual (`WindowTitleBar.jsx` + `index.css:329`)

| Zona | Contenido | Evaluación |
|---|---|---|
| Izquierda (`min-width: 80px`) | Texto estático `AMOXSQL`, uppercase, `opacity .7` | **Espacio muerto.** No es clicable, no informa nada que la ventana no diga ya. |
| Centro | Widget de workspace: `📁 Curso_SQL · RW curso_sql.duckdb ⌄` + `✕` | Correcto pero solitario. Un widget flotando en 1200px de barra. |
| Derecha | Minimizar / maximizar / cerrar | OK. |

`background: var(--surface-inset)` — plano, sin gradiente, sin acento.

### Lo que hace mejor REF-A

1. **Gradiente vertical tintado con el acento** en la parte superior de la ventana.
   Ancla visualmente el borde superior y hace que el color de acento se sienta parte
   de la aplicación, no solo de los botones activos.
2. **La izquierda tiene función**: menú de aplicación + selector de proyecto +
   control de versiones. Es un *breadcrumb operativo*.
3. **El centro es un clúster de acciones globales, agrupado con separadores.**
   La madurez percibida no viene de la cantidad de iconos, viene de que están
   **agrupados con espacio entre grupos** en vez de en fila continua.

### Propuestas

**P2.1 — Resplandor de acento en el fondo de la aplicación.** *(reescrita tras la ronda 1)*

> **Rechazado:** poner un `linear-gradient` vertical **sobre** la barra de ventana.
> Se lee como una banda de color pegada arriba y no como parte de la aplicación.

Lo correcto es que el resplandor **no viva en la barra**. Vive en el **fondo de la
aplicación** — la capa que está detrás de todos los paneles —, anclado arriba a la
izquierda, y sube desde detrás del panel lateral atravesando la barra. La barra se
vuelve transparente y solo lo deja pasar.

```css
.app-shell {                     /* la capa de fondo, detrás de los paneles */
  background:
    radial-gradient(52% 42% at 3% -8%,
      color-mix(in oklch, var(--accent-primary) 30%, transparent) 0%, transparent 68%),
    radial-gradient(30% 26% at 26% -4%,
      color-mix(in oklch, var(--accent-primary) 13%, transparent) 0%, transparent 72%),
    var(--surface-base);
}
.window-title-bar { background: transparent; }
```

Esto se **acopla con P3.2**: como los paneles opacos tapan el fondo, el acento solo
asoma por la barra de ventana, por los canales entre tarjetas y por los bordes. Las
dos propuestas se refuerzan — sin tarjetas el efecto pierde la mitad de su gracia.

Como el derivador de acento vive en `body` (ver el comentario en `index.css:37-45`),
sigue automáticamente el acento que elija el usuario. Falta calibrar el modo claro
por separado.

**P2.2 — Slot izquierdo con función.**
Sustituir el wordmark muerto por: marca del logo a 16px **actuando como botón de
menú de aplicación**. Ya existe `MenuBar.jsx` (71 líneas) **sin importar en ningún
lado** — es código muerto que puede reciclarse como contenido de ese menú.
A continuación, mover ahí el widget de workspace como breadcrumb
`Curso_SQL › curso_sql.duckdb [RW]`, que es donde corresponde un selector de
proyecto y libera el centro.

**P2.3 — Slot central: OMNIBOX.** *(decidido en la ronda 2)*

> **Rechazado:** el clúster `[▶ Run ⌄] · [🔍 Buscar] · [✨ Assist]`.
> Run es **redundante** — ya está en la barra del editor, a unos centímetros.

El criterio que sale de ese rechazo, y que conviene fijar: **al centro de la barra
solo sube lo que es global Y no tiene otro lugar donde verse.** Run falla la segunda
mitad. Assist también la falla parcialmente: ya tiene icono en el rail de actividad.

**Elegido: el omnibox.** Un único campo que unifica paleta de comandos + búsqueda de
archivos + búsqueda de tablas y columnas del esquema. Pasa el criterio con holgura:
la paleta hoy es un secreto de teclado (`Ctrl+Shift+P`) y **la búsqueda de esquema no
existe en ningún lado**. Es donde más pesa la diferencia con un cliente transaccional:
buscar una columna entre decenas de tablas es una necesidad analítica real que hoy no
tiene casa.

Descartados: **Vacío** (honesto pero no aporta) y **Contexto vivo** (el estado de
ejecución encaja mejor en la barra de estado, donde no compite con nada).

> **Consecuencia de alcance.** El omnibox es el único candidato que **no es solo un
> cambio de barra**: necesita un índice de archivos y de esquema que no existe. Por eso
> en el plan se parte en dos — la barra con el campo conectado a la paleta actual
> (barato, inmediato) y la búsqueda real como fase aparte.

**P2.4 — Altura.**
`--titlebar-height: 32px` es apretado para meter un clúster de acciones. 36–38px
da respiro sin que la barra domine.

---

## 3. Profundidad y definición de paneles

### Diagnóstico

```css
.activity-bar { background-color: transparent; border-right: 1px solid var(--border-subtle); }
.sidebar      { background-color: transparent; border-right: none; }
--border-subtle: rgba(255, 255, 255, 0.06);
```

Tres problemas encadenados: los paneles no usan la escala de superficies, no tienen
borde propio, y el borde que sí existe está por debajo del umbral perceptual sobre
un fondo de `L = 0.145`.

### Propuestas

**P3.1 — Usar la escala de elevación que ya existe.**

| Región | Hoy | Propuesta |
|---|---|---|
| Barra de actividad | `transparent` | `--surface-base` |
| Panel lateral (Files, DB, …) | `transparent` | `--surface-raised` |
| Editor | hereda | `--surface-base` / bg de Monaco |
| Panel de resultados | hereda | `--surface-raised` |
| Barra de estado | — | `--surface-inset` |

Un solo paso de separación entre regiones adyacentes ya elimina la sensación de
plano único, incluso sin tocar bordes.

**P3.2 — Paneles como tarjetas embebidas.**
Es el truco real de REF-A: cada región es una tarjeta con `border-radius: 8px`,
borde de 1px, y un **canal de 6px de fondo de ventana entre regiones**. El fondo
más oscuro asomando entre tarjetas es lo que se lee como profundidad. Ya hay un
`margin: 6px 0 6px 6px` en la zona del contenedor principal (`index.css:1975`);
falta aplicarlo de forma consistente y añadir el radio + borde.

**P3.3 — Subir `--border-subtle` a `0.085`.**
Mantener `0.06` para divisores *dentro* de un panel; usar el nuevo valor para
bordes *estructurales* entre regiones. Es un cambio de un token con efecto global.

**P3.4 — Encabezados de panel en caja normal.**
`FILES` → `Files`. Quitar `text-transform: uppercase` y el `letter-spacing` de los
encabezados de panel y de los agrupadores de extensión del explorador. Después del
acento, es la palanca más grande contra el efecto "terminal".

---

## 4. Color y tipografía

**P4.1 — La intensidad del acento pasa a ser un ajuste del usuario.** *(reescrita tras la ronda 1)*

No es un cambio de token: es una **preferencia configurable**, junto al selector de
acento que ya existe.

| | |
|---|---|
| Token | `--acc-l` (luminosidad oklch del acento) |
| Default | **`0.730`** |
| Rango | **`0.600` – `0.950`** |
| Persistencia | `localStorage`, junto a `amoxsql-accent` |

```css
--accent-primary: oklch(var(--acc-l) var(--acc-c) var(--acc-h));
```

El valor actual (`0.905`) queda dentro del rango, así que quien lo prefiera brillante
lo conserva; solo cambia el punto de partida. Ojo al implementarlo: el derivador de
acento vive en `body`, no en `:root` (ver `index.css:37-45`), así que `--acc-l` tiene
que declararse donde el derivador pueda verlo o la preferencia no se propagará a los
tokens derivados.

Como el resplandor de fondo (P2.1) se mezcla desde el acento, bajar la L también hace
que el gradiente se comporte mejor: con `0.905` un 30% de mezcla levanta demasiado.

**P4.2 — Tintar los neutros.**
`--surface-base: oklch(0.145 0.006 270)` → `oklch(0.145 0.012 270)` y equivalentes
en el resto de la escala. Imperceptible como "color", perceptible como intención.

**P4.3 — Confinar la monoespaciada.**
Auditar los usos de `--font-mono` / `'JetBrains Mono'` fuera de Monaco y de las
celdas de resultados numéricos, y pasarlos a la sans. Candidatos detectados:
`.chain-node-duration`, `.chain-node-config-summary`, tamaños de archivo en el
explorador.

**P4.4 — Subir `--text-tertiary`.**
`rgba(255,255,255,0.36)` sobre `L = 0.145` está en el límite de legibilidad para
texto de 10–11px (rutas, descripciones, metadatos). `0.44` es más honesto.

---

## 5. Pantalla de bienvenida — reposición 50/50

### Diagnóstico (`WelcomeScreen.jsx:126-159`)

Todo el layout es inline y es una columna centrada:

```jsx
paddingTop: '8vh'
<Logo width={250} height={250} />  →  marginBottom: '-55px'
<h1 style={{ fontSize: '36px' }}>  →  tagline
<div style={{ width: '560px' }}>   →  Step 1 / Step 2
   maxHeight: step === 1 ? '60vh' : '80px'
```

En 1080p eso son ~340px de decoración antes del primer elemento interactivo, una
columna de 560px, y **~1360px de ancho vacío**. Los proyectos recientes quedan
comprimidos dentro de una tarjeta con `maxHeight: 60vh` compartida con el
formulario — que es exactamente la queja.

### Propuesta

**P5.1 — Grid `1fr 1fr` a altura completa.**

```
┌───────────────────────────────┬───────────────────────────────┐
│  ▲ AmoxSQL                    │                               │
│  The Modern Codex…            │                               │
│                               │      [ lienzo animado ]       │
│  Abrir workspace              │                               │
│  ┌─────────────────────────┐  │                               │
│  │ ruta…              [📁] │  │                               │
│  └─────────────────────────┘  │                               │
│                               │                               │
│  Recientes                    │                               │
│  · Curso_SQL      hace 2h     │                               │
│  · Ventas_2026    ayer        │                               │
│  · Bench_duck     3 días      │                               │
│  · …                          │                               │
│  (ocupa el alto restante)     │                               │
│                               │                               │
│  ⚙                            │                               │
└───────────────────────────────┴───────────────────────────────┘
```

Izquierda: columna con `padding: 64px 72px`, contenido `max-width: 440px`,
alineado arriba. Logo reducido a marca de 32px **en línea** con el wordmark
(no un bloque de 250px). Los **recientes se convierten en la lista principal**
con `flex: 1` — que es el contenido que hoy se ahoga.

Derecha: lienzo a sangre, esquinas interiores redondeadas.

**P5.2 — La animación del lado derecho.**
Lo que se pidió (logo + referencias a análisis, SQL, gráficos, flujos, notebooks)
funciona **solo si es un único sistema que se transforma**, no cuatro animaciones
apiladas. Concretamente:

> Un campo de partículas se condensa hasta formar la marca de AmoxSQL. Se disgrega
> y las mismas partículas se reorganizan sucesivamente en: una retícula de filas de
> tabla → un grupo de barras → un grafo de nodos conectados (el flujo) → un bloque
> de celdas de notebook. Y vuelve a la marca. Ciclo lento, ~20s.

Implementación: un `<canvas>`, N puntos, interpolación entre *keyframes* de forma
con easing. Color tomado de `--accent-primary` con dispersión de luminosidad para
dar profundidad. ~150 líneas, sin librería, sin GPU. Con
`prefers-reduced-motion: reduce` se congela en el fotograma del logo.

Alternativa barata si se quiere algo ya: ilustración estática isométrica/blueprint
+ una deriva muy lenta de gradiente de acento.

---

## 6. Data Flow — lo que REF-B resuelve mejor

### Diagnóstico (`index.css:13550+`)

```css
.chain-node {
  background: color-mix(in oklch, var(--node-accent) 7%, var(--surface-raised));
  border: 1px solid color-mix(in oklch, var(--node-accent) 30%, var(--border-default));
  min-width: 180px; max-width: 260px; padding: 8px 12px;
}
```

La configuración se muestra como **una sola línea monoespaciada elipsizada**
(`.chain-node-config-summary`) y se edita en un popover externo
(`ChainNodeConfigPopover.jsx`).

### Diferencias, en orden de valor

**P6.1 — La configuración vive dentro del nodo (expandir/contraer).**
Es el hallazgo principal y el que más elevaría la sección.
Colapsado: cabecera + etiqueta + 1–2 líneas de resumen.
Expandido: los **campos etiquetados reales** dentro de la tarjeta; el nodo crece y
las aristas se re-enrutan. Elimina el popover para los casos comunes.
**Coste real:** alto. La altura del nodo pasa a ser dinámica, hay que dejar que
react-flow re-mida (`measured`), y el enrutado de aristas cambia en vivo.
Merece ser su propia fase.

**P6.2 — Tarjetas planas, el color como señal y no como baño.**
Hoy el nodo se **tiñe** con 7% del color de categoría. REF-B mantiene la superficie
de la tarjeta neutra y pone el color de categoría **solo en el icono y en el punto
del puerto**. Por eso se ve más limpio: el color informa en vez de decorar.
Cambio barato y de efecto inmediato:

```css
.chain-node {
  background: var(--surface-raised);
  border: 1px solid var(--border-default);
}
.chain-node-icon { color: var(--node-accent); }
```

…dejando el acento de categoría para el icono, el badge y el handle.

**P6.3 — Puertos con nombre.**
REF-B etiqueta cada entrada junto a su propio handle (*"Input"*, *"System Message"*).
AmoxSQL tiene handles genéricos izquierda/derecha. Nombrar los puertos hace el
grafo autoexplicativo sin abrir nada.

**P6.4 — Botón de ejecutar por nodo en la cabecera** (`▸`), y el tiempo de la
última ejecución en la misma línea (`11.2ms`). Parte ya existe (`.chain-node-duration`)
pero está fuera de la cabecera.

**P6.5 — Retícula de puntos fina** en el lienzo. Ya se usa
`BackgroundVariant.Dots` (`ChainCanvas.jsx:151`) — es cuestión de calibrar
espaciado, tamaño y opacidad para que se lea como papel técnico y no como ruido.

**P6.6 — Clúster de control abajo a la derecha** (zoom %, ajustar, bloquear, ayuda)
y toast de resultado abajo al centro, como en REF-B.

---

## 7. Orden sugerido de ataque

**Ganancias rápidas** — mucho efecto, poco código, sin riesgo estructural:

| # | Cambio | Alcance |
|---|---|---|
| 1 | Resplandor de acento en el fondo de la app (P2.1) | ~8 líneas CSS — **requiere P3.2** |
| 2 | Encabezados de panel en caja normal (P3.4) | buscar/reemplazar acotado |
| 3 | Escala de elevación en el shell (P3.1) | ~5 reglas |
| 4 | `--border-subtle` a `0.085` (P3.3) | 1 token |
| 5 | Nodos planos, color solo en icono/puerto (P6.2) | ~4 reglas |
| 6 | Monoespaciada fuera del chrome (P4.3) | auditoría acotada |

**Ajuste nuevo** — no es un cambio de estilo sino una preferencia:

| # | Cambio | Alcance |
|---|---|---|
| 7 | Intensidad del acento configurable, default `.730` (P4.1) | token + control en ajustes + persistencia |

**Movimientos medianos** — una sesión cada uno:

- Paneles como tarjetas con canal de fondo (P3.2)
- Recomposición de la barra superior: menú, breadcrumb, clúster central (P2.2–P2.4)
- Pantalla de bienvenida 50/50 sin la animación (P5.1)

**Movimientos grandes** — fase propia:

- Animación de partículas de la bienvenida (P5.2)
- Nodos expandibles con configuración inline (P6.1)

---

## 8. Referencias pendientes

Espacio para las capturas que sigan llegando. Por cada una conviene registrar:
qué sección de AmoxSQL toca, qué hace mejor, y si el aprendizaje es de *oficio*
(cómo se ve) o de *modelo mental* (cómo funciona).

| Ref | Sección de AmoxSQL | Aprendizaje | Tipo |
|---|---|---|---|
| REF-A | Barra de ventana, paneles | Profundidad por elevación + gradiente de acento; barra superior agrupada | Oficio |
| REF-B | Data Flow | Configuración inline en el nodo; color como señal; puertos nombrados | Modelo mental |
| REF-C | Bienvenida | Partido 50/50, contenido a la izquierda a alto completo, visual a sangre | Oficio |
| | | | |
