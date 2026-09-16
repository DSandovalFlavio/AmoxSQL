/**
 * Pruebas de `client/src/components/cuaderno/claves.js`.
 *
 * Lo que se comprueba aquí no es una función, es una promesa: **que el gráfico
 * que alguien configuró siga en su celda mañana**. Se rompe de cuatro maneras
 * —renombrando, moviendo, añadiendo y borrando— y las cuatro son silenciosas:
 * no hay excepción, no hay aviso, sólo una figura convertida en tabla.
 *
 *   node scripts/probarClavesCuaderno.mjs
 */
import { claveDeCelda, reclavar } from '../client/src/components/cuaderno/claves.js';

let bien = 0;
let mal = 0;

/**
 * Serializa con las claves ordenadas.
 *
 * Reclavar borra y repone entradas, así que el orden de inserción cambia sin
 * que cambie el contenido. Comparar con `JSON.stringify` a secas convierte eso
 * en una falla y esconde las de verdad.
 */
function estable(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(estable).join(',')}]`;
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${estable(v[k])}`).join(',')}}`;
}

function comprobar(titulo, real, esperado) {
    const a = estable(real);
    const b = estable(esperado);
    if (a === b) { bien++; return; }
    mal++;
    console.error(`FALLA  ${titulo}\n  esperado ${b}\n  real     ${a}`);
}

const G = { vista: 'chart', grafico: { tipo: 'barra' } };
const T = { vista: 'table' };

// ── la clave ────────────────────────────────────────────────────────────────
comprobar('con nombre, la clave es el nombre', claveDeCelda({ nombre: 'ventas' }, 3), 'n:ventas');
comprobar('sin nombre, la posición', claveDeCelda({}, 3), 'p:3');
comprobar('el nombre se recorta', claveDeCelda({ nombre: '  ventas  ' }, 0), 'n:ventas');
comprobar('nombre en blanco no es nombre', claveDeCelda({ nombre: '   ' }, 2), 'p:2');
comprobar('una celda que no existe no revienta', claveDeCelda(null, 1), 'p:1');

// ── renombrar ───────────────────────────────────────────────────────────────
{
    const antes = [{ id: 'a' }, { id: 'b' }];
    const despues = [{ id: 'a', nombre: 'ventas' }, { id: 'b' }];
    comprobar(
        'renombrar muda el estado a la clave nueva',
        reclavar(antes, despues, { 'p:0': G, 'p:1': T }),
        { 'p:1': T, 'n:ventas': G },
    );
}
{
    const antes = [{ id: 'a', nombre: 'ventas' }];
    const despues = [{ id: 'a', nombre: '' }];
    comprobar(
        'quitar el nombre devuelve el estado a la posición',
        reclavar(antes, despues, { 'n:ventas': G }),
        { 'p:0': G },
    );
}

// ── mover ───────────────────────────────────────────────────────────────────
{
    // El fallo de la notebook vieja: sin reclavar, la celda que sube se lleva
    // el gráfico de la que baja.
    const antes = [{ id: 'a' }, { id: 'b' }];
    const despues = [{ id: 'b' }, { id: 'a' }];
    comprobar(
        'mover intercambia los estados con las celdas',
        reclavar(antes, despues, { 'p:0': G, 'p:1': T }),
        { 'p:0': T, 'p:1': G },
    );
}
{
    // Con nombre no hace falta mover nada: la clave viaja con la celda.
    const antes = [{ id: 'a', nombre: 'uno' }, { id: 'b', nombre: 'dos' }];
    const despues = [{ id: 'b', nombre: 'dos' }, { id: 'a', nombre: 'uno' }];
    const estados = { 'n:uno': G, 'n:dos': T };
    comprobar('con nombres, reordenar no toca el mapa', reclavar(antes, despues, estados), estados);
    comprobar(
        'y se devuelve el MISMO objeto, para no re-guardar de balde',
        reclavar(antes, despues, estados) === estados,
        true,
    );
}

// ── añadir ──────────────────────────────────────────────────────────────────
{
    // Insertar en medio corre hacia abajo a todas las que no tienen nombre.
    const antes = [{ id: 'a' }, { id: 'b' }];
    const despues = [{ id: 'a' }, { id: 'c' }, { id: 'b' }];
    comprobar(
        'insertar en medio empuja el estado de las de abajo',
        reclavar(antes, despues, { 'p:0': G, 'p:1': T }),
        { 'p:0': G, 'p:2': T },
    );
}
{
    const antes = [{ id: 'a' }];
    const despues = [{ id: 'a' }, { id: 'b' }];
    comprobar(
        'la celda nueva no hereda estado de nadie',
        reclavar(antes, despues, { 'p:0': G }),
        { 'p:0': G },
    );
}

// ── borrar ──────────────────────────────────────────────────────────────────
{
    const antes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const despues = [{ id: 'a' }, { id: 'c' }];
    comprobar(
        'borrar en medio sube el estado de las de abajo, sin arrastrar el de la borrada',
        reclavar(antes, despues, { 'p:0': G, 'p:1': T, 'p:2': G }),
        { 'p:0': G, 'p:1': G },
    );
}
{
    const antes = [{ id: 'a', nombre: 'ventas' }, { id: 'b' }];
    const despues = [{ id: 'b' }];
    comprobar(
        'el estado de una celda borrada se descarta',
        reclavar(antes, despues, { 'n:ventas': G, 'p:1': T }),
        { 'p:0': T },
    );
}

// ── lo que no es de nadie se respeta ────────────────────────────────────────
{
    // Un cuaderno puede tener en su `.state.json` claves de celdas que aún no
    // se han leído o que vienen del formato viejo: no se tocan.
    const antes = [{ id: 'a' }];
    const despues = [{ id: 'a' }, { id: 'b' }];
    comprobar(
        'las claves ajenas sobreviven',
        reclavar(antes, despues, { 'p:0': G, 'n:otra_cosa': T }),
        { 'p:0': G, 'n:otra_cosa': T },
    );
}

// ── bordes ──────────────────────────────────────────────────────────────────
comprobar('sin celdas no pasa nada', reclavar([], [], {}), {});
comprobar('vaciar el cuaderno vacía el mapa', reclavar([{ id: 'a' }], [], { 'p:0': G }), {});
comprobar('sin estado previo, sale vacío', reclavar([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }], {}), {});

console.log(`\n${bien} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
