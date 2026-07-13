# Perfil de datos

**🌐 [English](../../en/results/data-profiler.md) · Español**

> Un análisis exploratorio automático de tu resultado: un veredicto en lenguaje llano, hallazgos ordenados por importancia y detalle por columna.

<img src="../../../images/12_data_profiler.png" alt="Perfil de datos de AmoxSQL" width="100%" />

## Qué es

El **Perfil de datos** (modo **Profile** de la [tabla de resultados](results-table.md)) examina el resultado de tu consulta y te cuenta, en lenguaje claro, qué historia cuentan esos datos. En lugar de una tabla de estadísticas fría, lidera con un **veredicto** de una o dos frases, seguido de un **marcador** (scorecard) y una lista de **hallazgos** ordenados por severidad.

Por debajo usa DuckDB (`SUMMARIZE` más un enriquecimiento de estadísticas) para calcular todo localmente y al instante, sobre el conjunto completo del resultado.

## Cuándo usarlo

- Nada más traer una tabla o el resultado de una query, para entenderla antes de analizarla.
- Para auditar la **calidad de los datos**: nulos, duplicados, valores atípicos, columnas constantes.
- Para detectar el **tipo semántico** de cada columna (identificador, fecha, categoría, email…) y relaciones entre columnas.
- Como paso previo a graficar: desde aquí puedes saltar a un gráfico de cualquier columna.

## Cómo usarlo

1. Ejecuta una consulta y, en el panel de resultados, cambia al modo **Profile**.
2. Lee el **veredicto** de arriba: resume dimensiones, limpieza general y el aviso más importante.
3. Revisa el **marcador**: Filas, Columnas, Completitud, Filas duplicadas y número de Hallazgos (coloreados según la severidad).
4. Recorre los **hallazgos** (Findings), ordenados de crítico a informativo.
5. En **Columns**, haz clic en una fila para **expandir** el detalle de esa columna: histograma (numéricas) o valores más frecuentes (texto), más sus estadísticas.
6. Mira **Relationships** para las correlaciones más fuertes entre columnas numéricas.

### Tipos semánticos
Además del tipo SQL, el perfil infiere un tipo con significado y le pone un icono: **Identificador** (id/uuid/clave o casi todo único), **Fecha**, **Booleano**, **Número**, **Email**, **Categoría** (pocos valores distintos) o **Texto**.

### Graficar una columna (Plot)
Al expandir una columna, el botón **Plot** abre un **gráfico nuevo y editable** en su propia pestaña, con una consulta derivada y agregada (histograma para numéricas, serie temporal para fechas, top-20 para categóricas). No grafica el millón de filas crudas: construye justo los datos del gráfico.

### Narrar con IA
El botón **Narrate with AI** envía el veredicto, los hallazgos y el resumen de columnas al [Asistente de IA](../ai/editor-assistant.md) para que redacte una narrativa breve: qué cuenta el dato, qué vigilar y qué explorar después.

### Exportar
- **HTML** — descarga un informe autocontenido con veredicto, marcador, hallazgos y tabla de columnas.
- **PDF** — abre una vista de impresión lista para guardar como PDF.
- **Full screen** — expande el perfil a pantalla completa.

## Referencia de hallazgos

| Categoría | Ejemplos de lo que detecta |
|---|---|
| **Valores faltantes** | Casi vacía (≥95 %), mayormente vacía (>50 %), algunos nulos (>5 %) |
| **Duplicados** | Filas exactas repetidas (infla conteos y promedios) |
| **Sin variación** | Columna con un único valor (sin señal) |
| **Cardinalidad** | Parece identificador · alta cardinalidad (demasiado granular para agrupar) |
| **Distribución** | Muy sesgada (usa la mediana) · mayormente ceros · negativos inesperados |
| **Atípicos** | Valores fuera del rango 1.5×IQR |
| **Fechas** | Rango de fechas · posibles huecos en la serie |
| **Concentración** | Dominada por un valor (>80 %) |
| **Claves y relaciones** | Clave candidata (par de columnas única) · correlaciones fuertes (r>0.95) |

## Referencia de estadísticas por columna

| Numéricas | Texto |
|---|---|
| Distintos, faltantes | Distintos, faltantes |
| Mín / Máx, Media, Mediana | Longitud mín/media/máx |
| Desviación estándar, Sesgo | Valor más común y su % |
| Ceros / Negativos, atípicos | Top de valores |

## Tips y gemas

- **Lee el veredicto primero:** condensa en una frase lo que tardarías en deducir mirando la tabla.
- **El punto de color por columna** en la vista Columns indica su peor hallazgo (rojo crítico, ámbar aviso, verde OK) de un vistazo.
- **Sesgo alto → usa la mediana:** cuando una columna está muy sesgada, el perfil te avisa de que la media engaña y te da la mediana.
- **Correlaciones ≈ 1** sugieren columnas redundantes: quizá puedas quedarte con una.
- **El perfil es local e instantáneo:** corre sobre DuckDB en tu máquina; no hay que esperar a un servicio externo.

## Relacionado

- [Tabla de resultados](results-table.md) · [Story Flow](../visualization/story-flow.md)
- [Asistente de IA](../ai/editor-assistant.md) · [Plan de ejecución](execution-plan.md)
