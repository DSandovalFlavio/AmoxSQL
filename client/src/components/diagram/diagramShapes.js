/**
 * La paleta que crece: formas aprendidas de los diagramas que abres.
 *
 * Mermaid trae **más de cuarenta formas con nombre** además de las catorce
 * clásicas. Meterlas todas en la paleta la convertiría en un catálogo: cuarenta
 * y seis siluetas de 19 px que hay que recorrer para encontrar «almacén» son
 * peores que catorce.
 *
 * Así que la base es corta y **cada uno se queda con las que usa**: si abres un
 * diagrama que trae una forma que no conocemos, el editor la reconoce y ofrece
 * guardarla. A partir de ahí está en tu paleta, en todos tus proyectos.
 *
 * ## Dónde vive
 *
 * En `localStorage`, que es donde esta aplicación guarda lo que es **del
 * usuario y no del proyecto** — el tema, el acento, el ancho de la barra. Una
 * paleta personal es exactamente eso: viaja contigo de un proyecto a otro y no
 * tiene por qué acabar en el repositorio de nadie.
 *
 * ## La silueta no se dibuja a mano
 *
 * Las catorce clásicas llevan su silueta en CSS porque son catorce y se
 * conocen. Para una forma aprendida no hay CSS que valga: se le **pregunta a
 * mermaid** cómo la dibuja y se guarda su contorno.
 *
 * Es la misma decisión que se tomó con las posiciones y con la exportación, y
 * por la misma razón: quien sabe cómo se ve un diagrama de mermaid es mermaid.
 * Cualquier dibujo nuestro sería una aproximación que tarde o temprano deja de
 * parecerse al del documento.
 */
const LLAVE = 'amoxsql-diagram-formas';

/** Lo que el usuario tiene aprendido. Nunca lanza: una paleta rota no es motivo para no abrir un diagrama. */
export function leerBiblioteca() {
    try {
        const crudo = localStorage.getItem(LLAVE);
        const lista = crudo ? JSON.parse(crudo) : [];
        return Array.isArray(lista) ? lista.filter((f) => f && f.nombre) : [];
    } catch {
        return [];
    }
}

function escribirBiblioteca(lista) {
    try { localStorage.setItem(LLAVE, JSON.stringify(lista)); } catch { /* modo privado */ }
}

/** ¿Está esta forma ya en la paleta? */
export function conocida(nombre) {
    return leerBiblioteca().some((f) => f.nombre === nombre);
}

/**
 * El contorno con el que mermaid dibuja una forma, como SVG suelto.
 *
 * Se renderiza una caja sola, se le saca el trazo y se envuelve en un SVG con
 * el `viewBox` ajustado a su caja y `preserveAspectRatio="none"`, para que
 * estire hasta donde se le ponga — una silueta de 19 px y una caja del lienzo
 * de 120 salen de la misma pieza.
 */
