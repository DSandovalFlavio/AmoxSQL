import { API_BASE } from '../api.js';
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import {
    LuSave, LuBot, LuX, LuPencilLine, LuEye, LuColumns2, LuPanelLeft,
} from 'react-icons/lu';
import './MarkdownEditor.css';
import { registerMonaco, MONACO_THEME_NAME } from '../monacoTheme.js';
import MarkdownPreview from './markdown/MarkdownPreview';
import {
    parse, blockAt, replaceLineMarker, toggleTaskLine, sectionProgress,
    moveSection, tasks, enlacesSalientes, leerFrontmatter, escribirFrontmatter,
} from './markdown/markdownModel';
import { INSERTABLES, GROUPS, snippetFor, plainText } from './markdown/markdownInsertables';
import { registerSlashMenu } from './markdown/slashMenu';
import { estadoPorSeccion } from './markdown/gitSections';
import { chainAMermaid } from './markdown/diagramFromChain';
import EditorOverlay from './markdown/EditorOverlay';
import OutlinePanel from './markdown/OutlinePanel';
import DocPanel from './markdown/DocPanel';
import InsertMenu from './markdown/InsertMenu';
import { useToast } from './ToastProvider';
import { useDialog } from './dialogs/DialogProvider';

// ── Editor manipulation helpers ───────────────────────────────────────────────

function wrapSelection(editor, prefix, suffix = prefix) {
    const selection = editor.getSelection();
    const selected = editor.getModel().getValueInRange(selection);
    editor.executeEdits('mde', [{ range: selection, text: `${prefix}${selected}${suffix}`, forceMoveMarkers: true }]);
    editor.focus();
}

/**
 * Inserta en el cursor — salvo que el cursor este DENTRO del front-matter, en
 * cuyo caso baja al cuerpo primero. Sin esta guarda, insertar cualquier cosa
 * con el documento recien abierto (cursor en 1,1) parte la cabecera en dos y
 * deja de ser YAML valido.
 */
function insertBlock(editor, text) {
    const model = editor.getModel();
    if (model) {
        const linea = editor.getPosition()?.lineNumber ?? 1;
        const bloque = blockAt(parse(model.getValue()), linea);
        if (bloque.type === 'frontmatter') {
            const destino = Math.min(bloque.endLine + 1, model.getLineCount());
            editor.setPosition({ lineNumber: destino, column: model.getLineMaxColumn(destino) });
        }
    }
    editor.executeEdits('mde', [{ range: editor.getSelection(), text, forceMoveMarkers: true }]);
    editor.focus();
}

// Convierte las líneas de la selección al marcador dado. La decisión de qué
// sustituir vive en markdownModel (`replaceLineMarker`, con pruebas); aquí
// solo queda el pegamento con Monaco.
function setLineMarker(editor, marker) {
    const selection = editor.getSelection();
    const model = editor.getModel();
    const edits = [];
    for (let n = selection.startLineNumber; n <= selection.endLineNumber; n++) {
        const { prefixLength, text } = replaceLineMarker(model.getLineContent(n), marker);
        edits.push({
            range: { startLineNumber: n, startColumn: 1, endLineNumber: n, endColumn: prefixLength + 1 },
            text,
        });
    }
    if (edits.length) editor.executeEdits('mde', edits);
    editor.focus();
}

// Inserta un snippet con sus paradas de tabulación aprovechando el controlador
// de Monaco — el mismo que usa el menú de "/". Si no estuviera disponible, cae
// a texto plano en vez de escribir los "${1:...}" en el documento.
function insertSnippet(editor, snippet) {
    const controller = editor.getContribution('snippetController2');
    if (controller?.insert) controller.insert(snippet);
    else insertBlock(editor, plainText(snippet));
    editor.focus();
}

// ── Constants ─────────────────────────────────────────────────────────────────

// La vista lleva etiqueta, no solo icono: un lapiz y un ojo no dicen por si
// solos que uno escribe markdown y el otro lo ensena compuesto.
const VIEW_MODES = [
    { id: 'edit', Icon: LuPencilLine, label: 'Escribir', title: 'Solo el documento (Ctrl+Shift+V rota)' },
    { id: 'split', Icon: LuColumns2, label: 'Dividido', title: 'Markdown y vista previa (Ctrl+Shift+V rota)' },
    { id: 'preview', Icon: LuEye, label: 'Leer', title: 'Solo la vista previa (Ctrl+Shift+V rota)' },
];

// El catálogo de bloques vive en markdownInsertables y se dibuja en
// InsertMenu, anclado a la manija del margen. El selector de bloque de la
// barra desapareció: Ctrl+1..6 y la manija hacen lo mismo sin ocupar sitio fijo.

// El cuaderno del proyecto: donde aterriza la captura rápida. Se crea si no
// existe. Configurable en ajustes cuando haga falta más de uno.
const NOTES_FILE = 'notas.md';

const INSERT_GROUPS = GROUPS.map(group => ({
    ...group,
    items: INSERTABLES.filter(item => item.group === group.id),
}));

// ── Component ─────────────────────────────────────────────────────────────────

