/**
 * Los estilos globales del cliente como UN texto, en el orden de la cascada.
 *
 * Desde la 6.0 (M8) `client/src/index.css` es sólo la lista de `@import` de
 * `client/src/estilos/`; quien necesite leer los tokens o las reglas (los
 * scripts de temas, las suites) lee aquí la unión, que es lo que el navegador
 * aplica.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'client', 'src');

function archivos() {
    const indice = fs.readFileSync(path.join(SRC, 'index.css'), 'utf8');
    const lista = [...indice.matchAll(/@import\s+['"]([^'"]+)['"]/g)].map(m => path.join(SRC, m[1]));
    return lista.length ? lista : [path.join(SRC, 'index.css')];
}

function leer() {
    return archivos().map(f => fs.readFileSync(f, 'utf8')).join('');
}

module.exports = { leer, archivos };
