# Auditoría de temas — septiembre 2026

Segunda pasada sobre el sistema de temas, después de la de julio
([auditoria_temas_2026-07.md](auditoria_temas_2026-07.md)) y del rediseño visual de la v5.

Esta vez el disparador fue el modo claro: los aprendizajes de
[aprendizajes_temas_claros.md](aprendizajes_temas_claros.md) apuntaban a que en claro no
basta con reflejar las recetas del oscuro, y quedaba un fallo vivo sin confirmar.

**Todo lo que aparece aquí está medido**, no estimado. Dos herramientas independientes que
coinciden: `scripts/checkThemeContrast.cjs` (analiza el CSS) y un banco de pruebas que
carga `index.css` en un navegador real y lee los valores computados (los `color-mix` y las
cadenas de `var()` solo se resuelven de verdad ahí).

---

## 1. Qué cambió en esta pasada

### 1.1 Tres temas retirados

| Tema | Modo | Motivo | Migra a |
|---|---|---|---|
| `light` | Claro | Genérico y redundante con Amox Light | `amoxlight` |
| `ivory` | Claro | Clon estructural de Mist (ΔL 0.006 según la auditoría de julio), solo cambia la temperatura | `amoxlight` |
| `sterlingdark` | Oscuro | Misma paleta que Sterling Deep sobre superficies más ruidosas | `sterlingdeep` |

Quedan **7 oscuros** (Amox Dark, Obsidian, Onyx, Nord, Dark Islands, Ayu, Sterling Deep) y
**3 claros** (Amox Light, Sterling Light, Mist).

La migración vive en `client/src/theme.js` (`migrateTheme`) y se aplica **al leer**, no al
escribir: así arregla también un perfil traído de otra máquina o de una versión anterior.
Sin ella, quien tuviera uno de los tres guardados se quedaría sin clase de tema y con la
app en oscuro sin haber tocado nada.

### 1.2 El bug de los alias congelados — confirmado y arreglado

Era la sospecha que quedó abierta en `aprendizajes_temas_claros.md`. Confirmada, y **mucho
más grande de lo que parecía**.

`:root` declaraba los quince alias semánticos como indirecciones:

```css
:root {
  --color-success: var(--feedback-success);   /* ← el problema */
  ...
}
```

