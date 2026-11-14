/**
 * ¿Dos versiones de un `.sqlchain` son el mismo proceso? (6.0, M10 · T2)
 *
 * Abrir un proceso lo marcaba como modificado: el autoguardado del editor corre
 * al montar y otra vez cuando el lienzo mide los pasos, y emitía el JSON aunque
 * no hubiera cambiado nada. Ahora se compara por CONTENIDO —lo que el editor
 * escribe al serializar, con las claves en orden— y no por el texto: un archivo
 * escrito a mano o con otro sangrado sigue siendo el mismo proceso.
 *
 * Pura y sin dependencias; la prueba es `scripts/probarMismoProceso.mjs`.
 */

const paso = (n) => ({
    id: n.id,
    type: n.type,
    label: n.label ?? '',
    description: n.description ?? '',
    position: { x: Number(n.position?.x) || 0, y: Number(n.position?.y) || 0 },
    config: n.config || {},
    disabled: !!n.disabled,
});

/** Lo que importa de un proceso: lo mismo que serializa ChainEditor. */
export function formaDeProceso(d) {
    return {
        name: d?.name ?? '',
        description: d?.description ?? '',
        config: d?.config ?? null,
        nodes: (d?.nodes || []).map(paso),
        edges: (d?.edges || []).map(e => ({ id: e.id, source: e.source, target: e.target })),
        variables: d?.variables ?? {},
        parametros: d?.parametros?.length ? d.parametros : null,
        vista: d?.vista ?? null,
    };
}

const estable = (v) => {
    if (Array.isArray(v)) return v.map(estable);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => [k, estable(v[k])]));
    return v;
};

/** `a` y `b`: objetos o texto JSON. Un texto que no es JSON nunca es «el mismo». */
export function mismoProceso(a, b) {
    try {
        const pa = typeof a === 'string' ? JSON.parse(a) : a;
        const pb = typeof b === 'string' ? JSON.parse(b) : b;
        if (!pa || !pb) return false;
        return JSON.stringify(estable(formaDeProceso(pa))) === JSON.stringify(estable(formaDeProceso(pb)));
    } catch {
        return false;
    }
}
