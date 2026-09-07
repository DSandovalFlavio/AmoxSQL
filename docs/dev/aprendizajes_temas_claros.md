# Aprendizajes — Temas claros

> **Origen**: rediseño visual de la bienvenida (2026-09-06). Al llevar el
> resplandor de acento al modo claro, lo que funcionaba en oscuro se veía
> ausente. Este documento recoge el porqué y lo generaliza, para aplicarlo al
> resto de la aplicación — el editor en particular.
>
> **Contexto**: ver [`plan_rediseno_visual.md`](./plan_rediseno_visual.md).

---

## 1. El principio: en claro no se suma luz, se resta

Es la raíz de todo lo demás.

Sobre un fondo casi negro (L ≈ 0.15) un halo funciona **añadiendo luz**: hay un
margen enorme hacia arriba, así que mezclar un 30% de acento produce un efecto
notorio. Sobre una superficie clara (L ≈ 0.98) **ese margen no existe**: añadir
un color claro sobre algo ya claro no produce nada.

Lo que se lee en claro no es luz emitida sino **un velo de color**: se consigue
oscureciendo y tintando, no iluminando.

> **El error a evitar.** Coger una receta de oscuro y aplicarla al claro *con
> menos fuerza*. El resultado no es "más sutil", es **invisible**. En la
> bienvenida el resplandor se puso al 40% de la fuerza para que no ensuciara, y
> lo que se consiguió fue borrarlo. La corrección fue subirlo al **80%**.

**Corolario práctico**: cuando un efecto de color no se vea en claro, el reflejo
correcto casi nunca es bajarlo. Suele ser subirlo *y* asegurarse de que el color
que se mezcla tiene la L baja, para que tinte en vez de blanquear.

---

## 2. Números medidos en la bienvenida

Sirven de referencia de magnitud, no como valores universales.

| Parámetro | Oscuro | Claro | Nota |
|---|--:|--:|---|
| Fuerza del resplandor de fondo | 100% | **80%** | del valor que pida el usuario |
| Halo del lienzo | 14% | **30%** | mezcla de acento |
| Tinte del panel | 0% | **10%** | en claro se tinta, en oscuro solo se oscurece |
| Factor de oscurecimiento del panel | 0.72 | **0.945** | sobre la L de `--surface-base` |
| Cuerpo / opacidad de las partículas | ×1 | **×1.35 / ×1.25** | |

Y la relación que conviene retener:

- Panel derecho **12.2%** más oscuro que la izquierda en claro
  (`rgb(207,215,223)` frente a `rgb(241,244,247)`).
- La misma separación en oscuro es del **30%**.

En claro hace falta **menos diferencia absoluta pero más tinte** para que una
región se lea como una región. Un panel gris no pega con nada; uno tintado se
lee como decisión de diseño.

---

## 3. Los elementos diseñados con L alta no sobreviven al claro

Cualquier color pensado para brillar sobre negro tiene la L por las nubes y en
claro desaparece. No se arregla bajándole la opacidad: hay que darle **anclas
propias** para el modo claro.

Caso concreto, el degradado del logo (`client/src/utils/logoGradient.js`):

| | Stop superior | Stop inferior |
|---|--:|--:|
| Oscuro | L 0.861 | L 0.567 |
| Claro | **L 0.640** | **L 0.380** |

Se conserva la caída relativa entre los dos stops; solo baja el punto de
partida. El croma se busca **al límite del gamut sRGB** para esa L y ese tono en
ambos modos (ver el propio archivo: es lo que hace que el color se vea vivo en
vez de sucio).

**Dónde más aplicar esto**: cualquier token o color literal con L > 0.75 que se
use sobre superficie. Sintaxis del editor, badges, iconos de estado, líneas de
gráfico.

---

## 4. No mezclar con negro para oscurecer

Mezclar una superficie con `#000` **desatura**: le roba el tinte.

Se detectó porque, de todos los temas oscuros, el único cuya bienvenida se veía
bien era Obsidian — y resultó ser el único con la superficie casi neutra
(croma 0.012). Los tintados perdían su tinte solo en la mitad afectada:

| Tema | `--surface-base` | |
|---|---|---|
| Obsidian | `oklch(0.145 0.012 270)` | casi neutro → aguantaba la mezcla |
| AmoxDark | `#0f141a` | carbón frío → se descoloría |
| Ayu | `#0d1017` | azul tinta → se descoloría |
| Nord | `#1a1e25` | polar → se descoloría |

**La forma correcta** es escalar solo la luminosidad conservando tono y croma:

