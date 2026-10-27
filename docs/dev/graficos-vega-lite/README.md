# Prueba: las 12 figuras de referencia en Vega-Lite

Acompaña a [`../plan_graficos_vega_lite.md`](../plan_graficos_vega_lite.md).

- `galeria.html`: cada figura, con su SVG y su especificación al lado.
- `NN_*.vl.json`: la especificación. Los datos llegan por nombre (`"data": {"name": "dataset"}`), igual
  que en Deneb.
- `tema.json`: la capa de aspecto, un `config` de Vega-Lite.
- `specs.mjs`, `datos.mjs` y `render.mjs`: con esto se reproduce. Los datos son sintéticos, con semilla
  fija.

Para volver a generarlo, desde una carpeta FUERA del repositorio:

```
pnpm add vega-lite@6.4.3 vega@6.2.0
node render.mjs   # con los tres .mjs copiados ahí; deja todo en out/
```
