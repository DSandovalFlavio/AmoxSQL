/**
 * Una ruta larga, por su final (6.0, M10 · T16).
 *
 * Cortada por la derecha («C:\Users\flavi\AppData\Local\Temp\…»), dos proyectos
 * se veían iguales: lo que los distingue es el final. Aquí se quedan los
 * últimos `tramos` tramos, con «…» delante y el separador de la propia ruta.
 * La ruta entera va en el `title` de quien la pinta.
 *
 *   rutaCorta('C:\\a\\b\\c\\d\\tienda')  →  '…\\c\\d\\tienda'
 */
export function rutaCorta(ruta, tramos = 3) {
    if (!ruta) return '';
    const texto = String(ruta);
    const sep = texto.includes('\\') && !texto.includes('/') ? '\\' : '/';
    const partes = texto.split(/[\\/]+/).filter(Boolean);
    if (partes.length <= tramos + 1) return texto;
    return `…${sep}${partes.slice(-tramos).join(sep)}`;
}
