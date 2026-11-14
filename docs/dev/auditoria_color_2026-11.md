# Auditoría de color: temas y acentos (2026-11-14)

Pedida por el autor: revisar la paleta de cada tema y la de los acentos, entender qué es cada tema, y decir qué se cambiaría y qué se añadiría, comparando los temas entre sí.

**Estado: APLICADA (2026-11-14), segunda versión.** Los suelos de la primera versión se descartaron (§2). Lo aplicado: los arreglos de sintaxis y estado de §2 (Ember como allí: suelo, tinta y coral intactos, error bermellón), los acentos de §3 más un **rojo neón** que pidió el autor, y un acento propio por tema (§5). Se descartó también una prueba de Ember con el negro de una carta de referencia.

## Cómo se midió

Los valores salen de `client/src/estilos/01-base.css` y `03-temas.css`. Todo se pasó a OKLCH y se midió:

- **Contraste** WCAG de cada tinta sobre sus superficies.
- **Distancia** entre dos colores como ΔE en OKLab ×100. Por debajo de 2, dos colores son el mismo a ojo; hacia 5 se distinguen puestos lado a lado; a partir de 8–10 se distinguen sueltos.
- **Daltonismo** (deuteranopía, protanopía, tritanopía) sobre los acentos.

Lo que no se midió: el color que el navegador pinta de verdad para un `oklch()` fuera de sRGB (ver A1), ni ninguna propuesta puesta en la app.

## 1. Lo que sale al comparar los temas entre sí

### 1.1 Cuatro oscuros comparten suelo

| Lienzo (ΔE) | Amox Dark | Ember | Sterling Deep | Islands | Nord | Obsidian | Deep Dark |
|---|---|---|---|---|---|---|---|
| Amox Dark | – | 1,6 | 1,4 | 2,9 | 4,5 | 4,4 | 10,5 |
| Ember | 1,6 | – | 1,6 | 1,5 | 3,2 | 5,8 | 11,9 |
| Sterling Deep | 1,4 | 1,6 | – | 3,0 | 4,3 | 5,0 | 11,1 |
| Islands | 2,9 | 1,5 | 3,0 | – | 1,9 | 7,2 | 13,2 |

Los paneles están todavía más cerca: Ember y Sterling Deep a 0,9, Ember y Amox Dark a 1,0. Los cuatro viven en L 0,19–0,22, croma 0,007–0,024 y tono 253–285°. Quien cambia entre ellos ve cambiar el código y el acento, no el fondo.

Los que sí tienen suelo propio: **Deep Dark** (negro sin tinte), **Obsidian** (el más oscuro con tinte, L 0,145) y **Nord** (el más claro, L 0,234).

### 1.2 Los tres papeles claros son el mismo blanco

Mist, Amox Light y Sterling Light tienen el lienzo a ΔE 0,2–1,0 (L 0,966–0,969). Mist se salva por su panel hacia abajo (4,3 de los otros); Amox Light y Sterling Light tienen el panel a 0,7. Se distinguen por la tinta y el acento.

### 1.3 No hay ningún tema cálido

Las diez superficies caen entre 248° y 303°: azul o violeta. Ember tiene el calor en el código y el suelo frío (decisión documentada). Desde que se retiró Ivory tampoco hay papel cálido.

## 2. Tema por tema

**Decisión del autor (2026-11-14): los suelos no se tocan.** La primera propuesta movía el suelo de Ember (ceniza cálida), el de Sterling Deep (más croma), el de Amox Dark (tono) y los papeles de Mist y Sterling Light. Rechazada: se ven radicales y saturados para una herramienta de análisis que se usa todo el día. Tampoco se añade un papel cálido.

El criterio que queda, y que coincide con las referencias que trajo el autor (un suelo quieto, un blanco, un solo color con voz): **el parecido entre suelos de 1.1 y 1.2 no es un defecto**. Medido, el `#111827` de su referencia está a ΔE 2,1 del lienzo de Sterling Deep y a 2,8 del de Amox Dark. Lo que da nombre a cada tema es su acento y su sintaxis.

