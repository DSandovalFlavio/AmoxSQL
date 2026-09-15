/**
 * Los ayudantes de escritura de una región: qué hace cada botón, cómo se aplica
 * al `textarea` y el estado del menú de inserción.
 *
 * Van aquí y no en `DeckWriting.jsx` por una razón de herramienta: un archivo
 * que exporta componentes Y funciones sueltas rompe Fast Refresh, así que al
 * tocar la barra se recargaba el módulo entero y se perdía lo que estuvieras
 * escribiendo. Lo señaló el linter.
 *
 * La lógica de texto pura —envolver, prefijar, insertar— no está aquí: vive en
 * `deckTextOps.js` y se ejercita desde Node.
 */
import { useState } from 'react';
import { LuBold, LuItalic, LuLink, LuList, LuQuote, LuCode } from 'react-icons/lu';
import {
    alternarMarca, alternarPrefijo, insertarEnlace,
    detectarDisparo, aplicarInsercion,
} from './deckTextOps';

/** Lo que hace cada botón, y con qué tecla. */
export const ACCIONES = [
    { id: 'negrita', Icono: LuBold, titulo: 'Negrita', tecla: 'B', marca: '**' },
    { id: 'cursiva', Icono: LuItalic, titulo: 'Cursiva', tecla: 'I', marca: '*' },
    { id: 'codigo', Icono: LuCode, titulo: 'Código', marca: '`' },
    { id: 'enlace', Icono: LuLink, titulo: 'Enlace', tecla: 'K', enlace: true },
    { id: 'lista', Icono: LuList, titulo: 'Lista', prefijo: '- ' },
    { id: 'cita', Icono: LuQuote, titulo: 'Conclusión destacada', prefijo: '> ' },
];

/**
 * Aplica una operación al `textarea` y APUNTA dónde tiene que quedar la
 * selección. No la pone: la deja pendiente.
 *
 * Ponerla aquí no funciona y costó verlo. `onCambio` es un `setState`, que es
 * asíncrono: para cuando corre un `requestAnimationFrame`, React todavía no ha
 * escrito el valor nuevo en el `textarea`. La selección se aplicaba sobre el
 * texto viejo y, al llegar el repintado, el cursor se iba al final. Medido: la
 * negrita se ponía bien y la selección se perdía.
 *
 * La marca viaja en el propio elemento porque es lo único que sobrevive al
 * repintado con identidad estable. Se recoge en `restaurarSeleccion`, desde un
 * layout effect — después de que el DOM tenga el texto nuevo y antes de pintar.
 */
export function aplicarAlArea(area, resultado, onCambio) {
    if (!area || !resultado) return;
    area.dataset.selPendiente = `${resultado.selDesde},${resultado.selHasta}`;
    onCambio(resultado.texto);
}

/** Recoge la selección que dejó pendiente `aplicarAlArea`. */
export function restaurarSeleccion(area) {
    const pend = area?.dataset?.selPendiente;
    if (!pend) return;
    delete area.dataset.selPendiente;
    const [desde, hasta] = pend.split(',').map(Number);
    area.focus();
    area.setSelectionRange(desde, hasta);
}

/** Ejecuta una de las ACCIONES sobre la selección actual del área. */
export function ejecutarAccion(area, accion, onCambio) {
    if (!area) return;
    const { value, selectionStart: ini, selectionEnd: fin } = area;
    let r = null;
    if (accion.marca) r = alternarMarca(value, ini, fin, accion.marca);
    else if (accion.prefijo) r = alternarPrefijo(value, ini, fin, accion.prefijo);
    else if (accion.enlace) r = insertarEnlace(value, ini, fin);
    aplicarAlArea(area, r, onCambio);
}

/** ¿La pulsación es uno de los atajos de formato? Devuelve la acción, o null. */
export function accionDeAtajo(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
    const t = (e.key || '').toUpperCase();
    return ACCIONES.find((a) => a.tecla === t) || null;
}

/**
 * El estado del menú dentro de una región: cuándo se abre, qué se ha tecleado
 * y qué pasa al elegir. Vive aquí para que `RegionTexto` no tenga que saberlo.
 */
export function useMenuInsercion(areaRef, onCambio) {
    const [disparo, setDisparo] = useState(null);

    /** Tras cada tecla, mirar si hay un `/` activo delante del cursor. */
    const revisar = () => {
        const area = areaRef.current;
        if (!area) return;
        setDisparo(detectarDisparo(area.value, area.selectionStart));
    };

    /** Abrir a mano, desde el botón: se escribe la barra por el usuario. */
    const abrir = () => {
        const area = areaRef.current;
        if (!area) return;
        const { value, selectionStart: c } = area;
        // Una barra sólo dispara a principio de línea o tras un espacio, así
        // que si hace falta se añade el espacio antes.
        const necesitaEspacio = c > 0 && !/\s/.test(value[c - 1]);
        const inserto = (necesitaEspacio ? ' /' : '/');
        const texto = value.slice(0, c) + inserto + value.slice(c);
        onCambio(texto);
        const nuevo = c + inserto.length;
        area.dataset.selPendiente = `${nuevo},${nuevo}`;
        setDisparo({ desde: nuevo - 1, consulta: '' });
    };

    const elegir = (item) => {
        const area = areaRef.current;
        if (!area || !disparo) return;
        const r = aplicarInsercion(area.value, disparo, area.selectionStart, item);
        setDisparo(null);
        aplicarAlArea(area, r, onCambio);
    };

    return { disparo, revisar, abrir, elegir, cerrar: () => setDisparo(null) };
}
