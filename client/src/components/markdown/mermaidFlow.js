/**
 * El formato de AmoxDiagram: mermaid `flowchart` ↔ grafo.
 *
 * Las **dos direcciones viven aquí**, y no en dos archivos, a propósito: el ida
 * y vuelta sólo sale exacto si las dos mitades conocen el mismo subconjunto.
 * Separadas, se desincronizan en cuanto alguien añade una forma a una y se
 * olvida de la otra — y el síntoma no es un error, es una caja que cambia de
 * dibujo al guardar.
 *
 * ## Por qué un parser propio
 *
 * La API pública de mermaid (`parse`, `render`, `detectType`) valida y dice el
 * tipo, pero **no devuelve el grafo**. Para eso hay que entrar por `mermaidAPI`,
 * marcado `@deprecated` y `@internal` en sus propios tipos: atarse a eso
 * significa que una subida de versión menor deja de abrir los diagramas de la
 * gente. Se usa su render —que es API pública y estable, y de paso nos da las
 * posiciones— y nuestro parser.
 *
 * ## Los tres niveles
 *
 * | Nivel | Qué entra | Qué se hace |
 * |---|---|---|
 * | **Entiendo** | nodos, aristas, formas, subgrafos, dirección | se edita |
 * | **Conservo** | `classDef`, `class`, `style`, `linkStyle`, `click`, `%%` | se guarda tal cual y se vuelve a escribir igual |
 * | **No abro** | otro tipo de diagrama, o algo que no se sabe leer | `null` |
 *
 * El nivel del medio es el que hace que esto sea seguro **sin ser cobarde**. La
 * primera versión del plan se negaba a abrir cualquier diagrama con `classDef`,
 * para no arriesgar pérdida de datos — pero colorear por capa es exactamente lo
 * que hace un ingeniero de datos con una arquitectura, así que la regla
 * protectora acababa cerrándole la puerta a sus propios diagramas.
 *
 * ## Sobre la forma canónica
 *
 * `flujoAMermaid` **normaliza**: comillas siempre, sangría de dos espacios,
 * orden fijo de secciones. Eso significa que el primer guardado de un diagrama
 * escrito a mano produce un diff más grande que el cambio que se hizo. Es el
 * precio de que a partir del segundo **el diff sólo contenga lo que cambió**, y
 * ese precio se paga una vez. Un serializador inestable ensucia cada guardado
 * con reordenaciones que nadie pidió, y estos archivos se versionan.
 */

/** Las siete formas, y lo que significan. El orden es el de la paleta. */
export const FORMAS = {
    proceso: { cercos: ['[', ']'], nombre: 'Proceso' },
    redondeado: { cercos: ['(', ')'], nombre: 'Paso suave' },
    almacen: { cercos: ['[(', ')]'], nombre: 'Almacén' },
    decision: { cercos: ['{', '}'], nombre: 'Decisión' },
    entrada: { cercos: ['[/', '/]'], nombre: 'Entrada' },
    salida: { cercos: ['[\\', '\\]'], nombre: 'Salida' },
    hito: { cercos: ['((', '))'], nombre: 'Hito' },
};

export const FORMA_POR_DEFECTO = 'proceso';

/**
 * Los estilos de flecha, nombrados por lo que significan y no por su sintaxis.
 * Quien dibuja una arquitectura no piensa «línea punteada», piensa «esto va
 * evento a evento».
 */
export const ESTILOS_ARISTA = {
    lotes: { flecha: '-->', nombre: 'Por lotes' },
    continuo: { flecha: '-.->', nombre: 'Continuo' },
    principal: { flecha: '==>', nombre: 'Camino principal' },
    simple: { flecha: '---', nombre: 'Sin dirección' },
};

export const ESTILO_POR_DEFECTO = 'lotes';

/** Las direcciones que mermaid entiende. `TD` es alias de `TB` y se respeta. */
export const DIRECCIONES = ['TB', 'TD', 'BT', 'LR', 'RL'];