Lo que sí se arregla es lo que hoy se confunde, sin cambiar el aspecto de ningún tema:

| Tema | Qué es | Lo que falla, medido | Arreglo |
|---|---|---|---|
| **Obsidian** | El negro azulado clásico | Cadena y número a ΔE 2,9: `'2024'` y `2024` se ven iguales. Comentario 2,8:1, bajo el piso de 3,0 | Número `oklch(0.76 0.12 350)` (a 14,2 de la cadena). Comentario a L 0,50 (3,3:1) |
| **Deep Dark** | Negro sin tinte | Hereda la sintaxis de Obsidian | Los dos mismos arreglos |
| **Amox Dark** | El de la casa | Nada que obligue. El comentario del CSS dice «tinte cian» y el suelo mide 253° | Sin cambios de color; corregir el comentario |
| **Ember** | Suelo neutro, código cálido, coral | El coral del acento está a 4,4 del rojo de error. Sobre menús da 4,42:1. Cadena y tipo a 2,6 | Se mueve el **error**, no el acento: bermellón `#f75932` (a 8,7 del coral). Coral un punto más claro, `#eb5e7c` (4,67:1; a 1,6 del actual). Tipo `#f3d19c` (a 6,3 de la cadena) |
| **Sterling Deep** | Gris-violeta con lima | Nada | Sin cambios |
| **Nord Dark** | Noche polar | Palabra clave y operador son el mismo color; número y constante también | Constante `#d08770` (de su propia paleta), operador `#98a4b3` |
| **Dark Islands** | Gris neutro | Comentario 2,45:1 | Comentario `#666a74` (3,2:1) |
| **Mist** | Niebla | Palabra clave y constante son el mismo color | Constante `oklch(0.53 0.12 15)` ≈ `#a54b55` (4,8:1) |
| **Amox Light** | El claro de la casa | Número y constante son el mismo color | Constante `#6d3fc4` (6,0:1) |
| **Sterling Light** | Papel lavanda | Nada | Sin cambios |

**Opcional:** Deep Dark no tiene acento propio (hereda el cian). Su idea es que el dato sea lo único con color; el acento Graphite nuevo (11,9:1 sobre su negro) lo cumple si se pone como su acento por defecto.

## 3. Acentos

### A1. El cian por defecto está fuera de sRGB
`oklch(0.73 0.155 195)` pide croma 0,155 y a esa luminosidad y tono sRGB da 0,125. Lo que se ve depende de cómo recorte el navegador; la muestra del selector (`#22d3ee`) es otro color (a 7,7 del equivalente dentro de gama) y el de Amox Dark otro más. Propuesta: un solo cian, `oklch(0.80 0.134 212)` = `#22d3ee`, que además se aleja de Sage (hoy a 8,1).

### A2. Seis sobrios que duplican a los vivos
| Par | Oscuro | Claro |
|---|---|---|
| violet / lavender | 4,6 | 6,6 |
| red / rose | 5,7 | 3,9 |
| orange / amber | 6,9 | 4,4 |
| orange / copper | 7,7 | **1,3** |
| green / sage | 10,0 | **0,6** |

En tema claro los 13 acentos son en la práctica 9. Los sobrios comparten tono con un vivo y sólo bajan el croma; en la banda estrecha del claro (L 0,47–0,52) esa diferencia desaparece.

### A3. Huecos en el círculo
Entre naranja (55°) y lima (125°) hay 70° sin nada: falta el **amarillo**. Entre cian y azul, 63°.

### A4. Acentos que son un color de estado
Naranja está a 4,4 del aviso, ámbar a 5,1, verde a 6,0 del éxito, azul a 7,5 de info y rojo a 8,6 del error. El que tiene consecuencia es el **rojo**: con él, el botón principal y el de borrar son el mismo color.

