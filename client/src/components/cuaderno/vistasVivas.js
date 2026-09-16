/**
 * Lo que el cuaderno declara, cruzado con lo que el motor tiene vivo.
 *
 * ## Por qué hace falta cruzarlo
 *
 * Son dos verdades distintas y hasta ahora nadie las comparaba. El documento
 * dice qué celdas hay; **el motor dice qué se puede consultar**. Al reabrir un
 * cuaderno al día siguiente el documento está intacto y la sesión está vacía, y
 * la única forma de enterarse era ejecutar la celda de en medio y verla fallar
 * con un «no existe» sobre una vista que el documento enseña con toda
 * naturalidad.
 *
 * ## Por qué también salen las que no son del cuaderno
 *
 * Porque la sesión es una sola. Una vista creada desde un `.sql` o desde otro
 * cuaderno se puede consultar desde aquí igual de bien, y no enseñarla haría
 * creer que el cuaderno es un mundo cerrado — que es justo lo que no es.
 */

/** El nombre con el que se comparan dos objetos: el motor no distingue mayúsculas. */
const llave = (n) => String(n || '').trim().toLowerCase();

/**
 * @param {Array} celdas las celdas del documento
 * @param {Array} vivas lo que devolvió `/api/cuaderno/vistas`
 * @returns {{propias: Array, ajenas: Array, faltan: number, vivasPropias: number}}
 *   `propias` son las celdas con nombre, cada una con `viva`; `ajenas`, lo vivo
 *   que no sale de este cuaderno.
 */
export function cruzarVistas(celdas, vivas) {
    const porNombre = new Map();
    for (const v of vivas || []) {
        const k = llave(v.nombre);
        if (k) porNombre.set(k, v);
    }

    const propias = [];
    const declaradas = new Set();
    for (const c of celdas || []) {
        if (c.tipo !== 'sql') continue;
        const nombre = String(c.nombre || '').trim();
        if (!nombre) continue;
        const k = llave(nombre);
        // Dos celdas con el mismo nombre: la segunda pisa a la primera al
        // ejecutarse. Se lista una sola vez para no prometer dos vistas donde
        // sólo va a haber una.
        if (declaradas.has(k)) continue;
        declaradas.add(k);

        const v = porNombre.get(k);
        propias.push({
            nombre,
            celda: c.id,
            viva: !!v,
            // El tipo lo manda el MOTOR cuando existe, y el documento sólo
            // mientras no exista: si alguien cambió el interruptor después de
            // ejecutar, lo que hay puesto sigue siendo lo de antes.
            tipo: v ? v.tipo : (c.materializada ? 'tabla' : 'vista'),
            descripcion: v ? v.descripcion || '' : '',
        });
    }

    const ajenas = (vivas || [])
        .filter((v) => !declaradas.has(llave(v.nombre)))
        .map((v) => ({
            nombre: v.nombre,
            viva: true,
            tipo: v.tipo || 'vista',
            descripcion: v.descripcion || '',
        }));

    return {
        propias,
        ajenas,
        faltan: propias.filter((p) => !p.viva).length,
        vivasPropias: propias.filter((p) => p.viva).length,
    };
}

/**
 * Los parámetros que el cuaderno usa de verdad, en el orden en que aparecen.
 *
 * Se leen del texto y no sólo de la cabecera porque las dos listas se separan
 * solas: alguien escribe `{{desde}}` en una celda y aún no lo ha declarado, o
 * declaró uno y luego quitó la celda que lo usaba. Saber cuál es cuál es la
 * diferencia entre una zona de parámetros útil y una lista de cosas muertas.
 *
 * ## La sintaxis es `{{nombre}}`, y no se elige aquí
 *
 * Ya la usan los cuadernos que existen y los tableros de Report Flow, con la
 * misma función de sustitución (`injectEnvironmentVariables`). Estrenar aquí la
 * otra convención del producto —la del editor de consultas— habría roto en
 * silencio cada archivo guardado: el marcador se quedaría sin sustituir y la
 * consulta se ejecutaría con él dentro.
 *
 * Que el producto arrastre dos convenciones es un lío heredado, pero el cuaderno
 * no es quien puede resolverlo por su cuenta.
 */
export function parametrosUsados(celdas) {
    const vistos = [];
    const puestos = new Set();
    for (const c of celdas || []) {
        if (c.tipo !== 'sql') continue;
        // Con espacios opcionales dentro, como acepta el sustituidor compartido.
        const re = /\{\{\s*([A-Za-z_][\w-]*)\s*\}\}/g;
        let m;
        while ((m = re.exec(String(c.contenido || ''))) !== null) {
            if (puestos.has(m[1])) continue;
            puestos.add(m[1]);
            vistos.push(m[1]);
        }
    }
    return vistos;
}

/**
 * Sustituye los `{{nombre}}` por su valor.
 *
 * Es la función que ya usaban los cuadernos y los tableros, sin envolver ni
 * adornar: un texto entra entrecomillado y un número entra tal cual. Comprobado
 * contra el motor, eso basta para lo normal —`LIMIT '2'`, `x > '5'` y
 * `fecha >= '2026-09-01'` funcionan— y sólo se queda corto cuando el parámetro
 * nombra una tabla, que es una limitación heredada y compartida.
 */
export { injectEnvironmentVariables as sustituirParametros } from '../../utils/injectEnvironmentVariables.js';
