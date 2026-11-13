/**
 * La interfaz está en inglés (6.0, M1; auditoría F8).
 *
 *     node scripts/probarTextosEnIngles.mjs
 *
 * Una guarda: busca en el cliente los textos que ve el usuario —atributos `title`,
 * `placeholder`, `aria-label`, `label`, `confirmLabel`, avisos (`toast.*`), opciones y
 * texto JSX— que parecen español (acentos, ñ, ¿¡ o palabras como «de», «para», «no se
 * pudo»). Los comentarios y el código no cuentan. En la auditoría había ~60 en 18
 * archivos; ahora tienen que ser cero.
 *
 * Excepciones a propósito (nombres propios o texto que no es interfaz):
 *   - `ai/exportConversation.js`: exporta la conversación a Markdown (es texto, no UI).
 *   - «La Matemaga» (el autor del tema Sterling).
 *   - `AiSidebar.jsx`: el chat viejo, sin uso (se borra en M8).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENTE = path.join(RAIZ, 'client', 'src');
const FUERA = [/ai[\\/]exportConversation\.js$/, /AiSidebar\.jsx$/];
const PERMITIDO = /La Matemaga/;
const PALABRAS = /\b(no se pudo|para|desde|con|sin|del|las|los|una|esto|este|esta|aquí|todavía|guardar|abrir|cerrar|copiar|buscar|nuevo|nueva|archivo|carpeta|fuente|datos|igualmente|copiado|contenido|cursiva|negrita|enlace|cita|etapa|empezar|descubrir|añadir|quitar|línea|tamaño|demás|ocultar|mostrar|pendientes)\b/i;

const hallazgos = [];
const recorrer = (d) => {
    for (const f of fs.readdirSync(d)) {
        const p = path.join(d, f);
        if (fs.statSync(p).isDirectory()) { recorrer(p); continue; }
        if (!/\.(jsx|js)$/.test(f) || FUERA.some(re => re.test(p))) continue;
        const lineas = fs.readFileSync(p, 'utf8').split(/\r?\n/);
        let comentario = false;
        lineas.forEach((l, i) => {
            const t = l.trim();
            if (comentario) { if (t.includes('*/')) comentario = false; return; }
            if (/^(\/\*|\{\/\*)/.test(t)) { if (!t.includes('*/')) comentario = true; return; }
            if (/^(\/\/|\*)/.test(t)) return;
            const s = l.replace(/\{\/\*.*?\*\/\}/g, '').replace(/\/\/.*$/, '');
            const textos = [];
            for (const m of s.matchAll(/\b(title|placeholder|aria-label|label|confirmLabel|cancelLabel)\s*[=:]\s*(["'`])([^"'`]{2,})\2/g)) textos.push(m[3]);
            for (const m of s.matchAll(/toast\.\w+\(\s*(["'`])([^"'`]{2,})\1/g)) textos.push(m[2]);
            for (const m of s.matchAll(/>([^<>{}]{3,})</g)) textos.push(m[1]);
            // texto JSX en su propia línea (sin código alrededor)
            if (/^[A-ZÁÉÍÓÚÑ¿¡][^<>{}=;()]{5,}$/.test(t) && !/[;{}=]/.test(t)) textos.push(t);
            for (const x of textos) {
                // Lo que va dentro de ${…} es código (un nombre de variable), no texto.
                const v = x.replace(/\$\{[^}]*\}/g, '').trim();
                if (!v || PERMITIDO.test(v)) continue;
                // Una comparación del código atrapada entre < y > no es texto.
                if (/&&|\|\||[=!<>]=|=>/.test(v)) continue;
                // Una sola palabra sin acentos (un nombre de columna en <code>) tampoco.
                if (!/\s/.test(v) && !/[áéíóúñ]/i.test(v)) continue;
                if (/[áéíóúñ¿¡]/i.test(v) || PALABRAS.test(v)) hallazgos.push(`${path.relative(RAIZ, p).split(path.sep).join('/')}:${i + 1}  ${v.slice(0, 90)}`);
            }
        });
    }
};
recorrer(CLIENTE);
if (hallazgos.length) {
    console.log(`  FALLA ${hallazgos.length} textos de la interfaz parecen español:`);
    for (const h of hallazgos) console.log('        ' + h);
} else console.log('  ok    ningún texto de la interfaz en español');
console.log(`\n${hallazgos.length ? 0 : 1} pasadas, ${hallazgos.length ? 1 : 0} fallos`);
process.exit(hallazgos.length ? 1 : 0);