### A5. Daltonismo
Con deuteranopía 15 parejas caen por debajo de 6. Importa poco: el acento se elige uno, no codifica categorías.

### Propuesta: 9 vivos y 6 sobrios

| Acento | Oscuro | Claro | Cambio |
|---|---|---|---|
| Cyan | `#25d4f0` | `#026d7c` | Dentro de gama, el mismo de Amox Dark |
| Blue | `#69a5fe` | `#085dc7` | – |
| Violet | `#ad8dfd` | `#773cd6` | – |
| Magenta | `#f46bdb` | `#ab2097` | 340° → 335° |
| **Pink** | `#fe85a4` | `#bb225c` | Sustituye a Red: a 14,5 del error |
| Orange | `#ff8f4b` | `#ab410b` | 55° → 50° |
| **Yellow** | `#f7d22a` | `#766202` | Nuevo; en claro es ocre |
| Lime | `#abe841` | `#4b6d00` | – |
| Green | `#30d882` | `#007245` | – |
| Sage | `#94b594` | `#4e6853` | Croma 0,10 → 0,06: deja de ser un verde flojo |
| **Sand** | `#d4bb86` | `#6f5f44` | Funde Amber y Copper |
| **Clay** | `#d28973` | `#8d5046` | Sustituye a Rose, hacia la terracota |
| **Mauve** | `#c592b3` | `#834f72` | Sustituye a Lavender |
| Steel | `#85a2c0` | `#3e5e7e` | – |
| **Graphite** | `#c1c4c9` | `#44484e` | Nuevo: acento sin color |

Medido: el par más cercano pasa de 4,6 a **8,5** en oscuro y de 0,6 a **5,2** en claro. Todos dan ≥ 4,5:1 como texto en las superficies de los siete oscuros y de los tres claros, y ≥ 5,99 con blanco encima en claro.

Se pierde: Red, Rose, Lavender, Amber y Copper como nombres. Harían falta entradas en `ACENTOS_RETIRADOS` (red → pink, rose → clay, lavender → mauve, amber y copper → sand).

## 4. Orden que seguiría

1. **Arreglos de sintaxis y estado** de la tabla de §2: no cambian el aspecto de ningún tema.
2. **Acentos**: la lista de 15, con el cian dentro de gama y las traducciones de los nombres retirados.

Cada paso pasa por `scripts/checkThemeContrast.cjs` y por la app en los diez temas.

## 5. Lo que se aplicó además (2026-11-14)

- **Rojo neón** (`oklch(0.68 0.208 22)` ≈ `#ff525b`, id `red`, «Neon red»): el croma máximo que cabe. En los menús de Nord daba 3,93, así que ahí sube a L 0,72 (`.theme-nord.accent-red`). El rosa queda aparte (a ΔE 11,2).
- **Error bermellón con acento rojo**: en oscuro, con `accent-red` (y en Deep Dark, que lo trae de serie), `--feedback-error` pasa a `#f75932` y su texto a `#ff7552`, igual que en Ember. En claro no: el rojo claro del acento no cambió.
- **Acento propio por tema**: Obsidian violeta (ahora con clase `theme-obsidian`), Deep Dark rojo neón, Ember el coral a `#eb5e7c`; los demás, el de siempre. El selector tiene una muestra **Theme** (id `tema`, sin clase) que es la de serie. Antes `cyan` hacía ese papel: un `cyan` guardado sin la marca `amoxsql-accent-v2` se lee una vez como `tema`.
- **Cian dentro de sRGB**: `.accent-cyan` y `:root` en `oklch(0.797 0.134 211.5)` = `#22d3ee`.
- **El verificador** (`scripts/lib/themeTokens.cjs`) junta todas las reglas de un selector y aplica el ajuste de un tema a un acento (`presetEnTema`). Pasan los diez temas con los dieciséis acentos.
- Los ajustes del deck (acento en el front-matter) siguen igual; un deck con un id retirado se traduce con `migrateAccent`.
