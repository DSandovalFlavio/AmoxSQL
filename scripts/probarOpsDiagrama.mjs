/**
 * Ejercita `diagram/diagramOps.js` — lo que hace cada gesto del editor.
 *
 *     node scripts/probarOpsDiagrama.mjs
 *
 * Las operaciones son puras a propósito, y esto es lo que se gana: borrar una
 * caja y comprobar que **no deja flechas colgando** se contesta aquí en un
 * milisegundo, en vez de descubrirlo al guardar un diagrama que ya no se abre.
 *
 * La otra mitad es la **inmutabilidad**. El historial guarda el texto de cada
 * paso; si una operación mutara el grafo que recibe, deshacer devolvería un
 * estado que ya venía modificado, y el fallo aparecería tres acciones más
 * tarde, lejos de su causa.
 */
import {
    anadirNodo, encadenarNodo, borrarNodo, duplicarNodo, renombrarNodo, cambiarForma,
    conectar, desconectar, etiquetarArista, estiloArista, cambiarDireccion,
    buscarNodos, idsUsados,
} from '../client/src/components/diagram/diagramOps.js';
import { parsearFlujo, flujoAMermaid, grupoDe } from '../client/src/components/markdown/mermaidFlow.js';

let ok = 0, mal = 0;
const eq = (nombre, a, b) => {
    const pasa = JSON.stringify(a) === JSON.stringify(b);
    if (pasa) { ok++; } else { mal++; console.log(`  FALLA  ${nombre}\n    esperado: ${JSON.stringify(b)}\n    obtenido: ${JSON.stringify(a)}`); }
};

const base = () => parsearFlujo([
    'flowchart LR',
    '  subgraph G1["Origen"]',
    '    erp[("Ventas ERP")]',
    '    web[("Eventos web")]',
    '  end',
    '  erp --> land["Aterrizaje"]',
    '  web -.-> land',
    '  land --> qa{"¿Calidad?"}',
    '  classDef origen fill:#1b3a52',
    '  class erp,web origen',
].join('\n'));

/** Ninguna operación puede tocar el grafo que recibe. */
function inmutable(nombre, op) {
    const g = base();
    const antes = JSON.stringify(g);
    op(g);
    eq(`no muta la entrada · ${nombre}`, JSON.stringify(g), antes);
}

// ── añadir ──────────────────────────────────────────────────────────────────
const a1 = anadirNodo(base(), { texto: 'Refinado' });
eq('añade una caja', a1.grafo.nodos.length, 5);
eq('con id legible', a1.id, 'refinado');
eq('y lo devuelve para poder seleccionarla', a1.grafo.nodos.at(-1).id, a1.id);
eq('con la forma por defecto', a1.grafo.nodos.at(-1).forma, 'proceso');
eq('sin flechas', a1.grafo.aristas.length, 3);
eq('con forma elegida', anadirNodo(base(), { texto: 'Lago', forma: 'almacen' }).grafo.nodos.at(-1).forma, 'almacen');
eq('dentro de un grupo si se pide', grupoDe(anadirNodo(base(), { texto: 'X', grupo: 'G1' }).grafo, 'x')?.id, 'G1');
eq('en un grupo que no existe, sin grupo', grupoDe(anadirNodo(base(), { texto: 'X', grupo: 'NO' }).grafo, 'x'), null);
// El identificador no puede chocar con uno existente NI con el de un subgrafo:
// en mermaid comparten espacio de nombres.
eq('no repite un id de caja', anadirNodo(base(), { texto: 'Ventas ERP' }).id !== 'erp', true);
eq('ni el de un subgrafo', anadirNodo(base(), { texto: 'G1' }).id, 'g1');
eq('ids usados incluye los subgrafos', idsUsados(base()).has('G1'), true);
inmutable('anadirNodo', (g) => anadirNodo(g, { texto: 'X' }));

// ── encadenar ───────────────────────────────────────────────────────────────
const e1 = encadenarNodo(base(), 'qa', { texto: 'Refinado' });
eq('encadena creando la flecha', e1.grafo.aristas.at(-1), { desde: 'qa', hasta: 'refinado', etiqueta: '', estilo: 'lotes' });
eq('y la caja', e1.grafo.nodos.at(-1).texto, 'Refinado');
// Hereda el grupo: encadenar dentro de una zona no debería sacarte de ella.
eq('hereda el grupo del que viene', grupoDe(encadenarNodo(base(), 'erp', { texto: 'Bruto' }).grafo, 'bruto')?.id, 'G1');
eq('desde una caja que no existe, nada', encadenarNodo(base(), 'fantasma', {}).id, null);
inmutable('encadenarNodo', (g) => encadenarNodo(g, 'qa', {}));

