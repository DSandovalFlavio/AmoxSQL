/**
 * Ejercita `utils/preferenciaApertura.js` — cómo se abre cada archivo.
 *
 *     node scripts/probarPreferenciaApertura.mjs
 *
 * Lo que se vigila aquí es que **la aplicación no discuta con el usuario**:
 *
 * 1. Que lo elegido para un archivo no se filtre a otro. Las rutas son
 *    relativas a la raíz del proyecto, así que `config.json` existe en todos:
 *    sin separar por proyecto, marcar uno como texto cambiaría el
 *    comportamiento en los demás, y eso se vive como que la aplicación decide
 *    sola.
 * 2. Que `null` signifique «nunca se dijo» y no «como datos». Quien pregunta se
 *    queda con su comportamiento de siempre, y ninguna rama existente cambia.
 * 3. Que una preferencia corrupta no impida abrir nada.
 */
import {
    comoAbrir, recordarApertura, olvidarApertura, moverPreferencia, MODOS,
} from '../client/src/utils/preferenciaApertura.js';

let ok = 0, mal = 0;
const eq = (nombre, a, b) => {
    const pasa = JSON.stringify(a) === JSON.stringify(b);
    if (pasa) { ok++; } else { mal++; console.log(`  FALLA  ${nombre}\n    esperado: ${JSON.stringify(b)}\n    obtenido: ${JSON.stringify(a)}`); }
};

const LLAVE = 'amoxsql-apertura';
const caja = new Map();
globalThis.localStorage = {
    getItem: (k) => (caja.has(k) ? caja.get(k) : null),
    setItem: (k, v) => caja.set(k, String(v)),
    removeItem: (k) => caja.delete(k),
};
const crudo = () => JSON.parse(caja.get(LLAVE) || '{}');

const A = 'C:/proyectos/ventas';
const B = 'C:/proyectos/marketing';

// ── sin nada dicho ──────────────────────────────────────────────────────────
caja.clear();
eq('sin preferencia, null', comoAbrir(A, 'config.json'), null);
eq('null no es "datos"', comoAbrir(A, 'config.json') === 'datos', false);

// ── recordar y leer ─────────────────────────────────────────────────────────
recordarApertura(A, 'config.json', 'texto');
eq('se recuerda', comoAbrir(A, 'config.json'), 'texto');
eq('otro archivo del mismo proyecto sigue sin preferencia', comoAbrir(A, 'eventos.json'), null);

// **La que importa:** la misma ruta en otro proyecto no hereda nada.
eq('otro proyecto no hereda', comoAbrir(B, 'config.json'), null);
recordarApertura(B, 'config.json', 'datos');
eq('y cada uno guarda la suya', [comoAbrir(A, 'config.json'), comoAbrir(B, 'config.json')], ['texto', 'datos']);

// ── las barras ──────────────────────────────────────────────────────────────
// El explorador produce barras de un tipo y el arrastrar y soltar del otro; la
// preferencia tiene que ser la misma.
recordarApertura(A, 'conf\\ajustes.json', 'texto');
eq('se guarda con barras de Windows y se lee con las otras', comoAbrir(A, 'conf/ajustes.json'), 'texto');
eq('y al revés', comoAbrir('C:\\proyectos\\ventas', 'conf/ajustes.json'), 'texto');
recordarApertura(A, './raiz.json', 'texto');
eq('el "./" del principio no cuenta', comoAbrir(A, 'raiz.json'), 'texto');

// ── olvidar ─────────────────────────────────────────────────────────────────
// Consultar un archivo marcado como texto es una elección tan explícita como la
// anterior: manda la última.
olvidarApertura(A, 'config.json');
eq('olvidada', comoAbrir(A, 'config.json'), null);
eq('sin tocar la del otro proyecto', comoAbrir(B, 'config.json'), 'datos');
olvidarApertura(A, 'no-existia.json');
eq('olvidar algo que no estaba no revienta', comoAbrir(A, 'no-existia.json'), null);
olvidarApertura('proyecto-desconocido', 'x.json');
eq('ni en un proyecto que no está', comoAbrir('proyecto-desconocido', 'x.json'), null);

// El proyecto se retira del almacén cuando se queda sin nada: si no, cada
// proyecto abierto una vez dejaría un resto para siempre.
caja.clear();
recordarApertura(A, 'uno.json', 'texto');
olvidarApertura(A, 'uno.json');
eq('un proyecto vacío no se queda dentro', Object.keys(crudo()), []);

// ── modos que no existen ────────────────────────────────────────────────────
caja.clear();
recordarApertura(A, 'x.json', 'grafico');
eq('un modo desconocido no se guarda', comoAbrir(A, 'x.json'), null);
recordarApertura(A, 'y.json', 'texto');
recordarApertura(A, 'y.json', 'otra-cosa');
eq('y pisa a la que hubiera', comoAbrir(A, 'y.json'), null);
eq('los modos son dos', MODOS, ['texto', 'datos']);

// ── renombrar y mover ───────────────────────────────────────────────────────
caja.clear();
recordarApertura(A, 'config.json', 'texto');
moverPreferencia(A, 'config.json', 'conf/config.json');
eq('la preferencia viaja con el archivo', comoAbrir(A, 'conf/config.json'), 'texto');
eq('y no se queda en la ruta vieja', comoAbrir(A, 'config.json'), null);
moverPreferencia(A, 'sin-preferencia.json', 'otro.json');
eq('mover algo sin preferencia no inventa una', comoAbrir(A, 'otro.json'), null);

// ── lo que puede llegar roto ────────────────────────────────────────────────
// Ninguno debe lanzar.
caja.set(LLAVE, '{no es json');
eq('JSON roto', comoAbrir(A, 'config.json'), null);
caja.set(LLAVE, '[1,2,3]');
eq('una lista donde iba un objeto', comoAbrir(A, 'config.json'), null);
caja.set(LLAVE, 'null');
eq('un null', comoAbrir(A, 'config.json'), null);
caja.set(LLAVE, JSON.stringify({ [A]: 'no soy un objeto' }));
eq('un proyecto que no es objeto', comoAbrir(A, 'config.json'), null);
caja.set(LLAVE, JSON.stringify({ [A]: { 'config.json': 12 } }));
eq('un modo que no es cadena', comoAbrir(A, 'config.json'), null);

// Y sin almacenamiento: pasa en modo privado.
const guardado = globalThis.localStorage;
delete globalThis.localStorage;
eq('sin almacenamiento se lee null', comoAbrir(A, 'config.json'), null);
recordarApertura(A, 'config.json', 'texto'); ok++; // no lanzar ya es el resultado
olvidarApertura(A, 'config.json'); ok++;
globalThis.localStorage = guardado;

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
