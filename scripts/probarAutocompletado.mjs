/**
 * El worker de completado del editor, en Node: lo que se ofrece tras «alias.».
 *
 *     node scripts/probarAutocompletado.mjs
 *
 * Al escribir `v.` el SQL queda incompleto y tree-sitter marca un nodo de error;
 * la extracción de alias del árbol vuelve vacía. El worker tiene que resolver el
 * alias por el texto y ofrecer las columnas de la tabla, no funciones.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CLIENTE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'client');
const respuestas = [];
globalThis.self = { postMessage: (m) => respuestas.push(m) };
await import(pathToFileURL(path.join(CLIENTE, 'src/workers/sqlLanguageWorker.js')).href);
const enviar = async (action, payload, id = 1) => { await self.onmessage({ data: { action, id, payload } }); return respuestas.at(-1); };

let ok = 0, mal = 0;
const eq = (nombre, real, esperado) => {
    const bien = JSON.stringify(real) === JSON.stringify(esperado);
    bien ? ok++ : mal++;
    console.log(`${bien ? '  ok ' : '  MAL'} ${nombre}${bien ? '' : ` → ${JSON.stringify(real)} (esperado ${JSON.stringify(esperado)})`}`);
};

await enviar('init', { treeSitterWasmUrl: path.join(CLIENTE, 'public/tree-sitter.wasm'), sqlWasmUrl: path.join(CLIENTE, 'public/tree-sitter-sql.wasm') });
await enviar('updateSchema', { tables: {
    ventas: [{ name: 'linea', type: 'BIGINT' }, { name: 'fecha', type: 'DATE' }, { name: 'producto', type: 'VARCHAR' }],
    productos: [{ name: 'producto', type: 'VARCHAR' }, { name: 'categoria', type: 'VARCHAR' }],
} }, 0);

async function tras(texto) {
    const lineas = texto.split('\n');
    await enviar('syncDocument', { docId: 'd', text: texto }, 0);
    const r = await enviar('requestCompletions', { docId: 'd', line: lineas.length, column: lineas.at(-1).length + 1 }, 2);
    return (r.result?.suggestions || []).map(s => s.label);
}

eq('WHERE v. con AS', await tras('SELECT *\nFROM ventas AS v\nWHERE v.'), ['linea', 'fecha', 'producto']);
eq('alias sin AS', await tras('SELECT *\nFROM ventas v\nWHERE v.'), ['linea', 'fecha', 'producto']);
eq('el alias del JOIN', await tras('SELECT *\nFROM ventas AS v\nJOIN productos AS p USING (producto)\nWHERE p.'), ['producto', 'categoria']);
eq('el nombre de la tabla sin alias', await tras('SELECT *\nFROM ventas\nWHERE ventas.'), ['linea', 'fecha', 'producto']);
eq('una palabra clave no es alias', (await tras('SELECT *\nFROM ventas WHERE ventas.')).length, 3);

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
