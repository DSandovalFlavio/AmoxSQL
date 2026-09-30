/**
 * La vista previa le ponia casilla a TODA vinuta.
 *
 * `TaskItem` es el renderer de CUALQUIER <li> de MarkdownPreview, no solo de las
 * tareas, y su guarda solo miraba si habia con que escribir en el documento
 * (`onToggleTask` y la linea), no si el punto era realmente una tarea. Como
 * MarkdownEditor siempre pasa `onToggleTask`, la guarda no saltaba nunca y un
 * `- texto` normal salia con casilla, y encima marcable.
 *
 * El arreglo añade `!box` a esa guarda. Esto comprueba la premisa de la que
 * depende: que remark-gfm mete un hijo <input type="checkbox"> cuando —y solo
 * cuando— el original lleva `- [ ]` o `- [x]`. Si algun dia eso cambiara, el
 * arreglo dejaria de funcionar en silencio; esta prueba lo dice en voz alta.
 *
 *   node client/scripts/probarVinetasDeTarea.mjs
 *
 * Vive dentro de `client/` y no junto al resto de `scripts/probar*.mjs` por una
 * razon mecanica: aquellos ejercitan modulos puros sin dependencias, mientras
 * que este necesita react, react-dom y react-markdown, y node resuelve los
 * paquetes desde la carpeta del archivo que importa. `client/` es un proyecto
 * pnpm separado, asi que desde la raiz no se ven.
 */
import { Children, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

let pasadas = 0;
let fallos = 0;

/** Lo mismo que hace TaskItem para decidir: buscar un hijo casilla. */
function mirarLos(md) {
    const vistos = [];
    const li = ({ node, children }) => {
        const kids = Children.toArray(children);
        const box = kids.find((c) => c?.props?.type === 'checkbox');
        vistos.push({
            caja: !!box,
            marcada: !!box?.props?.checked,
            linea: node?.position?.start?.line ?? null,
        });
        return createElement('li', null, children);
    };
    renderToStaticMarkup(
        createElement(Markdown, { remarkPlugins: [remarkGfm], components: { li } }, md),
    );
    return vistos;
}

function comprobar(titulo, ok, detalle) {
    if (ok) { pasadas++; console.log(`  ok   ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
}

console.log('\nvinuta normal, la que estaba rota');
{
    const v = mirarLos('- ¿Cuántos usuarios se registraron pero NO compraron?\n- Otro punto\n');
    comprobar('salen los dos puntos', v.length === 2, `salieron ${v.length}`);
    comprobar('ninguno trae casilla', v.every((x) => !x.caja),
        `con casilla: ${v.filter((x) => x.caja).length}`);
}

console.log('\nvinuta con asterisco y con anidada');
{
    const v = mirarLos('* uno\n* dos\n  * dos punto uno\n');
    comprobar('salen los tres puntos', v.length === 3, `salieron ${v.length}`);
    comprobar('ninguno trae casilla', v.every((x) => !x.caja));
}

console.log('\nlista numerada');
{
    const v = mirarLos('1. primero\n2. segundo\n');
    comprobar('ninguno trae casilla', v.every((x) => !x.caja));
}

console.log('\ntareas de verdad, que SI deben llevarla');
{
    const v = mirarLos('- [ ] pendiente\n- [x] hecha\n');
    comprobar('salen las dos', v.length === 2, `salieron ${v.length}`);
    comprobar('las dos traen casilla', v.every((x) => x.caja));
    comprobar('la primera sin marcar', v[0] && !v[0].marcada);
    comprobar('la segunda marcada', !!(v[1] && v[1].marcada));
}

console.log('\nmezcla en la misma lista');
{
    const v = mirarLos('- [ ] una tarea\n- solo texto\n- [x] otra tarea\n');
    comprobar('salen los tres', v.length === 3, `salieron ${v.length}`);
    comprobar('solo la del medio se libra',
        v[0]?.caja === true && v[1]?.caja === false && v[2]?.caja === true,
        JSON.stringify(v.map((x) => x.caja)));
}

console.log('\nla linea, que es lo que se escribe de vuelta');
{
    const v = mirarLos('texto\n\n- [ ] tarea en la linea 3\n');
    comprobar('la tarea conoce su linea', v[0]?.linea === 3, `dijo ${v[0]?.linea}`);
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos\n`);
process.exit(fallos ? 1 : 0);