// ── borrar ──────────────────────────────────────────────────────────────────
const b1 = borrarNodo(base(), 'land');
eq('quita la caja', b1.nodos.some((n) => n.id === 'land'), false);
// **Lo que de verdad se vigila aquí.** `land` tenía tres flechas; dejarlas
// haría un archivo que mermaid ya no dibuja.
eq('y TODAS sus flechas', b1.aristas.length, 0);
eq('borrar una caja de un grupo la saca del grupo', borrarNodo(base(), 'erp').subgrafos[0].nodos, ['web']);
eq('borrar algo que no existe no rompe', borrarNodo(base(), 'fantasma').nodos.length, 4);
// Las líneas conservadas NO se tocan aunque nombren a la caja borrada: son del
// autor, y adivinar qué quiso decir es peor que dejarlas.
eq('las líneas conservadas siguen intactas', borrarNodo(base(), 'erp').conservado.length, 2);
inmutable('borrarNodo', (g) => borrarNodo(g, 'land'));

// ── duplicar ────────────────────────────────────────────────────────────────
const d1 = duplicarNodo(base(), 'erp');
eq('duplica', d1.grafo.nodos.length, 5);
eq('con el mismo texto', d1.grafo.nodos.find((n) => n.id === d1.id).texto, 'Ventas ERP');
eq('y la misma forma', d1.grafo.nodos.find((n) => n.id === d1.id).forma, 'almacen');
// Al lado, no al final: quien duplica la tercera de cinco fuentes parecidas
// espera encontrarla ahí mismo.
eq('la copia va JUNTO a la original', d1.grafo.nodos.map((n) => n.id).slice(0, 3), ['erp', d1.id, 'web']);
eq('y en el mismo grupo, junto a ella', d1.grafo.subgrafos[0].nodos, ['erp', d1.id, 'web']);
eq('sin heredar las flechas', d1.grafo.aristas.length, 3);
eq('duplicar lo que no existe', duplicarNodo(base(), 'fantasma').id, null);
inmutable('duplicarNodo', (g) => duplicarNodo(g, 'erp'));

// ── renombrar y forma ───────────────────────────────────────────────────────
eq('renombra', renombrarNodo(base(), 'land', 'Zona de aterrizaje').nodos.find((n) => n.id === 'land').texto, 'Zona de aterrizaje');
// El ID NO cambia con el texto: las líneas conservadas nombran las cajas por
// id, y renombrarlo las dejaría apuntando a algo que ya no existe.
eq('pero NO el identificador', renombrarNodo(base(), 'erp', 'Otra cosa').nodos[0].id, 'erp');
eq('y la línea conservada sigue valiendo',
    renombrarNodo(base(), 'erp', 'Otra cosa').conservado.includes('class erp,web origen'), true);
eq('cambia la forma', cambiarForma(base(), 'land', 'decision').nodos.find((n) => n.id === 'land').forma, 'decision');

// La excepción: la caja recién creada, que todavía arrastra el id del marcador
// de posición. Sin esto el archivo acaba con `sin_nombre[("Almacén")]`.
const recien = anadirNodo(base(), {}).grafo;
const bautizada = renombrarNodo(recien, 'sin_nombre', 'Almacén', { tambienId: true });
eq('al bautizarla, el id la sigue', bautizada.nodos.at(-1).id, 'almacen');
eq('y el texto', bautizada.nodos.at(-1).texto, 'Almacén');
const conFlecha = conectar(recien, 'qa', 'sin_nombre');
const b2 = renombrarNodo(conFlecha, 'sin_nombre', 'Almacén', { tambienId: true });
eq('las flechas la siguen', b2.aristas.at(-1).hasta, 'almacen');
const enGrupo = anadirNodo(base(), { grupo: 'G1' }).grafo;
eq('y el grupo también',
    renombrarNodo(enGrupo, 'sin_nombre', 'Almacén', { tambienId: true }).subgrafos[0].nodos.includes('almacen'), true);
// El cinturón de seguridad: si una línea conservada la nombra, no se toca.
eq('si una línea conservada la nombra, el id NO cambia',
    renombrarNodo(base(), 'erp', 'Otra cosa', { tambienId: true }).nodos[0].id, 'erp');
