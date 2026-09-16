/**
 * Qué celda depende de cuál, y cuáles han dejado de estar al día.
 *
 * ## Por qué esta parte se prueba más que ninguna
 *
 * Porque **al fallar no da un error**. Todo lo demás del cuaderno avisa cuando
 * se rompe: una consulta mal escrita falla, una vista que no existe falla. Esto
 * no. Si aquí se pierde una dependencia, lo que queda en pantalla es un número
 * viejo con pinta de nuevo, y de ahí se va a una diapositiva y a una reunión.
 *
 * Por eso el código se inclina a propósito: **ante la duda, marcar como
 * desactualizado**. Inventarse una dependencia cuesta una ejecución de más;
 * perder una cuesta una cifra equivocada que nadie revisa.
 *
 * ## Qué significa «desactualizado» cuando una vista es perezosa
 *
 * Hay que decirlo con cuidado, porque no es lo obvio. Una vista **no guarda
 * datos**: leerla vuelve a ejecutar su cadena entera, así que si cambian los
 * datos de origen, la vista ya da el resultado nuevo sin que nadie la toque.
 * En ese sentido una vista no puede quedarse vieja.
 *
 * Lo que sí se queda viejo son dos cosas distintas:
 *
 * 1. **La definición puesta en la sesión**, que se congeló al ejecutar. Si se
 *    edita el SQL de la celda y no se vuelve a ejecutar, la vista viva sigue
 *    siendo la de antes — y la celda de abajo está leyendo algo que ya no es lo
 *    que el documento enseña.
 * 2. **El resultado que se ve en pantalla**, que es del último `SELECT`. Aunque
 *    la vista diera hoy otra cosa, en la celda sigue el número de ayer.
 *
 * Lo segundo es lo que de verdad hace daño, y es lo que estas funciones marcan.
 * (Una tabla materializada sí se queda vieja también en datos, y cae en el mismo
 * marcado, así que no necesita un caso aparte.)
 */

const llave = (n) => String(n || '').trim().toLowerCase();

/**
 * El grafo de dependencias, deducido de lo que cada celda lee.
 *
 * La dependencia es **por nombre, no por posición**: si una celda lee
 * `ventas_limpias`, depende de la que crea esa vista, esté donde esté en el
 * documento. Eso es justo lo que el orden de la pantalla no sabe, y por lo que
 * «ejecutar de aquí hacia abajo» era una promesa falsa.
 *
 * @param {Array} celdas
 * @param {Object} analisis mapa `id -> analizarCelda(...)`
 * @returns {{padres: Map<string,Set<string>>, hijos: Map<string,Set<string>>, deQuien: Map<string,string>}}
 */
export function construirGrafo(celdas, analisis) {
    const deQuien = new Map();   // nombre en minúsculas -> id de la celda que lo crea
    for (const c of celdas || []) {
        if (c.tipo !== 'sql') continue;
        const n = llave(c.nombre);
        // La PRIMERA se queda el nombre. Si hay dos iguales, la de abajo pisará
        // la vista al ejecutarse, pero para leer el grafo hace falta una sola
        // respuesta y la de arriba es la que el resto del documento ve primero.
        if (n && !deQuien.has(n)) deQuien.set(n, c.id);
    }

    const padres = new Map();
    const hijos = new Map();
    for (const c of celdas || []) {
        padres.set(c.id, new Set());
        hijos.set(c.id, new Set());
    }

    for (const c of celdas || []) {
        if (c.tipo !== 'sql') continue;
        for (const nombre of analisis?.[c.id]?.lee || []) {
            const padre = deQuien.get(llave(nombre));
            // Sin padre es una tabla de verdad, un archivo o algo de fuera: no
            // es una dependencia del cuaderno y no se inventa una.
            if (!padre || padre === c.id) continue;
            padres.get(c.id).add(padre);
            hijos.get(padre).add(c.id);
        }
    }

    return { padres, hijos, deQuien };
}

