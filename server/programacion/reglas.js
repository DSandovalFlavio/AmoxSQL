/**
 * reglas.js — cuándo toca un proceso programado (5.11, D1; Dec-18 del plan).
 *
 * Reglas legibles, no cron:
 *
 *   { tipo: 'diaria',  hora: '07:00', dias?: [1..7], soloHabiles?: true }
 *   { tipo: 'semanal', hora: '07:00', dia: 1..7 }                 (1 = lunes)
 *   { tipo: 'mensual', hora: '07:00', modo: 'dia', dia: 1..31 }   (si el mes no lo tiene, el último)
 *   { tipo: 'mensual', hora: '07:00', modo: 'primer_habil' | 'ultimo_habil' }
 *   { tipo: 'mensual', hora: '07:00', modo: 'habil_n', dia: N }   (el N-ésimo día hábil)
 *   { tipo: 'cada', horas: N, desde: '08:00', hasta: '18:00', dias?: [1..7] }
 *   { tipo: 'al_llegar', fuente: 'nombre' }                        (D8: no tiene horas)
 *
 * El calendario dice qué días se trabaja y cuáles son festivos:
 *   { laborables: [1, 2, 3, 4, 5], festivos: ['2026-12-25', …] }
 *
 * Todo en la hora de esta máquina. Un cambio de horario: una hora que no existe
 * (la 2:30 del día que se adelanta) cae en la siguiente que sí; una que pasa dos
 * veces cuenta una vez. Funciones puras: la hora «ahora» siempre se recibe.
 */

const CALENDARIO_POR_DEFECTO = Object.freeze({ laborables: [1, 2, 3, 4, 5], festivos: [] });
const DIAS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MAX_DIAS = 800;     // hasta dónde se busca la próxima (más de dos años)

class ErrorDeRegla extends Error {}

const dos = (n) => String(n).padStart(2, '0');
const isoDia = (d) => ((d.getDay() + 6) % 7) + 1;          // 1 = lunes … 7 = domingo
const claveDia = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;

function leerHora(h, campo = 'time') {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(h || '').trim());
    if (!m || +m[1] > 23 || +m[2] > 59) throw new ErrorDeRegla(`The ${campo} is written as HH:MM (for example 07:00).`);
    return { h: +m[1], m: +m[2] };
}

function normalizarCalendario(c) {
    const lab = Array.isArray(c?.laborables) ? [...new Set(c.laborables.map(Number).filter(n => n >= 1 && n <= 7))].sort() : CALENDARIO_POR_DEFECTO.laborables;
    const fest = Array.isArray(c?.festivos) ? [...new Set(c.festivos.map(String).filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f)))].sort() : [];
    return { laborables: lab.length ? lab : CALENDARIO_POR_DEFECTO.laborables, festivos: fest };
}

function esHabil(fecha, cal = CALENDARIO_POR_DEFECTO) {
    const c = normalizarCalendario(cal);
    return c.laborables.includes(isoDia(fecha)) && !c.festivos.includes(claveDia(fecha));
}

/** La regla, comprobada y limpia. Lanza ErrorDeRegla con lo que falta. */
function normalizar(r) {
    if (!r || typeof r !== 'object') throw new ErrorDeRegla('Say when it runs.');
    const dias = (v) => (Array.isArray(v) && v.length ? [...new Set(v.map(Number).filter(n => n >= 1 && n <= 7))].sort() : undefined);
    switch (r.tipo) {
        case 'diaria': {
            leerHora(r.hora);
            const d = dias(r.dias);
            return { tipo: 'diaria', hora: r.hora.trim().padStart(5, '0'), ...(d ? { dias: d } : {}), ...(r.soloHabiles ? { soloHabiles: true } : {}) };
        }
        case 'semanal': {
            leerHora(r.hora);
            const dia = Number(r.dia);
            if (!(dia >= 1 && dia <= 7)) throw new ErrorDeRegla('Choose the day of the week.');
            return { tipo: 'semanal', hora: r.hora.trim().padStart(5, '0'), dia };
        }
        case 'mensual': {
            leerHora(r.hora);
            const modo = ['dia', 'primer_habil', 'ultimo_habil', 'habil_n'].includes(r.modo) ? r.modo : 'dia';
            const out = { tipo: 'mensual', hora: r.hora.trim().padStart(5, '0'), modo };
            if (modo === 'dia' || modo === 'habil_n') {
                const dia = Number(r.dia);
                const max = modo === 'dia' ? 31 : 23;
                if (!(Number.isInteger(dia) && dia >= 1 && dia <= max)) throw new ErrorDeRegla(modo === 'dia' ? 'Choose the day of the month (1 to 31).' : 'Choose which business day (1 to 23).');
                out.dia = dia;
            }
            return out;
        }
        case 'cada': {
            const horas = Number(r.horas);
            if (!(Number.isInteger(horas) && horas >= 1 && horas <= 12)) throw new ErrorDeRegla('Every 1 to 12 hours.');
            const desde = leerHora(r.desde || '00:00', 'start time'), hasta = leerHora(r.hasta || '23:59', 'end time');
            if (hasta.h * 60 + hasta.m < desde.h * 60 + desde.m) throw new ErrorDeRegla('The end time is before the start time.');
            const d = dias(r.dias);
            return { tipo: 'cada', horas, desde: (r.desde || '00:00').trim().padStart(5, '0'), hasta: (r.hasta || '23:59').trim().padStart(5, '0'), ...(d ? { dias: d } : {}) };
        }
        case 'al_llegar': {
            const f = String(r.fuente || '').trim();
            if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(f)) throw new ErrorDeRegla('Choose the folder source whose files trigger it.');
            return { tipo: 'al_llegar', fuente: f };
        }
        default:
            throw new ErrorDeRegla('Unknown kind of schedule.');
    }
}