eq('pero el texto sí',
    renombrarNodo(base(), 'erp', 'Otra cosa', { tambienId: true }).nodos[0].texto, 'Otra cosa');
eq('y sin pedirlo, nunca cambia', renombrarNodo(recien, 'sin_nombre', 'Almacén').nodos.at(-1).id, 'sin_nombre');
inmutable('renombrarNodo con id', (x) => renombrarNodo(x, 'land', 'X', { tambienId: true }));
inmutable('renombrarNodo', (g) => renombrarNodo(g, 'land', 'X'));

// ── conectar ────────────────────────────────────────────────────────────────
eq('conecta', conectar(base(), 'qa', 'erp').aristas.length, 4);
eq('con el estilo pedido', conectar(base(), 'qa', 'erp', 'continuo').aristas.at(-1).estilo, 'continuo');
eq('una caja consigo misma, no', conectar(base(), 'qa', 'qa').aristas.length, 3);
eq('una caja que no existe, no', conectar(base(), 'qa', 'fantasma').aristas.length, 3);
// Repetir la misma flecha dibujaría dos encima y parecería una más gruesa: un
// cambio invisible es imposible de deshacer a ojo.
eq('la misma flecha dos veces, no', conectar(base(), 'erp', 'land').aristas.length, 3);
// Pero dos flechas DISTINTAS entre las mismas cajas sí: una de ida por lotes y
// otra continua es un diagrama legítimo.
eq('con otro estilo sí', conectar(base(), 'erp', 'land', 'continuo').aristas.length, 4);
inmutable('conectar', (g) => conectar(g, 'qa', 'erp'));

// ── flechas ─────────────────────────────────────────────────────────────────
eq('desconecta por posición', desconectar(base(), 1).aristas.map((a) => [a.desde, a.hasta]), [['erp', 'land'], ['land', 'qa']]);
eq('etiqueta', etiquetarArista(base(), 0, 'diario').aristas[0].etiqueta, 'diario');
eq('cambia el estilo', estiloArista(base(), 0, 'principal').aristas[0].estilo, 'principal');
eq('una posición que no existe no rompe', etiquetarArista(base(), 99, 'x').aristas.length, 3);
inmutable('desconectar', (g) => desconectar(g, 0));

// ── dirección ───────────────────────────────────────────────────────────────
eq('cambia la dirección', cambiarDireccion(base(), 'TB').direccion, 'TB');
eq('y sobrevive al guardado', flujoAMermaid(cambiarDireccion(base(), 'TB')).startsWith('flowchart TB'), true);

// ── buscar ──────────────────────────────────────────────────────────────────
eq('busca por texto', buscarNodos(base(), 'ventas').map((n) => n.id), ['erp']);
eq('sin acentos', buscarNodos(base(), 'calidad').map((n) => n.id), ['qa']);
eq('sin mayúsculas', buscarNodos(base(), 'ATERRIZAJE').map((n) => n.id), ['land']);
eq('también por identificador', buscarNodos(base(), 'web').map((n) => n.id), ['web']);
eq('sin consulta, todas', buscarNodos(base(), '').length, 4);
eq('sin resultados', buscarNodos(base(), 'zzz'), []);
eq('sin grafo', buscarNodos(null, 'x'), []);

// ── el ida y vuelta después de editar ───────────────────────────────────────
// Una cadena de gestos como los que hace alguien de verdad, y al final el
// archivo tiene que seguir abriéndose.
let g = base();
g = anadirNodo(g, { texto: 'Refinado' }).grafo;
g = conectar(g, 'qa', 'refinado');
g = etiquetarArista(g, g.aristas.length - 1, 'pasa');
g = encadenarNodo(g, 'refinado', { texto: 'Almacén', forma: 'almacen' }).grafo;
g = cambiarForma(g, 'land', 'entrada');
g = borrarNodo(g, 'web');
g = cambiarDireccion(g, 'TB');

const texto = flujoAMermaid(g);
const releido = parsearFlujo(texto);
eq('después de siete gestos, el archivo se sigue abriendo', releido !== null, true);
eq('y da el mismo grafo', releido, g);
eq('con las cajas que tocan', releido.nodos.map((n) => n.id), ['erp', 'land', 'qa', 'refinado', 'almacen']);
eq('el grupo se quedó con una', releido.subgrafos[0].nodos, ['erp']);
eq('y las líneas conservadas siguen ahí', releido.conservado.length, 2);

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
