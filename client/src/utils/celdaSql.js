/**
 * Lo que se deduce de la consulta de una celda **sin ejecutarla**.
 *
 * De aquí salen tres cosas que el cuaderno necesita saber antes de mandar nada
 * al motor:
 *
 * 1. **Si se puede envolver** en una vista. Es la condición de que la celda deje
 *    algo con nombre sin que nadie escriba el `CREATE`. Medido contra el motor:
 *    envolver algo que no sea un `SELECT` **falla**, así que no basta con
 *    intentarlo y ver qué pasa.
 * 2. **Qué lee.** De los `FROM` y los `JOIN` sale el grafo de dependencias, que
 *    es lo que permite marcar lo desactualizado y ejecutar sólo eso. Sin esto,
 *    «ejecutar todo» tiene que suponer que el orden de la pantalla es el orden
 *    de dependencia — que es justo la mentira que este formato viene a quitar.
 * 3. **Si escribe.** Hoy un `SELECT` y un `CREATE TABLE` se ven exactamente
 *    igual en una celda, y uno de los dos cambia el disco.
 *
 * ## La dirección en la que puede fallar, que no es simétrica
 *
 * Esto es un análisis por aproximación, no un parser de SQL. Conviene tener
 * clarísimo hacia dónde se inclina cuando duda:
 *
 * - **Inventarse una dependencia** hace que algo se marque desactualizado sin
 *   serlo: se recalcula de más. Molesto y **inofensivo**.
 * - **Perderse una dependencia** deja un resultado viejo con pinta de nuevo.
 *   **Eso sí hace daño**, porque ese número acaba en un informe.
 *
 * Por eso, ante la duda, aquí se **añade** el nombre en vez de descartarlo. Se
 * recorre el texto entero —subconsultas incluidas— y sólo se quitan los que se
 * sabe con certeza que no son tablas: los definidos en un `WITH` de la propia
 * consulta y las llamadas a función.
 */
import { splitSqlStatements } from './sqlSplitter.js';

/**
 * Sustituye por espacios lo que no es código: comentarios y literales.
 *
 * **Se conserva la longitud** para que las posiciones sigan valiendo, y se
 * respetan las comillas — el `stripComments` de `sqlSplitter` borra un `--` que
 * esté dentro de una cadena, y para clasificar da igual pero para leer nombres
 * de tabla no: `WHERE nota = 'a -- b'` se llevaría por delante media consulta.
 */
export function enmascarar(sql) {
    const s = String(sql || '');
    const out = s.split('');
    let i = 0;
    const n = s.length;
    const borrar = (desde, hasta) => {
        for (let k = desde; k < hasta && k < n; k++) {
            if (out[k] !== '\n') out[k] = ' ';
        }
    };

    while (i < n) {
        const c = s[i];
        const d = s[i + 1];

        if (c === '-' && d === '-') {
            let j = s.indexOf('\n', i);
            if (j === -1) j = n;
            borrar(i, j);
            i = j;
            continue;
        }
        if (c === '/' && d === '*') {
            let j = s.indexOf('*/', i + 2);
            j = j === -1 ? n : j + 2;
            borrar(i, j);
            i = j;
            continue;
        }
        // Cadenas y comillas dobles. La comilla se duplica para escaparse
        // (`'a''b'`), así que al encontrar el cierre hay que mirar la siguiente.
        if (c === "'" || c === '"') {
            let j = i + 1;
            while (j < n) {
                if (s[j] === c) {
                    if (s[j + 1] === c) { j += 2; continue; }
                    j++;
                    break;
                }
                j++;
            }
            // Las comillas dobles son un IDENTIFICADOR, no un literal: se
            // conservan para poder leer `FROM "mi tabla"`.
            if (c === "'") borrar(i, j);
            i = j;
            continue;
        }
        // Cadenas con dólar: $$ … $$ y $etiqueta$ … $etiqueta$
        if (c === '$') {
            const m = /^\$[A-Za-z_]*\$/.exec(s.slice(i));
            if (m) {
                const marca = m[0];
                const j = s.indexOf(marca, i + marca.length);
                const fin = j === -1 ? n : j + marca.length;
                borrar(i, fin);
                i = fin;
                continue;
            }
        }
        i++;
    }
    return out.join('');
}

/** La primera palabra de una sentencia, en mayúsculas. */
function primeraPalabra(code) {
    const m = /^\s*([A-Za-z_]+)/.exec(code || '');
    return m ? m[1].toUpperCase() : '';
}

/**
 * Qué toca esta sentencia: nada, la sesión, o el disco.
 *
 * La distinción importa porque **no es lo mismo una tabla temporal que una
 * real**: la primera se va al cerrar y la segunda se queda. La celda tiene que
 * poder decir cuál de las dos cosas va a hacer antes de hacerla.
 */