```css
background: oklch(from var(--surface-base) calc(l * 0.72) c h);
```

Tras el cambio, el desvío de tono entre las dos mitades quedó en 0.3°–10°, y ese
resto es de la medición en 8 bits, no de la fórmula. Vale para los dos modos.

---

## 5. Bug vivo: los alias de feedback están congelados en el tema oscuro

**Esto es lo más accionable del documento.** Es la misma trampa del PR #70
(el acento que se veía cian en todos los temas), todavía presente en otro sitio.

`:root` declara los alias como derivación:

```css
/* client/src/index.css, bloque :root */
--color-success: var(--feedback-success);
--color-error:   var(--feedback-error);
--color-warning: var(--feedback-warning);
```

Una custom property cuyo valor es `var(...)` **resuelve en el elemento donde se
declara**. `:root` es `<html>`, que no lleva la clase de tema — esa va en
`<body>`. Así que el alias se queda con el valor oscuro y nunca ve el override
del tema claro.

Medido en `theme-amoxlight`:

| Token | Valor | |
|---|---|---|
| `--feedback-success` | `rgb(31,122,72)` | correcto, verde oscuro del tema |
| `--color-success` | `rgb(0,198,109)` | **congelado**, verde brillante del oscuro |
| `--feedback-error` | `rgb(192,57,43)` | correcto |
| `--color-error` | `rgb(249,65,68)` | **congelado** |

En modo oscuro coinciden, porque ahí `:root` *es* la definición buena — por eso
no se había notado.

Alcance: **245 usos** de los alias congelados en la base de código
(`--color-error*` 108, `--color-success*` 64, `--color-warning*` 52,
`--color-info*` 21), frente a 145 usos de los `--feedback-*` correctos.

**La corrección** es mover la derivación de `:root` al mismo bloque `body` donde
ya vive el derivador del acento, que sí lleva la clase de tema:

```css
body {
  --accent-primary: oklch(var(--acc-l) var(--acc-c) var(--acc-h));
  /* ...aquí también: */
  --color-success: var(--feedback-success);
  --color-error:   var(--feedback-error);
  --color-warning: var(--feedback-warning);
  --color-info:    var(--feedback-info);
}
```

Un cambio de sitio, no de valor. Conviene revisar después los 245 usos por si
alguno dependía del color brillante a propósito.

> Hay precedente reconocido en el propio archivo: el comentario de `.mode-light`
> dice *"Info feedback — no light theme defined it; all inherited dark blue
> (~2.4:1)"*. Es exactamente esta clase de fallo, parcheado caso a caso.

---

## 6. Cómo medir sin engañarse

Dos trampas en las que se cayó durante este trabajo:

**No leer los componentes del color computado como si fueran RGB.** Chrome
devuelve `oklch(...)` cuando el color se declaró así, y esos tres números no son
rgb. Leerlos como rgb dio un delta de luminancia de 225 que no significaba nada.
Lo correcto es **rasterizar**:

```js
const c = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
c.fillStyle = getComputedStyle(probe).color;   // sea oklch, rgb o lo que sea
c.fillRect(0, 0, 1, 1);
const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
```

**Cuidado con medir a través de un canvas de 8 bits cuando lo que se comprueba
es una fórmula de color.** Ahí el color ya viene mapeado al gamut sRGB, así que
los deltas salen distorsionados. Para verificar una fórmula hay que leer el
color **computado**; para verificar lo que el usuario ve, el **pintado**. No son
lo mismo.

---

## 7. Checklist para mejorar un tema claro

1. **Buscar tokens huérfanos**: los que `:root` define y ningún tema claro
   redefine. Los `--color-*` de la sección 5 salieron de ahí.
2. **Buscar derivaciones en `:root`**: cualquier `--x: var(--y)` declarado en
   `:root` está congelado. Deben vivir en `body`.
3. **Buscar L > 0.75** en colores que se pinten sobre superficie: se pierden.
4. **Buscar mezclas con `#000` o `#fff`**: desaturan. Usar `oklch(from …)`
   escalando solo la L.
5. **Revisar los efectos de color por separado en cada modo.** Si algo no se ve
   en claro, probar a *subirlo* antes que a bajarlo.
6. **Comparar por ratio, no por delta absoluto.** Un 12% de diferencia de
   luminancia en claro puede leerse tanto como un 30% en oscuro.
7. **Las sombras son el recurso de profundidad del claro**, igual que la
   elevación por luminosidad lo es del oscuro. Sobre negro una sombra negra no
   se ve; sobre blanco es la señal más fuerte que hay.
