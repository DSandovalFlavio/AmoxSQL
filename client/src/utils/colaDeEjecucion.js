/**
 * **La ejecución es de la pestaña** (Dec-84, Dec-85).
 *
 * Había un solo `runningQueryId` para toda la aplicación. Con una consulta en
 * marcha, todas las pestañas enseñaban Stop; y lanzar otra pisaba el id, de modo
 * que Stop cancelaba la nueva y la primera seguía corriendo sin ningún botón que
 * la parara, con la conexión ocupada.
 *
 * Las consultas no van en paralelo a propósito: comparten la sesión de DuckDB
 * porque las vistas temporales, las variables y las macros son de la sesión, y
 * de eso viven el cuaderno y el Lienzo. Así que se encolan, y la cola se ve.
 *
 * Puro: ni React ni red. Lo usa LayoutManager y lo prueba
 * `scripts/probarInteraccion.mjs`.
 *
 *   alCambiar(tabId, info | null)   info = { estado: 'corriendo' } | { estado: 'en_espera', tras }
 *   nombreDe(tabId)                 el nombre que se enseña en «en espera de…»
 *   cancelarEnServidor(queryId)     interrumpe la consulta en el motor
 */
export function crearCola({ alCambiar, nombreDe = (id) => id, cancelarEnServidor = () => {} }) {
    const espera = [];
    let actual = null;
    const avisado = new Map();

    const avisar = (tabId, info) => {
        const previo = avisado.get(tabId);
        if (JSON.stringify(previo ?? null) === JSON.stringify(info)) return;
        if (info) avisado.set(tabId, info); else avisado.delete(tabId);
        alCambiar(tabId, info);
    };

    const repartir = () => {
        if (actual) avisar(actual.tabId, { estado: 'corriendo' });
        const tras = actual ? nombreDe(actual.tabId) : null;
        for (const e of espera) avisar(e.tabId, { estado: 'en_espera', tras });
    };

    const siguiente = () => {
        if (actual || espera.length === 0) { repartir(); return; }
        const e = espera.shift();
        actual = e;
        e.controller = new AbortController();
        repartir();
        // Lo que hace el trabajo no para la cola: ni un error ni un trabajo que
        // devuelve un valor raro pueden dejarla parada para siempre.
        Promise.resolve()
            .then(() => e.trabajo({
                signal: e.controller.signal,
                controller: e.controller,
                ponerQueryId: (id) => { e.queryId = id; },
            }))
            .then(e.resolver, (err) => e.resolver({ error: err?.message || String(err) }))
            .finally(() => {
                actual = null;
                avisar(e.tabId, null);
                siguiente();
            });
    };

    return {
        /**
         * Pone en la cola el trabajo de una pestaña. Una pestaña tiene como mucho
         * uno: si ya tiene otro, no se lanza y vuelve `{ yaEnMarcha: true }`.
         */
        poner(tabId, trabajo) {
            if (actual?.tabId === tabId || espera.some(e => e.tabId === tabId)) {
                return Promise.resolve({ cancelled: true, yaEnMarcha: true });
            }
            return new Promise((resolver) => {
                espera.push({ tabId, trabajo, resolver });
                siguiente();
            });
        },

        /** Cancela lo de ESA pestaña, y solo eso. Devuelve si había algo que cancelar. */
        cancelar(tabId) {
            if (actual?.tabId === tabId) {
                actual.controller.abort();
                if (actual.queryId) cancelarEnServidor(actual.queryId);
                return true;
            }
            const i = espera.findIndex(e => e.tabId === tabId);
            if (i < 0) return false;
            const [e] = espera.splice(i, 1);
            avisar(tabId, null);
            e.resolver({ cancelled: true });
            return true;
        },

        pestanas: () => [...(actual ? [actual.tabId] : []), ...espera.map(e => e.tabId)],
        estaOcupada: (tabId) => actual?.tabId === tabId || espera.some(e => e.tabId === tabId),
    };
}

/** Qué marca deja en la pestaña un trabajo que termina con ella en segundo plano. */
export function marcaAlTerminar(resultado) {
    if (!resultado || resultado.cancelled) return null;
    if (resultado.error || resultado.failCount > 0) return 'error';
    return 'ok';
}
