/**
 * Lo que los workspaces (B1, B8) ponen en pantalla sin que App tenga que
 * saber de ellos: la elección de la palabra la primera vez (pantalla 1) y el
 * diálogo de enlazar una carpeta (pantalla 5).
 *
 * Escucha tres eventos de ventana:
 *   amox_proyecto_abierto  — App abrió una carpeta: se mira su enlace.
 *   amox_proyecto_cerrado  — ya no hay carpeta.
 *   amox_enlazar_proyecto  — el usuario quiere cambiar el enlace (barra de título).
 *
 * El enlace actual vive en un almacén pequeño (`useEnlace`), que es lo que lee
 * la barra de título para enseñar el workspace junto al proyecto.
 */
import { useEffect, useState } from 'react';
import EleccionEtiqueta from './EleccionEtiqueta';
import EnlazarProyecto from './EnlazarProyecto';
import { cargarEtiqueta } from '../../etiqueta';
import { enlaceDelProyecto } from './api';

// ── el enlace de la carpeta abierta ─────────────────────────────────────────
let enlaceActual = null;
const oyentes = new Set();
function publicar(e) {
    enlaceActual = e;
    for (const o of oyentes) o(e);
}

export function useEnlace() {
    const [e, setE] = useState(enlaceActual);
    useEffect(() => {
        oyentes.add(setE);
        setE(enlaceActual);
        return () => { oyentes.delete(setE); };
    }, []);
    return e;
}

/** Pide al usuario cambiar el enlace de la carpeta abierta. */
export const pedirEnlazar = () => window.dispatchEvent(new CustomEvent('amox_enlazar_proyecto'));

export default function WorkspacesHost() {
    const [eleccion, setEleccion] = useState(false);
    const [dialogo, setDialogo] = useState(null);

    useEffect(() => {
        // Se monta en la bienvenida y otra vez en el IDE: cuenta lo de ahora.
        cargarEtiqueta().then(e => { if (e.cargada && e.elegida === false) setEleccion(true); });

        const mirar = (pregunta) => enlaceDelProyecto()
            .then(est => {
                publicar(est.estado === 'sin_proyecto' ? null : est);
                if (pregunta === 'siempre' || (pregunta === 'si-toca' && est.preguntar)) setDialogo(est);
            })
            .catch(() => publicar(null));

        const alAbrir = () => mirar('si-toca');
        const alCerrar = () => { publicar(null); setDialogo(null); };
        const alPedir = () => mirar('siempre');
        window.addEventListener('amox_proyecto_abierto', alAbrir);
        window.addEventListener('amox_proyecto_cerrado', alCerrar);
        window.addEventListener('amox_enlazar_proyecto', alPedir);
        return () => {
            window.removeEventListener('amox_proyecto_abierto', alAbrir);
            window.removeEventListener('amox_proyecto_cerrado', alCerrar);
            window.removeEventListener('amox_enlazar_proyecto', alPedir);
        };
    }, []);

    // La palabra primero: el diálogo de enlazar ya la usa.
    if (eleccion) return <EleccionEtiqueta onDone={() => setEleccion(false)} />;
    if (dialogo) {
        return (
            <EnlazarProyecto
                enlace={dialogo}
                onClose={(resultado) => {
                    setDialogo(null);
                    if (resultado) publicar(resultado);
                }}
            />
        );
    }
    return null;
}
