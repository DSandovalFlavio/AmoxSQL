/**
 * La barra derecha: índice, vistas vivas y parámetros.
 *
 * ## Por qué a la derecha
 *
 * El cuaderno se lee de izquierda a derecha, y esto no se lee: se consulta de
 * reojo. Ponerlo a la izquierda obligaría a cruzarlo con la mirada cada vez que
 * se vuelve al principio de una línea.
 *
 * ## Las tres secciones dicen tres cosas distintas
 *
 * El **índice** sale de los encabezados de las celdas de texto. Nadie sostiene
 * un índice a mano, así que éste se mantiene solo.
 *
 * Las **vistas** son lo único de aquí que no sale del documento: salen del
 * motor. Ésa es toda la gracia — el documento dice qué celdas hay, el motor dice
 * qué se puede consultar, y hasta ahora nadie comparaba las dos cosas. Al
 * reabrir un cuaderno al día siguiente el documento está intacto y la sesión
 * vacía, y eso se descubría al fallar una celda de en medio.
 *
 * Los **parámetros** viven en la cabecera del archivo. Se ven los que el
 * cuaderno usa de verdad y los que declara, que no siempre son los mismos.
 */
import { memo } from 'react';
import {
    LuLayers, LuDatabase, LuRotateCw, LuCircleAlert, LuPlus, LuTrash2, LuHistory,
} from 'react-icons/lu';

