/**
 * El crudo de UNA lámina, al lado del lienzo.
 *
 * Fase 5, y es la queja literal con la que empezó todo esto: «cuando se
 * necesite editar raw una slide, que sólo se muestre el texto markdown de esa
 * slide — ahora se muestra todo y no sabes cómo ni dónde editar». La vista
 * Source abre el `.amoxdeck` entero: 260 líneas para retocar una lámina.
 *
 * Se queda tal cual para quien la quiera; esto es lo otro.
 *
 * **Sin resaltado de sintaxis, y con una leyenda en su lugar.** El plan decía
 * «las directivas salen atenuadas»; esto es un `textarea` y no puede colorear.
 * Montar Monaco para una lámina de quince líneas es traerse un editor entero
 * —con su ciclo de vida, su tema y su teclado— para lo que aquí es un bloc de
 * notas. La leyenda dice qué directivas lleva ESTA lámina y qué hace cada una,
 * que era el objetivo: que no parezcan ruido que hay que aprenderse.
 */
import { useState, useEffect, useRef } from 'react';
import { LuCode, LuX, LuTriangleAlert } from 'react-icons/lu';
import { bloquesDe, leerBloque, BLOQUES } from './deckBlockModel';

/** Qué significa cada directiva, dicho donde aparece. */
const DIRECTIVAS = {
    layout: 'la disposición de la lámina — la escribe el inspector',
    eyebrow: 'el antetítulo, que por defecto hereda el del deck',
    footer: 'qué campos lleva el pie',
    tone: 'claro u oscuro, por encima del tema',
    col: 'el corte entre las dos columnas',
};

/** Las directivas que hay en este texto, con su línea. */
function directivasDe(texto) {
    const fuera = [];
    (texto || '').split(/\r?\n/).forEach((linea, i) => {
        const m = linea.match(/^\s*<!--\s*([a-z]+)\s*:?([^>]*)-->\s*$/);
        if (m && DIRECTIVAS[m[1]]) fuera.push({ linea: i + 1, clave: m[1], valor: m[2].trim() });
    });
    return fuera;
}

/**
 * Los bloques de dato cuyo YAML no se entiende, con la línea donde empiezan.
 *
 * Es el «error señalado en su línea» del plan, acotado a lo que de verdad puede
 * fallar: el markdown no tiene errores de sintaxis —lo que no es markdown es
 * texto— pero el YAML de un bloque sí, y ése es el que deja la lámina con un
 * hueco rojo sin decir dónde.
 */
function erroresDe(texto) {
    return bloquesDe(texto)
        .map((b) => ({ ...b, modelo: leerBloque(b.lang, b.cuerpo) }))
        .filter((b) => b.modelo.error)
        .map((b) => ({
            lang: b.lang,
            linea: (texto.slice(0, b.desde).match(/\n/g) || []).length + 1,
            mensaje: b.modelo.error,
        }));
}

const DeckSlideRaw = ({ raw, numero, onEditar, onCerrar }) => {
    const [borrador, setBorrador] = useState(raw);
    const refRaw = useRef(raw);
    const areaRef = useRef(null);

    // El texto de fuera manda cuando cambia por otro camino —el inspector, el
    // deshacer— pero no mientras se escribe aquí, que sería pelearse consigo
    // mismo letra a letra.
    useEffect(() => {
        if (refRaw.current !== raw) { refRaw.current = raw; setBorrador(raw); }
    }, [raw]);

    const confirmar = () => { if (borrador !== raw) { refRaw.current = borrador; onEditar(borrador); } };

    const directivas = directivasDe(borrador);
    const errores = erroresDe(borrador);
    const bloques = bloquesDe(borrador);

    return (
        <div className="deck-crudo">
            <div className="deck-crudo-cab">
                <LuCode size={13} />
                <span>Lámina {numero} · crudo</span>
                <kbd>Ctrl</kbd><kbd>⇧</kbd><kbd>E</kbd>
                <button type="button" onClick={onCerrar} title="Cerrar el crudo"><LuX size={14} /></button>
            </div>

            <textarea
                ref={areaRef}
                className="deck-crudo-area"
                value={borrador}
                spellCheck={false}
                onChange={(e) => setBorrador(e.target.value)}
                onBlur={confirmar}
                onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); confirmar(); }
                    if (e.key === 'Escape') { setBorrador(raw); e.currentTarget.blur(); }
                }}
            />

            <div className="deck-crudo-pie">
                {errores.map((err) => (
                    <p key={`${err.lang}-${err.linea}`} className="deck-crudo-error">
                        <LuTriangleAlert size={11} />
                        Línea {err.linea}, bloque <code>{err.lang}</code>: {err.mensaje}
                    </p>
                ))}

                {directivas.map((d) => (
                    <p key={`${d.clave}-${d.linea}`} className="deck-crudo-nota">
                        <b>línea {d.linea}</b> <code>{d.clave}</code> — {DIRECTIVAS[d.clave]}
                        {d.valor ? <> · ahora <code>{d.valor}</code></> : null}
                    </p>
                ))}

                {bloques.filter((b) => !errores.some((e) => e.lang === b.lang)).map((b) => (
                    <p key={`b-${b.desde}`} className="deck-crudo-nota">
                        bloque <code>{b.lang}</code> — {BLOQUES[b.lang]?.label}, editable con campos
                        desde el inspector
                    </p>
                ))}

                {!directivas.length && !bloques.length && !errores.length && (
                    <p className="deck-crudo-nota">Markdown a secas: sin directivas ni bloques de dato.</p>
                )}
            </div>
        </div>
    );
};

export default DeckSlideRaw;