const MarkdownEditor = ({
    content,
    onChange,
    onSave,
    onRequestSaveAs,
    theme,
    editorSettings,
    onToggleAi,
    showAiSidebar,
    isActive,
    onOpenFile,
    filePath,
    onBuscarProyecto,
    isDirty,
}) => {
    const toast = useToast();
    const dialog = useDialog();

    const editorRef = useRef(null);
    const containerRef = useRef(null);
    const isResizingRef = useRef(false);
    const cursorLineRef = useRef(1);
    // Los addCommand de Monaco se registran una vez; la ref evita que se queden
    // con la primera versión del callback y con un outline vacío.
    const moveCurrentSectionRef = useRef(() => {});

    const [cursorLine, setCursorLine] = useState(1);
    // Dónde se pidió insertar un bloque: línea y posición en píxeles dentro
    // del lienzo. Lo manda la manija del margen.
    const [insertAt, setInsertAt] = useState(null);
    const [editorInstance, setEditorInstance] = useState(null);
    const [splitPos, setSplitPos] = useState(null); // null = 50/50
    const [isExporting, setIsExporting] = useState(false);

    const [viewMode, setViewMode] = useState(() => {
        const saved = localStorage.getItem('amoxsql-md-view-mode');
        if (saved && ['edit', 'split', 'preview'].includes(saved)) return saved;
        return editorSettings?.markdownDefaultView || 'edit';
    });

    const [widthMode, setWidthMode] = useState(() => {
        const saved = localStorage.getItem('amoxsql-md-width-mode');
        return saved === 'full' ? 'full' : 'compact';
    });
    // La estructura ahora es el margen izquierdo y viene abierta: es
    // navegación, no una herramienta que haya que ir a buscar.
    const [showRail, setShowRail] = useState(() => localStorage.getItem('amoxsql-md-rail') !== 'off');
    const [focusMode, setFocusMode] = useState(false);
    // Qué columnas caben. Se mide de verdad en vez de suponerlo: el editor
    // comparte pantalla con el árbol de archivos y con el asistente, y ninguno
    // de los dos avisa cuando cambia de tamaño.
    const [cabe, setCabe] = useState({ rail: true, panel: true });
    const [exportPendiente, setExportPendiente] = useState(false);
    // Se incrementa al guardar: una tarea recién escrita aparece en el panel
    // sin tener que pedir el refresco a mano.
    const [tasksToken, setTasksToken] = useState(0);
    // Cambios de Git por seccion. Solo tiene sentido con el documento GUARDADO:
    // el diff habla del archivo en disco y el panel del documento en memoria,
    // asi que con cambios sin guardar los numeros se desplazarian y mentirian.
    const [gitPorSeccion, setGitPorSeccion] = useState(null);
    const [retroenlaces, setRetroenlaces] = useState([]);
    const [chains, setChains] = useState([]);

    const cargarGit = useCallback(async (secciones) => {
        if (!filePath || !secciones?.length) { setGitPorSeccion(null); return; }
        try {
            const r = await fetch(`${API_BASE}/api/git/diff?file=${encodeURIComponent(filePath)}`);
            if (!r.ok) { setGitPorSeccion(null); return; }
            const { diff } = await r.json();
            setGitPorSeccion(estadoPorSeccion(secciones, diff));
        } catch {
            // Sin repositorio, o Git no disponible: simplemente no se marca nada.
            setGitPorSeccion(null);
        }
    }, [filePath]);

    // Quién enlaza a este documento. Sale del mismo índice del proyecto que
    // alimenta los pendientes y la búsqueda: un recorrido, tres funciones.
    useEffect(() => {
        if (!filePath) { setRetroenlaces([]); return undefined; }
        let vivo = true;
        (async () => {
            try {
                const r = await fetch(`${API_BASE}/api/docs/index`);
                if (!r.ok) return;
                const docs = await r.json();
                const mio = filePath.split('\\').join('/');
                const nombre = mio.split('/').pop();
                if (vivo) {
                    setRetroenlaces(docs.filter(d => d.path !== mio
                        && d.links?.some(l => l === mio || l.endsWith(`/${nombre}`) || l === nombre)));
                }
            } catch { /* sin proyecto indexable: no hay retroenlaces */ }
        })();
        return () => { vivo = false; };
    }, [filePath, tasksToken]);

    // Las chains del proyecto, para poder generar su diagrama. Se piden al
    // abrir el menu de insertar, no al montar: casi nadie lo usa cada vez.
    const cargarChains = useCallback(async () => {
        try {
            const r = await fetch(`${API_BASE}/api/files/list?path=`);
            if (!r.ok) return;
            const raiz = await r.json();
            const encontradas = [];
            const mirar = async (entradas, base) => {
                for (const f of entradas) {
                    const ruta = base ? `${base}/${f.name}` : f.name;
                    if (f.isDirectory) {
                        if (f.name.startsWith('.') || f.name === 'node_modules') continue;
                        const sub = await fetch(`${API_BASE}/api/files/list?path=${encodeURIComponent(ruta)}`);
                        if (sub.ok) await mirar(await sub.json(), ruta);
                    } else if (f.name.toLowerCase().endsWith('.sqlchain')) {
                        encontradas.push(ruta);
                    }
                }
            };
            await mirar(raiz, '');
            setChains(encontradas);
        } catch { setChains([]); }
    }, []);

    /** Lee una chain y mete su diagrama en el documento. */
    const insertarDiagramaDeChain = useCallback(async (ruta) => {
        try {
            const r = await fetch(`${API_BASE}/api/file?path=${encodeURIComponent(ruta)}`);
            const data = await r.json();
            if (data.error) throw new Error(data.error);
            const mermaid = chainAMermaid(JSON.parse(data.content));
            if (!mermaid) { toast.warning(`${ruta.split('/').pop()} no tiene nodos que dibujar`); return; }
            // Sin pasar por `act`: esa referencia se declara mas abajo y en el
            // array de dependencias reventaria por zona muerta temporal.
            const editor = editorRef.current;
            if (editor) insertBlock(editor, mermaid);
            toast.success('Diagrama generado — a partir de aquí es markdown editable');
        } catch (e) {
            toast.error(`No se pudo leer la chain: ${e.message}`);
        }
    }, [toast]);

    const handleSave = useCallback(() => {
        onSave?.();
        setTasksToken(t => t + 1);
    }, [onSave]);

    const toolbarVisible = editorSettings?.markdownToolbarVisible ?? true;


    // ── Bloque bajo el cursor ─────────────────────────────────────────────────
    // El parseo va con retardo (el documento cambia en cada tecla) pero el
    // cursor no: moverse por un documento que no ha cambiado reaprovecha el
    // árbol cacheado de markdownModel, así que solo se recalcula el descriptor.
    const [parsedContent, setParsedContent] = useState(content || '');

    useEffect(() => {
        const id = setTimeout(() => setParsedContent(content || ''), 120);
        return () => clearTimeout(id);
    }, [content]);

    // En vista solo-previa Monaco se desmonta, pero la ref se quedaría
    // apuntando a un editor con el modelo ya desechado. Soltarla aquí es lo que
    // hace que marcar una casilla caiga al camino alternativo, y que el overlay
    // no intente engancharse a un editor muerto.
    useEffect(() => {
        if (viewMode !== 'preview') return;
        editorRef.current = null;
        setEditorInstance(null);
    }, [viewMode]);


    // La estructura del documento con su progreso. Alimenta a la vez el panel
    // lateral y los contadores que la vista previa pinta junto a cada título.
    const outline = useMemo(() => {
        try {
            return sectionProgress(parse(parsedContent));
        } catch (e) {
            console.error('Failed to read document outline', e);
            return [];
        }
    }, [parsedContent]);

    // Las casillas de ESTE documento. Antes se calculaban dentro de las
    // estadísticas y se tiraban; ahora son el contenido del bloque de tareas.
    const tareasDoc = useMemo(() => {
        try { return tasks(parse(parsedContent)); } catch { return []; }
    }, [parsedContent]);

    // A qué apunta el documento. Con los retroenlaces forman el bloque de
    // enlaces: hacia dónde sale y quién entra.
    const enlaces = useMemo(() => {
        try { return enlacesSalientes(parse(parsedContent)); } catch { return []; }
    }, [parsedContent]);

    const taskProgress = useMemo(
        () => new Map(outline.map(s => [s.headingLine, { done: s.done, total: s.total }])),
        [outline],
    );

    // La cabecera se lee del contenido con retardo, como el resto del modelo.
    const docMeta = useMemo(() => {
        try { return leerFrontmatter(parsedContent); } catch { return null; }
    }, [parsedContent]);

    // Editar una ficha reescribe SOLO el bloque de front-matter. Va por
    // executeEdits sobre el modelo completo para que entre en el deshacer.
    const cambiarMeta = useCallback((cambios) => {
        const editor = editorRef.current;
        const model = editor?.getModel?.();
        const vivo = model && !model.isDisposed?.() ? model.getValue() : (content || '');
        const nuevo = escribirFrontmatter(vivo, cambios);
        if (nuevo === vivo) return;
        if (model && !model.isDisposed?.()) {
            editor.executeEdits('mde', [{ range: model.getFullModelRange(), text: nuevo }]);
        } else {
            onChange?.(nuevo);
        }
    }, [content, onChange]);

    // Por ref para no re-pedir el diff en cada tecla: solo interesa al abrir el
    // archivo, al guardar y cuando cambia el numero de secciones.
    const outlineRef = useRef([]);
    useEffect(() => { outlineRef.current = outline; }, [outline]);
    useEffect(() => { cargarGit(outlineRef.current); }, [cargarGit, tasksToken, outline.length]);

    // ── Barra de estado ──────────────────────────────────────────────────────
    // Palabras y lectura se cuentan sobre la PROSA: sin bloques de código, sin
    // front-matter y sin los signos del markdown. Contar las tildes de un
    // bloque de bash como palabras daría un tiempo de lectura de fantasía.
    const stats = useMemo(() => {
        const texto = (parsedContent || '')
            .replace(/^---\n[\s\S]*?\n---\n/, '')
            .replace(/```[\s\S]*?```/g, '')
            .replace(/`[^`]*`/g, '')
            .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/^[>\s]*[-*+]\s+(\[[ xX]\]\s*)?/gm, '')
            .replace(/[#*_~|>]/g, '');
        const palabras = texto.split(/\s+/).filter(Boolean).length;
        // Las casillas se cuentan del árbol, no sumando secciones: las secciones
        // anidan y un H1 volvería a contar todo lo que ya contaron sus H2.
        return {
            palabras,
            minutos: Math.max(1, Math.round(palabras / 200)),
            secciones: outline.length,
            casillas: { done: tareasDoc.filter(t => t.done).length, total: tareasDoc.length },
        };
    }, [parsedContent, outline, tareasDoc]);

    // ── Cuántas columnas caben ───────────────────────────────────────────────
    // Tres columnas necesitan sitio. El orden de sacrificio no es casual: la
    // estructura cae primero porque tiene sustituto inmediato (Ctrl+Shift+O la
    // devuelve); los metadatos no tienen ninguno. En vista dividida cae también,
    // porque la previsualización ya parte la columna central en dos.
    //
    // Se guardan las DECISIONES, no los pixeles. El arbol de archivos se pliega
    // con una transicion de `width`, asi que el ancho cambia en cada fotograma;
    // guardarlo en estado re-renderizaba el editor entero sesenta veces por
    // segundo —con el panel, el margen y un `updateOptions` de Monaco cada vez—
    // y eso se veia como tirones en la animacion. Devolver el mismo objeto
    // cuando nada cambia hace que React se salte el re-render: durante una
    // animacion completa hay como mucho un cambio de estado, no quince.
    useEffect(() => {
        const nodo = containerRef.current;
        if (!nodo || typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(([e]) => {
            const w = e.contentRect.width;
            setCabe(prev => (prev.rail === (w >= 990) && prev.panel === (w >= 760)
                ? prev
                : { rail: w >= 990, panel: w >= 760 }));
        });
        ro.observe(nodo);
        return () => ro.disconnect();
    }, []);

    // Los umbrales son del ancho que le queda AL EDITOR, no de la ventana: con
    // el árbol de archivos abierto, una ventana de 1600 deja 1040 aquí. El
    // lienzo necesita unos 460 px para no estrangular la línea; lo que sobra
    // decide cuántas columnas caben.
    const panelVisible = cabe.panel && !focusMode;
    // Si no cabe, el margen no se puede enseñar por mucho que el usuario quiera.
    const railCabe = cabe.rail && !focusMode && viewMode !== 'split';
    const railVisible = showRail && railCabe;

    // ── Navegación y reordenación de secciones ───────────────────────────────
    const goToSection = useCallback((section) => {
        const editor = editorRef.current;
        if (editor?.getModel?.()) {
            editor.revealLineNearTop(section.headingLine);
            editor.setPosition({ lineNumber: section.headingLine, column: 1 });
            editor.focus();
        }
        // En vista previa el salto es por ancla, igual que el índice de antes.
        const el = document.getElementById(section.slug);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    /**
     * Mueve una sección delante de otra. Se aplica como UNA sola edición sobre
     * el modelo completo para que el movimiento se deshaga de una vez, en vez
     * de dejar media docena de pasos en la pila.
     */
    const moveSectionTo = useCallback((fromHeadingLine, toHeadingLine) => {
        const editor = editorRef.current;
        const model = editor?.getModel?.();
        const vivo = model && !model.isDisposed?.() ? model.getValue() : (content || '');
        const nuevo = moveSection(vivo, fromHeadingLine, toHeadingLine);
        if (nuevo === vivo) return;

        if (model && !model.isDisposed?.()) {
            editor.executeEdits('mde', [{ range: model.getFullModelRange(), text: nuevo }]);
            editor.focus();
        } else {
            onChange?.(nuevo);
        }
    }, [content, onChange]);

    /**
     * Sube o baja una sección entre sus hermanas del mismo nivel. Sin línea,
     * actúa sobre la sección donde está el cursor.
     */
    const moveSectionBy = useCallback((direccion, headingLine = null) => {
        const actual = headingLine
            ? outline.find(s => s.headingLine === headingLine)
            : [...outline].reverse().find(s => cursorLineRef.current >= s.startLine && cursorLineRef.current <= s.endLine);
        if (!actual) return;
        const hermanas = outline.filter(s => s.level === actual.level);
        const i = hermanas.findIndex(s => s.headingLine === actual.headingLine);
        if (i < 0) return;

        if (direccion === 'up') {
            const previa = hermanas[i - 1];
            if (previa) moveSectionTo(actual.headingLine, previa.headingLine);
        } else {
            // Bajar es subir la siguiente por delante: así basta con "insertar
            // antes de" y no hace falta un caso especial para la última.
            const siguiente = hermanas[i + 1];
            if (siguiente) moveSectionTo(siguiente.headingLine, actual.headingLine);
        }
    }, [outline, moveSectionTo]);

    useEffect(() => { moveCurrentSectionRef.current = moveSectionBy; }, [moveSectionBy]);

    // ── PDF export ─────────────────────────────────────────────────────────────
    /**
     * Exporta a PDF de verdad, no a una captura.
     *
     * La versión anterior rasterizaba la vista previa con html2canvas y metía
     * la imagen en un PDF: texto no seleccionable, no buscable, enlaces
     * muertos y cortes de página a ciegas. Ahora el HTML del documento se manda
     * al motor de impresión de Chromium por IPC, que produce texto real.
     *
     * Se exporta SIEMPRE en claro: un PDF con fondo oscuro es ilegible
     * impreso, y gasta el tóner de quien lo reciba.
     */
    const handleExportPdf = useCallback(async () => {
        if (!containerRef.current || isExporting) return;
        const cuerpo = containerRef.current.querySelector('.mde-preview-body');
        if (!cuerpo) {
            toast.warning('Cambia a vista previa o dividida para exportar');
            return;
        }
        if (!window.electronAPI?.exportPdf) {
            toast.error('La exportación a PDF solo está disponible en la aplicación de escritorio');
            return;
        }

        setIsExporting(true);
        try {
            const estilos = [...document.querySelectorAll('style, link[rel="stylesheet"]')]
                .map(n => n.outerHTML).join('\n');
            const nombre = (filePath?.split(/[\\/]/).pop() || 'documento').replace(/\.md$/i, '');

            const html = [
                '<!doctype html><html><head><meta charset="utf-8">',
                `<title>${nombre}</title>`,
                estilos,
                // El PDF va en claro y con ancho de lectura, pase lo que pase.
                '<style>',
                '  body { background: #fff !important; color: #1a1a1a !important; margin: 0; }',
                '  .mde-preview-body { max-width: none !important; padding: 0 !important; color: #1a1a1a !important; }',
                '  .mde-preview-body * { color: inherit; }',
                '  .mde-preview-body pre, .mde-preview-body code { background: #f4f4f5 !important; color: #1a1a1a !important; }',
                '  .mde-preview-body a { color: #0b5cad !important; }',
                '  .mde-preview-body h1, .mde-preview-body h2, .mde-preview-body h3 { color: #000 !important; break-after: avoid; }',
                '  .mde-preview-body pre, .mde-preview-body table, .mde-preview-body blockquote { break-inside: avoid; }',
                '  .mde-anchor, .mde-codeblock-copy, .mde-mermaid-expand { display: none !important; }',
                '</style>',
                '</head><body>',
                `<div class="mde-preview-body">${cuerpo.innerHTML}</div>`,
                '</body></html>',
            ].join('\n');

            const r = await window.electronAPI.exportPdf({ html });
            if (r?.error) throw new Error(r.error);

            const bytes = Uint8Array.from(atob(r.data), c => c.charCodeAt(0));
            const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `${nombre}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('PDF exportado con texto seleccionable');
        } catch (e) {
            console.error('Failed to export PDF', e);
            toast.error(`No se pudo exportar: ${e.message}`);
        } finally {
            setIsExporting(false);
        }
    }, [isExporting, filePath, toast]);

    const cycleView = useCallback(() => {
        setViewMode(prev => {
            const modes = ['edit', 'split', 'preview'];
            const next = modes[(modes.indexOf(prev) + 1) % modes.length];
            localStorage.setItem('amoxsql-md-view-mode', next);
            return next;
        });
    }, []);

    const switchView = (mode) => {
        setViewMode(mode);
        localStorage.setItem('amoxsql-md-view-mode', mode);
    };

    const toggleWidth = useCallback(() => {
        setWidthMode(prev => {
            const next = prev === 'compact' ? 'full' : 'compact';
            localStorage.setItem('amoxsql-md-width-mode', next);
            return next;
        });
    }, []);


    // ── Image paste / drop ──────────────────────────────────────────────────────
    const handleImageFile = useCallback(async (file) => {
        if (!file || !file.type?.startsWith('image/')) return false;
        const ext = (file.type.split('/')[1] || 'png').replace('+xml', '');
        const relPath = `assets/image-${Date.now()}.${ext}`;
        try {
            const dataUrl = await new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(r.result);
                r.onerror = reject;
                r.readAsDataURL(file);
            });
            const res = await fetch(`${API_BASE}/api/files/write-binary`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: relPath, dataBase64: dataUrl }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            const ed = editorRef.current;
            if (ed) insertBlock(ed, `\n![image](./${data.path})\n`);
            return true;
        } catch (e) {
            console.error('Image upload failed', e);
            return false;
        }
    }, []);

    // ── Monaco mount ─────────────────────────────────────────────────────────

    const handleEditorWillMount = useCallback((monaco) => {
        registerMonaco(monaco);

        // El menú de "/" lee el documento vivo del propio editor: las entradas
        // que dependen de él (el índice) se generan con los títulos de verdad.
        registerSlashMenu(monaco, () => editorRef.current?.getValue() ?? '');

        if (!monaco.languages._mdAutocompleteRegistered) {
            monaco.languages._mdAutocompleteRegistered = true;
            monaco.languages.registerCompletionItemProvider('markdown', {
                triggerCharacters: ['@'],
                provideCompletionItems: async (model, position) => {
                    const textUntilPosition = model.getValueInRange({
                        startLineNumber: position.lineNumber,
                        startColumn: 1,
                        endLineNumber: position.lineNumber,
                        endColumn: position.column
                    });
                    const match = textUntilPosition.match(/@([\w.-]*)$/);
                    if (!match) return { suggestions: [] };

                    const word = model.getWordUntilPosition(position);
                    const range = {
                        startLineNumber: position.lineNumber,
                        endLineNumber: position.lineNumber,
                        startColumn: word.startColumn - 1,
                        endColumn: word.endColumn
                    };

                    try {
                        const suggestions = [];

                        // 1. Fetch tables from Schema
                        const schemaRes = await fetch(`${API_BASE}/api/db/schemas`);
                        if (schemaRes.ok) {
                            const schemas = await schemaRes.json();
                            if (schemas && schemas.length) {
                                schemas.forEach(schemaObj => {
                                    schemaObj.tables.forEach(table => {
                                        suggestions.push({
                                            label: `@${table.name}`,
                                            kind: monaco.languages.CompletionItemKind.Class,
                                            detail: 'Table',
                                            insertText: `**${table.name}**`,
                                            range: range
                                        });
                                        if (table.columns) {
                                            table.columns.forEach(col => {
                                                suggestions.push({
                                                    label: `@${table.name}.${col.column_name}`,
                                                    kind: monaco.languages.CompletionItemKind.Field,
                                                    detail: `Column (${col.data_type})`,
                                                    insertText: `\`${table.name}.${col.column_name}\``,
                                                    range: range
                                                });
                                            });
                                        }
                                    });
                                });
                            }
                        }

                        // 2. Fetch Files (recursive)
                        const collectSqlFiles = async (dir = '') => {
                            const res = await fetch(`${API_BASE}/api/files/list?path=${encodeURIComponent(dir)}`);
                            if (!res.ok) return [];
                            const files = await res.json();
                            let sqlFiles = [];
                            for (const f of files) {
                                if (f.isDirectory) {
                                    const sub = await collectSqlFiles(dir ? `${dir}/${f.name}` : f.name);
                                    sqlFiles = sqlFiles.concat(sub);
                                } else if (/\.(sql|amoxvis|sqlchain|sqlnb|amoxdeck|md)$/i.test(f.name)) {
                                    sqlFiles.push(dir ? `${dir}/${f.name}` : f.name);
                                }
                            }
                            return sqlFiles;
                        };
                        const files = await collectSqlFiles('');
                        // Cada artefacto dice lo que es: la ficha resultante
                        // abre la pestaña que le corresponde al pulsarla.
                        const QUE_ES = {
                            sql: 'Consulta', amoxvis: 'Gráfico', sqlchain: 'Data Flow',
                            sqlnb: 'Notebook', amoxdeck: 'Report Flow', md: 'Documento',
                        };
                        files.forEach(fullPath => {
                            const ext = fullPath.split('.').pop().toLowerCase();
                            suggestions.push({
                                label: `@${fullPath}`,
                                kind: monaco.languages.CompletionItemKind.File,
                                detail: QUE_ES[ext] || 'Archivo',
                                insertText: `[${fullPath.split('/').pop()}](./${fullPath})`,
                                range: range
                            });
                        });

                        return { suggestions };
                    } catch (e) {
                        console.error('Autocomplete error', e);
                        return { suggestions: [] };
                    }
                }
            });
        }
    }, []);

    const handleEditorMount = useCallback((editor, monaco) => {
        editorRef.current = editor;
        // En estado, no solo en la ref: el overlay tiene que re-renderizar
        // cuando el editor existe para engancharse a sus eventos.
        setEditorInstance(editor);
        const { CtrlCmd, Shift } = monaco.KeyMod;
        const { KeyS, KeyB, KeyI, KeyK, KeyV, KeyE, KeyT } = monaco.KeyCode;
        editor.addCommand(CtrlCmd | KeyS, () => handleSave());
        editor.addCommand(CtrlCmd | KeyB, () => wrapSelection(editor, '**'));
        editor.addCommand(CtrlCmd | KeyI, () => wrapSelection(editor, '_'));
        editor.addCommand(CtrlCmd | KeyE, () => wrapSelection(editor, '`'));
        editor.addCommand(CtrlCmd | KeyK, () => {
            const txt = editor.getModel().getValueInRange(editor.getSelection());
            insertBlock(editor, `[${txt || 'link text'}](url)`);
        });
        editor.addCommand(CtrlCmd | Shift | KeyV, () => cycleView());

        // Conversión de bloque por teclado: Ctrl+1..6 titula, Ctrl+0 vuelve a
        // párrafo, Ctrl+Shift+T convierte en tarea.
        for (let level = 1; level <= 6; level++) {
            editor.addCommand(CtrlCmd | monaco.KeyCode[`Digit${level}`], () => setLineMarker(editor, `${'#'.repeat(level)} `));
        }
        editor.addCommand(CtrlCmd | monaco.KeyCode.Digit0, () => setLineMarker(editor, ''));
        editor.addCommand(CtrlCmd | Shift | KeyT, () => setLineMarker(editor, '- [ ] '));

        // Mover la sección del cursor entre sus hermanas.
        // NO se usa Alt+Shift+flechas: en Monaco eso ya es "duplicar línea" y
        // un addCommand no gana esa puja de forma fiable. Ctrl+Shift+flechas
        // está libre en el editor.
        editor.addCommand(CtrlCmd | Shift | monaco.KeyCode.UpArrow, () => moveCurrentSectionRef.current('up'));
        editor.addCommand(CtrlCmd | Shift | monaco.KeyCode.DownArrow, () => moveCurrentSectionRef.current('down'));

        // El selector de bloque sigue al cursor. Solo interesa el cambio de
        // línea: moverse dentro de la misma no cambia de bloque.
        editor.onDidChangeCursorPosition((e) => {
            if (e.position.lineNumber === cursorLineRef.current) return;
            cursorLineRef.current = e.position.lineNumber;
            setCursorLine(e.position.lineNumber);
        });

        // Image paste / drop → save into project assets + insert markdown
        const dom = editor.getDomNode();
        if (dom && !dom._mdeImgBound) {
            dom._mdeImgBound = true;
            dom.addEventListener('paste', (e) => {
                const items = e.clipboardData?.items || [];
                for (const it of items) {
                    if (it.kind === 'file' && it.type.startsWith('image/')) {
                        e.preventDefault();
                        e.stopPropagation();
                        handleImageFile(it.getAsFile());
                        return;
                    }
                }
            }, true);
            dom.addEventListener('drop', (e) => {
                const files = e.dataTransfer?.files || [];
                for (const f of files) {
                    if (f.type.startsWith('image/')) {
                        e.preventDefault();
                        e.stopPropagation();
                        handleImageFile(f);
                        return;
                    }
                }
            }, true);
        }
    }, [handleSave, cycleView, handleImageFile]);

    // ── Split resizer ─────────────────────────────────────────────────────────

    const startResizing = (e) => {
        e.preventDefault();
        isResizingRef.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    useEffect(() => {
        const onMouseMove = (e) => {
            if (!isResizingRef.current || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const pos = e.clientX - rect.left;
            if (pos > 160 && pos < rect.width - 160) setSplitPos(pos);
        };
        const onMouseUp = () => {
            if (!isResizingRef.current) return;
            isResizingRef.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, []);

    const act = useCallback((fn) => { if (editorRef.current) fn(editorRef.current); }, []);

    // ── Casillas ─────────────────────────────────────────────────────────────
    // Marcar desde la vista previa escribe en el DOCUMENTO, no en el disco: si
    // escribiera el archivo con el editor sucio, el siguiente guardado pisaría
    // la marca. Con Monaco montado va por executeEdits para que la casilla
    // entre en la pila de deshacer como una edición más; en vista solo-previa
    // no hay editor, así que se edita el contenido y se avisa al padre.
    const handleToggleTask = useCallback((line) => {
        const flip = toggleTaskLine;
        const editor = editorRef.current;
        const model = editor?.getModel?.();

        if (model && !model.isDisposed?.()) {
            if (line < 1 || line > model.getLineCount()) return;
            const actual = model.getLineContent(line);
            const nuevo = flip(actual);
            if (nuevo === actual) return;
            editor.executeEdits('mde', [{
                range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: actual.length + 1 },
                text: nuevo,
            }]);
            return;
        }

        const lineas = (content || '').split('\n');
        if (line < 1 || line > lineas.length) return;
        const nuevo = flip(lineas[line - 1]);
        if (nuevo === lineas[line - 1]) return;
        lineas[line - 1] = nuevo;
        onChange?.(lineas.join('\n'));
    }, [content, onChange]);

    // ── Captura rápida ───────────────────────────────────────────────────────
    // Lo que se te ocurre a media faena y no puede esperar a tener forma. Va al
    // documento de notas del proyecto SIN cambiar de pestaña, con la fecha
    // puesta. Si el archivo no existe se crea con un título.
    const handleQuickCapture = useCallback(async () => {
        const texto = await dialog.promptAsync({
            title: 'Captura rápida',
            message: `Se añade como tarea a ${NOTES_FILE}`,
            placeholder: 'Revisar el particionado de eventos @flavio vence 2026-09-20',
            confirmLabel: 'Añadir',
            cancelLabel: 'Cancelar',
        });
        if (!texto?.trim()) return;

        try {
            const res = await fetch(`${API_BASE}/api/file?path=${encodeURIComponent(NOTES_FILE)}`);
            const data = await res.json();
            const previo = typeof data?.content === 'string' ? data.content : `# Notas\n`;
            const cuerpo = previo.endsWith('\n') || !previo ? previo : `${previo}\n`;
            const nuevo = `${cuerpo}- [ ] ${texto.trim()}\n`;

            const guardado = await fetch(`${API_BASE}/api/file`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: NOTES_FILE, content: nuevo }),
            });
            if (!guardado.ok) throw new Error((await guardado.json()).error || 'no se pudo escribir');

            setTasksToken(t => t + 1);
            toast.success(`Anotado en ${NOTES_FILE}`);
        } catch (e) {
            console.error('Quick capture failed', e);
            toast.error(`No se pudo anotar: ${e.message}`);
        }
    }, [dialog, toast]);

    // La captura rápida tiene que funcionar también en vista solo-previa, donde
    // Monaco no está montado y sus addCommand no existen — de ahí el listener
    // de ventana en vez de un atajo del editor. Solo mientras la pestaña activa
    // sea esta, para no robarle el atajo a otras.
    useEffect(() => {
        if (!isActive) return undefined;
        const onKey = (e) => {
            if (!e.ctrlKey || !e.shiftKey) return;
            const k = e.key.toLowerCase();
            if (k === 'n') { e.preventDefault(); handleQuickCapture(); }
            else if (k === 'o') {
                e.preventDefault();
                setShowRail(v => { localStorage.setItem('amoxsql-md-rail', v ? 'off' : 'on'); return !v; });
            }
            // Ctrl+Shift+F es la búsqueda global del proyecto (convención
            // universal); el modo foco se queda con la M de "modo foco".
            else if (k === 'm') { e.preventDefault(); setFocusMode(v => !v); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isActive, handleQuickCapture]);

    // La burbuja manda el envoltorio que toca; 'link' es el caso especial que
    // necesita construir el texto alrededor de la selección.
    const handleOverlayWrap = useCallback((kind) => {
        const editor = editorRef.current;
        if (!editor) return;
        if (kind === 'link') {
            const txt = editor.getModel().getValueInRange(editor.getSelection());
            insertBlock(editor, `[${txt || 'texto del enlace'}](url)`);
            return;
        }
        wrapSelection(editor, kind);
    }, []);

    // ── La manija del margen ─────────────────────────────────────────────────
    // Sustituye al selector de bloque, al botón de tabla y al menú «Insertar»
    // de la barra. Antes de abrir el catálogo deja el cursor donde se pidió, y
    // nunca dentro del front-matter: insertar ahí parte la cabecera en dos.
    const pedirInsertar = useCallback(({ line, top, left }) => {
        const editor = editorRef.current;
        const model = editor?.getModel?.();
        if (!editor || !model) return;

        let destino = line;
        try {
            const bloque = blockAt(parse(model.getValue()), line);
            if (bloque.type === 'frontmatter') destino = Math.min(bloque.endLine + 1, model.getLineCount());
        } catch { /* si el parser falla, se inserta donde estaba */ }

        editor.setPosition({ lineNumber: destino, column: model.getLineMaxColumn(destino) });
        setInsertAt({ line: destino, top, left });
        cargarChains();
    }, [cargarChains]);

    const cerrarInsertar = useCallback(() => setInsertAt(null), []);

    const insertarDelCatalogo = useCallback((item) => {
        setInsertAt(null);
        act((editor) => {
            const model = editor.getModel();
            const linea = editor.getPosition().lineNumber;
            const snippet = snippetFor(item, { content: model.getValue() });
            // Un bloque nuevo empieza en su propia línea: si donde está el
            // cursor ya hay texto, se baja antes de escribir.
            const hayTexto = model.getLineContent(linea).trim().length > 0;
            insertSnippet(editor, hayTexto ? `
${snippet}` : snippet);
        });
    }, [act]);

    const insertarChain = useCallback((ruta) => {
        setInsertAt(null);
        insertarDiagramaDeChain(ruta);
    }, [insertarDiagramaDeChain]);

    // ── Acciones de la columna derecha ───────────────────────────────────────
    const irALinea = useCallback((line) => {
        const editor = editorRef.current;
        if (!editor?.getModel?.()) return;
        editor.revealLineInCenterIfOutsideViewport(line);
        editor.setPosition({ lineNumber: line, column: 1 });
        editor.focus();
    }, []);

    const anadirCabecera = useCallback(() => {
        const hoy = new Date();
        const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
        cambiarMeta({ owner: '', estado: 'borrador', revisado: iso });
    }, [cambiarMeta]);

    // Los callbacks que llegan del padre pueden cambiar de identidad en cada
    // render suyo, y entonces `memo` no sirve de nada. Se leen por referencia y
    // se exponen envueltos en funciones que nunca cambian.
    const padreRef = useRef({});
    padreRef.current = { onOpenFile, onBuscarProyecto, onRequestSaveAs };
    const abrirArchivo = useCallback((ruta) => padreRef.current.onOpenFile?.(ruta), []);
    const buscarEnProyecto = useCallback(() => padreRef.current.onBuscarProyecto?.(), []);
    const guardarComo = useCallback(() => padreRef.current.onRequestSaveAs?.(), []);

    const moverSeccion = useCallback((linea, dir) => moveSectionBy(dir, linea), [moveSectionBy]);

    const plegarRail = useCallback(() => {
        setShowRail(false);
        localStorage.setItem('amoxsql-md-rail', 'off');
    }, []);

    const desplegarRail = useCallback(() => {
        setShowRail(true);
        localStorage.setItem('amoxsql-md-rail', 'on');
    }, []);

    // El PDF sale de la vista previa, que en «escribir» no está montada. Antes
    // eso era un aviso pidiendo al usuario que cambiase de vista; ahora se
    // cambia solo, se exporta y se vuelve a dejar como estaba.
    const exportarRef = useRef(handleExportPdf);
    useEffect(() => { exportarRef.current = handleExportPdf; }, [handleExportPdf]);

    const vistaPrevia = useRef(null);
    const pedirExportar = useCallback(() => {
        if (viewMode === 'preview' || viewMode === 'split') { handleExportPdf(); return; }
        vistaPrevia.current = viewMode;
        setViewMode('preview');
        setExportPendiente(true);
    }, [viewMode, handleExportPdf]);

    useEffect(() => {
        if (!exportPendiente) return undefined;
        // La vista previa necesita un momento para montar y dibujar los
        // diagramas; sin la espera saldrían huecos en blanco.
        const id = setTimeout(async () => {
            await exportarRef.current();
            setExportPendiente(false);
            if (vistaPrevia.current) { setViewMode(vistaPrevia.current); vistaPrevia.current = null; }
        }, 700);
        return () => clearTimeout(id);
    }, [exportPendiente]);

    // ── Monaco options ────────────────────────────────────────────────────────

    // ── Desplazamiento sincronizado en vista dividida ────────────────────────
    //
    // Se alinea por CONTENIDO, no por porcentaje. Cada bloque de la vista previa
    // lleva la línea del documento de la que sale (`data-line`), así que basta
    // con buscar los dos bloques que rodean la posición actual e interpolar
    // entre ellos. Una regla de tres sobre la altura total parece equivalente y
    // no lo es: un diagrama alto o un bloque de código largo ocupan cosas muy
    // distintas a cada lado y el texto acaba desfasado.
    //
    // El pestillo evita el bucle: mover un lado mueve el otro, que volvería a
    // mover el primero. Quien empieza el gesto manda hasta que lo suelta.
    const previewPaneRef = useRef(null);
    const mandaRef = useRef(null);          // 'editor' | 'preview' | null
    const soltarRef = useRef(null);

    const tomarMando = useCallback((quien) => {
        mandaRef.current = quien;
        clearTimeout(soltarRef.current);
        soltarRef.current = setTimeout(() => { mandaRef.current = null; }, 120);
    }, []);

    useEffect(() => () => clearTimeout(soltarRef.current), []);

    useEffect(() => {
        const editor = editorInstance;
        const panel = previewPaneRef.current;
        if (viewMode !== 'split' || !editor || !panel) return undefined;

        // Los anclajes se recalculan en cada gesto: el documento cambia, las
        // imágenes terminan de cargar y los diagramas se dibujan tarde.
        const anclajes = () => {
            const base = panel.getBoundingClientRect().top - panel.scrollTop;
            return [...panel.querySelectorAll('[data-line]')]
                .map(el => ({ linea: Number(el.dataset.line), y: el.getBoundingClientRect().top - base }))
                .filter(a => Number.isFinite(a.linea))
                .sort((a, b) => a.linea - b.linea);
        };

        /** Interpola `valor` entre dos listas de puntos paralelas. */
        const proyectar = (puntos, de, a, valor) => {
            if (puntos.length === 0) return null;
            if (puntos.length === 1 || valor <= puntos[0][de]) return puntos[0][a];
            for (let i = 0; i < puntos.length - 1; i++) {
                const p = puntos[i], q = puntos[i + 1];
                if (valor >= p[de] && valor <= q[de]) {
                    const tramo = q[de] - p[de];
                    const razon = tramo > 0 ? (valor - p[de]) / tramo : 0;
                    return p[a] + (q[a] - p[a]) * razon;
                }
            }
            return puntos[puntos.length - 1][a];
        };

        const puntos = () => anclajes().map(an => ({
            editor: editor.getTopForLineNumber(an.linea),
            preview: an.y,
        })).sort((x, y) => x.editor - y.editor);

        const delEditor = () => {
            if (mandaRef.current === 'preview') return;
            tomarMando('editor');
            const destino = proyectar(puntos(), 'editor', 'preview', editor.getScrollTop());
            if (destino !== null) panel.scrollTop = Math.max(0, destino);
        };

        const delPanel = () => {
            if (mandaRef.current === 'editor') return;
            tomarMando('preview');
            const destino = proyectar(puntos(), 'preview', 'editor', panel.scrollTop);
            if (destino !== null) editor.setScrollTop(Math.max(0, destino));
        };

        const sub = editor.onDidScrollChange(e => { if (e.scrollTopChanged) delEditor(); });
        panel.addEventListener('scroll', delPanel, { passive: true });
        return () => {
            sub?.dispose?.();
            panel.removeEventListener('scroll', delPanel);
        };
    }, [viewMode, editorInstance, tomarMando]);

    // En «escribir» se le quitan a Monaco las tres cosas que delatan que debajo
    // hay un editor de código: los números de línea, el resaltado de la línea
    // activa y las guías de sangría. En «dividido» se quedan, porque ahí sí
    // estás mirando el markdown como código.
    //
    // Lo que Monaco NO puede hacer: títulos a su tamaño real. Asume alto de
    // línea uniforme, así que un H1 no puede ser más alto que un párrafo. Para
    // verlo compuesto está la vista previa.
    const escribiendo = viewMode === 'edit';
    const monacoOptions = useMemo(() => ({
        fontSize: (editorSettings?.fontSize || 14) + (escribiendo ? 1 : 0),
        fontFamily: editorSettings?.fontFamily || "'JetBrains Mono', 'Consolas', monospace",
        lineHeight: escribiendo ? 1.75 : 0,
        wordWrap: 'on',
        wrappingIndent: 'same',
        lineNumbers: escribiendo ? 'off' : (editorSettings?.lineNumbers || 'on'),
        renderLineHighlight: escribiendo ? 'none' : 'line',
        // El hueco que ocupa la manija del margen, fuera de la medida de lectura.
        lineDecorationsWidth: escribiendo ? 34 : 10,
        guides: { indentation: !escribiendo },
        folding: !escribiendo,
        glyphMargin: false,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        renderWhitespace: 'none',
        padding: { top: escribiendo ? 32 : 16, bottom: 48 },
        contextmenu: false,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        // Plegar el margen cambia el ancho del lienzo sin que cambie la ventana;
        // sin esto Monaco se quedaría con la medida anterior.
        automaticLayout: true,
        // Memorizado: el envoltorio llama a `updateOptions` cada vez que este
        // objeto cambia de identidad, y recrearlo en cada render lo convertia
        // en trabajo por fotograma durante cualquier animacion.
    }), [escribiendo, editorSettings?.fontSize, editorSettings?.fontFamily, editorSettings?.lineNumbers]);

    const editorStyle = viewMode === 'split' && splitPos ? { width: splitPos } : undefined;
    const previewStyle = viewMode === 'split' && splitPos ? { width: `calc(100% - ${splitPos}px - 5px)` } : undefined;

    const nombreArchivo = (filePath?.split(/[\\/]/).pop() || 'documento sin guardar').replace(/\.md$/i, '');

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className={`mde-wrap${isActive ? ' active' : ''}${focusMode ? ' mde-focus' : ''}`}>
            <div className="ep-editor-card mde-card">

                {/* ── Barra de sesión ──
                    Solo lo que pertenece a la sesión, no al texto: qué archivo,
                    si está guardado, cómo lo miro y el asistente. El formato
                    vive en la isla de selección y en la manija del margen. */}
                {toolbarVisible && (
                    <div className={`mde-topbar${focusMode ? ' foco' : ''}`}>
                        {railCabe && !showRail && (
                            <button className="mde-top-icon" title="Mostrar la estructura (Ctrl+Shift+O)" onClick={desplegarRail}>
                                <LuPanelLeft size={14} />
                            </button>
                        )}

                        <span className="mde-topbar-file" title={filePath || undefined}>
                            {nombreArchivo}<span className="ext">.md</span>
                        </span>

                        {/* Guardar deja de ser un botón permanente y pasa a ser un
                            estado: sin cambios pendientes no hay nada que pulsar.
                            El hueco se reserva para que la barra no baile. */}
                        <span className={`mde-topbar-state${isDirty ? ' sucio' : ''}`}>
                            <i className="mde-topbar-dot" />
                            {isDirty ? 'sin guardar' : 'guardado'}
                        </span>

                        <span className="mde-topbar-gap" />

                        {focusMode ? (
                            <button className="mde-top-ghost" onClick={() => setFocusMode(false)}>
                                <LuX size={13} /> Salir del foco
                            </button>
                        ) : (
                            <>
                                <span className="mde-topbar-save">
                                    {isDirty && (
                                        <button className="mde-top-ghost acento" onClick={handleSave} title="Guardar (Ctrl+S)">
                                            <LuSave size={13} /> Guardar <kbd>Ctrl+S</kbd>
                                        </button>
                                    )}
                                </span>

                                <div className="mde-seg">
                                    {VIEW_MODES.map(({ id, Icon, label, title }) => (
                                        <button
                                            key={id}
                                            className={viewMode === id ? 'on' : ''}
                                            title={title}
                                            onClick={() => switchView(id)}
                                        >
                                            <Icon size={13} /> <span>{label}</span>
                                        </button>
                                    ))}
                                </div>

                                {onToggleAi && (
                                    <button
                                        className={`mde-top-ghost${showAiSidebar ? ' acento' : ''}`}
                                        onClick={onToggleAi}
                                        title="Abrir o cerrar el asistente"
                                    >
                                        {showAiSidebar ? <LuX size={13} /> : <LuBot size={13} />}
                                        <span>{showAiSidebar ? 'Cerrar' : 'Assist'}</span>
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* ── Las tres columnas ── */}
                <div className={`mde-content mde-content--${viewMode}${widthMode === 'full' ? ' mde-content--ancho' : ''}`} ref={containerRef}>

                    {railVisible && (
                        <OutlinePanel
                            sections={outline}
                            activeLine={cursorLine}
                            onGo={goToSection}
                            onMove={moveSectionTo}
                            onMoveBy={moverSeccion}
                            onBuscar={onBuscarProyecto ? buscarEnProyecto : undefined}
                            git={gitPorSeccion}
                            gitFiable={!isDirty}
                            onPlegar={plegarRail}
                        />
                    )}

                    {(viewMode === 'edit' || viewMode === 'split') && (
                        <div className="mde-editor-pane" style={editorStyle}>
                            <Editor
                                value={content}
                                language="markdown"
                                theme={MONACO_THEME_NAME}
                                onChange={onChange}
                                beforeMount={handleEditorWillMount}
                                onMount={handleEditorMount}
                                options={monacoOptions}
                            />
                            <EditorOverlay
                                editor={editorInstance}
                                content={content}
                                onWrap={handleOverlayWrap}
                                onLineMarker={(marker) => act(e => setLineMarker(e, marker))}
                                onInsertar={pedirInsertar}
                                insertarAbierto={!!insertAt}
                            />
                            {insertAt && (
                                <InsertMenu
                                    groups={INSERT_GROUPS}
                                    chains={chains}
                                    onInsert={insertarDelCatalogo}
                                    onChain={insertarChain}
                                    onClose={cerrarInsertar}
                                    style={{ top: insertAt.top + 24, left: insertAt.left }}
                                />
                            )}
                        </div>
                    )}

                    {viewMode === 'split' && (
                        <div className="mde-split-handle" onMouseDown={startResizing} />
                    )}

                    {(viewMode === 'preview' || viewMode === 'split') && (
                        <div className="mde-preview-pane" style={previewStyle} ref={previewPaneRef}>
                            <MarkdownPreview
                                content={content}
                                theme={theme}
                                onOpenFile={onOpenFile}
                                widthMode={widthMode}
                                filePath={filePath}
                                onToggleTask={handleToggleTask}
                                taskProgress={taskProgress}
                            />
                        </div>
                    )}

                    {panelVisible && (
                        <DocPanel
                            meta={docMeta}
                            umbralMeses={editorSettings?.markdownUmbralRevision ?? 6}
                            onCambiarMeta={cambiarMeta}
                            onAnadirCabecera={anadirCabecera}
                            tareas={tareasDoc}
                            onToggleTask={handleToggleTask}
                            onIrALinea={irALinea}
                            enlaces={enlaces}
                            retroenlaces={retroenlaces}
                            onAbrir={abrirArchivo}
                            currentPath={filePath}
                            tasksToken={tasksToken}
                            onBuscar={onBuscarProyecto ? buscarEnProyecto : undefined}
                            onExportar={pedirExportar}
                            exportando={isExporting || exportPendiente}
                            onGuardarComo={onRequestSaveAs ? guardarComo : undefined}
                            widthMode={widthMode}
                            onAncho={toggleWidth}
                        />
                    )}
                </div>

                {/* ── Barra de estado ── */}
                <div className="mde-status">
                    <span>{stats.palabras.toLocaleString('es')} palabras</span>
                    <span>{stats.minutos} min de lectura</span>
                    <span>{stats.secciones} {stats.secciones === 1 ? 'sección' : 'secciones'}</span>
                    {stats.casillas.total > 0 && (
                        <span className={stats.casillas.done === stats.casillas.total ? 'mde-status-ok' : undefined}>
                            {stats.casillas.done} de {stats.casillas.total} casillas
                        </span>
                    )}
                    <span className="mde-status-gap" />
                    <button className="mde-status-btn" onClick={() => setFocusMode(v => !v)}>
                        {focusMode ? 'Salir del foco' : 'Foco'} <kbd>Ctrl+Shift+M</kbd>
                    </button>
                </div>

            </div>
        </div>
    );
};

export default MarkdownEditor;
