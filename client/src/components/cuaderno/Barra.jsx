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
    LuLayers, LuDatabase, LuRotateCw, LuCircleAlert, LuPlus, LuTrash2,
} from 'react-icons/lu';

const Barra = ({
    indice,
    vistas,            // lo que devolvió cruzarVistas
    usados,            // los `${...}` que aparecen en las celdas
    parametros,        // los declarados en la cabecera
    onIrA,
    onRefrescar,
    onParametro,       // (nombre, valor) — valor null borra
}) => {
    const nombresDeclarados = Object.keys(parametros || {});
    const sinDeclarar = usados.filter((u) => !nombresDeclarados.includes(u));

    return (
        <div className="cdn-lado">
            {/* ── índice ─────────────────────────────────────────────────── */}
            <div className="cdn-seccion">
                Índice <span className="cdn-sp" /><span className="cdn-n">{indice.length}</span>
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
                    Los encabezados de las celdas de texto —<code>#</code>, <code>##</code>,
                    <code> ###</code>— construyen este índice.
                </p>
            )}

            {/* ── vistas ─────────────────────────────────────────────────── */}
            <div className="cdn-seccion">
                Vistas
                <span className="cdn-sp" />
                <span className="cdn-n">{vistas.vivasPropias}/{vistas.propias.length}</span>
                <button
                    type="button"
                    className="cdn-mini"
                    onClick={onRefrescar}
                    title="Volver a preguntarle al motor"
                ><LuRotateCw size={11} /></button>
            </div>

            {/* El aviso de la fase: lo que el cuaderno espera y no está. Se dice
                aquí, arriba, en vez de dejar que lo descubra una celda al fallar. */}
            {vistas.faltan > 0 && (
                <div className="cdn-falta-aviso">
                    <LuCircleAlert size={12} style={{ flex: 'none' }} />
                    <span>
                        {vistas.faltan === vistas.propias.length
                            ? 'La sesión no tiene ninguna. Ejecuta las celdas para volver a ponerlas.'
                            : `${vistas.faltan === 1 ? 'Falta una' : `Faltan ${vistas.faltan}`}: hasta que se ejecuten, `
                              + 'lo que las lea fallará.'}
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
                            title={v.viva
                                ? `${v.descripcion || 'Sin descripción'}\nViva en la sesión — ir a su celda`
                                : 'Todavía no existe: ir a su celda y ejecutarla'}
                        >
                            {v.tipo === 'tabla' ? <LuDatabase size={11} /> : <LuLayers size={11} />}
                            <span className="cdn-vista-n">{v.nombre}</span>
                            {v.descripcion && <span className="cdn-vista-d">{v.descripcion.split('\n')[0]}</span>}
                        </button>
                    ))}
                </div>
            ) : (
                <p className="cdn-lista-vacia">
                    Cada celda con nombre deja una vista aquí al ejecutarse, y la siguiente
                    puede leerla por ese nombre.
                </p>
            )}

            {/* La sesión es una sola: lo creado desde un .sql o desde otro
                cuaderno se puede consultar desde aquí igual de bien. */}
            {vistas.ajenas.length > 0 && (
                <>
                    <div className="cdn-seccion cdn-seccion--sub">
                        También en la sesión <span className="cdn-sp" />
                        <span className="cdn-n">{vistas.ajenas.length}</span>
                    </div>
                    <div className="cdn-indice">
                        {vistas.ajenas.map((v) => (
                            <span
                                key={v.nombre}
                                className="cdn-vista cdn-vista--viva cdn-vista--ajena"
                                title={`${v.descripcion || 'Sin descripción'}\nCreada fuera de este cuaderno`}
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
                Parámetros <span className="cdn-sp" />
                <span className="cdn-n">{nombresDeclarados.length}</span>
            </div>

            {nombresDeclarados.length > 0 ? (
                <div className="cdn-params">
                    {nombresDeclarados.map((n) => (
                        <div className="cdn-param" key={n}>
                            <label className="cdn-param-n" htmlFor={`cdn-p-${n}`} title={
                                usados.includes(n)
                                    ? `Se usa escribiendo {{${n}}} en una celda`
                                    : 'Declarado, pero ninguna celda lo usa'
                            }>
                                {n}
                                {!usados.includes(n) && <span className="cdn-param-huerfano">sin usar</span>}
                            </label>
                            <div className="cdn-param-fila">
                                <input
                                    id={`cdn-p-${n}`}
                                    className="cdn-param-v"
                                    value={parametros[n] ?? ''}
                                    spellCheck={false}
                                    onChange={(e) => onParametro(n, e.target.value)}
                                />
                                <button
                                    type="button"
                                    className="cdn-mini"
                                    onClick={() => onParametro(n, null)}
                                    title="Quitar este parámetro"
                                ><LuTrash2 size={11} /></button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="cdn-lista-vacia">
                    Escribe <code>{'{{desde}}'}</code> en una celda y aquí podrás darle valor
                    sin tocar la consulta.
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
                            title="Alguna celda lo usa pero no tiene valor. Declararlo aquí."
                        >
                            <LuPlus size={11} />
                            Declarar <code>{n}</code>
                        </button>
                    ))}
                </div>
            )}

            {/* Lo del entrecomillado automático hay que decirlo: es la fuente de
                la confusión de «por qué me sobran comillas» con un parámetro que
                nombra una tabla. */}
            <p className="cdn-lista-vacia">
                Un texto entra <strong>entrecomillado</strong> y un número tal cual, así que
                se escribe <code>{'f >= {{desde}}'}</code> y no <code>{"f >= '{{desde}}'"}</code>.
                Por eso un parámetro no sirve para nombrar una tabla.
            </p>
        </div>
    );
};

export default memo(Barra);
