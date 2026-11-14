/**
 * Lo que el servidor cuenta de sí mismo, con nivel (6.0, M7; auditoría P4).
 *
 *     AMOXSQL_LOG=error | aviso | info | depurar     (por defecto: info)
 *
 * Hasta la 5.19 todo iba a `console.*` sin filtro: para diagnosticar había que
 * leerlo todo, y no había forma de pedir más detalle ni de callar lo rutinario.
 * Ahora cada línea lleva su hora y su nivel, y `AMOXSQL_LOG` decide hasta dónde
 * se escribe:
 *   - error    sólo lo que falló
 *   - aviso    + lo que no salió como se esperaba pero siguió
 *   - info     + lo que el servidor hace (abrir una base, montar fuentes…) — lo de siempre
 *   - depurar  + el detalle (cada consulta interna, cada paso), para diagnosticar
 *
 * El nivel se lee en cada línea (no al cargar), así una prueba o el proceso
 * principal pueden cambiarlo sin reiniciar. La salida sigue yendo a stdout/stderr,
 * que el proceso principal hereda: nada la analiza, así que el formato puede crecer.
 */
const NIVELES = { error: 0, aviso: 1, info: 2, depurar: 3 };

function nivelActual() {
    const n = NIVELES[String(process.env.AMOXSQL_LOG || '').trim().toLowerCase()];
    return n === undefined ? NIVELES.info : n;
}

const hora = () => {
    const d = new Date();
    const dos = (x) => String(x).padStart(2, '0');
    return `${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};

const escribir = (nivel, salida, etiqueta) => (...partes) => {
    if (NIVELES[nivel] > nivelActual()) return;
    salida(`${hora()} ${etiqueta}`, ...partes);
};

module.exports = {
    error: escribir('error', (...a) => console.error(...a), 'ERROR'),
    aviso: escribir('aviso', (...a) => console.warn(...a), 'aviso'),
    info: escribir('info', (...a) => console.log(...a), 'info '),
    depurar: escribir('depurar', (...a) => console.log(...a), 'debug'),
    nivelActual,
    NIVELES,
};