function alcanceDeEscritura(code) {
    const p = primeraPalabra(code);
    if (['SELECT', 'WITH', 'FROM', 'VALUES', 'DESCRIBE', 'SHOW', 'EXPLAIN', 'SUMMARIZE'].includes(p)) {
        return 'no';
    }
    if (['SET', 'PRAGMA', 'INSTALL', 'LOAD', 'USE', 'BEGIN', 'COMMIT', 'ROLLBACK'].includes(p)) {
        return 'sesion';
    }
    if (p === 'CREATE' || p === 'DROP' || p === 'ALTER' || p === 'COMMENT') {
        // TEMP/TEMPORARY sólo vive en la sesión; lo demás se queda en el disco.
        return /^\s*\w+\s+(OR\s+REPLACE\s+)?(TEMP|TEMPORARY)\b/i.test(code) ? 'sesion' : 'disco';
    }
    if (['INSERT', 'UPDATE', 'DELETE', 'COPY', 'TRUNCATE', 'ATTACH', 'DETACH', 'EXPORT', 'IMPORT', 'VACUUM', 'CHECKPOINT'].includes(p)) {
        return 'disco';
    }
    // Lo que no se reconoce se trata como si escribiera: es la suposición que
    // no hace daño. Callarse un CREATE sería peor que avisar de un SELECT raro.
    return p ? 'disco' : 'no';
}