const Barra = ({
    indice,
    vistas,            // lo que devolvió cruzarVistas
    frescuras,         // Map id -> 'nunca'|'dia'|'cambiada'|'arriba'
    usados,            // los `{{...}}` que aparecen en las celdas
    parametros,        // los declarados en la cabecera
    onIrA,
    onRefrescar,
    onParametro,       // (nombre, valor) — valor null borra
}) => {
    const nombresDeclarados = Object.keys(parametros || {});
    // Una vista puede estar viva Y vieja a la vez: existe en la sesión, pero su
    // definición es de antes de la última edición. Es el caso que más engaña,
    // porque la lista la enseñaría encendida sin más.
    const viejas = vistas.propias.filter(
        (v) => v.viva && ['cambiada', 'arriba'].includes(frescuras?.get(v.celda)),
    ).length;
    const sinDeclarar = usados.filter((u) => !nombresDeclarados.includes(u));

    return (
        <div className="cdn-lado">
            {/* ── índice ─────────────────────────────────────────────────── */}
            <div className="cdn-seccion">
                Outline <span className="cdn-sp" /><span className="cdn-n">{indice.length}</span>
            </div>
            {indice.length > 0 ? (
                <div className="cdn-indice">
                    {indice.map((e, i) => (
                        <button
                            key={`${e.celda}-${i}`}
                            type="button"
                            className={`cdn-idx cdn-idx--${e.nivel}`}
                            onClick={() => onIrA(e.celda)}
                            title={e.texto}
                        >
                            {e.texto}
                        </button>
                    ))}
                </div>
            ) : (
                <p className="cdn-lista-vacia">
                    The headings of text cells —<code>#</code>, <code>##</code>,
                    <code> ###</code>— build this outline.
                </p>
            )}

            {/* ── vistas ─────────────────────────────────────────────────── */}
            <div className="cdn-seccion">
                Views
                <span className="cdn-sp" />
                <span className="cdn-n">{vistas.vivasPropias}/{vistas.propias.length}</span>
                <button
                    type="button"
                    className="cdn-mini"
                    onClick={onRefrescar}
                    title="Ask the engine again"
                ><LuRotateCw size={11} /></button>
            </div>

            {/* Dos avisos, y son cosas distintas. Arriba: lo que está puesto
                pero con una definición vieja —el caso que engaña, porque existe
                y responde—. Abajo: lo que directamente no está. Los dos se dicen
                aquí en vez de dejar que los descubra una celda al fallar. */}
            {viejas > 0 && (
                <div className="cdn-falta-aviso cdn-falta-aviso--vieja">
                    <LuHistory size={12} style={{ flex: 'none' }} />
                    <span>
                        {viejas === 1 ? 'One is in place' : `${viejas} are in place`} with a
                        definition older than the last edit. What you see is from before.
                    </span>
                </div>
            )}

            {vistas.faltan > 0 && (
                <div className="cdn-falta-aviso">
                    <LuCircleAlert size={12} style={{ flex: 'none' }} />
                    <span>
                        {vistas.faltan === vistas.propias.length
                            ? 'The session has none. Run the cells to put them back.'
                            : `${vistas.faltan === 1 ? 'One is missing' : `${vistas.faltan} are missing`}: until they run, `
                              + 'anything reading them will fail.'}
                    </span>
                </div>
            )}

            {vistas.propias.length > 0 ? (
                <div className="cdn-indice">
                    {vistas.propias.map((v) => (
                        <button
                            key={v.nombre}
                            type="button"
                            className={`cdn-vista${v.viva ? ' cdn-vista--viva' : ''}`}
                            onClick={() => onIrA(v.celda)}
                            title={!v.viva
                                ? 'Does not exist yet: go to its cell and run it'
                                : ['cambiada', 'arriba'].includes(frescuras?.get(v.celda))
                                    ? `${v.descripcion || 'No description'}\nIn place, but with a definition older than the last edit`
                                    : `${v.descripcion || 'No description'}\nLive and up to date — go to its cell`}
                        >
                            {v.tipo === 'tabla' ? <LuDatabase size={11} /> : <LuLayers size={11} />}
                            <span className="cdn-vista-n">{v.nombre}</span>
                            {v.viva && ['cambiada', 'arriba'].includes(frescuras?.get(v.celda))
                                && <LuHistory size={10} className="cdn-vista-vieja" />}
                            {v.descripcion && <span className="cdn-vista-d">{v.descripcion.split('\n')[0]}</span>}
                        </button>
                    ))}
                </div>
            ) : (
                <p className="cdn-lista-vacia">
                    Every named cell leaves a view here when it runs, and the next one
                    can read it by that name.
                </p>
            )}

            {/* La sesión es una sola: lo creado desde un .sql o desde otro
                cuaderno se puede consultar desde aquí igual de bien. */}
            {vistas.ajenas.length > 0 && (
                <>
                    <div className="cdn-seccion cdn-seccion--sub">
                        Also in the session <span className="cdn-sp" />
                        <span className="cdn-n">{vistas.ajenas.length}</span>
                    </div>
                    <div className="cdn-indice">
                        {vistas.ajenas.map((v) => (
                            <span
                                key={v.nombre}
                                className="cdn-vista cdn-vista--viva cdn-vista--ajena"
                                title={`${v.descripcion || 'No description'}\nCreated outside this notebook`}
                            >
                                {v.tipo === 'tabla' ? <LuDatabase size={11} /> : <LuLayers size={11} />}
                                <span className="cdn-vista-n">{v.nombre}</span>
                            </span>
                        ))}
                    </div>
                </>
            )}

            {/* ── parámetros ─────────────────────────────────────────────── */}
            <div className="cdn-seccion">
                Parameters <span className="cdn-sp" />
                <span className="cdn-n">{nombresDeclarados.length}</span>
            </div>

            {nombresDeclarados.length > 0 ? (
                <div className="cdn-params">
                    {nombresDeclarados.map((n) => (
                        <div className="cdn-param" key={n}>
                            <label className="cdn-param-n" htmlFor={`cdn-p-${n}`} title={
                                usados.includes(n)
                                    ? `Use it by writing {{${n}}} in a cell`
                                    : 'Declared, but no cell uses it'
                            }>
                                {n}
                                {!usados.includes(n) && <span className="cdn-param-huerfano">unused</span>}
                            </label>
                            <div className="cdn-param-fila">
                                {/* La regla del entrecomillado se dice AQUI y no en un
                                    parrafo permanente de la barra: hace falta justo al
                                    escribir el valor, y como texto fijo era un muro que
                                    ocupaba un tercio de la barra sin que hubiera ni un
                                    parametro. */}
                                <input
                                    id={`cdn-p-${n}`}
                                    className="cdn-param-v"
                                    value={parametros[n] ?? ''}
                                    spellCheck={false}
                                    onChange={(e) => onParametro(n, e.target.value)}
                                    title={'Text goes in quoted and a number goes in raw: '
                                        + `you write "f >= {{${n}}}", with no quotes around it. `
                                        + 'That is also why a parameter cannot name a table.'}
                                />
                                <button
                                    type="button"
                                    className="cdn-mini"
                                    onClick={() => onParametro(n, null)}
                                    title="Remove this parameter"
                                ><LuTrash2 size={11} /></button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="cdn-lista-vacia">
                    Write <code>{'{{desde}}'}</code> in a cell to give it a value here.
                </p>
            )}

            {/* Un parámetro usado y no declarado no es un error: es lo normal
                justo después de escribirlo. Se ofrece declararlo de un clic. */}
            {sinDeclarar.length > 0 && (
                <div className="cdn-params">
                    {sinDeclarar.map((n) => (
                        <button
                            key={n}
                            type="button"
                            className="cdn-declarar"
                            onClick={() => onParametro(n, '')}
                            title="A cell uses it but it has no value. Declare it here."
                        >
                            <LuPlus size={11} />
                            Declare <code>{n}</code>
                        </button>
                    ))}
                </div>
            )}

        </div>
    );
};

export default memo(Barra);
