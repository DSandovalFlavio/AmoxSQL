/**
 * El grafo del Canvas (5.15, Dec-55 y Dec-57): qué tarjeta lee a cuál.
 *
 * **Las flechas no se dibujan, se deducen.** Cada tarjeta de datos (Source,
 * Query) deja una vista con su nombre —su `id`— y la de abajo la lee por ese
 * nombre; la conexión sale de lo que lee su SQL, con el mismo análisis que el
 * cuaderno (`celdaSql.js`) y el mismo grafo (`cuaderno/grafo.js`). Así no puede
 * haber una flecha que diga algo distinto de lo que hace la consulta. Un Chart o
 * un Number apunta a la tarjeta que enseña (`desde`).
 *
 * Puro: sin React ni red. Lo prueba `scripts/probarLienzo.mjs`.
 */
import { analizarCelda, enmascarar } from '../../utils/celdaSql.js';
import { construirGrafo, ordenTopologico, celdasEnCiclo } from '../cuaderno/grafo.js';
import { citarIdentificador, citarTexto, problemaDeNombre, nombrePorOmision } from '../../utils/vistaDeCelda.js';
import { DEJAN_VISTA, claveDeEtiqueta } from '../../utils/lienzoFile.js';

const llave = (n) => String(n || '').trim().toLowerCase();

/**
 * El SQL que deja la vista de una tarjeta de datos. Una Query, el suyo; una
 * Source, la lectura de lo que nombra: una fuente con nombre, una tabla (de la
 * base o de otro proyecto mirado en sólo lectura, 5.14) o un archivo.
 */
export function sqlDeTarjeta(t) {
    if (!t) return '';
    if (t.tipo === 'query') return String(t.sql || '');
    if (t.tipo !== 'source') return '';
    const o = t.origen || {};
    if (o.tipo === 'fuente' && o.nombre) return `SELECT * FROM fuentes.${citarIdentificador(o.nombre)}`;
    if (o.tipo === 'tabla' && o.nombre) {
        const partes = String(o.nombre).split('.').map(p => p.replace(/^"(.*)"$/, '$1'));
        return `SELECT * FROM ${partes.map(citarIdentificador).join('.')}`;
    }
    if (o.tipo === 'archivo' && o.ruta) return `SELECT * FROM ${citarTexto(o.ruta)}`;
    return String(t.sql || '');
}

/** Las tarjetas de datos, en la forma de celdas que entiende el grafo del cuaderno. */
function comoCeldas(tarjetas) {
    return (tarjetas || []).filter(t => DEJAN_VISTA.has(t.tipo)).map(t => ({ id: t.id, tipo: 'sql', nombre: t.id }));
}

/** El análisis de cada tarjeta de datos (`id → analizarCelda`). */
export function analizarLienzo(lienzo) {
    const fuera = {};
    for (const t of lienzo?.tarjetas || []) {
        if (DEJAN_VISTA.has(t.tipo)) fuera[t.id] = analizarCelda(sqlDeTarjeta(t));
    }
    return fuera;
}

/**
 * El grafo de las tarjetas de datos (padres, hijos), el del cuaderno tal cual.
 * Un Chart o un Number no deja vista: su flecha va aparte (`aristas`).
 */
export function grafoDeLienzo(lienzo, analisis = analizarLienzo(lienzo)) {
    return construirGrafo(comoCeldas(lienzo?.tarjetas), analisis);
}

// ── Las etiquetas (Dec-57) ───────────────────────────────────────────────────

const CORTA = 34;
const corta = (s) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length > CORTA ? `${t.slice(0, CORTA - 1)}…` : t;
};

/** Un nombre en el SQL, con o sin comillas, como expresión regular. */
const patronDeNombre = (nombre) => {
    const e = String(nombre).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return `(?:"${e}"|${e})`;
};

/**
 * Lo que hay entre una palabra clave y la siguiente de su nivel. Se busca en el
 * texto enmascarado (sin cadenas ni comentarios, misma longitud) y se recorta
 * del original, para que la etiqueta enseñe los literales tal cual.
 */
function clausula(original, mascara, clave, hasta) {
    const re = new RegExp(`\\b${clave}\\b`, 'i');
    const m = re.exec(mascara);
    if (!m) return null;
    const desde = m.index + m[0].length;
    const resto = mascara.slice(desde);
    const fin = new RegExp(`\\b(${hasta})\\b|;`, 'i').exec(resto);
    return original.slice(desde, desde + (fin ? fin.index : resto.length)).trim();
}

/**
 * La etiqueta de la conexión de `padre` a la consulta `sql`: qué transformación
 * hay entre las dos. `null` si no hay nada que decir (un `SELECT *` sin más).
 */