Una custom property cuyo valor contiene `var()` **resuelve en el elemento donde se
declara**. `:root` es `<html>`, y la clase del tema va en `<body>`. Resultado: los alias se
quedaban con el valor por defecto de `:root`, que es el del tema oscuro, pasara lo que
pasara después. Es el mismo mecanismo que hacía que todos los acentos se vieran cian
(PR #70) y que ya está documentado dos veces en los comentarios del propio archivo, para
el acento y para el resplandor. Los alias se quedaron fuera.

Medido en Amox Light, antes del arreglo:

| Token | Lo que declara el tema | Lo que llegaba a la pantalla |
|---|---|---|
| `--color-success` | `#1f7a48` verde oscuro | `#00c66d` — el verde brillante del oscuro |
| `--color-error` | `#c0392b` | `#f94144` |
| `--color-warning` | `#b06f10` | `#ed990e` |

**No era un problema del modo claro.** Afectaba a **11 de los 13 temas**: todos menos
Obsidian y Onyx, que son los únicos que no redefinen la paleta de feedback y por eso
casualmente coincidían. Nord pintaba en verde ácido donde su paleta dice `#a3be8c`; Ayu,
Islands, Sterling Dark y Deep, igual.

Alcance: **275 usos de `var(--color-*)`** entre CSS y JSX.

El arreglo es mover las quince declaraciones al bloque `body`, donde ya vive el derivador
del acento y por la misma razón. Un movimiento de bloque; los 275 usos se arreglan solos.

Verificado token a token en los 10 temas que quedan: los 12 alias coinciden ahora con su
`--feedback-*` en todos.

### 1.3 Limpieza de la cascada

La rampa de acentos claros enumeraba los cinco temas claros regla por regla — 27
selectores de cinco clases cada uno. Es justo lo que se rompe al añadir o quitar un tema.
Ahora cuelga de `.mode-light`, que va en el body de todos los temas claros, presentes y
futuros. Misma especificidad (0-2-0), mismo comportamiento; comprobado que los tres claros
reciben la rampa clara y que los oscuros siguen con la suya.

Lo mismo en `App.jsx`: la lista literal de clases de tema a limpiar pasó a un barrido por
prefijo `theme-`.

### 1.4 El verificador, al día

`scripts/checkThemeContrast.cjs` seguía apuntando a `.light-theme` y `.theme-ivory`. Como
`extractBlock` devuelve `{}` cuando no encuentra el bloque y `tok()` caía a `:root`,
**reportaba en verde los valores oscuros bajo el nombre de un tema claro**. Un verificador
que no sabe que está midiendo el tema equivocado es peor que no tenerlo.

Además nunca había mirado Sterling Deep ni Sterling Light. Ahora sí, y encuentra 4 fallos
a la primera. Se le añadió la capa de modo (`.mode-light`) a la cadena de resolución, que
antes se saltaba.

---

## 2. Estado medido, tema por tema

Todos los ratios son WCAG 2.x contra la superficie **más exigente** del tema (base, raised,
overlay o inset — la que peor sale).

### Los 7 oscuros: sanos

Ningún fallo de texto ni de feedback. La única familia por debajo de 4.5:1 son los
comentarios de la sintaxis (2.45–3.64), que es intencionado: un comentario tiene que
retroceder. El más flojo es Dark Islands, `#555861` a 2.45:1 sobre su lienzo.

`--text-tertiary` va de 3.01 (Onyx) a 5.37 (Sterling Deep). Está por debajo de AA en casi
todos, pero es una decisión asumida y aprobada: sobre fondo oscuro el ojo se adapta
distinto, y el piso del proyecto para oscuro es 3:1. Se queda.

Único fallo real: **Sterling Deep tiene `--border-strong` en 1.45**, justo en el límite
inferior del rango canónico. Sus superficies están tan juntas (escalón base→raised de
1.02, contra 1.04–1.13 del resto) que el borde fuerte no llega a leerse como fuerte.

### Amox Light — el más cerca de estar bien

```
superficies  base #f1f4f7  raised #f8fafb  overlay #ffffff  inset #e7ebef
```

| Token | Actual | Peor ratio | Piso | Sugerido |
|---|---|---|---|---|
| `--text-tertiary` | `#5e6f7d` | 4.33 | 4.5 | `#5b6c7a` |
| `--text-disabled` | `#9aa6b1` | 2.07 | 3.0 | `#7c8792` |
| `--accent-primary` (teal de marca) | `#0a7d8c` | 4.05 | 4.5 | `#007483` |
| `--syntax-type` (= el teal) | `#0a7d8c` | 4.40 | 4.5 | idem |
| `--feedback-warning-text` | `#915a08` | 4.49 | 4.5 | `#915a07` |

Diferencias de 1–3 % de luminosidad. El tema está bien construido; le falta un empujón.

### Sterling Light — la tinta violeta se queda corta

```
superficies  base #f6f3fb  raised #fbf9fe  overlay #ffffff  inset #e2dbf0
```

| Token | Actual | Peor ratio | Piso | Sugerido |
|---|---|---|---|---|
| `--text-secondary` | `#5c5178` | 5.38 | 5.5 | bajar ~0.01 L |
| `--text-tertiary` | `#7d719c` | 3.31 | 4.5 | `#675c85` |
| `--text-disabled` | `#a99fc4` | 1.85 | 3.0 | `#83799c` |
| `--accent-primary` (violeta) | `#7c5ce0` | 3.50 | 4.5 | `#6b49cb` |
| `--border-subtle` | `#d9d1e6` | 1.35 | 1.08–1.30 | fuera de rango por arriba |

La causa es una sola: **`--surface-inset` está en `#e2dbf0`**, mucho más oscuro que el
inset de los otros dos claros (escalón base→inset de 1.22, contra 1.09 de Amox Light).
Todo lo que se pinta dentro de un pozo — entradas, canaleta del editor, celdas vacías —
pierde de golpe medio punto de contraste. O se aclara el inset, o hay que oscurecer toda
la tinta para compensar. Aclararlo es una línea; lo otro son seis.

Es también el único tema con bordes literales en vez de alfa, y por eso su `border-subtle`
se sale del rango: un lavanda opaco no se integra sobre cuatro superficies distintas.

### Mist — el que peor está

```
superficies  base #f2f4f8  raised #e8ecf2  overlay #ffffff  inset #dce1e9
```

Los textos pasan. Lo que no pasa es **casi todo el color**:

- **Sintaxis**: 6 de 9 por debajo de 4.5 sobre el lienzo del editor — `string` 3.72,
  `number` 3.61, `type` 3.69, `operator` 4.39, `function` 4.34, y `comment` en 2.38, el
  más flojo de los diez temas.
- **Tipos de dato**: 5 de 6 por debajo — `float` 3.43, `text` 3.36, `boolean` 3.46,
  `integer` 4.03, `datetime` 4.25. Son las etiquetas de la cabecera de resultados y del
  explorador de esquema: aparecen en cada consulta.
- `--feedback-warning-text` en 3.15 y `--feedback-success-text` en 3.91.

Sugeridos (mismo tono y croma, solo baja la luminosidad):

| Token | Actual | Sugerido | | Token | Actual | Sugerido |
|---|---|---|---|---|---|---|
| `--syntax-string` | `#468a6e` | `#367c60` | | `--type-integer` | `#4a72b8` | `#3c63a7` |
| `--syntax-number` | `#c06838` | `#ad5726` | | `--type-float` | `#3a8a88` | `#176f6d` |
| `--syntax-type` | `#3a8a88` | `#277b79` | | `--type-text` | `#c06838` | `#a04b18` |
| `--syntax-function` | `#4a72b8` | `#476fb4` | | `--type-datetime` | `#7c5cc2` | `#7150b5` |
| `--syntax-operator` | `#906a4a` | `#8e6848` | | `--type-boolean` | `#468a6e` | `#2a7055` |
| `--syntax-comment` | `#9aa0b0` | `#878c9c` (piso 3.0) | | | | |

Mist tiene además una particularidad estructural: **su `raised` es más oscuro que su
`base`** (`#e8ecf2` contra `#f2f4f8`), al revés que los otros dos claros, que suben hacia
el blanco. No es un fallo — es la lógica del oscuro, con el panel separándose hacia abajo —
pero conviene decidirlo a propósito, porque la capa `.mode-light` sí asume elevación
ascendente en otros sitios.

---

## 3. Los cinco problemas que comparten todos los claros

Estos no son de un tema: son de la capa de modo, y ninguno se ve en el verificador porque
no es una relación texto/fondo.

### 3.1 El velo de los diálogos sigue siendo negro al 60 %

`--overlay-bg: rgba(0, 0, 0, 0.6)` está en `:root` y **la capa `.mode-light` nunca lo
toca**. Al abrir cualquier modal en un tema claro, la app entera se va a un gris muy
oscuro y el diálogo — que es blanco puro — queda flotando sobre casi-negro. Es el cambio
más brusco que hay en modo claro y el más fácil de arreglar.

### 3.2 Las sombras son demasiado tenues para ser la pista de profundidad

Los tres claros usan alfa 0.06 / 0.09 / 0.13. En oscuro, donde las sombras no son lo que
separa, el proyecto usa 0.40 / 0.50 / 0.60.

Aquí aplica directamente el aprendizaje de los temas claros: **sobre fondo oscuro la
profundidad se construye añadiendo luz; sobre papel, la única herramienta que queda es la
sombra**. Copiar la receta del oscuro con el alfa bajado no da sutileza, da nada.

### 3.3 Las superficies casi no se separan

Amox Light y Sterling Light tienen un escalón base→raised de **1.050**. Con
`--border-subtle` en 1.14 y las sombras en 0.06, un panel sobre el lienzo se distingue por
un margen que está en el umbral de lo perceptible. Es la razón de fondo de que el modo
claro se lea "plano": no falla ningún token por separado, fallan los tres a la vez, que son
justo los tres que hacen el mismo trabajo.

### 3.4 Los estados de interacción son más flojos que en oscuro

| | hover | active |
|---|---|---|
| Obsidian | 1.140 | 1.300 |
| Amox Dark | 1.120 | 1.220 |
| Amox Light | 1.100 | 1.190 |
| Sterling Light | 1.110 | 1.200 |
| Mist | 1.090 | 1.150 |

Otra vez el mismo error de simetría: los lavados de claro se escribieron como la imagen
especular de los de oscuro, con el mismo alfa. Pero un 5 % de negro sobre `#f8fafb` mueve
mucho menos el ojo que un 6 % de blanco sobre `#0f141a`.

### 3.5 Cuatro acentos hacen ilegibles los botones

El texto de los botones de acento es `#ffffff`. Contra el relleno:

| Acento | Relleno en claro | Blanco encima | Sugerido |
|---|---|---|---|
| Aqua (`amox-2`) | `#009d9e` | **3.32** | `#008385` |
| `amox-3` | `#00999d` | **3.47** | `#008488` |
| Sky (`amox-4`) | `#00919c` | **3.80** | `#00828d` |
| `amox-5` | `#0089a0` | **4.13** | `#008298` |
| Azure (`amox-6`) en adelante | | 4.58+ | ya cumple |

Los tres acentos por defecto de los temas claros sí cumplen (4.70–5.34). El problema es
solo el extremo turquesa de la rampa elegible.

**Y hay una tensión de diseño que conviene nombrar**: el mismo token, `--accent-primary`,
se usa como color de texto y como relleno de botón. En claro los dos requisitos empujan en
direcciones opuestas, y exigir ambos a 4.5 obliga a poner toda la rampa en L≈0.48–0.50 —
es decir, a aplanarla: Aqua, Sky y Azure acabarían siendo el mismo color. Lo correcto es
**partir el token**: `--accent-primary` se queda como relleno (que solo necesita 3:1 como
componente de interfaz) y nace un `--accent-text`, más oscuro, para cuando el acento es
letra. Eso conserva la rampa y cumple las dos cosas.

---

## 4. Plan

Por fases, de más a menos apalancamiento. Las fases 0 y 1 no cambian ningún color: mueven
o miden. Cada una es verificable con `node scripts/checkThemeContrast.cjs --all`.

### Fase 0 — Base ✅ HECHA en esta pasada

- Retirar `light`, `ivory` y `sterlingdark`, con migración al leer.
- Sacar los alias `--color-*` de `:root` y llevarlos a `body`. Es el requisito de todo lo
  demás: mientras estuvieran congelados, calibrar la paleta de feedback de un tema claro
  no habría cambiado nada en pantalla.
- Rampa de acentos claros colgando de `.mode-light`.
- Verificador al día, con la capa de modo en la cadena de resolución.

### Fase 1 — Que el verificador vea lo que falla ✅ HECHA

El verificador miraba texto y bordes, y con eso decía "All checks passed" mientras la
mitad de los tokens salían `(unresolved)` por dentro: no sabía resolver `var()` ni
`color-mix()`, así que **callaba en vez de fallar**. Eso es peor que no medir, porque da
una señal verde falsa.

Ahora resuelve `var(--x)` y `var(--x, respaldo)` recorriendo la misma cadena que la
cascada real — preset de acento → tema → `.mode-light` → `body` → `:root` — y entiende
`color-mix(…, transparent)`, que resulta ser la **única** forma de color-mix que usa el
archivo (mezclar con `transparent` no depende del espacio de color: solo baja el alfa). Si
algún día aparece una mezcla entre dos colores reales, devuelve nulo y el token sale como
`(sin resolver)` en vez de mentir con un valor a medias.

Con eso puede medir lo que antes había que mirar a mano en el navegador: **sintaxis**
contra el lienzo del editor, **tipos de dato** contra panel y editor, **textos de
feedback**, **iconos de archivo**, **escalón** base→raised, **hover/active**, el **velo**
de los diálogos y el alfa de las **sombras** en claro, y el **acento** en sus dos usos —
como texto y como relleno con su propio texto encima — probando **todos los presets**, no
solo el que trae puesto el tema. Era ahí donde estaba el fallo de los cuatro botones
ilegibles: en presets que el usuario podía elegir y nadie medía.

**Fallos y avisos, separados.** Un aviso se mide y se imprime pero no tumba la ejecución.
Es para lo que está medido y es cierto, pero cuya corrección es una decisión de diseño que
nadie ha tomado. Hoy hay 24, y son todos lo mismo: **el extremo profundo de la rampa de
acentos en los temas oscuros**. `linear`, `amox-9` y `amox-10` nacen con L 0.53–0.61, y
sobre un near-black eso da 2.5–4.0:1 cuando el acento se usa como texto. Subirlos
cambiaría el aspecto de los siete temas oscuros a la vez — no es un arreglo, es una
decisión, y queda anotada en vez de resuelta a escondidas.


### Fase 2 — La capa de modo claro ✅ HECHA

Lo de la sección 3, que es lo que arregla los tres temas a la vez. El principio que guía
las cuatro piezas es el mismo, el que aprendimos con la pantalla de bienvenida: **no se
trata de aplicar la receta del oscuro más floja; en claro varios efectos necesitan ir
hacia arriba, no hacia abajo**.

**Lo que cambió, y el número antes / después:**

| | Antes | Después |
|---|---|---|
| Velo del diálogo | negro al 60 % — lienzo velado `#606163`, diálogo a 6.4:1 | tinta del tema al 45 % — lienzo velado `#91979e`, diálogo a **2.9–3.0:1** |
| Sombras (alfa sm/md/lg) | 0.06 / 0.09 / 0.13 | **0.10 / 0.16 / 0.22** |
| `hover` sobre `raised` | 1.09–1.11 | **1.13–1.15** (oscuro: 1.12–1.14) |
| `active` sobre `raised` | 1.15–1.20 | **1.25–1.28** (oscuro: 1.22–1.30) |
| Acentos que fallan como texto o como relleno | 7 de 20 | **0 de 20** |

Las cuatro se declaran ahora en `.mode-light` y se derivan de `--text-primary`, la tinta
del tema. Antes cada bloque de tema escribía su propio `rgba(…)` a mano — tres recetas
distintas para el mismo trabajo, con pesos visuales que no coincidían. Derivarlas obliga a
**quitarlas de los bloques de tema**: misma especificidad (0-1-0) y más abajo en el
archivo, así que ganaban ellas. Los bloques llevan una nota que lo dice, para que nadie
las vuelva a declarar ahí sin darse cuenta.

**El punto 4 no se hizo como lo proponía el plan, y conviene explicar por qué.** El plan
decía partir `--accent-primary` en relleno y `--accent-text`. Al contarlos, el token se usa
**146 veces como `color:`** y **100 como fondo**: partirlo obliga a repasar a mano uno de
los dos grupos entero, decidiendo caso por caso, con el riesgo de equivocarse justo en los
sitios mixtos (texto de acento sobre un chip ya tintado de acento).

Midiendo resultó que no hace falta. Las dos exigencias — acento legible **sobre** papel y
blanco legible **encima** del acento — se cumplen a la vez en una banda estrecha,
**L 0.47–0.52**; fuera de ella fallan las dos juntas. Así que en vez de partir el token se
clavó la rampa clara en esa banda. Un solo valor por acento, cero call sites tocados.

El precio hay que decirlo: **en claro la rampa deja de ser una rampa de luminosidad y pasa
a ser una rampa de tono**. Los cuatro primeros pasos (`amox-2` a `amox-5`) quedan teales
casi idénticos, porque a esa L el margen de croma es el que es. Se prefiere eso a cuatro
acentos ilegibles — pero si alguna vez molesta, la salida no es subirles la L, es
replantear qué significa la rampa en claro.

### Fase 3 — Cada tema claro ✅ HECHA

**Se subió el piso antes de calibrar.** `--text-tertiary` en claro pasa de 4.0 a **4.5**
(AA de texto normal): el 4.0 vino de cuando los claros estaban mucho peor y era un suelo de
emergencia. Los tres llegan a 4.5 sin perder la distancia con `secondary`, que va en 6–7. Y
se añadió `--text-disabled` al verificador con piso 3.0 — estaba sin medir, y los tres
claros lo tenían entre **1.74 y 2.07**, que es sencillamente invisible. Solo se mide en
claro: en oscuro va en 1.7–2.4 a propósito, y decidir si eso se queda es de otra fase.

- **Amox Light** — el retoque que se esperaba. `text-tertiary` 4.33→4.60, `text-disabled`
  2.07→3.10. Y `--syntax-type` / `--type-float`, que son el teal de marca, pasan a ser el
  **mismo valor exacto** que el acento por defecto del tema, para que la identidad se lea
  igual en la UI y dentro del SQL.

- **Sterling Light** — el diagnóstico se confirmó a medias, y conviene apuntarlo. Aclarar
  `--surface-inset` de `#e2dbf0` a `#ede8f6` (escalón 1.22 → 1.09, el de Amox Light) arregló
  `text-secondary` (5.38→6.02) y el acento, pero **`text-tertiary` y `text-disabled` sí
  hubo que tocarlos**: se quedaban en 3.71 y 2.07 con el pozo ya aclarado. La predicción de
  que la tinta no haría falta tocarla era optimista.

  Sus bordes pasan de lavanda opaco a alfa sobre la tinta, con los mismos alfas que Amox
  Light (0.07 / 0.12 / 0.20). Un color literal no puede integrarse sobre cuatro superficies
  a la vez, y por eso `border-subtle` se salía del rango por arriba.

- **Mist** — el que más cambia: 6 valores de sintaxis, 5 de tipos de dato y 2 textos de
  feedback. Todos conservan tono y croma y solo bajan de luminosidad, así que el carácter
  apagado del tema no cambia — lo que cambia es que ahora se lee. Su problema era que
  “muted and easy on the eyes” estaba resuelto bajando el croma **y subiendo la
  luminosidad**, y lo segundo es justo lo que no funciona sobre papel.

  **Su elevación invertida se queda**, y ahora está dicho en el CSS. Es lo que le da
  carácter, y midiendo separa mejor que los otros dos (escalón base→raised de 1.08 contra
  1.05). El aviso que hacía falta es para quien lo edite: aquí el “panel” es el color
  oscuro y el “lienzo” el claro, al revés de lo que se espera leyendo el resto del archivo.


### Fase 4 — El oscuro que quedó suelto ✅ HECHA

Al medirlo con el verificador ya completo salieron más cosas que el borde de Sterling Deep:

- **Sterling Deep** — `--surface-raised` sube de `#0b0912` a `#0c0a14`: el escalón con el
  lienzo estaba en 1.018 y el panel no llegaba a separarse. `--border-strong` de `#2e2a3a`
  a `#332f41` (1.45 → 1.56); en 1.45 el borde "fuerte" no se leía como fuerte. Y sus
  estados, que iban en 1.07 / 1.14 contra el 1.12–1.14 / 1.22–1.30 del resto de oscuros:
  **sobre un fondo más hondo hace falta más alfa para el mismo efecto**, que es el mismo
  principio del modo claro visto por el otro lado.
- **Ayu** — mismo caso, estados en 1.07 / 1.14.
- **Nord** — `--feedback-error-text` en 3.05:1 sobre la superficie de los modales. El rojo
  aurora `#bf616a` se queda en `--feedback-error`, que es la marca y el borde y ahí no
  necesita 4.5; el token `-text` pasa a `#d6888f`, el mismo tono aclarado. **Es justo para
  esto que el token `-text` existe separado del base**, y Nord era el único tema que tenía
  los dos con el mismo valor.

Lo que **no** se tocó: `--text-disabled` en oscuro (1.7–2.4) y la rampa de acentos oscura.
Los dos están medidos — el primero excluido del verificador a propósito, el segundo como
aviso — y los dos son decisiones de diseño pendientes, no deuda escondida.

### Fase 5 — Cerrar el sistema ✅ HECHA

**La regla, ahora comprobada sola.** El verificador recorre `:root` y falla si alguna
custom property lleva `var()` apuntando a un token que algún tema redefine. La precisión
importa: `--transition-fast: var(--duration-fast)` lleva `var()` y **no** es un bug, porque
ninguna duración depende del tema y congelarla no cambia nada. La regla mira a dónde
apunta, no si hay un `var()`.

Al encenderla salieron **24 properties**, no una:

- Los 8 `--feedback-*-bg` / `-border`, que ya estaban señalados como "la misma trampa
  esperando".
- `--icon-default`, que servía el `--text-tertiary` de Obsidian a los temas oscuros con
  terciario propio.
- Los **15 alias legacy** — `--panel-bg`, `--editor-bg`, `--text-color`,
  `--button-text-color`… — que era el hallazgo gordo. `--panel-bg: var(--surface-raised)`
  en `:root` resolvía contra el `surface-raised` de `<html>`, o sea el del tema oscuro por
  defecto. **No se notaba porque los diez bloques de tema los redeclaran uno por uno** — y
  eso es exactamente el trabajo que no habría que estar haciendo.

Los 24 bajaron al bloque `body`. Es un cambio sin efecto visible donde los temas ya
redeclaraban (el tema seguía ganando por especificidad) y un arreglo donde no.

Queda también actualizada la tabla de temas de `guia_estilos.md`, con las capas de la
cascada (ahora cinco, con `body` en medio), los pisos por token y el aviso de que un tema
claro no debe declarar `--shadow-*`, `--hover-bg` ni `--active-bg`.


---

## 5. Cómo verificar

```bash
node scripts/checkThemeContrast.cjs --all
```

**Todo pasa**, en los diez temas, con **24 avisos**.

Los 24 son la misma cosa: el extremo profundo de la rampa de acentos (`linear`, `amox-9`,
`amox-10`, y en Nord también `islands`, `rose`, `lavender`, `steel`) usado como TEXTO sobre
un fondo oscuro. Está medido y es cierto; arreglarlo significa aclarar la rampa oscura, y
eso cambia el aspecto de los siete temas oscuros a la vez. Es una decisión de diseño
pendiente, no un descuido — por eso es aviso y no fallo.

Lo que el verificador cubre ahora: texto (cuatro niveles), bordes, escalón de elevación,
sintaxis, tipos de dato, textos de feedback, iconos de archivo, hover/active, velo de los
diálogos, alfa de las sombras, el acento en sus dos usos y con todos los presets, y la
regla estructural del `var()` en `:root`.

Los temas retirados ya no existen: aplicar `.light-theme`, `.theme-ivory` o
`.theme-sterlingdark` al body no define ninguna superficie y cae al oscuro por defecto,
que es exactamente por lo que hace falta `migrateTheme`.
