// @suite rapida
/**
 * Abrir un `.sqlchain` no lo modifica (6.0, M10 · T2): el editor compara por
 * contenido (client/src/components/chains/mismoProceso.js) antes de marcarlo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { mismoProceso, formaDeProceso } = await import(pathToFileURL(path.join(RAIZ, 'client', 'src', 'components', 'chains', 'mismoProceso.js')).href);

let ok = 0, mal = 0;
const bien = (n, c, x) => { if (c) { ok++; console.log('  ok ', n); } else { mal++; console.log('  MAL', n, x === undefined ? '' : JSON.stringify(x)); } };

const texto = fs.readFileSync(path.join(RAIZ, 'scripts', 'ejemplos', 'proyectos', 'tienda-electronica', 'flujos', 'cierre_mensual.sqlchain'), 'utf8');
const archivo = JSON.parse(texto);

// Lo que ChainEditor.serialize() devuelve al abrir, sin tocar nada.
const comoLoSerializa = (d) => ({
    version: '1.0', name: d.name, description: d.description,
    ...(d.config ? { config: d.config } : {}),
    nodes: d.nodes.map(n => ({ id: n.id, type: n.type, label: n.label, description: n.description, position: n.position, config: n.config || {}, disabled: !!n.disabled })),
    edges: d.edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
    variables: d.variables,
    ...(d.parametros?.length ? { parametros: d.parametros } : {}),
    ...(d.vista ? { vista: d.vista } : {}),
});

console.log('— abrir sin tocar');
bien('lo serializado al abrir es el mismo proceso que el archivo', mismoProceso(comoLoSerializa(archivo), texto));
bien('con otro sangrado y otro orden de claves, también', mismoProceso(JSON.stringify(JSON.parse(texto)), texto) && mismoProceso({ ...archivo, nodes: archivo.nodes.map(n => Object.fromEntries(Object.entries(n).reverse())) }, texto));

console.log('— un cambio de verdad');
const movido = structuredClone(archivo); movido.nodes[0].position = { x: movido.nodes[0].position.x + 40, y: movido.nodes[0].position.y };
bien('mover un paso', !mismoProceso(movido, texto));
const configurado = structuredClone(archivo); configurado.nodes[1].config = { ...configurado.nodes[1].config, nuevo: 1 };
bien('cambiar la configuración de un paso', !mismoProceso(configurado, texto));
const desconectado = structuredClone(archivo); desconectado.edges.pop();
bien('quitar una conexión', !mismoProceso(desconectado, texto));
const desactivado = structuredClone(archivo); desactivado.nodes[2].disabled = true;
bien('desactivar un paso', !mismoProceso(desactivado, texto));

console.log('— lo que no es un proceso');
bien('un texto que no es JSON nunca es «el mismo»', !mismoProceso('{roto', texto) && !mismoProceso(texto, ''));
bien('la forma trae todo lo que se guarda', Object.keys(formaDeProceso(archivo)).join(',') === 'name,description,config,nodes,edges,variables,parametros,vista');

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