/**
 * En qué estado está cada celda respecto de lo que se ejecutó.
 *
 * ## Se compara la consulta YA RESUELTA, no la escrita
 *
 * Porque cambiar el valor de un parámetro cambia la consulta sin tocar una sola
 * letra de la celda. Si se comparase el texto tal cual está escrito, mover
 * `desde` de septiembre a agosto dejaría todas las celdas «al día» enseñando las
 * cifras de septiembre — que es exactamente el número viejo con pinta de nuevo
 * que esta parte existe para evitar.
 *
 * @param {Array} celdas
 * @param {object} grafo el de `construirGrafo`
 * @param {Object} ejecuciones mapa `id -> {en: number, sql: string}` (sql resuelto)
 * @param {Object} [textos] mapa `id -> sql resuelto de ahora`; sin él se usa el escrito
 * @returns {Map<string,'nunca'|'dia'|'cambiada'|'arriba'>}
 */
export function frescura(celdas, grafo, ejecuciones, textos) {
    const estado = new Map();
    const orden = ordenTopologico(celdas, grafo);
    const enDeps = new Map(); // id -> instante de la última ejecución

    for (const id of orden) {
        const celda = (celdas || []).find((c) => c.id === id);
        if (!celda || celda.tipo !== 'sql') continue;
        const e = ejecuciones?.[id];
        enDeps.set(id, e?.en ?? 0);

        if (!e) { estado.set(id, 'nunca'); continue; }
        const ahora = textos?.[id] ?? celda.contenido;
        if (String(ahora || '') !== String(e.sql || '')) { estado.set(id, 'cambiada'); continue; }

        // Se mira hacia arriba. Basta con los padres directos porque el recorrido
        // es topológico: lo que le pasara al abuelo ya marcó al padre.
        let desfasada = false;
        for (const padre of grafo.padres.get(id) || []) {
            const dePadre = estado.get(padre);
            // Un padre que no está al día contamina: lo que hay puesto en la
            // sesión con su nombre no es lo que el documento dice que es.
            if (dePadre && dePadre !== 'dia') { desfasada = true; break; }
            if ((enDeps.get(padre) ?? 0) > e.en) { desfasada = true; break; }
        }
        estado.set(id, desfasada ? 'arriba' : 'dia');
    }

    // Las que el recorrido no alcanzó —celdas de texto, o atrapadas en un ciclo—
    // no se quedan sin respuesta.
    for (const c of celdas || []) {
        if (c.tipo === 'sql' && !estado.has(c.id)) estado.set(c.id, ejecuciones?.[c.id] ? 'arriba' : 'nunca');
    }
    return estado;
}

/**
 * El orden en que hay que ejecutar: primero lo de lo que los demás cuelgan.
 *
 * Las celdas atrapadas en un ciclo van al final en el orden del documento. Un
 * ciclo no tiene un orden correcto; dejarlas fuera sería peor, porque
 * desaparecerían de «Actualizar» sin decir nada.
 */
export function ordenTopologico(celdas, grafo) {
    const ids = (celdas || []).filter((c) => c.tipo === 'sql').map((c) => c.id);
    const enJuego = new Set(ids);
    const pendientes = new Map();
    for (const id of ids) {
        pendientes.set(id, [...(grafo.padres.get(id) || [])].filter((p) => enJuego.has(p)).length);
    }

    const salida = [];
    // Se recorre en orden del documento para que dos celdas sin relación entre
    // sí salgan como están escritas, que es lo que quien mira espera.
    let movido = true;
    while (movido) {
        movido = false;
        for (const id of ids) {
            if (pendientes.get(id) !== 0) continue;
            pendientes.set(id, -1);
            salida.push(id);
            movido = true;
            for (const hijo of grafo.hijos.get(id) || []) {
                if (pendientes.get(hijo) > 0) pendientes.set(hijo, pendientes.get(hijo) - 1);
            }
        }
    }

    for (const id of ids) if (pendientes.get(id) > 0) salida.push(id);
    return salida;
}

/** Los ciclos que impiden ordenar, para poder decirlo en vez de callarlo. */
export function celdasEnCiclo(celdas, grafo) {
    const orden = ordenTopologico(celdas, grafo);
    const ids = (celdas || []).filter((c) => c.tipo === 'sql').map((c) => c.id);
    const colocadas = new Set();
    const pendientes = new Map();
    for (const id of ids) {
        pendientes.set(id, [...(grafo.padres.get(id) || [])].filter((p) => ids.includes(p)).length);
    }
    for (const id of orden) {
        if (pendientes.get(id) === 0) {
            colocadas.add(id);
            for (const hijo of grafo.hijos.get(id) || []) {
                if (pendientes.get(hijo) > 0) pendientes.set(hijo, pendientes.get(hijo) - 1);
            }
        }
    }
    return ids.filter((id) => !colocadas.has(id));
}