export async function siluetaDeMermaid(nombre, { oscuro = true } = {}) {
    /**
     * Mermaid se carga **aquí dentro**, no arriba del archivo.
     *
     * Este módulo lo usa `diagramGraph`, que es traducción pura y se ejercita
     * desde Node: un `import` de mermaid en la cabecera arrastraba medio motor
     * de dibujo a un script de pruebas y lo dejaba sin arrancar. De paso, quien
     * nunca aprenda una forma nunca paga ese chunk.
     */
    const { renderMermaid, idDeRender } = await import('../markdown/mermaidRuntime.js');
    const id = idDeRender('forma');
    let svg;
    try {
        ({ svg } = await renderMermaid(id, `flowchart LR\n  n@{ shape: ${nombre}, label: " " }`, { oscuro, paraMedir: true }));
    } catch {
        return null;
    }

    // Montado y no parseado: hace falta `getBBox`, que sólo existe sobre un
    // elemento vivo. Y un SVG con `click` no es XML bien formado — ya mordió
    // una vez en la fase 1.
    const jaula = document.createElement('div');
    jaula.setAttribute('aria-hidden', 'true');
    jaula.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none';
    jaula.innerHTML = svg;
    document.body.appendChild(jaula);
    try {
        const nodo = jaula.querySelector('g.node');
        if (!nodo) return null;

        /**
         * Se coge **el grupo entero, sin la etiqueta**, y no la primera pieza
         * que aparezca: una forma puede estar dibujada con varias —`brace` son
         * dos trazos— y quedarse con una da media silueta. Y la caja del texto
         * mide 0×0 pero arrastra la suya, así que se quita antes de medir.
         */
        const copia = nodo.cloneNode(true);
        for (const e of copia.querySelectorAll('foreignObject, .label, .nodeLabel, text')) e.remove();
        // La copia se cuelga **del `<svg>`**, no del `div` que lo contiene: un
        // `<g>` fuera de un SVG no tiene caja y `getBBox` revienta.
        const lienzo = jaula.querySelector('svg');
        if (!lienzo) return null;
        lienzo.appendChild(copia);
        const b = copia.getBBox();
        if (!(b.width > 0 && b.height > 0)) return null;

        const dentro = copia.innerHTML
            .replace(/\sstyle="[^"]*"/g, '')
            .replace(/\sfill="[^"]*"/g, '')
            .replace(/\sstroke="[^"]*"/g, '');
        /**
         * El trazo va en negro opaco, **no en `currentColor`**.
         *
         * Un SVG dentro de un `url(data:…)` es un documento aparte: no hereda
         * el color del elemento que lo usa, así que `currentColor` se resolvía a
         * negro y las siluetas salían invisibles sobre el lienzo oscuro.
         *
         * Se usa como **máscara** en vez de como fondo: la silueta aporta la
         * silueta, y el color lo pone el CSS de quien la pinta — con lo cual
         * sigue el tema y el acento como las catorce dibujadas a mano.
         */
        const grosor = Math.max(1, Math.round(Math.min(b.width, b.height) / 12));
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.width} ${b.height}" preserveAspectRatio="none" fill="none" stroke="#000" stroke-width="${grosor}">${dentro}</svg>`;
    } catch {
        return null;
    } finally {
        jaula.remove();
    }
}

/**
 * Guarda una forma en la paleta del usuario.
 *
 * Devuelve `null` si mermaid no sabe dibujarla — que es la comprobación que
 * importa: sin ella la paleta se llenaría de nombres mal copiados que no
 * producen nada, y el usuario descubriría el error al pulsarlos.
 */
export async function aprenderForma(nombre, { oscuro = true } = {}) {
    const limpio = String(nombre || '').trim();
    if (!limpio) return null;
    const silueta = await siluetaDeMermaid(limpio, { oscuro });
    if (!silueta) return null;

    const lista = leerBiblioteca().filter((f) => f.nombre !== limpio);
    lista.push({ nombre: limpio, silueta });
    escribirBiblioteca(lista);
    return { nombre: limpio, silueta };
}

/** La quita de la paleta. El diagrama que la use sigue abriéndose igual. */
export function olvidarForma(nombre) {
    escribirBiblioteca(leerBiblioteca().filter((f) => f.nombre !== nombre));
}

/**
 * El contorno guardado, listo para usarse **como máscara**.
 *
 * Con `mask-image` el color lo pone el CSS del elemento, así que una forma
 * aprendida sigue el tema y el acento igual que las catorce que van en CSS.
 * Como fondo saldría siempre del color con el que se guardó.
 */
export function mascaraDeSilueta(silueta) {
    if (!silueta) return null;
    const url = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(silueta)}")`;
    return {
        maskImage: url,
        WebkitMaskImage: url,
        maskSize: '100% 100%',
        WebkitMaskSize: '100% 100%',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        backgroundColor: 'currentColor',
    };
}