/** Los nombres definidos en el `WITH` de la propia consulta. No son dependencias. */
function nombresDeCte(codigo) {
    const nombres = new Set();
    // `WITH a AS (…), b AS (…)` y `WITH RECURSIVE a AS (…)`. Se buscan todos los
    // `<ident> AS (` que estén en el tramo anterior al primer SELECT de nivel
    // superior; en la práctica basta con recogerlos todos, porque un nombre de
    // CTE nunca coincide con una tabla que además se lea.
    const re = /(?:^|[\s,(])([A-Za-z_][\w$]*)\s+AS\s*\(/gi;
    let m;
    while ((m = re.exec(codigo)) !== null) nombres.add(m[1].toLowerCase());
    return nombres;
}

/**
 * De qué lee la consulta.
 *
 * Se recorre **todo** el texto —subconsultas incluidas— buscando `FROM` y
 * `JOIN`. Se descartan tres cosas y sólo tres, porque de las tres hay certeza:
 * los paréntesis (una subconsulta), las llamadas a función (`read_csv(…)`) y
 * los nombres definidos en el `WITH` de la propia consulta.
 */
/**
 * Palabras que en el sitio de un nombre de tabla **no son un nombre de tabla**.
 *
 * Hace falta por una razón muy concreta: al enmascarar, un
 * `FROM 'Data/ventas.csv'` deja un hueco de espacios, y sin esta lista el
 * escáner se salta el hueco y se traga la palabra siguiente — `FROM  … JOIN
 * campanas` acababa dando `JOIN` como si fuera una tabla. Y consultar un
 * archivo directamente es de lo más común en esta aplicación.
 */
const NO_SON_TABLA = new Set([
    'select', 'from', 'join', 'where', 'group', 'order', 'limit', 'having',
    'union', 'intersect', 'except', 'on', 'using', 'left', 'right', 'inner',
    'full', 'outer', 'cross', 'natural', 'lateral', 'qualify', 'window',
    'offset', 'values', 'unnest', 'as', 'with', 'by', 'and', 'or', 'not',
    'asof', 'positional', 'anti', 'semi', 'sample', 'tablesample',
]);

function loQueLee(codigo) {
    const cte = nombresDeCte(codigo);
    const lee = new Set();
    const n = codigo.length;

    // Un identificador: entre comillas dobles (y entonces admite espacios) o la
    // racha de caracteres de nombre. Devuelve `null` si ahi no empieza uno.
    const leerNombre = (i) => {
        if (codigo[i] === '"') {
            const fin = codigo.indexOf('"', i + 1);
            if (fin === -1) return null;
            return { nombre: codigo.slice(i + 1, fin), fin: fin + 1 };
        }
        const m = /^[A-Za-z_][\w$]*(?:\.[A-Za-z_"][\w$"]*)*/.exec(codigo.slice(i));
        if (!m) return null;
        return { nombre: m[0], fin: i + m[0].length };
    };

    const saltarEspacios = (i) => {
        while (i < n && /\s/.test(codigo[i])) i++;
        return i;
    };

    const re = /\b(FROM|JOIN)\b/gi;
    let m;
    while ((m = re.exec(codigo)) !== null) {
        let i = saltarEspacios(m.index + m[0].length);
        // Una lista: `FROM a, b, c`. Se corta en cuanto algo no encaja.
        for (;;) {
            // Un parentesis es una subconsulta: su propio FROM lo pilla otra
            // vuelta de este mismo bucle, asi que aqui no hay nada que hacer.
            if (codigo[i] === '(') break;
            const leido = leerNombre(i);
            if (!leido) break;

            // Si justo detras hay un parentesis, era una llamada a funcion
            // —`read_csv('x')`— y no una tabla.
            const tras = saltarEspacios(leido.fin);
            const esFuncion = codigo[tras] === '(';

            const clave = leido.nombre.toLowerCase();
            // Una palabra reservada aqui significa que el nombre no estaba: o
            // era un literal que el enmascarado dejo en blanco, o la consulta
            // sigue por otro lado. En los dos casos, no hay tabla que anotar.
            if (NO_SON_TABLA.has(clave.split('.')[0])) break;
            if (!esFuncion && !cte.has(clave)) lee.add(leido.nombre);

            // Saltar lo que venga detras del nombre hasta la coma, si la hay:
            // alias, `AS x`, `ON …`. Solo se sigue si lo siguiente es una coma.
            let j = leido.fin;
            if (esFuncion) {
                // saltar el parentesis entero para no confundirlo con una lista
                let prof = 0;
                j = tras;
                while (j < n) {
                    if (codigo[j] === '(') prof++;
                    else if (codigo[j] === ')') { prof--; if (prof === 0) { j++; break; } }
                    j++;
                }
            }
            j = saltarEspacios(j);
            // `FROM a AS x, b` — hay que pasar por encima del alias.
            const alias = /^(?:(AS)\s+)?([A-Za-z_][\w$]*)/i.exec(codigo.slice(j));
            if (alias && (alias[1] || !NO_SON_TABLA.has(alias[2].toLowerCase()))) {
                j = saltarEspacios(j + alias[0].length);
            }
            if (codigo[j] !== ',') break;
            i = saltarEspacios(j + 1);
        }
    }
    return [...lee];
}

/** El bloque de comentarios del principio, que será la descripción de la vista. */
function comentarioDeCabecera(sql) {
    const lineas = String(sql || '').split('\n');
    const texto = [];
    for (const linea of lineas) {
        const t = linea.trim();
        if (!t) {
            // Una línea en blanco antes de que haya empezado el comentario se
            // salta; después, corta. Lo de después ya no es la cabecera.
            if (texto.length) break;
            continue;
        }
        if (t.startsWith('--')) {
            texto.push(t.replace(/^--\s?/, '').trim());
            continue;
        }
        break;
    }
    return texto.join('\n').trim();
}

/** Si la celda ya trae su propio `CREATE … VIEW`, se respeta y se usa su nombre. */
function vistaEscritaAMano(codigo) {
    const m = /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?("[^"]*"|[\w$.]+)/i.exec(codigo);
    return m ? m[1].replace(/^"(.*)"$/, '$1') : null;
}

/**
 * Todo lo que se sabe de una celda antes de ejecutarla.
 *
 * `envolvible` es la condición de la vista implícita: **una sola sentencia y que
 * empiece por `SELECT` o `WITH`.** Un `WITH … INSERT` no vale aunque empiece por
 * `WITH`, y por eso se mira también con qué acaba.
 */
export function analizarCelda(sql) {
    const texto = String(sql || '');
    const sentencias = splitSqlStatements(texto);
    const vacia = sentencias.length === 0;

    const codigos = sentencias.map((s) => enmascarar(s.raw));
    const alcances = codigos.map(alcanceDeEscritura);
    const escribe = alcances.includes('disco') ? 'disco'
        : alcances.includes('sesion') ? 'sesion'
            : 'no';

    const unica = sentencias.length === 1 ? codigos[0] : null;
    const vistaPropia = unica ? vistaEscritaAMano(unica) : null;

    // `WITH` puede acabar en cualquier cosa. Se comprueba que en la sentencia no
    // aparezca ninguna palabra que la convierta en otra cosa.
    const esConsulta = !!unica
        && ['SELECT', 'WITH', 'FROM', 'VALUES', 'TABLE'].includes(primeraPalabra(unica))
        && !/\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|COPY)\s/i.test(unica);

    return {
        vacia,
        sentencias: sentencias.length,
        /** ¿Se le puede poner nombre envolviéndola en una vista? */
        envolvible: esConsulta && !vistaPropia,
        /** Si ya la escribió el usuario, su nombre. */
        vistaPropia,
        /** La descripción, del comentario de cabecera. */
        comentario: comentarioDeCabecera(texto),
        /** El grafo de dependencias. */
        lee: codigos.length ? loQueLee(codigos.join('\n')) : [],
        /** `'no'` | `'sesion'` | `'disco'`. */
        escribe,
    };
}
