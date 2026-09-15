/**
 * Ejercita `diagram/diagramShapes.js` — la paleta que crece.
 *
 *     node scripts/probarFormasDiagrama.mjs
 *
 * **Sólo la mitad que se puede ejercitar desde Node.** `siluetaDeMermaid` le
 * pregunta a mermaid cómo dibuja una forma y necesita un `getBBox` de verdad:
 * eso se comprueba con la aplicación delante, no aquí.
 *
 * Lo que sí se vigila aquí es lo que puede romper en silencio:
 *
 * 1. **Que una paleta corrupta no impida abrir un diagrama.** Es almacenamiento
 *    del navegador, editable a mano y compartido con otras pestañas: puede
 *    llegar con basura. Que eso lance una excepción significaría que alguien se
 *    queda sin poder abrir su archivo por una lista de formas.
 * 2. **Que la máscara salga bien escapada.** Una silueta viaja dentro de un
 *    `url(data:…)`, y un `#` o unas comillas sin escapar cortan la URL por la
 *    mitad — con el resultado de una caja invisible y ningún error.
 */
import {
    leerBiblioteca, conocida, olvidarForma, aprenderForma, mascaraDeSilueta,
} from '../client/src/components/diagram/diagramShapes.js';

let ok = 0, mal = 0;
const eq = (nombre, a, b) => {
    const pasa = JSON.stringify(a) === JSON.stringify(b);
    if (pasa) { ok++; } else { mal++; console.log(`  FALLA  ${nombre}\n    esperado: ${JSON.stringify(b)}\n    obtenido: ${JSON.stringify(a)}`); }
};
const si = (nombre, v) => eq(nombre, !!v, true);
const no = (nombre, v) => eq(nombre, !!v, false);

// El almacenamiento del navegador, lo justo para lo que este módulo usa.
const LLAVE = 'amoxsql-diagram-formas';
const caja = new Map();
globalThis.localStorage = {
    getItem: (k) => (caja.has(k) ? caja.get(k) : null),
    setItem: (k, v) => caja.set(k, String(v)),
    removeItem: (k) => caja.delete(k),
};
const poner = (v) => caja.set(LLAVE, typeof v === 'string' ? v : JSON.stringify(v));

// ── una paleta que no se ha usado nunca ─────────────────────────────────────
caja.clear();
eq('sin nada guardado, la paleta está vacía', leerBiblioteca(), []);
no('y nada es conocido', conocida('doc'));

// ── una paleta normal ───────────────────────────────────────────────────────
poner([{ nombre: 'doc', silueta: '<svg/>' }, { nombre: 'cyl', silueta: '<svg/>' }]);
eq('se leen las dos', leerBiblioteca().map((f) => f.nombre), ['doc', 'cyl']);
si('y se reconocen', conocida('cyl'));
no('sin confundir con una que no está', conocida('hourglass'));
no('ni con una a medio escribir', conocida('cy'));

// ── el orden es el de aprendizaje, y se respeta ─────────────────────────────
// La paleta se dibuja en este orden: reordenarla movería botones bajo el dedo
// de quien ya tiene memoria muscular.
poner([{ nombre: 'a', silueta: '<svg/>' }, { nombre: 'b', silueta: '<svg/>' }, { nombre: 'c', silueta: '<svg/>' }]);
olvidarForma('b');
eq('olvidar una no descoloca al resto', leerBiblioteca().map((f) => f.nombre), ['a', 'c']);
olvidarForma('no-estaba');
eq('olvidar una que no está no toca nada', leerBiblioteca().map((f) => f.nombre), ['a', 'c']);

// ── lo que puede llegar roto ────────────────────────────────────────────────
// Ninguno de estos debe lanzar: una paleta rota no es motivo para no abrir un
// diagrama.
poner('{esto no es json');
eq('un JSON roto se lee como paleta vacía', leerBiblioteca(), []);
poner('"una cadena suelta"');
eq('algo que no es lista, tampoco', leerBiblioteca(), []);
poner('null');
eq('un null, tampoco', leerBiblioteca(), []);
poner([{ nombre: 'buena', silueta: '<svg/>' }, null, { silueta: '<svg/>' }, { nombre: '' }, 7]);
eq('las entradas sin nombre se descartan y la buena sobrevive', leerBiblioteca().map((f) => f.nombre), ['buena']);
no('y una entrada rota no se da por conocida', conocida(''));

// Sin `localStorage` ninguna de las dos debe reventar: pasa en modo privado y
// en cualquier entorno que no sea un navegador.
const guardado = globalThis.localStorage;
delete globalThis.localStorage;
eq('sin almacenamiento, paleta vacía y sin excepción', leerBiblioteca(), []);
olvidarForma('doc'); ok++; // no lanzar ya es el resultado
globalThis.localStorage = guardado;

// ── aprender ────────────────────────────────────────────────────────────────
// Lo que se puede comprobar sin mermaid: que un nombre vacío ni siquiera lo
// intente. Si preguntara, un botón sin nombre acabaría en la paleta.
caja.clear();
eq('un nombre vacío no se aprende', await aprenderForma(''), null);
eq('ni uno que sólo son espacios', await aprenderForma('   '), null);
eq('y la paleta sigue vacía', leerBiblioteca(), []);

// ── la máscara ──────────────────────────────────────────────────────────────
eq('sin silueta no hay máscara', mascaraDeSilueta(null), null);
eq('ni con cadena vacía', mascaraDeSilueta(''), null);

const m = mascaraDeSilueta('<svg viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>');
si('la máscara lleva su variante con prefijo', m.WebkitMaskImage);
eq('las dos son la misma URL', m.maskImage, m.WebkitMaskImage);
eq('estira hasta donde se le ponga', m.maskSize, '100% 100%');
eq('y no se repite', m.maskRepeat, 'no-repeat');
// El color lo pone el CSS de quien la pinta: es la razón de usarla como
// máscara y no como fondo — `currentColor` no se resuelve dentro de un `data:`.
eq('el color viene de quien la pinta', m.backgroundColor, 'currentColor');

// Lo que cortaría la URL por la mitad.
const sucia = mascaraDeSilueta('<svg fill="#fff"><path d="M0 0h1v1z"/></svg>').maskImage;
no('el # va escapado', sucia.includes('#'));
eq('las comillas también', sucia.match(/"/g).length, 2); // sólo las del url("…")
si('y sigue siendo una URL de datos', sucia.startsWith('url("data:image/svg+xml;charset=utf-8,'));
eq('lo que va dentro se recupera entero',
    decodeURIComponent(sucia.slice('url("data:image/svg+xml;charset=utf-8,'.length, -2)),
    '<svg fill="#fff"><path d="M0 0h1v1z"/></svg>');

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
