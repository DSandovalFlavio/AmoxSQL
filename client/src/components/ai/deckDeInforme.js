/**
 * Un análisis de Deep Dive → un deck de Report Flow (.amoxdeck). Puro (plan UX, F8).
 *
 * La respuesta es la portada y el resumen; cada paso con gráfico es una lámina de
 * hallazgo (su conclusión como título, su gráfico debajo); lo que se aprendió en
 * pasos sin gráfico va junto; luego qué hacer y las salvedades. Los gráficos van
 * como `.amoxvis` aparte (`graficos`: bloque → ruta), así el deck los vuelve a
 * consultar con **Refresh all** y se exporta a PowerPoint o Word desde Report Flow.
 */
import { stripThink } from './deepDiveTurns.js';

const q = (s) => JSON.stringify(String(s ?? '')); // YAML acepta cadenas JSON: sin sorpresas con «:» o «#»

/** Texto de lámina: sin citas internas ni formato de más, y corto. */
function limpio(md, max = 420) {
    let t = stripThink(String(md || ''))
        .replace(/\[([^\]]+)\]\(cite:[^)]*\)/g, '$1')   // citas → su valor
        .replace(/^#+\s*/gm, '')
        .replace(/\n{2,}/g, '\n\n')
        .trim();
    const parrafo = t.split('\n\n')[0];
    t = parrafo.length > 40 ? parrafo : t;
    return t.length > max ? `${t.slice(0, max).replace(/\s+\S*$/, '')}…` : t;
}

/**
 * @param episodio  de `armarInforme`
 * @param opciones  { titulo, fecha, graficos: Map<`${seccionKey}-g${i}`, ruta> }
 * @returns {string} el .amoxdeck
 */
export function deckDeInforme(episodio, { titulo = 'Deep Dive', fecha = '', graficos = new Map() } = {}) {
    const r = episodio?.respuesta?.resultado || null;
    const laminas = [];

    // Portada: la pregunta y, si hay, la respuesta en una línea.
    laminas.push(['<!-- layout: cover -->', `# ${episodio?.pregunta || titulo}`, r?.tldr ? `\n## ${r.tldr}` : ''].join('\n'));

    // Resumen: si solo se lee una lámina.
    if (r && (r.tldr || r.findings?.length)) {
        const hallazgos = (r.findings || []).map(f => `- **${f.point}**${f.value ? ` — ${f.value}` : ''}${f.so_what ? `. ${f.so_what}` : ''}`);
        laminas.push(['<!-- layout: summary -->', `## ${r.tldr || 'What we found'}`, '', ...hallazgos].join('\n'));
    }

    // Un hallazgo por gráfico, en el orden del análisis.
    const sinGrafico = [];
    for (const s of [episodio?.intro, ...(episodio?.secciones || [])].filter(Boolean)) {
        const texto = s.bloques.filter(b => b.tipo === 'texto').map(b => b.texto).join('\n\n');
        const conGrafico = s.bloques.map((b, i) => ({ b, i })).filter(({ b }) => b.tipo === 'grafico');
        if (!conGrafico.length) {
            if (s.titulo && s.nota) sinGrafico.push(`- **${s.titulo}:** ${s.nota}`);
            continue;
        }
        conGrafico.forEach(({ b, i }, n) => {
            const src = graficos.get(`${s.key}-g${i}`);
            if (!src) return;
            const cc = b.tc.result.chartConfig || {};
            const encabezado = (n === 0 && s.nota) || cc.title || s.titulo || 'Finding';
            const cuerpo = n === 0 ? limpio(texto) : '';
            laminas.push([
                '<!-- layout: finding -->',
                `## ${encabezado}`,
                cuerpo ? `\n${cuerpo}` : '',
                '',
                '```amoxchart',
                `src: ${q(src)}`,
                '```',
            ].join('\n'));
        });
    }
    if (sinGrafico.length) {
        laminas.push(['<!-- layout: content -->', '## Along the way', '', ...sinGrafico].join('\n'));
    }

    // Qué hacer.
    if (r?.suggested_actions?.length) {
        laminas.push(['<!-- layout: actions -->', '## Next steps', '', '```actions',
            ...r.suggested_actions.map(a => `- action: ${q(a)}`), '```'].join('\n'));
    }
    // Salvedades: lo que una persona debe saber antes de usar los números.
    if (r?.caveats?.length) {
        laminas.push(['<!-- layout: content -->', '## Caveats', '', ...r.caveats.map(c => `- ${c}`)].join('\n'));
    }

    const frente = ['---', `title: ${q(titulo)}`, 'theme: dark', `section: ${q('Deep Dive')}`, fecha ? `date: ${q(fecha)}` : null, '---']
        .filter(Boolean).join('\n');
    return `${frente}\n\n${laminas.join('\n\n---\n\n')}\n`;
}

/** Un nombre de archivo seguro a partir del de la sesión. */
export function slugDe(texto) {
    return String(texto || 'deep-dive')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'deep-dive';
}