const enHora = (dia, { h, m }) => new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), h, m, 0, 0);

/** Los días hábiles de un mes, en orden. */
function habilesDelMes(anio, mes, cal) {
    const out = [];
    for (let d = new Date(anio, mes, 1); d.getMonth() === mes; d = new Date(anio, mes, d.getDate() + 1)) {
        if (esHabil(d, cal)) out.push(d);
    }
    return out;
}

/** Las horas a las que toca un día concreto (ordenadas). */
function horasDelDia(regla, dia, cal) {
    const r = regla;
    switch (r.tipo) {
        case 'diaria':
            if (r.dias && !r.dias.includes(isoDia(dia))) return [];
            if (r.soloHabiles && !esHabil(dia, cal)) return [];
            return [enHora(dia, leerHora(r.hora))];
        case 'semanal':
            return isoDia(dia) === r.dia ? [enHora(dia, leerHora(r.hora))] : [];
        case 'mensual': {
            const y = dia.getFullYear(), mo = dia.getMonth();
            let objetivo = null;
            if (r.modo === 'dia') {
                const ultimo = new Date(y, mo + 1, 0).getDate();
                objetivo = new Date(y, mo, Math.min(r.dia, ultimo));
            } else {
                const hab = habilesDelMes(y, mo, cal);
                if (r.modo === 'primer_habil') objetivo = hab[0] || null;
                else if (r.modo === 'ultimo_habil') objetivo = hab[hab.length - 1] || null;
                else objetivo = hab[r.dia - 1] || null;
            }
            return objetivo && claveDia(objetivo) === claveDia(dia) ? [enHora(dia, leerHora(r.hora))] : [];
        }
        case 'cada': {
            if (r.dias && !r.dias.includes(isoDia(dia))) return [];
            const a = leerHora(r.desde), b = leerHora(r.hasta);
            const out = [];
            for (let min = a.h * 60 + a.m; min <= b.h * 60 + b.m; min += r.horas * 60) out.push(enHora(dia, { h: Math.floor(min / 60), m: min % 60 }));
            return out;
        }
        default:
            return [];
    }
}

/** La primera ocurrencia estrictamente después de `desde`. null si no hay (al_llegar). */
function siguiente(regla, desde, cal = CALENDARIO_POR_DEFECTO) {
    const r = normalizar(regla);
    if (r.tipo === 'al_llegar') return null;
    const inicio = new Date(desde);
    for (let i = 0; i < MAX_DIAS; i++) {
        const dia = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
        for (const t of horasDelDia(r, dia, cal)) if (t > inicio) return t;
    }
    return null;
}

/** Las ocurrencias en (desde, hasta], en orden. Como mucho `limite`. */
function ocurrencias(regla, desde, hasta, cal = CALENDARIO_POR_DEFECTO, limite = 1000) {
    const out = [];
    const fin = new Date(hasta);
    let t = new Date(desde);
    while (out.length < limite) {
        t = siguiente(regla, t, cal);
        if (!t || t > fin) break;
        // Una hora que se repite (cambio de horario) cuenta una vez.
        if (!out.length || out[out.length - 1].getTime() !== t.getTime()) out.push(t);
    }
    return out;
}

/** Las próximas `n`, para enseñarlas mientras se escribe la regla. */
const proximas = (regla, ahora, cal, n = 5) => {
    const out = [];
    let t = new Date(ahora);
    for (let i = 0; i < n; i++) { t = siguiente(regla, t, cal); if (!t) break; out.push(t); }
    return out;
};

const ORDINAL = (n) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
const listaDias = (d) => {
    const s = (d || []).join(',');
    if (!d || d.length === 7) return 'every day';
    if (s === '1,2,3,4,5') return 'Monday to Friday';
    if (s === '6,7') return 'on weekends';
    return `on ${d.map(x => DIAS[x]).join(', ')}`;
};

/** La regla en una frase: «Every month, on the 1st business day, at 07:00». */
function describir(regla) {
    const r = normalizar(regla);
    switch (r.tipo) {
        case 'diaria': return `${r.soloHabiles ? 'Every business day' : r.dias ? `Every week, ${listaDias(r.dias)}` : 'Every day'}, at ${r.hora}`;
        case 'semanal': return `Every ${DIAS[r.dia]}, at ${r.hora}`;
        case 'mensual':
            if (r.modo === 'dia') return `Every month, on day ${r.dia}${r.dia > 28 ? ' (or the last day)' : ''}, at ${r.hora}`;
            if (r.modo === 'primer_habil') return `Every month, on the first business day, at ${r.hora}`;
            if (r.modo === 'ultimo_habil') return `Every month, on the last business day, at ${r.hora}`;
            return `Every month, on the ${ORDINAL(r.dia)} business day, at ${r.hora}`;
        case 'cada': return `Every ${r.horas === 1 ? 'hour' : `${r.horas} hours`} from ${r.desde} to ${r.hasta}${r.dias ? `, ${listaDias(r.dias)}` : ''}`;
        case 'al_llegar': return `When a new file arrives in the source "${r.fuente}"`;
        default: return '';
    }
}

module.exports = {
    ErrorDeRegla, CALENDARIO_POR_DEFECTO, normalizar, normalizarCalendario, esHabil,
    siguiente, ocurrencias, proximas, describir, claveDia, isoDia,
};
