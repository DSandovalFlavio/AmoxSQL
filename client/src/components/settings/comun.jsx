/**
 * Lo que comparten varias secciones de Settings (6.0, M8).
 */

/**
 * Desde la 5.9 el servidor nunca manda un secreto: donde hay uno guardado manda
 * esta marca (ver server/secretos.js). Se enseña como un campo vacío con una
 * indicación; si el usuario no escribe nada, al guardar vuelve tal cual y el
 * servidor no toca la clave. Borrar con la X la deja vacía, y eso la borra.
 */
export const EN_EL_LLAVERO = '__amox_en_el_llavero__';

export const valorVisible = (v) => (v === EN_EL_LLAVERO ? '' : (v ?? ''));

export const indicacion = (v, normal) => (v === EN_EL_LLAVERO ? 'Saved in your system keychain — type to replace' : normal);

// ─── Reusable Toggle Component ───
export const Toggle = ({ on, onChange }) => (
    <div className={`stg-toggle${on ? ' stg-toggle--on' : ''}`} onClick={onChange}>
        <div className="stg-toggle-knob" />
    </div>
);