/**
 * Las líneas que no entendemos pero **no tocamos**. El orden importa: se prueban
 * de más específica a menos, y `%%{` tiene que ir antes que `%%`.
 *
 * `class` estuvo aquí y **se ha promovido**: asignar una capa a una caja es lo
 * que pedía la pregunta 26 de la auditoría, y no se puede ofrecer si la línea
 * que lo dice es opaca. La distinción que queda es la correcta: entendemos
 * **qué caja pertenece a qué clase** y no tocamos **qué aspecto tiene esa
 * clase** — el `classDef` sigue siendo del autor, palabra por palabra.
 */
const CONSERVADAS = [
    /^%%\{/,
    /^%%/,
    /^classDef\s/,
    /^style\s/,
    /^linkStyle\s/,
    /^click\s/,
];

/** `class a,b,c nombre` — la asignación de capas, que sí se entiende. */
const RE_CLASE = /^class\s+([A-Za-z0-9_,\-\s]+?)\s+([A-Za-z_][A-Za-z0-9_-]*)$/;

/** Los cercos ordenados por longitud: `[(` tiene que probarse antes que `[`. */
const APERTURAS = Object.entries(FORMAS)
    .map(([forma, { cercos }]) => ({ forma, abre: cercos[0], cierra: cercos[1] }))
    .sort((a, b) => b.abre.length - a.abre.length);

const RE_ID = /^[A-Za-z0-9_][A-Za-z0-9_-]*/;

// ── leer ────────────────────────────────────────────────────────────────────

/**
 * Un nodo a partir de `pos`: el identificador y, si lo lleva, su forma y texto.
 * Devuelve `null` si ahí no empieza un nodo.
 */
function leerNodo(s, pos) {
    let i = pos;
    while (i < s.length && s[i] === ' ') i++;

    const m = RE_ID.exec(s.slice(i));
    if (!m) return null;
    const id = m[0];
    i += id.length;

    for (const { forma, abre, cierra } of APERTURAS) {
        if (s.startsWith(abre, i)) {
            const dentroDesde = i + abre.length;
            let texto;
            let fin;

            if (s[dentroDesde] === '"') {
                // Con comillas el texto puede llevar cualquier cosa, cercos
                // incluidos. Es la forma que emitimos siempre.
                const cierraComilla = s.indexOf('"', dentroDesde + 1);
                if (cierraComilla === -1) return null;
                texto = s.slice(dentroDesde + 1, cierraComilla);
                if (!s.startsWith(cierra, cierraComilla + 1)) return null;
                fin = cierraComilla + 1 + cierra.length;
            } else {
                const cierraEn = s.indexOf(cierra, dentroDesde);
                if (cierraEn === -1) return null;
                texto = s.slice(dentroDesde, cierraEn).trim();
                fin = cierraEn + cierra.length;
            }
            return { id, texto, forma, conCerco: true, pos: fin };
        }
    }

    // Sin cerco es una referencia a un nodo, no una declaración.
    return { id, texto: null, forma: null, conCerco: false, pos: i };
}

/** Un conector a partir de `pos`, con su etiqueta si la lleva. */
function leerConector(s, pos) {
    let i = pos;
    while (i < s.length && s[i] === ' ') i++;
    const resto = s.slice(i);

    // `-- texto -->` antes que `-->`, porque el primero empieza por `--`.
    const conTexto = /^--\s+(.+?)\s+(-->|---)/.exec(resto);
    if (conTexto) {
        return {
            estilo: conTexto[2] === '---' ? 'simple' : 'lotes',
            etiqueta: conTexto[1],
            pos: i + conTexto[0].length,
        };
    }

    const flecha = /^(-\.->|==>|-->|---)/.exec(resto);
    if (!flecha) return null;
    const estilo = Object.keys(ESTILOS_ARISTA)
        .find((k) => ESTILOS_ARISTA[k].flecha === flecha[1]);
    let fin = i + flecha[0].length;

    const etiq = /^\|([^|]*)\|/.exec(s.slice(fin));
    if (etiq) return { estilo, etiqueta: etiq[1].trim(), pos: fin + etiq[0].length };

    return { estilo, etiqueta: '', pos: fin };
}

/** La cabecera del subgrafo: `subgraph G1["Título"]`, `subgraph Origen`. */
function leerSubgrafo(resto, cuantos) {
    const t = resto.trim();
    if (!t) return null;

    if (/^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(t)) return { id: t, titulo: t };

    const nodo = leerNodo(t, 0);
    if (nodo && nodo.conCerco && nodo.pos === t.length) {
        return { id: nodo.id, titulo: nodo.texto };
    }
    // `subgraph Zona de aterrizaje` — título con espacios y sin identificador.
    // Se le inventa uno estable por posición; el título es lo que el autor ve.
    return { id: `sg${cuantos + 1}`, titulo: t.replace(/^"|"$/g, '') };
}

/** Por qué no se pudo abrir, en el idioma del usuario y no en el del programa. */
export const MOTIVOS_FLUJO = {
    'otro-tipo': 'no es un diagrama de flujo',
    vacio: 'no hay ningún diagrama',
    direccion: 'esa dirección no existe: usa TB, BT, LR o RL',
    anidado: 'los grupos dentro de grupos todavía no se saben dibujar',
    direccion_grupo: 'cambiar la dirección dentro de un grupo todavía no se sabe dibujar',
    ampersand: 'varias cajas en una línea con «&» todavía no se saben escribir de vuelta',
    'grupo-sin-cerrar': 'falta el «end» de un grupo',
    'end-de-mas': 'hay un «end» que no cierra ningún grupo',
    linea: 'esta línea no se entiende',
};

/**
 * El análisis, con el motivo por el que se rinde.
 *
 * Es la misma pasada que `parsearFlujo`: **una sola**, con dos puertas de
 * salida. Tener un segundo recorrido «que además explique» habría sido dos
 * gramáticas que mantener en paralelo, y la que explica se habría ido quedando
 * atrás sin que nadie lo notase.
 */
function analizar(texto) {
    const crudo = String(texto || '');
    const lineas = crudo.split(/\r?\n/);
    // La línea en la que se está, para poder señalarla si algo falla.
    let nLinea = 0;
    const rendirse = (motivo) => ({ fallo: { linea: nLinea, motivo } });

    const nodos = new Map();
    const aristas = [];
    const subgrafos = [];
    const conservado = [];
    let direccion = null;
    const pila = [];

    const registrar = (spec, enSubgrafo) => {
        const previo = nodos.get(spec.id);
        if (!previo) {
            nodos.set(spec.id, {
                id: spec.id,
                texto: spec.conCerco ? spec.texto : spec.id,
                forma: spec.conCerco ? spec.forma : FORMA_POR_DEFECTO,
                clases: [],
            });
        } else if (spec.conCerco) {
            previo.texto = spec.texto;
            previo.forma = spec.forma;
        }
        if (enSubgrafo && !enSubgrafo.nodos.includes(spec.id)) enSubgrafo.nodos.push(spec.id);
    };

    // Las asignaciones de clase se apuntan y se aplican al final: un
    // `class erp,web origen` puede estar escrito antes de que las cajas se
    // declaren, y en mermaid vale igual.
    const asignaciones = [];

    for (const lineaCruda of lineas) {
        nLinea++;
        const linea = lineaCruda.trim();
        if (!linea) continue;

        if (CONSERVADAS.some((re) => re.test(linea))) { conservado.push(linea); continue; }

        const clase = RE_CLASE.exec(linea);
        if (clase) {
            for (const id of clase[1].split(',').map((x) => x.trim()).filter(Boolean)) {
                asignaciones.push([id, clase[2]]);
            }
            continue;
        }

        if (direccion === null) {
            const cab = /^(?:flowchart|graph)(?:\s+([A-Za-z]{2}))?$/.exec(linea);
            if (!cab) return rendirse('otro-tipo');               // no es un flowchart: no se abre
            direccion = cab[1] || 'TB';
            if (!DIRECCIONES.includes(direccion)) return rendirse('direccion');
            continue;
        }

        if (/^end$/i.test(linea)) {
            if (!pila.length) return rendirse('end-de-mas');
            pila.pop();
            continue;
        }

        const sub = /^subgraph\s+(.*)$/.exec(linea);
        if (sub) {
            // Un solo nivel de anidamiento. Más profundo se sabría leer, pero no
            // se sabría dibujar sin decidir cómo se anidan las cajas, y abrir
            // algo que luego no se guarda igual es peor que no abrirlo.
            if (pila.length) return rendirse('anidado');
            const cab = leerSubgrafo(sub[1], subgrafos.length);
            if (!cab) return rendirse('anidado');
            const nuevo = { id: cab.id, titulo: cab.titulo, nodos: [] };
            subgrafos.push(nuevo);
            pila.push(nuevo);
            continue;
        }

        // `direction TB` dentro de un subgrafo cambia la disposición de ese
        // grupo. Conservarlo sería mentir —se reescribiría fuera del subgrafo,
        // donde significa otra cosa— así que el diagrama no se abre.
        if (/^direction\s/i.test(linea)) return rendirse('direccion_grupo');

        // Nodos separados por `&` en la misma sentencia. Se sabe lo que es; no
        // se sabe escribirlo de vuelta sin cambiar la forma del archivo.
        if (linea.includes('&')) return rendirse('ampersand');

        const enSub = pila[pila.length - 1] || null;
        const primero = leerNodo(linea, 0);
        if (!primero) return rendirse('linea');
        registrar(primero, enSub);

        let pos = primero.pos;
        let anterior = primero.id;
        while (pos < linea.length) {
            const con = leerConector(linea, pos);
            if (!con) return rendirse('linea');
            const sig = leerNodo(linea, con.pos);
            if (!sig) return rendirse('linea');
            registrar(sig, enSub);
            aristas.push({
                desde: anterior, hasta: sig.id,
                etiqueta: con.etiqueta || '',
                estilo: con.estilo,
            });
            anterior = sig.id;
            pos = sig.pos;
            while (pos < linea.length && linea[pos] === ' ') pos++;
        }
    }

    if (direccion === null) { nLinea = 0; return rendirse('vacio'); }
    if (pila.length) { nLinea = 0; return rendirse('grupo-sin-cerrar'); }

    for (const [id, clase] of asignaciones) {
        const nodo = nodos.get(id);
        // Una clase asignada a algo que no existe se descarta en silencio: es
        // exactamente lo que hace mermaid, y avisar de ello sería avisar de un
        // problema del documento que no hemos causado ni sabemos arreglar.
        if (nodo && !nodo.clases.includes(clase)) nodo.clases.push(clase);
    }

    return { grafo: { direccion, nodos: [...nodos.values()], aristas, subgrafos, conservado } };
}

/**
 * Mermaid `flowchart` a grafo, o `null` si no se sabe leer.
 *
 * `null` es una respuesta **normal y frecuente**, no un fallo: un
 * `sequenceDiagram` no es un diagrama roto, es otro tipo de diagrama. Quien
 * llama decide qué hacer, y lo correcto casi siempre es no ofrecer el botón.
 */
export function parsearFlujo(texto) {
    return analizar(texto).grafo || null;
}

/**
 * Por qué no se abre, para poder decírselo a quien esperaba que se abriera.
 *
 * La diferencia importa y por eso hay dos respuestas distintas: un
 * `sequenceDiagram` **no es un fallo** —es otro tipo de diagrama, y ahí lo
 * correcto es callarse—, mientras que un flowchart con una línea rara sí es
 * algo que el usuario esperaba poder abrir, y merece saber cuál.
 *
 * Devuelve `null` cuando sí se abre.
 */
export function porQueNoSeAbre(texto) {
    const { fallo } = analizar(texto);
    if (!fallo) return null;
    return {
        ...fallo,
        // `otro-tipo` y `vacio` no son culpa de nadie: no se enseñan como error.
        esperado: fallo.motivo === 'otro-tipo' || fallo.motivo === 'vacio',
        texto: MOTIVOS_FLUJO[fallo.motivo] || MOTIVOS_FLUJO.linea,
    };
}

// ── escribir ────────────────────────────────────────────────────────────────

/**
 * Un texto listo para ir dentro de un cerco de mermaid. Las comillas del autor
 * pasan a simples: mermaid no las escapa dentro de una etiqueta entrecomillada,
 * y la alternativa (`#quot;`) le sale al usuario en el dibujo.
 */
function textoSeguro(t) {
    return String(t ?? '').replace(/"/g, "'").replace(/\r?\n/g, ' ').trim();
}

/** `id["texto"]` con los cercos de su forma. Siempre con comillas. */
function declarar(nodo) {
    const { cercos } = FORMAS[nodo.forma] || FORMAS[FORMA_POR_DEFECTO];
    return `${nodo.id}${cercos[0]}"${textoSeguro(nodo.texto)}"${cercos[1]}`;
}

/**
 * Grafo a mermaid, en forma canónica.
 *
 * Cada nodo se declara **la primera vez que aparece**: dentro de su subgrafo si
 * pertenece a uno, en su propia línea si está suelto, y si no, en la arista
 * donde sale por primera vez. Eso mantiene el texto cerca de lo que una persona
 * escribiría, y sigue siendo determinista porque el orden de los nodos y las
 * aristas es el del grafo.
 */
export function flujoAMermaid(grafo) {
    if (!grafo) return '';
    const direccion = DIRECCIONES.includes(grafo.direccion) ? grafo.direccion : 'LR';
    const nodos = Array.isArray(grafo.nodos) ? grafo.nodos : [];
    const aristas = Array.isArray(grafo.aristas) ? grafo.aristas : [];
    const subgrafos = Array.isArray(grafo.subgrafos) ? grafo.subgrafos : [];

    const porId = new Map(nodos.map((n) => [n.id, n]));
    const declarados = new Set();
    const lineas = [`flowchart ${direccion}`];

    const pieza = (id) => {
        const nodo = porId.get(id);
        if (!nodo) return id;
        if (declarados.has(id)) return id;
        declarados.add(id);
        return declarar(nodo);
    };

    for (const sg of subgrafos) {
        const dentro = (sg.nodos || []).filter((id) => porId.has(id));
        lineas.push(`  subgraph ${sg.id}["${textoSeguro(sg.titulo)}"]`);
        for (const id of dentro) lineas.push(`    ${pieza(id)}`);
        lineas.push('  end');
    }

    for (const a of aristas) {
        const { flecha } = ESTILOS_ARISTA[a.estilo] || ESTILOS_ARISTA[ESTILO_POR_DEFECTO];
        const etiqueta = a.etiqueta ? `|${textoSeguro(a.etiqueta)}|` : '';
        lineas.push(`  ${pieza(a.desde)} ${flecha}${etiqueta} ${pieza(a.hasta)}`);
    }

    // Los nodos sueltos sin ninguna arista siguen apareciendo: son parte del
    // diagrama aunque todavía no estén conectados, y quien los puso los quiere.
    //
    // Van **después** del flujo y no antes. Es una cuestión de diff: añadir una
    // caja que todavía no has conectado no debería desplazar todas las líneas
    // del flujo en el control de versiones. Y de lectura: primero lo que cuenta
    // la historia, luego lo que quedó a medias.
    for (const n of nodos) if (!declarados.has(n.id)) lineas.push(`  ${pieza(n.id)}`);

    for (const linea of grafo.conservado || []) lineas.push(`  ${linea}`);

    // Las asignaciones de clase, **agrupadas por clase**: `class erp,web origen`
    // en vez de una línea por caja. Es como se escribe a mano, y mantiene el
    // diff corto cuando se añade una caja a una capa que ya existe.
    //
    // Van después del `classDef`, que vive en lo conservado: mermaid no lo
    // exige, pero un archivo donde la definición precede al uso se lee mejor.
    const porClase = new Map();
    for (const n of nodos) {
        for (const c of n.clases || []) {
            if (!porClase.has(c)) porClase.set(c, []);
            porClase.get(c).push(n.id);
        }
    }
    for (const [clase, ids] of porClase) lineas.push(`  class ${ids.join(',')} ${clase}`);

    return lineas.join('\n');
}

// ── utilidades del modelo ───────────────────────────────────────────────────

/** Un grafo vacío con el que arrancar un diagrama nuevo. */
export function flujoVacio(direccion = 'LR') {
    return { direccion, nodos: [], aristas: [], subgrafos: [], conservado: [] };
}

/**
 * Un identificador libre, corto y legible.
 *
 * Se sanea a lo que mermaid admite y se numera si hace falta. Que sea legible
 * importa más de lo que parece: es lo que va a leer quien abra el archivo en el
 * control de versiones.
 */
export function idLibre(texto, usados) {
    const tomados = usados instanceof Set ? usados : new Set(usados || []);
    const base = String(texto || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase()
        .slice(0, 24);
    const raiz = base && /^[a-z]/.test(base) ? base : `n${base ? `_${base}` : ''}`;
    if (!tomados.has(raiz)) return raiz;
    let i = 2;
    while (tomados.has(`${raiz}_${i}`)) i++;
    return `${raiz}_${i}`;
}

/**
 * Las capas declaradas en el diagrama, con el color que el autor les dio.
 *
 * Se leen de los `classDef` **sin tocarlos**: el editor necesita el color para
 * pintar la caja igual que la va a pintar mermaid, pero la definición sigue
 * siendo del autor. Si mañana escribe ahí un degradado o una propiedad que no
 * conocemos, el `classDef` sobrevive entero y nosotros nos quedamos sin color,
 * que es la forma correcta de fallar.
 */
export function capasDe(grafo) {
    const fuera = [];
    for (const linea of grafo?.conservado || []) {
        const m = /^classDef\s+([A-Za-z_][A-Za-z0-9_-]*)\s+(.*)$/.exec(linea);
        if (!m) continue;
        const props = Object.fromEntries(
            m[2].split(',')
                .map((p) => p.split(':').map((x) => x.trim()))
                .filter((p) => p.length >= 2)
                .map(([k, ...v]) => [k, v.join(':')]),
        );
        fuera.push({ nombre: m[1], fill: props.fill || null, stroke: props.stroke || null });
    }
    return fuera;
}

/** Una definición de capa nueva, con el color dado. */
export function defineCapa(nombre, fill, stroke) {
    return `classDef ${nombre} fill:${fill},stroke:${stroke}`;
}

/** El subgrafo al que pertenece un nodo, si pertenece a alguno. */
export function grupoDe(grafo, id) {
    return (grafo?.subgrafos || []).find((sg) => (sg.nodos || []).includes(id)) || null;
}

/**
 * Los cabos sueltos: lo que alguien quiere mirar antes de enseñar el diagrama.
 * No bloquea nada — un diagrama a medias es un estado legítimo de trabajo.
 */
export function cabosSueltos(grafo) {
    if (!grafo) return [];
    const avisos = [];
    const salen = new Set(grafo.aristas.map((a) => a.desde));
    const entran = new Set(grafo.aristas.map((a) => a.hasta));

    for (const n of grafo.nodos) {
        if (!salen.has(n.id) && !entran.has(n.id) && !grupoDe(grafo, n.id)) {
            avisos.push({ tipo: 'suelto', id: n.id, texto: `«${n.texto}» no está conectada ni agrupada` });
        }
    }
    for (const sg of grafo.subgrafos) {
        if (!(sg.nodos || []).length) {
            avisos.push({ tipo: 'grupo-vacio', id: sg.id, texto: `El grupo «${sg.titulo}» está vacío` });
        }
    }
    const vistos = new Map();
    for (const n of grafo.nodos) {
        const clave = textoSeguro(n.texto).toLowerCase();
        if (!clave) continue;
        if (vistos.has(clave)) {
            avisos.push({ tipo: 'repetida', id: n.id, texto: `«${n.texto}» aparece en dos cajas` });
        } else vistos.set(clave, n.id);
    }
    return avisos;
}
