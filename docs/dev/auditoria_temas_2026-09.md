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

### Fase 1 — Que el verificador vea lo que falla

Ahora mismo solo mira texto y bordes: los fallos de la sección 2 (sintaxis, tipos,
feedback) y los de la 3 (velo, sombras, escalones, acentos) los encontré con el banco de
pruebas del navegador, a mano. Antes de tocar un solo color hay que poder repetir la
medición.

Añadirle: sintaxis contra el lienzo del editor, tipos de dato contra panel y tabla, textos
de feedback, relleno de acento con su texto encima, escalones entre superficies, y hover /
active. Y meter el banco del navegador en `scripts/`, porque es el único que resuelve
`color-mix` y `var()` de verdad.

Sin esto, las fases siguientes son opinión.

### Fase 2 — La capa de modo claro

Lo de la sección 3, que es lo que arregla los tres temas a la vez:

1. `--overlay-bg` propio para claro. Un velo tintado con la tinta del tema en vez de negro
   puro, alrededor del 35–40 %.
2. Subir las sombras. No al nivel del oscuro, pero sí lo bastante para que sean ellas las
   que separan: el punto de partida a medir es 0.10 / 0.16 / 0.22.
3. Subir `hover` y `active` hasta igualar la percepción del oscuro (objetivo 1.13 / 1.26).
4. Partir `--accent-primary` en relleno y `--accent-text`, y bajar `amox-2` … `amox-5` a
   los valores de la tabla.

El principio que guía las cuatro es el mismo, y es el que aprendimos con la pantalla de
bienvenida: **no se trata de aplicar la receta del oscuro más floja; en claro varios
efectos necesitan ir hacia arriba, no hacia abajo**.

### Fase 3 — Cada tema claro

- **Amox Light**: los cinco valores de la tabla. Es un retoque.
- **Sterling Light**: aclarar `--surface-inset` (es la causa única de cuatro de sus cinco
  fallos) y pasar sus bordes de lavanda opaco a alfa. Después volver a medir: es probable
  que la tinta no haya que tocarla.
- **Mist**: recalibrar sintaxis y tipos con la tabla de la sección 2, y decidir a propósito
  si su elevación invertida se queda.

### Fase 4 — El oscuro que quedó suelto

`--border-strong` de Sterling Deep, y de paso revisar si sus escalones de superficie
(1.02) son demasiado cortos para que la elevación se lea.

### Fase 5 — Cerrar el sistema

- El comentario de `:root` ya avisa del riesgo de las derivaciones con `var()` para el
  acento y para el resplandor, pero el fallo se coló igual. Falta la comprobación
  automática: **ninguna custom property declarada en `:root` puede contener `var()`**. Es
  una regla de una línea en el verificador y cierra la familia entera de bugs.
- `--feedback-*-bg` y `--feedback-*-border` se derivan con `color-mix` dentro de `:root`.
  Hoy no rompe nada porque los diez temas los declaran uno por uno, pero es la misma
  trampa esperando a que alguien declare solo el color base.
- Actualizar la tabla de temas de `guia_estilos.md` y los pisos por token.

---

## 5. Cómo verificar

```bash
node scripts/checkThemeContrast.cjs --all
```

Estado al cerrar esta pasada: **4 avisos**, todos conocidos y en el plan — Sterling Deep
`border-strong` 1.45 (fase 4) y Sterling Light `text-secondary` 5.38, `text-tertiary` 3.31
y `border-subtle` 1.35 (fase 3).

Los temas retirados ya no existen: aplicar `.light-theme`, `.theme-ivory` o
`.theme-sterlingdark` al body no define ninguna superficie y cae al oscuro por defecto,
que es exactamente por lo que hace falta `migrateTheme`.
