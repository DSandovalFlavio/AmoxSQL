import fs from 'node:fs';
import * as vl from 'vega-lite';
import * as vega from 'vega';
import { specs, tema } from './specs.mjs';
import { datos } from './datos.mjs';

// Se corre desde una carpeta aparte con vega-lite y vega instalados; deja todo en out/.
fs.mkdirSync('out', { recursive: true });
const filas = [];
for (const [id, s] of Object.entries(specs)) {
  const { datos: clave, ...spec } = s;
  const avisos = [];
  const logger = { level() { return this; }, warn: (...a) => avisos.push(a.join(' ')), info() {}, debug() {}, error: (...a) => avisos.push('ERROR ' + a.join(' ')) };
  try {
    const vg = vl.compile(spec, { config: tema, logger }).spec;
    const view = new vega.View(vega.parse(vg), { renderer: 'none' });
    view.data('dataset', datos[clave]);
    await view.runAsync();
    const svg = await view.toSVG();
    fs.writeFileSync(`out/${id}.svg`, svg);
    fs.writeFileSync(`out/${id}.vl.json`, JSON.stringify(spec, null, 2));
    const lineas = JSON.stringify(spec, null, 2).split('\n').length;
    filas.push({ id, lineas, avisos });
    console.log('ok ', id, `${lineas} líneas`, avisos.length ? '· ' + avisos.join(' | ') : '');
  } catch (e) {
    console.log('MAL', id, e.message);
  }
}
fs.writeFileSync('out/resumen.json', JSON.stringify(filas, null, 2));
fs.writeFileSync('out/tema.json', JSON.stringify(tema, null, 2));