/**
 * Qué hay que ejecutar y en qué orden.
 *
 * Entra todo lo que no está al día **y todo lo que cuelga de ello**, aunque el
 * hijo pareciera al día por su cuenta: ejecutar el padre le cambia el suelo.
 * Una celda sin relación con lo que cambió no se toca.
 *
 * ## También entra lo que falta, no sólo lo que se quedó viejo
 *
 * Al reabrir el cuaderno al día siguiente **ninguna celda está desactualizada**:
 * están todas sin ejecutar, que no es lo mismo. Pero la sesión está vacía, la
 * barra lo dice, y lo que quien abre quiere es volver a ponerlo. Si «Actualizar»
 * sólo mirara lo desfasado, en el caso más común del mundo no haría nada.
 *
 * Así que una celda sin ejecutar entra **si no hay nada que enseñar, o si su
 * vista no está viva**.
 *
 * Las dos condiciones, y la primera es la que faltaba. Cerrar la pestaña y
 * volver a abrir el mismo archivo **sin cerrar la aplicación** deja la sesión
 * intacta —las vistas siguen vivas— pero los resultados no vuelven: viven en
 * memoria y a propósito, porque guardarlos haría que un cuaderno reabierto se
 * diera por ejecutado sobre una sesión que podría estar vacía. Mirando sólo las
 * vistas, «Actualizar» se apagaba entero mientras las dieciséis celdas decían
 * «Sin ejecutar». Las dos cosas eran ciertas y juntas no servían de nada.
 *
 * Ejecutar una celda cuyo resultado no está en pantalla **no es sólo un efecto**:
 * es lo único que lo pone. Que la vista ya estuviera puesta no lo cambia.
 *
 * ## Lo que escribe en disco se aparta, y se dice
 *
 * Aquí el código se inclina al revés que en el marcado. Marcar de más cuesta una
 * ejecución; **ejecutar de más un `INSERT` duplica filas**, y eso no se deshace
 * cerrando el proyecto. Una celda que escribe en disco se aparta de la lista y
 * se devuelve por separado, para que se pueda decir en vez de callarlo.
 *
 * @param {Object} [opciones]
 * @param {Set<string>} [opciones.vivas] nombres vivos, en minúsculas
 * @param {Object} [opciones.analisis] mapa `id -> analizarCelda(...)`
 * @param {Set<string>} [opciones.conResultado] ids que YA enseñan algo en pantalla
 * @returns {{orden: Array<string>, apartadas: Array<{id: string, motivo: string}>}}
 */
export function queActualizar(celdas, grafo, estado, { vivas, analisis, conResultado } = {}) {
    const porId = new Map((celdas || []).map((c) => [c.id, c]));
    const hayQue = new Set();

    for (const [id, e] of estado) {
        if (e === 'cambiada' || e === 'arriba') { hayQue.add(id); continue; }
        if (e !== 'nunca') continue;

        // Sin ejecutar y sin nada en pantalla: entra. Es el caso de reabrir el
        // archivo, y ejecutarla es lo único que llena la celda.
        if (conResultado && !conResultado.has(id)) { hayQue.add(id); continue; }

        // Y si hay algo en pantalla, entra sólo si lo que debería dejar puesto
        // no está. Una celda sin nombre no deja nada, así que ahí ejecutarla
        // sería sólo un efecto.
        const nombre = llave(porId.get(id)?.nombre);
        if (vivas && nombre && !vivas.has(nombre)) hayQue.add(id);
    }

    // Arrastre hacia abajo: los hijos de algo que se va a ejecutar también.
    const cola = [...hayQue];
    while (cola.length) {
        for (const hijo of grafo.hijos.get(cola.pop()) || []) {
            if (hayQue.has(hijo)) continue;
            hayQue.add(hijo);
            cola.push(hijo);
        }
    }

    const apartadas = [];
    const orden = [];
    for (const id of ordenTopologico(celdas, grafo)) {
        if (!hayQue.has(id)) continue;
        if (analisis?.[id]?.escribe === 'disco') {
            apartadas.push({ id, motivo: 'escribe' });
            continue;
        }
        orden.push(id);
    }
    return { orden, apartadas };
}
