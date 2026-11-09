/**
 * Deep Dive como informe (plan UX, entrega 2: F2 + F3 + F4). Puro: sin React.
 *
 * Convierte los turnos de la conversación en lo que una persona lee:
 *
 *   episodio = una pregunta tuya y lo que el analista hizo con ella
 *     pregunta · respuesta (la conclusión, si ya existe) · intro ·
 *     secciones (una por paso del plan, con su narración, sus gráficos y su
 *     conclusión, en el orden en que pasaron) · lo que necesita de ti
 *
 * **Por qué hace falta `textOffset`.** Una ejecución se guarda como UN mensaje:
 * toda la prosa en `content` y todas las herramientas en `toolCalls`. Sin saber
 * en qué punto del texto ocurrió cada llamada no hay forma de decir qué párrafo
 * narra qué paso. `useAiChat` lo anota al recibir cada llamada. Las sesiones
 * anteriores no lo tienen: su prosa va entera antes de los pasos (como antes),
 * y los pasos siguen teniendo sus gráficos y conclusiones.
 *
 * Un mensaje del usuario que **continúa** el plan («Continue the plan…», la
 * respuesta a una pregunta del analista, o un mensaje tras el que el agente sigue
 * los pasos del plan anterior sin crear otro) no abre un episodio nuevo: se une
 * al anterior.
 */
import { extractReasoning, stripThink } from './deepDiveTurns.js';

const PLAN = new Set(['create_plan', 'update_plan']);
const FUERA_DEL_INFORME = new Set(['final_answer', 'suggest_followups', 'ask_user', 'amox_interrupcion', 'amox_indicacion']);
const CONTINUACION = /^(continue the plan|continue where you left off|finish the analysis now)/i;

const PROVEEDOR = { gemini: 'Gemini', anthropic: 'Anthropic', openai: 'OpenAI', vertex: 'Google Vertex', ollama: 'Ollama' };

/**
 * Why a run stopped short, in words (F9). Shared by the report and the decision card.
 * @returns {{ titulo: string, ayuda: string }}
 */
export function textoDeInterrupcion(i) {
    if (!i) return null;
    const p = PROVEEDOR[i.proveedor] || 'The model provider';
    if (i.motivo === 'detenido') return { titulo: 'You stopped the analysis.', ayuda: '' };
    if (i.motivo === 'ventana') return { titulo: 'The window closed in the middle of the analysis.', ayuda: 'Its last checkpoint was recovered. Continue to finish it.' };
    if (i.motivo === 'cuota' && i.diaria) {
        return { titulo: `${p}'s daily quota ran out.`, ayuda: 'Waiting won\'t help today. Pick another model in the box below and continue, or continue tomorrow.' };
    }
    if (i.motivo === 'cuota') {
        return { titulo: `${p}'s quota ran out.`, ayuda: 'Free tiers allow only a few requests a minute. Continue in a moment, or pick another model in the box below.' };
    }
    return { titulo: 'The model failed in the middle of the analysis.', ayuda: 'Continue to try again from where it stopped, or pick another model in the box below.' };
}

/** Los trozos de una respuesta del analista, en el orden en que ocurrieron. */
export function eventosDeTurno(turn) {
    const eventos = [];
    for (const m of turn?.messages || []) {
        const texto = String(m.content || '');
        const tools = m.toolCalls || [];
        const conPosicion = tools.length > 0 && tools.every(tc => Number.isFinite(tc.textOffset));
        if (!conPosicion) {
            // Sin posiciones: el texto del mensaje va antes que sus herramientas.
            if (texto) eventos.push({ tipo: 'texto', texto });
            for (const tc of tools) eventos.push({ tipo: 'tool', tc });
            continue;
        }
        let desde = 0;
        for (const tc of tools) {
            const hasta = Math.min(Math.max(tc.textOffset, desde), texto.length);
            if (hasta > desde) eventos.push({ tipo: 'texto', texto: texto.slice(desde, hasta) });
            eventos.push({ tipo: 'tool', tc });
            desde = hasta;
        }
        if (desde < texto.length) eventos.push({ tipo: 'texto', texto: texto.slice(desde) });
    }
    return eventos;
}

function nuevaSeccion(key, { stepId = null, numero = null, titulo = null } = {}) {
    return { key, stepId, numero, titulo, estado: null, nota: null, bloques: [], razonamiento: [], herramientas: [] };
}

/** Un trozo de texto: el razonamiento aparte, la prosa visible como bloque. */
function anadirTexto(destino, texto) {
    destino.razonamiento.push(...extractReasoning(texto));
    const visible = stripThink(texto);
    if (!visible.trim()) return null;
    const ultimo = destino.bloques[destino.bloques.length - 1];
    if (ultimo?.tipo === 'texto') { ultimo.texto += visible; return ultimo; }
    const b = { tipo: 'texto', texto: visible };
    destino.bloques.push(b);
    return b;
}

