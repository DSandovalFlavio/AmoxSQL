/**
 * Las capturas de la documentación, rehechas con una orden.
 *
 *     node scripts/ejemplos/capturas.mjs [--solo <nombre>] [--ejemplos <carpeta>]
 *
 * Necesita, ya en marcha:
 *   - el servidor de los ejemplos en 3911 (`servirEjemplos.mjs`, casa temporal);
 *   - la interfaz en 5173 (`pnpm client:dev`).
 * Este script abre el capturador (`capturador.cjs`, una ventana de Electron de
 * 1440×900 a escala 1.5) y recorre las recetas: cada una prepara lo que se ve
 * —proyecto, pestañas, tema— recargando la interfaz con `?reanudar=1`, hace lo
 * que haga falta en la página y guarda la foto en `docs/images/` o `images/`.
 *
 * Las pestañas se preparan escribiendo la lista que la app restaura por proyecto
 * (`amoxsql-layout-v1:<carpeta>`, rutas relativas), así cada receta empieza
 * igual por mucho que hayan tocado las anteriores.
 *
 * `--solo` admite parte del nombre (`--solo story`). Las que necesitan un modelo
 * de IA o un servicio externo no están aquí: ver docs/dev/capturas_pendientes.md.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const arg = (n, def) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : def; };
const SOLO = arg('--solo', null);
const EJEMPLOS = arg('--ejemplos', path.join(os.homedir(), 'Desktop', 'Ejemplos AmoxSQL')).replace(/\\/g, '/');
const API = 'http://localhost:3911';
const UI = 'http://localhost:5173/?apiPort=3911';
const CAP = 'http://localhost:3999';
const dormir = (ms) => new Promise(r => setTimeout(r, ms));

const TIENDA = `${EJEMPLOS}/tienda-electronica`;
const MARKETING = `${EJEMPLOS}/marketing-campanas`;
const ALMACEN = `${EJEMPLOS}/almacen-dbt`;
const BASES = { [TIENDA]: 'tienda.duckdb', [MARKETING]: 'marketing.duckdb', [ALMACEN]: ':memory:' };

// ── El capturador ─────────────────────────────────────────────────────────────
async function orden(nombre, cuerpo = {}) {
    const r = await fetch(`${CAP}/${nombre}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    const t = await r.text();
    if (!r.ok) throw new Error(`${nombre}: ${t}`);
    try { return JSON.parse(t); } catch { return t; }
}
const js = async (codigo) => {
    const r = await orden('js', { codigo: AYUDAS + codigo });
    return r?.r;
};
const tecla = (t, mods = []) => orden('tecla', { tecla: t, mods });

/** Ayudas que cada orden lleva delante (la página se recarga entre recetas). */
const AYUDAS = `
const t = {
  dormir: (ms) => new Promise(r => setTimeout(r, ms)),
  todos: (sel) => [...document.querySelectorAll(sel)],
  boton: (x) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === x || b.title === x || b.getAttribute('aria-label') === x),
  conTexto: (sel, x) => [...document.querySelectorAll(sel)].find(e => e.textContent.trim().startsWith(x)),
  pulsar: (el) => { if (!el) return false; for (const k of ['pointerdown','mousedown','pointerup','mouseup','click']) el.dispatchEvent(new MouseEvent(k, { bubbles: true, cancelable: true, view: window })); return true; },
  doble: (el) => { if (!el) return false; t.pulsar(el); el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return true; },
  menu: (el) => { if (!el) return false; const b = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.x + 30, clientY: b.y + b.height / 2 })); return true; },
  esperar: async (f, ms = 15000) => { const fin = Date.now() + ms; while (Date.now() < fin) { try { const v = f(); if (v) return v; } catch {} await t.dormir(150); } return null; },
  rect: (sel, m = 0) => { const e = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.max(0, Math.round(b.x - m)), y: Math.max(0, Math.round(b.y - m)), width: Math.round(b.width + 2 * m), height: Math.round(b.height + 2 * m) }; },
  ed: () => window.monaco?.editor.getEditors()[0],
  correr: async () => { t.boton('Run')?.click(); await t.esperar(() => document.querySelector('.rt-table, .results-table, table'), 20000); await t.dormir(800); },
  pestana: (n) => [...document.querySelectorAll('.tab-item')].find(e => e.querySelector('.tab-label')?.textContent.trim() === n),
  panel: async (prefijo) => { document.querySelector('.activity-bar-btn[title^="' + prefijo + '"]')?.click(); await t.dormir(1200); },
  ajustes: async (seccion) => { window.dispatchEvent(new CustomEvent('amox_abrir_ajustes', { detail: seccion })); await t.esperar(() => document.querySelector('.stg-theme-card, .stg-content-body'), 10000); await t.dormir(1200); },
  pestanaDe: (sel, x) => [...document.querySelectorAll(sel)].find(e => e.textContent.trim() === x),
  fijo: (re) => [...document.querySelectorAll('body *')].filter(e => getComputedStyle(e).position === 'fixed' && e.getBoundingClientRect().height > 60 && re.test(e.className)).pop(),
};
`;

