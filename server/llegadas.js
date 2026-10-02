/**
 * El archivo que acaba de llegar (C3, fase 3 del plan de la 5.10).
 *
 * Un vigilante por cada carpeta de fuente del proyecto abierto (sin entrar en
 * subcarpetas salvo que la fuente lo pida). Cuando algo que casa con el patrón
 * aparece o cambia, se espera a que esté QUIETO —el mismo tamaño y la misma
 * fecha durante unos segundos (Dec-14)—: una carpeta sincronizada escribe el
 * archivo en varias pasadas, y contarlo a medias sería leer medio Excel.
 * Entonces se avisa una vez por archivo y versión; quien escucha rehace la
 * vista y se lo dice al usuario.
 *
 * Sin la aplicación abierta no hay vigilante, y no hace falta: una ejecución
 * de Data Flow o de la línea de comandos monta su catálogo al empezar, y eso
 * ya elige el más reciente (3.4).
 */
const fs = require('fs');
const path = require('path');
const { ESTABLE_MS, esTemporal, globARegex } = require('./fuentes');

const SONDEO_MS = 1000;
const ESPERA_MAXIMA_MS = 10 * 60 * 1000;   // una copia de 10 minutos ya es otra cosa

let vigilantes = [];          // [{ clave, watcher }]
let pendientes = new Map();   // ruta → timer
let vistos = new Map();       // ruta → 'tamano:mtime' ya avisado

function parar() {
    for (const v of vigilantes) { try { v.watcher.close(); } catch { /* ya cerrado */ } }
    vigilantes = [];
    for (const t of pendientes.values()) clearTimeout(t);
    pendientes = new Map();
}

/**
 * Espera a que el archivo deje de moverse y entonces avisa. Un archivo que
 * desaparece mientras tanto (un temporal que se renombra) no se avisa.
 */
function esperarQuieto(ruta, alLlegar, info) {
    clearTimeout(pendientes.get(ruta));
    const inicio = Date.now();
    let anterior = null;
    let desde = Date.now();
    const mirar = () => {
        let st;
        try { st = fs.statSync(ruta); } catch { pendientes.delete(ruta); return; }
        if (!st.isFile()) { pendientes.delete(ruta); return; }
        const firma = `${st.size}:${Math.round(st.mtimeMs)}`;
        if (firma !== anterior) { anterior = firma; desde = Date.now(); }
        const quieto = st.size > 0 && Date.now() - desde >= ESTABLE_MS && Date.now() - st.mtimeMs >= ESTABLE_MS;
        if (quieto) {
            pendientes.delete(ruta);
            if (vistos.get(ruta) === firma) return;        // esta versión ya se avisó
            vistos.set(ruta, firma);
            try { alLlegar({ ...info, ruta, archivo: path.basename(ruta), tamano: st.size, modificada: st.mtime.toISOString() }); } catch { /* quien escucha reporta */ }
            return;
        }
        if (Date.now() - inicio > ESPERA_MAXIMA_MS) { pendientes.delete(ruta); return; }
        pendientes.set(ruta, setTimeout(mirar, SONDEO_MS));
    };
    pendientes.set(ruta, setTimeout(mirar, SONDEO_MS));
}

/**
 * Vigila estas carpetas, y sólo estas (lo anterior se para).
 * @param {Array<{ fuente, dir, patron, subcarpetas }>} carpetas
 * @param {(llegada) => void} alLlegar
 */
function vigilar(carpetas, alLlegar) {
    parar();
    // Lo que ya está quieto en la carpeta al empezar no «llega»: se anota como
    // visto. Lo que todavía se está escribiendo sí: se espera a que pare, porque
    // puede que no vuelva a producir ningún evento.
    for (const c of carpetas) {
        const re = globARegex(c.patron);
        try {
            for (const n of fs.readdirSync(c.dir)) {
                if (esTemporal(n) || !re.test(n)) continue;
                const abs = path.join(c.dir, n);
                let st;
                try { st = fs.statSync(abs); } catch { continue; }
                if (!st.isFile()) continue;
                const firma = `${st.size}:${Math.round(st.mtimeMs)}`;
                if (Date.now() - st.mtimeMs >= ESTABLE_MS && st.size > 0) {
                    if (!vistos.has(abs)) vistos.set(abs, firma);
                } else if (vistos.get(abs) !== firma) {
                    esperarQuieto(abs, alLlegar, { fuentes: carpetas.filter(x => path.resolve(x.dir) === path.resolve(c.dir) && globARegex(x.patron).test(n)).map(x => x.fuente) });
                }
            }
        } catch { /* carpeta ilegible */ }
    }
    const porCarpeta = new Map();
    for (const c of carpetas) {
        const k = `${path.resolve(c.dir).toLowerCase()}|${!!c.subcarpetas}`;
        if (!porCarpeta.has(k)) porCarpeta.set(k, { dir: c.dir, subcarpetas: !!c.subcarpetas, fuentes: [] });
        porCarpeta.get(k).fuentes.push({ fuente: c.fuente, re: globARegex(c.patron) });
    }
    for (const [clave, g] of porCarpeta) {
        let watcher;
        try {
            watcher = fs.watch(g.dir, { recursive: g.subcarpetas }, (_evento, nombre) => {
                if (!nombre) return;
                const base = path.basename(String(nombre));
                if (esTemporal(base)) return;
                const cuales = g.fuentes.filter(f => f.re.test(base)).map(f => f.fuente);
                if (!cuales.length) return;
                esperarQuieto(path.join(g.dir, String(nombre)), alLlegar, { fuentes: cuales });
            });
            watcher.on('error', () => { /* la carpeta dejó de responder: se calla */ });
            vigilantes.push({ clave, watcher });
        } catch { /* no se puede vigilar (montaje de red…): se lee al montar */ }
    }
    return vigilantes.length;
}

module.exports = { vigilar, parar };