function esContinuacion(textoUsuario, eventos, anterior) {
    if (!anterior) return false;
    if (CONTINUACION.test(String(textoUsuario || '').trim())) return true;
    if (anterior.esperaba === 'pregunta') return true; // contestaba al analista
    const tools = eventos.filter(e => e.tipo === 'tool').map(e => e.tc);
    if (tools.some(tc => tc.toolName === 'create_plan')) return false;
    const pasosPrevios = new Set((anterior.plan?.pasos || []).map(p => p.id));
    return tools.some(tc => tc.toolName === 'update_plan' && pasosPrevios.has(tc.args?.step_id));
}

/**
 * @param {Array} turns  de `groupIntoTurns` (+ el turno en vivo)
 * @param {{ enCurso?: boolean, saltados?: Set<string> }} opciones
 * @returns {Array} episodios
 */
export function armarInforme(turns = [], { enCurso = false, saltados = new Set() } = {}) {
    const episodios = [];
    let ep = null;
    let ultimoTextoTrasHerramienta = []; // texto escrito desde la última herramienta

    const abrirEpisodio = (turnoUsuario) => {
        const id = turnoUsuario ? `ep-${turnoUsuario.id}` : `ep-${episodios.length}`;
        ep = {
            id,
            pregunta: turnoUsuario?.text || '',
            continuaciones: [],
            intro: nuevaSeccion(`${id}-intro`),
            plan: null,
            secciones: [],
            actual: null,
            respuesta: null,
            interrupcion: null,
            esperaba: null,
            enCurso: false,
        };
        episodios.push(ep);
    };

    const seccionDe = (stepId) => {
        let s = ep.secciones.find(x => x.stepId === stepId);
        if (!s) {
            const p = ep.plan?.pasos.find(x => x.id === stepId);
            s = nuevaSeccion(`${ep.id}-${stepId}`, { stepId, numero: p?.numero ?? null, titulo: p?.descripcion || (p?.numero ? `Step ${p.numero}` : 'Step') });
            ep.secciones.push(s);
        }
        return s;
    };
    const exploracion = () => {
        let s = ep.secciones.find(x => x.key === `${ep.id}-explorar`);
        if (!s) {
            s = nuevaSeccion(`${ep.id}-explorar`, { titulo: ep.plan ? 'Looking at the data' : null });
            ep.secciones.push(s);
        }
        return s;
    };

    for (let ti = 0; ti < turns.length; ti++) {
        const turn = turns[ti];
        if (turn.type === 'user') {
            ultimoTextoTrasHerramienta = [];
            // ¿Continúa el plan anterior? Mira el turno del analista que le sigue.
            const siguiente = turns[ti + 1];
            const eventosSig = siguiente?.type === 'ai' ? eventosDeTurno(siguiente) : [];
            if (ep && esContinuacion(turn.text, eventosSig, ep)) {
                ep.continuaciones.push(turn.text);
                const destino = ep.actual || ep.intro;
                destino.bloques.push({ tipo: 'usuario', texto: turn.text, tras: ep.interrupcion || null });
                ep.esperaba = null;
                ep.interrupcion = null; // it went on: only the latest stop counts
            } else {
                abrirEpisodio(turn);
            }
            continue;
        }
        if (!ep) abrirEpisodio(null);
        if (turn.inProgress) ep.enCurso = true;

        for (const ev of eventosDeTurno(turn)) {
            if (ev.tipo === 'texto') {
                // Sin plan todo va, en orden, a una sola sección sin título (una
                // respuesta corta se lee como texto y gráficos intercalados).
                const destino = ep.actual || exploracion();
                const b = anadirTexto(destino, ev.texto);
                if (b) ultimoTextoTrasHerramienta.push({ destino, bloque: b, texto: stripThink(ev.texto) });
                continue;
            }
            const tc = ev.tc;
            const nombre = tc.toolName;
            if (nombre === 'create_plan') {
                const pasos = (tc.args?.steps || tc.result?.steps || []).map((s, i) => ({ id: s.id, descripcion: s.description || '', numero: i + 1 }));
                // Lo que pasó antes del plan (el planteamiento, una mirada a las
                // tablas) es la introducción del análisis, no un paso.
                const previa = ep.secciones.find(x => x.key === `${ep.id}-explorar`);
                if (previa && !ep.plan) {
                    ep.intro.bloques.push(...previa.bloques);
                    ep.intro.razonamiento.push(...previa.razonamiento);
                    ep.intro.herramientas.push(...previa.herramientas);
                    ep.secciones = ep.secciones.filter(x => x !== previa);
                    for (const x of ultimoTextoTrasHerramienta) if (x.destino === previa) x.destino = ep.intro;
                }
                ep.plan = { goal: tc.args?.goal || tc.result?.goal || '', pasos };
            } else if (nombre === 'update_plan') {
                const sid = tc.args?.step_id;
                if (sid) {
                    if (!ep.plan) ep.plan = { goal: '', pasos: [] };
                    if (!ep.plan.pasos.some(p => p.id === sid)) ep.plan.pasos.push({ id: sid, descripcion: '', numero: ep.plan.pasos.length + 1 });
                    const s = seccionDe(sid);
                    if (tc.args?.status) s.estado = tc.args.status;
                    if (tc.args?.note) s.nota = tc.args.note;
                    if (tc.args?.status === 'in_progress') ep.actual = s;
                    s.herramientas.push(tc);
                }
            } else if (nombre === 'final_answer') {
                if (tc.result) {
                    // La narración de cierre es el texto escrito justo antes de la
                    // conclusión: es la respuesta, no el último paso.
                    const prosa = ultimoTextoTrasHerramienta.map(x => x.texto).join('');
                    for (const { destino, bloque } of ultimoTextoTrasHerramienta) {
                        destino.bloques = destino.bloques.filter(b => b !== bloque);
                    }
                    ep.respuesta = { resultado: tc.result, prosa: prosa.trim() };
                }
            } else if (nombre === 'ask_user') {
                ep.esperaba = 'pregunta';
            } else if (nombre === 'amox_indicacion') {
                // An instruction you gave while it ran (F6): in the report where it was taken.
                const destino = ep.actual || exploracion();
                destino.bloques.push({ tipo: 'usuario', texto: tc.args?.texto || '', enVuelo: true });
            } else if (nombre === 'amox_interrupcion') {
                // The run stopped short (F9): what's above is kept; say why it stopped.
                ep.interrupcion = tc.result || { motivo: 'error' };
            } else if (!FUERA_DEL_INFORME.has(nombre)) {
                const destino = ep.actual || exploracion();
                destino.herramientas.push(tc);
                if (nombre === 'display_chart' && tc.result?.chartConfig) destino.bloques.push({ tipo: 'grafico', tc });
                else if (nombre === 'execute_sql') {
                    const ult = destino.bloques[destino.bloques.length - 1];
                    if (ult?.tipo === 'consultas') ult.tcs.push(tc);
                    else destino.bloques.push({ tipo: 'consultas', tcs: [tc] });
                }
            }
            if (!PLAN.has(nombre) || nombre === 'update_plan') ultimoTextoTrasHerramienta = [];
        }
    }

    // Estados que se leen: lo que concluyó, lo que nunca empezó, lo que se quedó a medias.
    for (const e of episodios) {
        const vivo = enCurso && e === episodios[episodios.length - 1];
        e.enCurso = vivo;
        const concluyo = !!e.respuesta;
        const estadoDe = (s) => {
            if (saltados.has(s.stepId) && s.estado !== 'done') return 'skipped';
            if (s.estado === 'in_progress' && !vivo) return concluyo ? 'done' : 'interrupted';
            return s.estado;
        };
        for (const s of e.secciones) s.estado = estadoDe(s);
        e.indice = (e.plan?.pasos || []).map(p => {
            const s = e.secciones.find(x => x.stepId === p.id);
            let estado = s?.estado || 'pending';
            if (saltados.has(p.id) && estado === 'pending') estado = 'skipped';
            if (estado === 'pending' && concluyo) estado = 'not_done';
            return { ...p, estado, nota: s?.nota || null, tieneSeccion: !!s };
        });
        // Secciones en el orden del plan; lo demás (explorar sin paso) delante.
        const orden = (s) => (s.numero == null ? -1 : s.numero);
        e.secciones = e.secciones
            .filter(s => s.bloques.length || s.nota || s.herramientas.some(tc => !PLAN.has(tc.toolName)))
            .sort((a, b) => orden(a) - orden(b));
        e.consultas = e.secciones.reduce((n, s) => n + s.herramientas.filter(tc => tc.toolName === 'execute_sql').length, 0)
            + e.intro.herramientas.filter(tc => tc.toolName === 'execute_sql').length;
        e.graficos = e.secciones.reduce((n, s) => n + s.bloques.filter(b => b.tipo === 'grafico').length, 0);
        delete e.actual;
    }
    return episodios;
}

/** La sección de un episodio que contiene la consulta `queryId` (para «Cómo lo obtuve»). */
export function seccionDeConsulta(episodios, queryId) {
    for (const e of episodios) {
        for (const s of [e.intro, ...e.secciones]) {
            if (s.herramientas.some(tc => tc.toolName === 'execute_sql' && tc.result?.queryId === queryId)) return { episodio: e, seccion: s };
        }
    }
    return null;
}