// ── Preparar lo que se ve ─────────────────────────────────────────────────────
const TOURS = ['amoxsql-getting-started-seen', 'amoxsql-storyflow-tour-seen', 'amoxsql-dataflow-tour-seen', 'amox-ai-modes-tour-seen',
    'amoxsql-notebooks-tour-seen', 'amoxsql-deepdive-tour-seen', 'amoxsql-aicontext-tour-seen', 'amoxsql-vault-tour-seen', 'amoxsql-extensions-tour-seen'];
let proyectoAbierto = null;

async function pedir(ruta, cuerpo) {
    const r = await fetch(`${API}${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: JSON.stringify(cuerpo) });
    return r.json().catch(() => ({}));
}

/**
 * Deja la interfaz como la receta la quiere.
 *   proyecto  carpeta (TIENDA por defecto) · null = la bienvenida
 *   pestanas  rutas relativas al proyecto (la última queda activa)
 *   derecha   rutas en el panel derecho (divide la pantalla)
 *   tema, acento, ajustes (editorSettings parcial), ancho/alto de la ventana
 */
async function preparar({ proyecto = TIENDA, pestanas = [], derecha = [], tema = 'amoxdark', acento = 'tema', ajustes = {}, ancho = 1440, alto = 900, extra = {}, ratio = 0.42 } = {}) {
    await orden('tam', { ancho, alto });
    if (proyecto && proyecto !== proyectoAbierto) {
        await pedir('/api/project/open', { path: proyecto });
        if (BASES[proyecto]) await pedir('/api/db/connect', { path: BASES[proyecto] === ':memory:' ? ':memory:' : `${proyecto}/${BASES[proyecto]}` });
        proyectoAbierto = proyecto;
    }
    const clave = proyecto ? `amoxsql-layout-v1:${proyecto.toLowerCase()}` : null;
    const pest = (lista) => lista.map(p => ({ path: p, name: p.split('/').pop(), resultsRatio: ratio }));
    const estado = {
        'amoxsql-theme': tema, 'amoxsql-accent': acento, 'amoxsql-accent-v2': '1',
        'amoxsql-editor-settings': JSON.stringify({ explorerVista: 'carpetas', ...ajustes }),
        ...Object.fromEntries(TOURS.map(k => [k, '1'])),
        ...extra,
        ...(clave ? { [clave]: JSON.stringify({ leftTabs: pest(pestanas), rightTabs: pest(derecha), splitEnabled: derecha.length > 0 }) } : {}),
    };
    // Al salir, la página guarda sus pestañas: se le quita la escritura antes, o
    // pisaría las que se acaban de preparar.
    await orden('js', { codigo: `localStorage.clear(); sessionStorage.clear(); for (const [k, v] of Object.entries(${JSON.stringify(estado)})) localStorage.setItem(k, v);
      Storage.prototype.setItem = function () {}; Storage.prototype.removeItem = function () {}; return 'ok';` });
    await orden('ir', { url: proyecto ? `${UI}&reanudar=1` : UI });
    await js(`
      await t.esperar(() => ${proyecto ? `document.querySelector('.activity-bar, .ab-bar, [class*=activity]')` : `document.querySelector('input')`}, 20000);
      ${pestanas.length ? `await t.esperar(() => document.querySelectorAll('.tab-item').length >= ${pestanas.length + derecha.length}, 15000);` : ''}
      await t.dormir(1800);
      // lo que sale la primera vez y no es de la foto
      for (const s of ['.retomar-cerrar', '.rt-cerrar', '.ob-hint-close', '.ww-close-btn']) document.querySelector(s)?.click();
      t.boton('Skip')?.click(); t.boton('Not now')?.click();
      // el aviso «Reloaded…» de reanudar (los avisos se pintan con estilos en línea)
      await t.dormir(300);
      t.todos('body *').filter(e => getComputedStyle(e).position === 'fixed' && /^(Reloaded|The window stopped)/.test(e.textContent.trim())).forEach(e => { e.style.display = 'none'; });
      await t.dormir(1200);
      return 'ok';`);
}

async function foto(ruta, recorte = null) {
    const destino = path.join(RAIZ, ruta);
    await orden('foto', { ruta: destino, ...(recorte ? { recorte } : {}) });
    console.log('  foto', ruta);
}
/** Un clic de ratón de verdad en el centro de un elemento: Monaco y los nodos lo necesitan. */
async function clicEn(selector) {
    const r = await js(`return t.rect(${JSON.stringify(selector)});`);
    if (!r) throw new Error(`no está: ${selector}`);
    await orden('raton', { tipo: 'click', x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
    await dormir(600);
}
/** La foto de un elemento (selector CSS), con margen. */
async function fotoDe(ruta, selector, margen = 0) {
    const r = await js(`return t.rect(${JSON.stringify(selector)}, ${margen});`);
    if (!r) throw new Error(`no está: ${selector}`);
    await foto(ruta, r);
}

/** Abre una consulta (y, si se da, cambia su texto) y la ejecuta. */
async function consulta(ruta, { sql = null, pestanas = [], ...resto } = {}) {
    await preparar({ pestanas: [...pestanas, ruta], ...resto });
    await js(`
      await t.esperar(() => t.ed(), 15000); await t.dormir(500);
      ${sql ? `t.ed().setValue(${JSON.stringify(sql)}); await t.dormir(300);` : ''}
      await t.correr(); return 'ok';`);
}
const recorteSuperior = async (selector, alto) => {
    const r = await js(`return t.rect(${JSON.stringify(selector)});`);
    return { ...r, height: Math.min(r.height, alto) };
};

async function abrirFlujo() {
    await preparar({ pestanas: ['flujos/cierre_mensual.sqlchain'] });
    await js(`await t.dormir(2000); document.querySelector('.activity-bar-collapse-btn')?.click(); await t.dormir(700);
      t.boton('Fit the flow to the view')?.click(); await t.dormir(1000); return 'ok';`);
}

// ── Las recetas ───────────────────────────────────────────────────────────────
const RECETAS = {
    async bienvenida() {
        const recientes = [TIENDA, MARKETING, ALMACEN].map(r => r.replace(/\//g, '\\'));
        await preparar({ proyecto: null, extra: { 'amoxsql-recent-projects': JSON.stringify(recientes) } });
        await foto('images/01_welcome_screen.png');
    },
    async canvas() {
        await preparar({ pestanas: ['queries/01_panorama_mensual.sql', 'notebooks/analisis_2024.sqlnb', 'canvas/exploracion_2024.amoxcanvas'] });
        await js(`
          document.querySelector('.activity-bar-collapse-btn')?.click(); await t.dormir(600);
          t.boton('Refresh all')?.click();
          await t.esperar(() => !t.boton('Refresh all')?.disabled && !document.body.innerText.includes('cards to refresh'), 30000);
          await t.dormir(2500);
          document.querySelector('.react-flow__controls-fitview')?.click(); await t.dormir(900);
          return 'ok';`);
        await foto('images/02_main_ide.png');
        await foto('docs/images/notebooks/canvas.png');
    },

    // ── Editor y resultados ──
    async editor() {
        await consulta('queries/04_meta_vs_real.sql', { pestanas: ['queries/01_panorama_mensual.sql', 'queries/02_mezcla_por_categoria.sql'] });
        await foto('images/04_sql_editor.png');
    },
    async resultados() {
        await consulta('queries/03_top_productos.sql');
        await fotoDe('docs/images/results/results-table.png', '.ep-results');
    },
    async perfil() {
        await consulta('queries/07_calidad_de_datos.sql', { sql: 'SELECT * FROM ventas WHERE year(fecha) = 2024;', ratio: 0.78 });
        await js(`t.conTexto('.rt-view-btn', 'Profile')?.click(); await t.esperar(() => document.body.innerText.includes('Findings') || document.querySelector('[class*=profiler]'), 30000); await t.dormir(3500); return 'ok';`);
        await foto('images/12_data_profiler.png');
        await fotoDe('docs/images/results/data-profiler.png', '.main-content');
    },
    async plan() {
        await consulta('queries/02_mezcla_por_categoria.sql', { sql: "SELECT categoria, round(sum(importe), 2) AS venta\nFROM ventas\nWHERE fecha >= DATE '2024-07-01'\nGROUP BY categoria\nORDER BY venta DESC;" });
        await js(`t.boton('Analyze Query Plan (Ctrl+Shift+A)')?.click(); await t.esperar(() => document.querySelector('[class*=plan-modal], [class*=qpm], [role=dialog]'), 20000); await t.dormir(3000); return 'ok';`);
        await foto('images/11_query_plan.png');
        await foto('docs/images/results/execution-plan.png');
    },
    async variables() {
        await consulta('queries/08_variables.sql');
        await js(`if (!document.querySelector('.ep-variables-panel')) t.boton('Toggle Variables')?.click();
          t.conTexto('.rt-view-btn', 'Table')?.click(); await t.dormir(1200); return 'ok';`);
        await fotoDe('docs/images/editor/variables-bar.png', '.main-content');
    },
    async lambda() {
        await consulta('queries/06_estacionalidad.sql', { sql: "-- Escrita en la 5.x: DuckDB 2 ya no acepta la flecha\nSELECT categoria,\n       list_transform(list(importe), x -> round(x * 1.16, 2)) AS con_iva\nFROM ventas\nGROUP BY categoria;" });
        await js(`await t.esperar(() => document.querySelector('.ep-error'), 10000); await t.dormir(500); return 'ok';`);
        await fotoDe('docs/images/editor/lambda-rewrite.png', '.main-content');
    },
    async paleta() {
        await preparar({ pestanas: ['queries/01_panorama_mensual.sql'] });
        await js(`document.querySelector('.wtb-omnibox').click(); await t.dormir(900); return 'ok';`);
        await foto('docs/images/editor/command-palette.png');
        await foto('docs/images/user-guide/command-palette.png');
    },
    // ── Datos ──
    async base() {
        await consulta('queries/02_mezcla_por_categoria.sql');
        await js(`await t.panel('Data'); t.pulsar(t.conTexto('.db-table-item', 'ventas')); await t.dormir(900); return 'ok';`);
        await foto('images/03_database_explorer.png');
    },
    async archivos() {
        await preparar({ pestanas: ['notebooks/analisis_2024.sqlnb', 'queries/03_top_productos.sql'], ajustes: { explorerVista: 'arbol' } });
        await js(`await t.dormir(800); return 'ok';`);
        await fotoDe('docs/images/data/file-explorer.png', '.left-panel-card');
    },
    async importar() {
        await preparar({ pestanas: ['queries/01_panorama_mensual.sql'] });
        await js(`
          t.pulsar(t.conTexto('.fe-item, li, [class*=fe-fila]', 'datos')); await t.dormir(900);
          t.pulsar(t.conTexto('.fe-item, li, [class*=fe-fila]', 'ventas-mensuales')); await t.dormir(900);
          const csv = [...document.querySelectorAll('.fe-item, li, [class*=fe-fila]')].find(e => /\.csv/.test(e.textContent));
          t.menu(csv); await t.dormir(500);
          [...document.querySelectorAll('.context-menu-item')].find(e => e.textContent.trim().startsWith('Import to Database'))?.click(); await t.dormir(1500);
          return 'ok';`);
        await foto('docs/images/data/import-modal.png');
    },
    async extensiones() {
        await preparar({ pestanas: ['queries/01_panorama_mensual.sql'] });
        await js(`await t.panel('Data'); t.pulsar(t.conTexto('.sidebar-seccion-plegable__cabecera', 'Extensions')); await t.dormir(2500); document.querySelector('.sidebar-seccion-plegable__cabecera')?.scrollIntoView(); await t.dormir(400); return 'ok';`);
        await fotoDe('docs/images/data/extensions-panel.png', '.left-panel-card');
    },
    async er() {
        await preparar({ pestanas: ['queries/01_panorama_mensual.sql'] });
        await js(`await t.panel('Data'); t.boton('ER Diagram (main)')?.click(); await t.dormir(3500); document.querySelector('.react-flow__controls-fitview')?.click(); await t.dormir(800); return 'ok';`);
        await foto('images/10_er_diagram.png');
        await foto('docs/images/data/er-diagram.png');
    },
    async anidado() {
        await consulta('queries/06_estacionalidad.sql', { sql: "SELECT 'compra' AS tipo,\n       {'cliente': {'nombre': 'Ana Ruiz', 'ciudad': 'Monterrey'},\n        'pedido': {'total': 1520.50, 'productos': ['Laptop 14', 'Mouse']}}::VARIANT AS datos\nUNION ALL\nSELECT 'visita', {'cliente': {'nombre': 'Luis Peña'}, 'pagina': '/ofertas'}::VARIANT;", ratio: 0.6 });
        await js(`const c = [...document.querySelectorAll('td, .rt-cell')].find(e => e.textContent.includes('Ana Ruiz')); t.pulsar(c); await t.dormir(1000); return 'ok';`);
        await fotoDe('docs/images/results/nested-value.png', '.main-content');
    },

    // ── Story Flow ──
    async storyflow() {
        await preparar({ pestanas: ['charts/venta_mensual.amoxvis'] });
        await js(`await t.esperar(() => document.querySelector('.vega-embed svg, .vega-embed canvas'), 20000); await t.dormir(2000); return 'ok';`);
        await foto('images/06_data_visualizer.png');
        await foto('docs/images/visualization/story-flow-full.png');
    },
    async historia() {
        await preparar({ pestanas: ['charts/top_productos.amoxvis'] });
        await js(`await t.esperar(() => document.querySelector('.vega-embed svg, .vega-embed canvas'), 20000); t.pulsar(t.boton('Story')); await t.dormir(2000); return 'ok';`);
        await foto('docs/images/visualization/story-stage.png');
    },
    async tipos() {
        await preparar({ pestanas: ['charts/venta_mensual.amoxvis'] });
        await js(`await t.esperar(() => document.querySelector('.vega-embed svg, .vega-embed canvas'), 20000); t.pulsar(t.boton('Type')); await t.dormir(1500); return 'ok';`);
        await foto('docs/images/visualization/chart-type-selector.png');
    },
    async formato() {
        await preparar({ pestanas: ['charts/top_productos.amoxvis'] });
        await js(`await t.esperar(() => document.querySelector('.vega-embed svg, .vega-embed canvas'), 20000); t.pulsar(t.boton('Format')); await t.dormir(1500); return 'ok';`);
        await foto('docs/images/visualization/format-style-tabs.png');
    },
    async exportar() {
        await preparar({ pestanas: ['charts/top_productos.amoxvis'] });
        await js(`await t.esperar(() => document.querySelector('.vega-embed svg, .vega-embed canvas'), 20000); t.pulsar(t.boton('Export')); await t.dormir(1500); return 'ok';`);
        await foto('docs/images/visualization/export-stage.png');
    },

    // ── Cuaderno, deck, diagrama ──
    async cuaderno() {
        await preparar({ pestanas: ['notebooks/analisis_2024.sqlnb'] });
        await js(`await t.dormir(1000); [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('Refresh'))?.click(); await t.dormir(800); [...document.querySelectorAll('[role=dialog] button, .modal-overlay button, button')].reverse().find(b => b.textContent.trim() === 'Refresh')?.click(); await t.esperar(() => !document.body.innerText.includes('Not run yet'), 40000); await t.dormir(3000); return 'ok';`);
        await foto('images/05_sql_notebook.png');
        await foto('docs/images/notebooks/notebook.png');
    },
    async deck() {
        await preparar({ pestanas: ['reportes/resumen_2024.amoxdeck'] });
        await js(`await t.dormir(2500); for (let i = 0; i < 2; i++) { t.boton('Next slide')?.click(); await t.dormir(900); } [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Clean view')?.click(); await t.dormir(4000); return 'ok';`);
        await foto('docs/images/reports/report-flow-studio.png');
        await js(`t.pulsar(t.boton('Export to PowerPoint')?.nextElementSibling); await t.dormir(800); return 'ok';`);
        await foto('docs/images/reports/export-to-office-menu.png');
    },
    async diagrama() {
        await preparar({ pestanas: ['diagramas/arquitectura.amoxdiagram'] });
        await js(`await t.dormir(2000); document.querySelector('.activity-bar-collapse-btn')?.click(); await t.dormir(1500); return 'ok';`);
        await foto('docs/images/editor/amoxdiagram.png');
    },

    // ── Data Flow ──
    async flujo() {
        await abrirFlujo();
        await js(`t.pulsar(document.querySelectorAll('.react-flow__node')[2]); await t.dormir(2500); return 'ok';`);
        await foto('docs/images/data-flow/data-flow-editor.png');
        await js(`t.pulsar([...document.querySelectorAll('.react-flow__node')].find(e => /Excel|Libro/i.test(e.textContent))); await t.dormir(2000); t.pulsar(t.boton('Configure') || [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Configure')); await t.dormir(1500); return 'ok';`);
        await foto('docs/images/data-flow/excel-node.png');
    },
    async pasos() {
        await abrirFlujo();
        await js(`t.pulsar(document.querySelectorAll('.react-flow__node')[2]); await t.dormir(800); return 'ok';`);
        await clicEn('.chain-node-quickadd');
        await js(`await t.dormir(1200); return 'ok';`);
        await foto('docs/images/data-flow/node-palette.png');
    },
    async corrida() {
        await abrirFlujo();
        await js(`t.boton('Run the whole flow')?.click(); await t.esperar(() => document.body.innerText.includes('Chain completed'), 90000); await t.dormir(1500); t.boton('Fit the flow to the view')?.click(); await t.dormir(1000); return 'ok';`);
        await foto('docs/images/data-flow/running-status.png');
    },
    async programar() {
        await abrirFlujo();
        await js(`t.pulsar(t.boton('More actions')); await t.dormir(500); [...document.querySelectorAll('button, [role=menuitem], div')].find(e => e.textContent.trim() === 'Schedule…' && e.children.length < 3)?.click(); await t.dormir(1800); return 'ok';`);
        await foto('docs/images/data-flow/schedule-dialog.png');
    },
    async cambios() {
        const fs = await import('node:fs');
        const archivo = `${TIENDA}/flujos/cierre_mensual.sqlchain`;
        const original = fs.readFileSync(archivo, 'utf8');
        fs.writeFileSync(archivo, original.replace(/top 15/g, 'top 20').replace(/"limit":\s*15/g, '"limit": 20').replace(/"n":\s*15/g, '"n": 20'));
        try { await abrirFlujo(); } finally { setTimeout(() => fs.writeFileSync(archivo, original), 15000); }
        await js(`t.pulsar(t.boton('More actions')); await t.dormir(500); [...document.querySelectorAll('button, [role=menuitem], div')].find(e => e.textContent.trim() === 'What changed' && e.children.length < 3)?.click(); await t.dormir(2500); return 'ok';`);
        await foto('docs/images/data-flow/what-changed.png');
    },
    async operacion() {
        await preparar({ pestanas: ['queries/01_panorama_mensual.sql'] });
        await js(`window.dispatchEvent(new CustomEvent('amox_abrir_operacion')); await t.dormir(2500); return 'ok';`);
        await foto('docs/images/data-flow/operations.png');
    },

    // ── Ajustes, workspaces, la ventana ──
    async ajustes() {
        await preparar({ pestanas: ['queries/01_panorama_mensual.sql'] });
        await js(`await t.ajustes('appearance'); return 'ok';`);
        await foto('images/09_settings_modal.png');
        await fotoDe('docs/images/user-guide/theme-gallery.png', '.stg-content-body', 0);
    },
    async ia() {
        await preparar({ pestanas: ['queries/01_panorama_mensual.sql'] });
        await js(`await t.ajustes('ai'); t.pulsar(t.pestanaDe('button, [role=tab]', 'Models')); await t.dormir(1200); return 'ok';`);
        await foto('docs/images/ai/settings-ai-providers.png');
        await js(`t.pulsar(t.pestanaDe('button, [role=tab]', 'Knowledge')); await t.dormir(1500); return 'ok';`);
        await foto('docs/images/ai/context-folder.png');
        await js(`t.pulsar(t.pestanaDe('button, [role=tab]', 'Skills')); await t.dormir(1500); return 'ok';`);
        await foto('docs/images/ai/skills-panel.png');
    },
    async workspaces() {
        await preparar({ proyecto: null, extra: { 'amoxsql-recent-projects': JSON.stringify([TIENDA, MARKETING, ALMACEN]) } });
        await js(`t.pulsar(document.querySelector('.ws-grupos-btn')); await t.dormir(2500); return 'ok';`);
        await foto('docs/images/user-guide/workspaces.png');
        await js(`t.pulsar(t.conTexto('[class*=tarjeta], [class*=card], button', 'Electrónica Global')); await t.dormir(2500); return 'ok';`);
        await foto('docs/images/user-guide/workspace-page.png');
    },
    async titulo() {
        await preparar({ pestanas: ['queries/01_panorama_mensual.sql'] });
        await clicEn('.wtb-crumb');
        await js(`await t.dormir(900); return 'ok';`);
        await foto('docs/images/user-guide/title-bar-workspace.png', { x: 0, y: 0, width: 720, height: 420 });
    },
    async barra() {
        await preparar({ pestanas: ['queries/01_panorama_mensual.sql'], ajustes: { activityBarLabels: true } });
        await js(`await t.dormir(800); return 'ok';`);
        const r = await js(`const a = document.querySelector('.activity-bar-btn').parentElement.closest('[class*=activity-bar]') || document.querySelector('.activity-bar-btn').parentElement; return t.rect(a, 4);`);
        await foto('docs/images/user-guide/activity-bar.png', r);
    },
    async seleccionDeBase() {
        await preparar({ proyecto: null });
        await js(`
          const i = document.querySelector('input');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(TIENDA)});
          i.dispatchEvent(new Event('input', { bubbles: true })); await t.dormir(300);
          t.boton('Open Project')?.click(); await t.dormir(2500);
          t.boton('Leave unlinked')?.click(); await t.dormir(1200);
          return 'ok';`);
        await foto('docs/images/user-guide/db-selection-modal.png');
        proyectoAbierto = null;
    },

    // ── dbt ──
    async dbt() {
        await preparar({ proyecto: ALMACEN, pestanas: ['models/marts/fct_revenue_monthly.sql'] });
        await js(`await t.panel('DBT'); await t.dormir(2000); return 'ok';`);
        await foto('images/08_dbt_studio.png');
        await foto('docs/images/dbt/dbt-studio.png');
        await foto('docs/images/dbt/model-bar.png', await recorteSuperior('.main-content', 260));
    },

    // ── Biblioteca y editor ──
    async snippets() {
        await preparar({ pestanas: ['queries/01_panorama_mensual.sql'] });
        await js(`await t.panel('Library'); t.pulsar(t.pestanaDe('button, [role=tab]', 'Snippets')); await t.dormir(1500); return 'ok';`);
        await fotoDe('docs/images/editor/snippets-panel.png', '.left-panel-card');
    },
    async historial() {
        await consulta('queries/03_top_productos.sql', { pestanas: ['queries/01_panorama_mensual.sql'] });
        await js(`await t.panel('Library'); t.pulsar(t.pestanaDe('button, [role=tab]', 'History')); await t.dormir(1500); return 'ok';`);
        await fotoDe('docs/images/editor/history-modal.png', '.left-panel-card');
        await js(`t.pulsar(t.pestanaDe('button, [role=tab]', 'Saved')); await t.dormir(1200); return 'ok';`);
        await fotoDe('docs/images/editor/bookmarks-tab.png', '.left-panel-card');
    },
    async cte() {
        await preparar({ pestanas: ['queries/01_panorama_mensual.sql'] });
        await js(`await t.esperar(() => document.querySelector('.glyph-margin-widgets div[class*=cte], .cte-debug-glyph, [class*=cte-glyph]'), 10000); await t.dormir(500); return 'ok';`);
        await foto('docs/images/editor/cte-debug-glyph.png', await recorteSuperior('.main-content', 330));
        await clicEn('.cte-debug-glyph');
        await js(`await t.dormir(3000); return 'ok';`);
        await foto('docs/images/editor/cte-debug-modal.png');
    },
    async autocompletado() {
        await preparar({ pestanas: ['queries/05_ciudades.sql'] });
        await js(`
          const ed = t.ed(); ed.setValue('SELECT v.\\nFROM ventas AS v\\nJOIN productos AS p USING (producto);'); ed.focus();
          ed.setPosition({ lineNumber: 1, column: 10 }); await t.dormir(300);
          ed.trigger('keyboard', 'editor.action.triggerSuggest', {}); await t.dormir(1500); return 'ok';`);
        await foto('docs/images/editor/autocomplete-dot-access.png', await recorteSuperior('.main-content', 420));
        await js(`
          const ed = t.ed(); ed.trigger('keyboard', 'hideSuggestWidget', {}); ed.setValue('SELECT date_trunc(\\'month\\', fecha) AS mes, sum(importe)\\nFROM ventas\\nGROUP BY ALL;');
          ed.setPosition({ lineNumber: 1, column: 10 }); ed.focus(); await t.dormir(300);
          ed.trigger('keyboard', 'editor.action.showHover', {}); await t.dormir(1800); return 'ok';`);
        await foto('docs/images/editor/autocomplete-hover-doc.png', await recorteSuperior('.main-content', 420));
    },
    async comparar() {
        await consulta('queries/02_mezcla_por_categoria.sql');
        await js(`
          t.pulsar(t.conTexto('.rt-action-btn', 'Save / Share')); await t.dormir(400);
          t.pulsar([...document.querySelectorAll('.toolbar-dropdown-item')].find(e => e.textContent.trim().startsWith('Store for comparison'))); await t.dormir(600);
          t.ed().setValue("SELECT categoria, round(sum(importe), 2) AS venta, sum(cantidad) AS unidades, round(100 * sum(importe) / sum(sum(importe)) OVER (), 1) AS participacion_pct FROM ventas WHERE fecha >= DATE '2024-07-01' GROUP BY categoria ORDER BY venta DESC;");
          document.body.click(); await t.dormir(300);
          const antes = document.querySelector('.ep-results tbody tr')?.innerText;
          for (let i = 0; i < 3 && document.querySelector('.ep-results tbody tr')?.innerText === antes; i++) { t.boton('Run')?.click(); await t.esperar(() => document.querySelector('.ep-results tbody tr')?.innerText !== antes, 5000); }
          await t.dormir(800);
          t.pulsar(t.boton('Compare') || [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('Compare'))); await t.dormir(2000);
          [...document.querySelectorAll('button')].find(b => /Changed/.test(b.textContent))?.click(); await t.dormir(800);
          return 'ok';`);
        await foto('docs/images/results/compare-results.png');
    },
    async upgrade() {
        // Una base escrita por la 5.x (fixture del motor 1.5.6), copiada aparte.
        const fs = await import('node:fs');
        const vieja = path.join(os.tmpdir(), 'amox-capturas-tienda-5.duckdb');
        fs.copyFileSync(path.join(RAIZ, 'scripts/fixtures/motor/vistas_con_catalogo_v15.duckdb'), vieja);
        await preparar({ pestanas: ['queries/01_panorama_mensual.sql'] });
        await pedir('/api/db/connect', { path: vieja });
        await orden('ir', { url: `${UI}&reanudar=1` });
        await dormir(5000);
        await js(`await t.panel('Data'); await t.dormir(1200); return 'ok';`);
        await fotoDe('docs/images/data/upgrade-format.png', '.left-panel-card');
        await pedir('/api/db/connect', { path: `${TIENDA}/tienda.duckdb` });
    },
    async pestanas() {
        await preparar({ pestanas: ['queries/01_panorama_mensual.sql', 'notebooks/analisis_2024.sqlnb', 'charts/venta_mensual.amoxvis', 'flujos/cierre_mensual.sqlchain', 'queries/03_top_productos.sql'] });
        await js(`t.pulsar(t.boton('New File Options')); await t.dormir(600); return 'ok';`);
        await foto('docs/images/editor/tab-bar.png', await recorteSuperior('.main-content', 330));
    },
};

// ── Correr ────────────────────────────────────────────────────────────────────
// Si ya hay un capturador abierto (para probar una receta y seguir mirando con
// él), se usa ése y se deja abierto.
const yaAbierto = await fetch(CAP).then(() => true, () => false);
const electron = require('electron');
const cap = yaAbierto ? null : spawn(electron, [path.join(RAIZ, 'scripts/ejemplos/capturador.cjs'), '--url', UI], { stdio: 'inherit' });
let listo = yaAbierto;
for (let i = 0; i < 60 && !listo; i++) { try { await fetch(CAP); listo = true; } catch { await dormir(500); } }
if (!listo) { console.error('el capturador no arrancó'); cap?.kill(); process.exit(1); }

let fallos = 0;
try {
    for (const [nombre, receta] of Object.entries(RECETAS)) {
        if (SOLO && !nombre.includes(SOLO)) continue;
        console.log(`— ${nombre}`);
        try { await receta(); } catch (e) { fallos++; console.log(`  FALLÓ: ${e.message}`); }
    }
} finally {
    cap?.kill();
}
console.log(fallos ? `${fallos} receta(s) fallaron` : 'listo');
process.exit(fallos ? 1 : 0);