export function etiquetaDeducida(sql, padre) {
    const original = String(sql || '');
    const mascara = enmascarar(original);
    const nombre = patronDeNombre(padre);
    // Unido por JOIN: lo que aporta es «+ padre».
    if (new RegExp(`\\bJOIN\\s+${nombre}(?![\\w$])`, 'i').test(mascara.replace(/\s+/g, ' ')) || new RegExp(`\\bJOIN\\s+${nombre}(?![\\w$])`, 'i').test(original)) {
        return `+ ${padre}`;
    }
    // Una UNION en la que el padre no es la primera lectura: «+ rows of padre».
    if (/\bUNION\b/i.test(mascara)) {
        const primero = /\bFROM\s+("[^"]+"|[\w$.]+)/i.exec(original);
        if (primero && llave(primero[1].replace(/"/g, '')) !== llave(padre)) return `+ rows of ${padre}`;
    }
    const grupo = clausula(original, mascara, 'GROUP\\s+BY', 'HAVING|ORDER|LIMIT|QUALIFY|WINDOW|UNION');
    if (grupo) return /^all$/i.test(grupo) ? 'grouped' : corta(`by ${grupo}`);
    const donde = clausula(original, mascara, 'WHERE', 'GROUP|ORDER|LIMIT|HAVING|QUALIFY|WINDOW|UNION');
    if (donde) return corta(`where ${donde}`);
    return null;
}

/**
 * Las conexiones del lienzo: `{ de, a, etiqueta, aMano }`. Las de datos salen de
 * lo que lee cada consulta; las de un Chart o un Number, de su `desde`. Una
 * etiqueta escrita a mano (`etiquetas["de→a"]`) gana a la deducida.
 */
export function aristas(lienzo, analisis = analizarLienzo(lienzo)) {
    const tarjetas = lienzo?.tarjetas || [];
    const porId = new Map(tarjetas.map(t => [llave(t.id), t]));
    const g = grafoDeLienzo(lienzo, analisis);
    const fuera = [];
    const manual = lienzo?.etiquetas || {};
    for (const t of tarjetas) {
        if (DEJAN_VISTA.has(t.tipo)) {
            for (const p of g.padres.get(t.id) || []) {
                const k = claveDeEtiqueta(p, t.id);
                fuera.push({ de: p, a: t.id, etiqueta: manual[k] ?? etiquetaDeducida(sqlDeTarjeta(t), p), aMano: k in manual });
            }
        } else if ((t.tipo === 'chart' || t.tipo === 'number') && t.desde) {
            const p = porId.get(llave(t.desde));
            if (p && DEJAN_VISTA.has(p.tipo)) {
                const k = claveDeEtiqueta(p.id, t.id);
                fuera.push({ de: p.id, a: t.id, etiqueta: manual[k] ?? null, aMano: k in manual });
            }
        }
    }
    return fuera;
}

/** Lo que lee una tarjeta y lo que la lee, hasta el final (para resaltar el linaje). */
export function linaje(lienzo, id, lista = aristas(lienzo)) {
    const arriba = new Set();
    const abajo = new Set();
    const subir = (x) => { for (const e of lista) if (e.a === x && !arriba.has(e.de)) { arriba.add(e.de); subir(e.de); } };
    const bajar = (x) => { for (const e of lista) if (e.de === x && !abajo.has(e.a)) { abajo.add(e.a); bajar(e.a); } };
    subir(id); bajar(id);
    return { arriba, abajo };
}

/**
 * En qué orden poner las vistas para **Refresh**: todo el lienzo, o una rama
 * (la tarjeta y lo que la lee, más lo que ella necesita y aún no existe se
 * decide al ejecutar). Lo que está en un ciclo va al final, y se dice aparte.
 */
export function ordenDeRefresco(lienzo, { desde = null, analisis = analizarLienzo(lienzo) } = {}) {
    const celdas = comoCeldas(lienzo?.tarjetas);
    const g = construirGrafo(celdas, analisis);
    let orden = ordenTopologico(celdas, g);
    if (desde) {
        const rama = new Set([desde]);
        const bajar = (x) => { for (const h of g.hijos.get(x) || []) if (!rama.has(h)) { rama.add(h); bajar(h); } };
        bajar(desde);
        orden = orden.filter(id => rama.has(id));
    }
    return { orden, enCiclo: [...celdasEnCiclo(celdas, g)] };
}

// ── Renombrar (Dec-55) ───────────────────────────────────────────────────────

/**
 * Enmascara comentarios y cadenas de comillas SIMPLES, conservando las dobles:
 * un `"ventas"` es un nombre y hay que poder reescribirlo; un `'ventas'` es un
 * texto y nunca se toca.
 */
function sinTextos(sql) {
    const s = String(sql || '');
    const out = s.split('');
    const n = s.length;
    let i = 0;
    const borrar = (a, b) => { for (let k = a; k < b && k < n; k++) if (out[k] !== '\n') out[k] = ' '; };
    while (i < n) {
        if (s[i] === '-' && s[i + 1] === '-') { let j = s.indexOf('\n', i); if (j === -1) j = n; borrar(i, j); i = j; continue; }
        if (s[i] === '/' && s[i + 1] === '*') { let j = s.indexOf('*/', i + 2); j = j === -1 ? n : j + 2; borrar(i, j); i = j; continue; }
        if (s[i] === "'") {
            let j = i + 1;
            while (j < n) { if (s[j] === "'") { if (s[j + 1] === "'") { j += 2; continue; } j++; break; } j++; }
            borrar(i, j); i = j; continue;
        }
        i++;
    }
    return out.join('');
}

/**
 * Reescribe en `sql` las lecturas de la tabla `viejo` como `nuevo`: después de
 * `FROM` o `JOIN`, y como calificador (`viejo.columna`). **Nunca** dentro de un
 * texto ni de un comentario, y nunca una columna que se llame igual.
 */
export function reescribirLecturas(sql, viejo, nuevo) {
    const original = String(sql || '');
    const mascara = sinTextos(original);
    const nombre = patronDeNombre(viejo);
    const nuevoCitado = /^[A-Za-z_][\w$]*$/.test(nuevo) ? nuevo : citarIdentificador(nuevo);
    const cambios = [];
    const enTabla = new RegExp(`\\b(FROM|JOIN)(\\s+)${nombre}(?![\\w$"])`, 'gi');
    let m;
    while ((m = enTabla.exec(mascara)) !== null) {
        const ini = m.index + m[1].length + m[2].length;
        cambios.push([ini, m.index + m[0].length]);
    }
    const calificador = new RegExp(`(^|[^\\w$."])${nombre}(?=\\.[\\w"])`, 'gi');
    while ((m = calificador.exec(mascara)) !== null) {
        const ini = m.index + m[1].length;
        cambios.push([ini, m.index + m[0].length]);
    }
    if (!cambios.length) return { sql: original, cambios: 0 };
    cambios.sort((a, b) => b[0] - a[0]);
    let s = original;
    for (const [a, b] of cambios) s = s.slice(0, a) + nuevoCitado + s.slice(b);
    return { sql: s, cambios: cambios.length };
}

/**
 * Renombrar una tarjeta: su id, y todo lo que la nombra —el SQL de las que la
 * leen, el `desde` de un gráfico, el `marco` de lo que está dentro de un marco y
 * las etiquetas escritas a mano—. Devuelve el lienzo nuevo y la lista de lo que
 * cambia (para enseñarla antes de confirmar), o `error`.
 */
export function renombrar(lienzo, viejo, nuevo) {
    const n = String(nuevo || '').trim();
    const problema = problemaDeNombre(n);
    if (problema) return { error: problema };
    const tarjetas = lienzo?.tarjetas || [];
    const esta = tarjetas.find(t => llave(t.id) === llave(viejo));
    if (!esta) return { error: `There is no card named "${viejo}"` };
    if (llave(n) !== llave(viejo) && tarjetas.some(t => llave(t.id) === llave(n))) return { error: `"${n}" is already the name of another card` };

    const cambian = [];
    const nuevas = tarjetas.map(t => {
        if (t === esta) return { ...t, id: n };
        let c = t;
        if (DEJAN_VISTA.has(esta.tipo) && t.tipo === 'query' && t.sql) {
            const r = reescribirLecturas(t.sql, esta.id, n);
            if (r.cambios) { c = { ...c, sql: r.sql }; cambian.push({ id: t.id, que: 'sql', veces: r.cambios }); }
        }
        if (llave(t.desde) === llave(esta.id)) { c = { ...c, desde: n }; cambian.push({ id: t.id, que: 'desde' }); }
        if (llave(t.marco) === llave(esta.id)) { c = { ...c, marco: n }; cambian.push({ id: t.id, que: 'marco' }); }
        return c;
    });
    const etiquetas = {};
    for (const [k, v] of Object.entries(lienzo?.etiquetas || {})) {
        const [de, a] = k.split('→');
        etiquetas[claveDeEtiqueta(llave(de) === llave(esta.id) ? n : de, llave(a) === llave(esta.id) ? n : a)] = v;
    }
    const resultado = { ...lienzo, tarjetas: nuevas, etiquetas };
    // Lo que todavía lee el nombre viejo (una lista `FROM a, viejo` que no se
    // reescribe sola): se dice, no se calla.
    const analisis = analizarLienzo(resultado);
    const siguenLeyendo = Object.entries(analisis).filter(([, a]) => a.lee.some(x => llave(x) === llave(esta.id))).map(([id]) => id);
    return { lienzo: resultado, cambian, siguenLeyendo };
}

// ── Crear al soltar una conexión (Dec-55, Dec-56) ───────────────────────────

/**
 * La consulta nueva que lee `padre`, según lo elegido en el menú: **Filter…**,
 * **Group by…**, **Join with…** o vacía. Escribe el SQL y lo deja editable; no
 * hay tarjetas de transformación sin código (llegarán como otro tipo).
 */
export function consultaNueva(lienzo, padre, accion = 'vacia', { columna = null, otra = null } = {}) {
    const usados = (lienzo?.tarjetas || []).map(t => t.id);
    const id = nombrePorOmision(usados);
    const p = /^[A-Za-z_][\w$]*$/.test(padre) ? padre : citarIdentificador(padre);
    const col = columna ? (/^[A-Za-z_][\w$]*$/.test(columna) ? columna : citarIdentificador(columna)) : null;
    let sql;
    switch (accion) {
        case 'filtrar':
            sql = `SELECT *\nFROM ${p}\nWHERE ${col ? `${col} = ` : ''}`;
            break;
        case 'agrupar':
            sql = col
                ? `SELECT ${col}, count(*) AS filas\nFROM ${p}\nGROUP BY ${col}\nORDER BY filas DESC`
                : `SELECT count(*) AS filas\nFROM ${p}`;
            break;
        case 'unir': {
            const o = otra ? (/^[A-Za-z_][\w$]*$/.test(otra) ? otra : citarIdentificador(otra)) : 'otra';
            sql = `SELECT *\nFROM ${p} AS a\nJOIN ${o} AS b USING (${col || ''})`;
            break;
        }
        default:
            sql = `SELECT *\nFROM ${p}`;
    }
    return { id, tipo: 'query', sql };
}

// ── Nombres de las Source ───────────────────────────────────────────────────

/** La última parte de un nombre calificado, sin comillas: `"cierre_norte".main.ventas` → `ventas`. */
const ultimaParte = (nombre) => String(nombre || '').split('.').pop().replace(/^"(.*)"$/, '$1');

/**
 * El nombre que toma una Source al crearse. Una fuente con nombre se lee como
 * `fuentes."ventas"`, así que la tarjeta puede llamarse `ventas`; una tabla o un
 * archivo, no: la vista `ventas` que leyera la tabla `ventas` se leería a sí
 * misma. Esas toman `<nombre>_src`. Siempre uno libre.
 */
export function nombreParaFuente(lienzo, origen = {}) {
    const usados = new Set((lienzo?.tarjetas || []).map(t => llave(t.id)));
    let base = origen.tipo === 'fuente' ? origen.nombre
        : origen.tipo === 'tabla' ? `${ultimaParte(origen.nombre)}_src`
            : origen.tipo === 'archivo' ? `${String(origen.ruta || '').split(/[\/]/).pop().replace(/\.[^.]+$/, '')}_src`
                : 'fuente';
    base = String(base || 'fuente').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'fuente';
    if (/^\d/.test(base)) base = `t_${base}`;
    if (!usados.has(base)) return base;
    for (let i = 2; ; i++) if (!usados.has(`${base}_${i}`)) return `${base}_${i}`;
}

/**
 * Lo que impide ejecutar una tarjeta de datos, o `null`: un nombre que no sirve,
 * o una tarjeta que se lee a sí misma (una tabla con su mismo nombre, sin
 * calificar), que como vista no tendría fin.
 */
export function problemaDeTarjeta(t, analisis = DEJAN_VISTA.has(t?.tipo) ? analizarCelda(sqlDeTarjeta(t)) : null) {
    if (!t || !DEJAN_VISTA.has(t.tipo)) return null;
    const p = problemaDeNombre(t.id);
    if (p) return p;
    if (analisis?.lee?.some(x => llave(x) === llave(t.id))) {
        return `It reads "${t.id}", its own name: give the card another name`;
    }
    if (t.tipo === 'query' && analisis && !analisis.vacia && !analisis.envolvible) {
        return analisis.escribe !== 'no'
            ? 'A card on the canvas only reads: it cannot change data (write that in a notebook or a SQL file)'
            : 'Only one SELECT per card';
    }
    return null;
}
