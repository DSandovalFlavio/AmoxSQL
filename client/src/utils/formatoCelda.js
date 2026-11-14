/**
 * Cómo se lee un número en la tabla de resultados (6.0, M1; auditoría F5).
 *
 * El motor manda los enteros grandes (BIGINT, HUGEINT…) y los DECIMAL como TEXTO,
 * para no perder precisión en JavaScript; los DOUBLE como número. La tabla formateaba
 * por `typeof`, así que `venta` (DECIMAL) salía «5553900.00» y `precio` (DOUBLE)
 * «1,700»: dos columnas de dinero con dos aspectos. Aquí se formatea por el TIPO de
 * la columna, con separador de miles y sin pasar por `Number` lo que no cabe en él.
 */

const ENTERO = /^(TINYINT|SMALLINT|INTEGER|INT|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT)$/i;
const DECIMAL = /^DECIMAL\(\s*\d+\s*,\s*(\d+)\s*\)$/i;
const TEXTO_ENTERO = /^-?\d+$/;
const TEXTO_DECIMAL = /^-?\d+(\.\d+)?$/;

/** El separador de miles y el decimal del idioma de la máquina. */
function separadores(locale) {
    const partes = new Intl.NumberFormat(locale).formatToParts(12345.6);
    return {
        miles: partes.find(p => p.type === 'group')?.value ?? ',',
        decimal: partes.find(p => p.type === 'decimal')?.value ?? '.',
    };
}

/** «1234567» → «1,234,567», en texto: vale para cualquier tamaño. */
function agrupar(digitos, miles) {
    const negativo = digitos.startsWith('-');
    const d = negativo ? digitos.slice(1) : digitos;
    const conMiles = d.replace(/\B(?=(\d{3})+(?!\d))/g, miles);
    return (negativo ? '-' : '') + conMiles;
}

/**
 * El texto de un número según el tipo de su columna, o null si no es un número que
 * haya que formatear (el que llama sigue con lo suyo: fechas, objetos, texto).
 */
export function formatearNumero(valor, tipo, locale = undefined) {
    const t = String(tipo || '').trim();
    const s = separadores(locale);
    if (typeof valor === 'string') {
        if (ENTERO.test(t) && TEXTO_ENTERO.test(valor)) return agrupar(valor, s.miles);
        const dec = DECIMAL.exec(t);
        if (dec && TEXTO_DECIMAL.test(valor)) {
            const escala = Number(dec[1]);
            const [ent, frac = ''] = valor.split('.');
            const fraccion = escala > 0 ? (frac + '0'.repeat(escala)).slice(0, escala) : '';
            return agrupar(ent, s.miles) + (fraccion ? s.decimal + fraccion : '');
        }
        return null;
    }
    if (typeof valor === 'number' && Number.isFinite(valor)) {
        const dec = DECIMAL.exec(t);
        if (dec) {
            const escala = Number(dec[1]);
            return valor.toLocaleString(locale, { minimumFractionDigits: escala, maximumFractionDigits: escala });
        }
        if (Number.isInteger(valor)) return valor.toLocaleString(locale);
        return valor.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
    }
    return null;
}
