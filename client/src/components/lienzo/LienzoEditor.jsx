/**
 * El Canvas (5.15, fase 1): un lienzo infinito para pensar un análisis.
 *
 * El archivo (`.amoxcanvas`) es la verdad y este componente lo pinta con el
 * lienzo de nodos que ya usa Data Flow. Las decisiones que lo moldean:
 *
 * - **Las flechas se deducen** (Dec-55): salen de lo que lee cada consulta
 *   (`grafoLienzo.aristas`). No hay flechas a mano que puedan mentir; arrastrar
 *   desde el borde de una tarjeta a un hueco crea una consulta que la lee.
 * - **Cada tarjeta de datos deja una vista con su nombre**, ejecutada con el mismo
 *   endpoint que las celdas del cuaderno. El punto de estado y **Refresh** son
 *   los del cuaderno (`grafo.frescura`, `ordenDeRefresco`).
 * - **La foto** (Dec-58): al ejecutarse bien, la tarjeta guarda sus primeras filas
 *   en el archivo; al abrir se ve esa foto, marcada «as of».
 * - **Moverse por el lienzo no ensucia el archivo**: el zoom y el encuadre se
 *   guardan con el siguiente cambio de verdad.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ReactFlow, ReactFlowProvider, Background, BackgroundVariant, MiniMap, Controls, useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
    LuInbox, LuDatabase, LuStickyNote, LuType, LuFrame, LuRefreshCw, LuSearch, LuEllipsis,
    LuFilter, LuGroup, LuMerge, LuTriangleAlert, LuX, LuEraser,
} from 'react-icons/lu';
import { API_BASE } from '../../api.js';
import { useDialog } from '../dialogs/DialogProvider';
import { useToast } from '../ToastProvider';
import { leerLienzo, escribirLienzo, sinFotos, DEJAN_VISTA, FILAS_DE_FOTO } from '../../utils/lienzoFile.js';
import { analizarCelda } from '../../utils/celdaSql.js';
import { componerCelda } from '../../utils/vistaDeCelda.js';
import { sustituirParametros } from '../cuaderno/vistasVivas.js';
import { frescura } from '../cuaderno/grafo.js';
import { listarFuentes } from '../fuentes/api';
import {
    analizarLienzo, grafoDeLienzo, aristas as aristasDe, linaje, ordenDeRefresco, renombrar as renombrarEn,
    consultaNueva, nombreParaFuente, problemaDeTarjeta, sqlDeTarjeta,
} from './grafoLienzo.js';
import {
    LienzoCtx, TarjetaDatos, TarjetaNota, TarjetaTexto, TarjetaMarco, TarjetaDesconocida,
} from './Tarjetas.jsx';
import './lienzo.css';

const TIPOS_DE_NODO = {
    source: TarjetaDatos, query: TarjetaDatos, note: TarjetaNota, text: TarjetaTexto, frame: TarjetaMarco,
    desconocida: TarjetaDesconocida,
};
const CONOCIDOS = new Set(['source', 'query', 'note', 'text', 'frame']);
const TAMANO = { source: [260, 170], query: [380, 300], note: [190, 120], text: [420, 110], frame: [640, 420] };
const DATOS_DE_ARCHIVO = /\.(csv|tsv|parquet|json|jsonl|ndjson|xlsx)$/i;

async function pedirJson(ruta, opciones) {
    let r;
    try { r = await fetch(`${API_BASE}${ruta}`, opciones); } catch (e) {
        throw new Error(`Could not reach the AmoxSQL server (${API_BASE}). ${e?.message || e}`);
    }
    if (!(r.headers.get('content-type') || '').includes('application/json')) {
        throw new Error(r.status === 404
            ? `The server does not know "${ruta}": close AmoxSQL and open it again.`
            : `The server answered ${r.status} with no JSON for "${ruta}".`);
    }
    return r.json();
}

/** La foto que guarda una tarjeta al ejecutarse bien (Dec-58). */
function fotoDe(r) {
    const datos = Array.isArray(r?.data) ? r.data : [];
    const columnas = datos[0] ? Object.keys(datos[0]) : (r?.types ? Object.keys(r.types) : []);
    const limpio = (v) => (typeof v === 'bigint' ? Number(v) : v instanceof Date ? v.toISOString() : v);
    return {
        cuando: new Date().toISOString(),
        filas: Number(r?.rowCount ?? datos.length),
        columnas,
        muestra: datos.slice(0, FILAS_DE_FOTO).map(f => columnas.map(c => limpio(f[c]))),
    };
}

function Interior({ content, onChange, theme, editorSettings, isActive }) {
    const dialog = useDialog();
    const toast = useToast();
    const flow = useReactFlow();

    // ── El documento ────────────────────────────────────────────────────────
    const leer = (texto) => { try { return { lienzo: leerLienzo(texto), error: null }; } catch (e) { return { lienzo: null, error: e.message }; } };
    const [{ lienzo, error }, setDoc] = useState(() => leer(content));
    const emitido = useRef(content);
    const vistaRef = useRef(lienzo?.vista || null);

    // Un cambio del archivo hecho fuera (otra pestaña, el disco) se vuelve a leer.
    useEffect(() => {
        if (content === emitido.current) return;
        emitido.current = content;
        setDoc(leer(content));
    }, [content]);

    const temporizador = useRef(null);
    const emitir = useCallback((nuevo) => {
        setDoc({ lienzo: nuevo, error: null });
        clearTimeout(temporizador.current);
        temporizador.current = setTimeout(() => {
            const texto = escribirLienzo({ ...nuevo, vista: vistaRef.current });
            if (texto === emitido.current) return;
            emitido.current = texto;
            onChange?.(texto);
        }, 250);
    }, [onChange]);
    useEffect(() => () => clearTimeout(temporizador.current), []);

    const lienzoRef = useRef(lienzo);
    lienzoRef.current = lienzo;
    const actualizar = useCallback((fn) => {
        const actual = lienzoRef.current;
        if (!actual) return;
        const nuevo = fn(actual);
        if (nuevo && nuevo !== actual) { lienzoRef.current = nuevo; emitir(nuevo); }
    }, [emitir]);

    const cambiar = useCallback((id, campos) => actualizar(l => ({
        ...l, tarjetas: l.tarjetas.map(t => (t.id === id ? { ...t, ...campos } : t)),
    })), [actualizar]);

    // ── Lo que se ejecutó en esta sesión ────────────────────────────────────
    const [resultados, setResultados] = useState({});
    const [ejecuciones, setEjecuciones] = useState({});
    const [corriendo, setCorriendo] = useState(null);
    const [editando, setEditando] = useState(null);
    const [seleccion, setSeleccion] = useState(null);
    const tapadosOk = useRef(new Set());

    const tarjetas = lienzo?.tarjetas || [];
    const parametros = lienzo?.parametros || {};
    const analisis = useMemo(() => (lienzo ? analizarLienzo(lienzo) : {}), [lienzo]);
    const grafo = useMemo(() => (lienzo ? grafoDeLienzo(lienzo, analisis) : null), [lienzo, analisis]);
    const flechas = useMemo(() => (lienzo ? aristasDe(lienzo, analisis) : []), [lienzo, analisis]);
    const textos = useMemo(() => Object.fromEntries(tarjetas.filter(t => DEJAN_VISTA.has(t.tipo))
        .map(t => [t.id, sustituirParametros(sqlDeTarjeta(t), parametros)])), [tarjetas, parametros]);
    const estados = useMemo(() => {
        if (!grafo) return new Map();
        const celdas = tarjetas.filter(t => DEJAN_VISTA.has(t.tipo)).map(t => ({ id: t.id, tipo: 'sql', contenido: textos[t.id] }));
        return frescura(celdas, grafo, ejecuciones, textos);
    }, [tarjetas, grafo, ejecuciones, textos]);
    const problemas = useMemo(() => Object.fromEntries(tarjetas.filter(t => DEJAN_VISTA.has(t.tipo))
        .map(t => [t.id, problemaDeTarjeta(t, analisis[t.id])]).filter(([, p]) => p)), [tarjetas, analisis]);

    /** Ejecuta una tarjeta: deja su vista y trae sus filas. `true` si fue bien. */
    const correr = useCallback(async (id) => {
        const t = lienzoRef.current?.tarjetas.find(x => x.id === id);
        if (!t || !DEJAN_VISTA.has(t.tipo)) return false;
        const texto = sustituirParametros(sqlDeTarjeta(t), lienzoRef.current.parametros || {});
        const an = analizarCelda(texto);
        const problema = problemaDeTarjeta(t, an);
        if (problema) { setResultados(p => ({ ...p, [id]: { error: problema } })); return false; }
        const { preparacion, lector, vista, deja } = componerCelda({ sql: texto, analisis: an, nombre: t.id, descripcion: an.comentario, materializar: !!t.materializada });
        setCorriendo(id);
        try {
            const pedir = (aceptarTapado) => pedirJson('/api/cuaderno/celda', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ preparacion, lector, vista, deja, aceptarTapado, limit: 1000 }),
            });
            let r = await pedir(tapadosOk.current.has(String(vista).toLowerCase()));
            if (r?.tapado) {
                const seguir = await dialog.confirmAsync({
                    title: `${r.tapado.tipo === 'tabla' ? 'A table' : 'A view'} named "${r.tapado.nombre}" already exists`,
                    message: `This card leaves a view with that name, and for the whole session anything reading "FROM ${r.tapado.nombre}" would see the card and not the original. Nothing is deleted; closing the project puts it back.`,
                    confirmLabel: 'Shadow it anyway', cancelLabel: 'I will rename the card', destructive: true,
                });
                if (!seguir) return null;
                tapadosOk.current.add(String(vista).toLowerCase());
                r = await pedir(true);
            }
            setResultados(p => ({ ...p, [id]: r || {} }));
            if (r && !r.error) {
                setEjecuciones(p => ({ ...p, [id]: { en: Date.now(), sql: texto } }));
                cambiar(id, { foto: fotoDe(r) });
                return true;
            }
            return false;
        } catch (e) {
            setResultados(p => ({ ...p, [id]: { error: e.message } }));
            return false;
        } finally {
            setCorriendo(null);
        }
    }, [cambiar, dialog]);

    /** Refresh: lo que no está al día, en orden de dependencias (todo, o una rama). */
    const refrescar = useCallback(async (desde = null) => {
        const { orden, enCiclo } = ordenDeRefresco(lienzoRef.current, { desde });
        const pendientes = orden.filter(id => estados.get(id) !== 'dia' || resultados[id]?.error);
        if (enCiclo.length) toast.error(`${enCiclo.join(', ')} read each other: there is no order to run them in.`);
        for (const id of pendientes) {
            if (enCiclo.includes(id)) continue;
            const ok = await correr(id);
            if (ok === null) return;
            if (!ok) { toast.error(`Stopped at "${id}": it failed, and what reads it would fail too.`); return; }
        }
        if (pendientes.length) toast.success(pendientes.length === 1 ? 'One card refreshed' : `${pendientes.length} cards refreshed`);
    }, [estados, resultados, correr, toast]);

    const viejas = useMemo(() => [...estados.values()].filter(e => e !== 'dia').length, [estados]);

    // ── Renombrar (Dec-55) ──────────────────────────────────────────────────
    const renombrar = useCallback(async (viejo, nuevo) => {
        const r = renombrarEn(lienzoRef.current, viejo, nuevo);
        if (r.error) { toast.error(r.error); return false; }
        const enSql = r.cambian.filter(c => c.que === 'sql');
        if (enSql.length) {
            const ok = await dialog.confirmAsync({
                title: `Rename "${viejo}" to "${nuevo}"`,
                message: `These cards read it, and their SQL will be rewritten:\n\n${enSql.map(c => `• ${c.id}`).join('\n')}`
                    + (r.siguenLeyendo.length ? `\n\nNot rewritten (check them by hand): ${r.siguenLeyendo.join(', ')}` : ''),
                confirmLabel: 'Rename',
            });
            if (!ok) return false;
        }
        actualizar(() => r.lienzo);
        setResultados(p => { const n = { ...p }; delete n[viejo]; return n; });
        return true;
    }, [actualizar, dialog, toast]);

    // ── Los nodos y las flechas ─────────────────────────────────────────────
    const resaltadas = useMemo(() => (seleccion ? linaje(lienzo, seleccion, flechas) : null), [lienzo, seleccion, flechas]);
    const nodos = useMemo(() => tarjetas.map(t => {
        const tipo = CONOCIDOS.has(t.tipo) ? t.tipo : 'desconocida';
        const [w, h] = TAMANO[t.tipo] || [260, 160];
        return {
            id: t.id,
            type: tipo,
            position: { x: t.x ?? 0, y: t.y ?? 0 },
            width: t.w ?? w,
            height: t.h ?? h,
            zIndex: t.tipo === 'frame' ? -1 : (seleccion === t.id ? 10 : 1),
            selected: seleccion === t.id,
            dragHandle: DEJAN_VISTA.has(t.tipo) ? '.lz-cab' : (t.tipo === 'frame' ? '.lz-marco-titulo' : undefined),
            data: { tarjeta: t, resaltada: !!resaltadas && (resaltadas.arriba.has(t.id) || resaltadas.abajo.has(t.id)) },
        };
    }), [tarjetas, seleccion, resaltadas]);

    const bordes = useMemo(() => flechas.map(e => {
        const lit = !!resaltadas && ((e.a === seleccion || resaltadas.abajo.has(e.a)) && (e.de === seleccion || resaltadas.abajo.has(e.de))
            || (e.de === seleccion || resaltadas.arriba.has(e.de)) && (e.a === seleccion || resaltadas.arriba.has(e.a)));
        return {
            id: `${e.de}→${e.a}`, source: e.de, target: e.a,
            label: e.etiqueta || undefined,
            className: lit ? 'lz-arista lz-arista--lit' : 'lz-arista',
            labelBgPadding: [6, 3], labelBgBorderRadius: 4,
            focusable: false, deletable: false,
        };
    }), [flechas, resaltadas, seleccion]);

    // Mover, redimensionar y seleccionar vuelven al documento.
    const alCambiarNodos = useCallback((cambios) => {
        let sel;
        const pos = {};
        const tam = {};
        for (const c of cambios) {
            if (c.type === 'select') { if (c.selected) sel = c.id; else if (sel === undefined) sel = null; }
            if (c.type === 'position' && c.position) pos[c.id] = c.position;
            // Sólo lo que redimensiona la persona; las medidas del pintado no.
            if (c.type === 'dimensions' && c.dimensions && (c.resizing || c.setAttributes)) tam[c.id] = c.dimensions;
        }
        if (Object.keys(tam).length) {
            actualizar(l => ({ ...l, tarjetas: l.tarjetas.map(t => (tam[t.id] ? { ...t, w: tam[t.id].width, h: tam[t.id].height } : t)) }));
        }
        if (sel !== undefined) {
            setSeleccion(sel);
            if (sel !== editando) setEditando(null);
        }
        if (!Object.keys(pos).length) return;
        actualizar(l => {
            const porId = new Map(l.tarjetas.map(t => [t.id, t]));
            const mover = new Map();
            for (const [id, p] of Object.entries(pos)) {
                const t = porId.get(id);
                if (!t) continue;
                mover.set(id, p);
                // Un marco arrastra lo que tiene dentro.
                if (t.tipo === 'frame') {
                    const dx = p.x - (t.x ?? 0), dy = p.y - (t.y ?? 0);
                    for (const m of l.tarjetas) {
                        if (m.marco === id && !(m.id in pos)) mover.set(m.id, { x: (m.x ?? 0) + dx, y: (m.y ?? 0) + dy });
                    }
                }
            }
            return { ...l, tarjetas: l.tarjetas.map(t => (mover.has(t.id) ? { ...t, x: mover.get(t.id).x, y: mover.get(t.id).y } : t)) };
        });
    }, [actualizar, editando]);

    /** Qué marco contiene el centro de una tarjeta (el más pequeño, si hay varios). */
    const marcoDe = (t, marcos) => {
        const cx = (t.x ?? 0) + (t.w ?? 0) / 2, cy = (t.y ?? 0) + (t.h ?? 0) / 2;
        const dentro = marcos.filter(f => cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h);
        dentro.sort((a, b) => a.w * a.h - b.w * b.h);
        return dentro[0]?.id;
    };
    const recolocarEnMarcos = useCallback(() => actualizar(l => {
        const marcos = l.tarjetas.filter(t => t.tipo === 'frame');
        let cambio = false;
        const tarjetasN = l.tarjetas.map(t => {
            if (t.tipo === 'frame') return t;
            const m = marcoDe(t, marcos);
            if ((m || undefined) === (t.marco || undefined)) return t;
            cambio = true;
            const { marco, ...resto } = t;
            return m ? { ...resto, marco: m } : resto;
        });
        return cambio ? { ...l, tarjetas: tarjetasN } : l;
    }), [actualizar]);

    // Al soltar el tirador: el tamaño ya llegó por `alCambiarNodos`; queda ver
    // qué cae dentro de qué marco.
    const redimensionar = useCallback(() => recolocarEnMarcos(), [recolocarEnMarcos]);

    const borrar = useCallback((ids) => actualizar(l => ({
        ...l,
        tarjetas: l.tarjetas.filter(t => !ids.includes(t.id)).map(t => (ids.includes(t.marco) ? (({ marco, ...r }) => r)(t) : t)),
        etiquetas: Object.fromEntries(Object.entries(l.etiquetas || {}).filter(([k]) => !ids.some(id => k.split('→').includes(id)))),
    })), [actualizar]);

    // ── Crear tarjetas ──────────────────────────────────────────────────────
    const centro = useCallback(() => {
        const el = document.querySelector('.lz-flujo');
        const r = el?.getBoundingClientRect();
        return r ? flow.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: 0, y: 0 };
    }, [flow]);
    const anadir = useCallback((tarjeta, en = null) => {
        const [w, h] = TAMANO[tarjeta.tipo] || [260, 160];
        const p = en || centro();
        const nueva = { w, h, ...tarjeta, x: Math.round(p.x - (en ? 0 : w / 2)), y: Math.round(p.y - (en ? 0 : h / 2)) };
        actualizar(l => ({ ...l, tarjetas: [...l.tarjetas, nueva] }));
        setSeleccion(nueva.id);
        if (nueva.tipo === 'query' || nueva.tipo === 'note' || nueva.tipo === 'text') setEditando(nueva.id);
        recolocarEnMarcos();
        return nueva;
    }, [actualizar, centro, recolocarEnMarcos]);

    const idLibre = (base) => {
        const usados = new Set((lienzoRef.current?.tarjetas || []).map(t => t.id.toLowerCase()));
        for (let i = 1; ; i++) if (!usados.has(`${base}_${i}`)) return `${base}_${i}`;
    };
    const nuevaQuery = () => { const c = consultaNueva(lienzoRef.current, '', 'vacia'); anadir({ id: c.id, tipo: 'query', sql: 'SELECT 1' }); };
    const nuevaFuente = (origen, en) => anadir({ id: nombreParaFuente(lienzoRef.current, origen), tipo: 'source', origen, modo: 'resultado' }, en);

    const [menuFuentes, setMenuFuentes] = useState(null);   // { fuentes }
    const abrirFuentes = async () => {
        let fuentes = [];
        try { fuentes = (await listarFuentes()).fuentes || []; } catch { /* sin proyecto */ }
        setMenuFuentes({ fuentes });
    };
    const fuenteATexto = async () => {
        setMenuFuentes(null);
        const v = await dialog.promptAsync({ title: 'A table or a file', message: 'A table of the database (main.ventas, or "otro_proyecto".main.metas) or a file of the project (data/ventas.csv).', placeholder: 'main.ventas' });
        const s = String(v || '').trim();
        if (!s) return;
        nuevaFuente(DATOS_DE_ARCHIVO.test(s) || /[\\/]/.test(s) ? { tipo: 'archivo', ruta: s } : { tipo: 'tabla', nombre: s });
    };

    // Soltar desde el explorador: una fuente, una tabla o un archivo de datos.
    const alSoltar = useCallback((e) => {
        e.preventDefault();
        let d = null;
        try { d = JSON.parse(e.dataTransfer.getData('application/json') || 'null'); } catch { d = null; }
        if (!d) return;
        const en = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        if (d.type === 'table') {
            if (d.schema === 'fuentes') return nuevaFuente({ tipo: 'fuente', nombre: d.name }, en);
            return nuevaFuente({ tipo: 'tabla', nombre: d.ref || (d.schema && d.schema !== 'main' ? `${d.schema}.${d.name}` : d.name) }, en);
        }
        if (d.type === 'file' && DATOS_DE_ARCHIVO.test(d.path || '')) return nuevaFuente({ tipo: 'archivo', ruta: d.path }, en);
        if (d.type === 'file') toast.info('Only data files (CSV, Parquet, JSON, Excel) become a Source.');
    }, [flow, toast]);   // eslint-disable-line react-hooks/exhaustive-deps

    // Soltar una conexión en un hueco: el menú que escribe la consulta (Dec-56).
    const [menuConexion, setMenuConexion] = useState(null);   // { padre, x, y, en }
    const alTerminarConexion = useCallback((e, estado) => {
        if (estado?.isValid || !estado?.fromNode) return;
        const ev = 'changedTouches' in e ? e.changedTouches[0] : e;
        const en = flow.screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
        const caja = document.querySelector('.lz-raiz')?.getBoundingClientRect();
        setMenuConexion({ padre: estado.fromNode.id, x: ev.clientX - (caja?.left || 0), y: ev.clientY - (caja?.top || 0), en });
    }, [flow]);
    const crearDesde = (accion) => {
        const { padre, en } = menuConexion;
        setMenuConexion(null);
        const cols = resultados[padre]?.data?.[0] ? Object.keys(resultados[padre].data[0]) : (lienzoRef.current.tarjetas.find(t => t.id === padre)?.foto?.columnas || []);
        const c = consultaNueva(lienzoRef.current, padre, accion, { columna: accion === 'vacia' ? null : cols[0] || null });
        anadir({ id: c.id, tipo: 'query', sql: c.sql }, { x: en.x, y: en.y - 40 });
    };

    // ── Buscar (Ctrl+F) y teclas ────────────────────────────────────────────
    const [buscando, setBuscando] = useState(false);
    const [busqueda, setBusqueda] = useState('');
    const irA = (q) => {
        const s = q.trim().toLowerCase();
        if (!s) return;
        const t = tarjetas.find(x => [x.id, x.titulo, x.texto, x.sql, x.origen?.nombre].some(v => String(v || '').toLowerCase().includes(s)));
        if (!t) { toast.info(`Nothing on this canvas says "${q}"`); return; }
        setSeleccion(t.id);
        flow.fitView({ nodes: [{ id: t.id }], duration: 350, maxZoom: 1.1, padding: 0.4 });
    };
    useEffect(() => {
        if (!isActive) return undefined;
        const tecla = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && document.querySelector('.lz-raiz')?.contains(document.activeElement || document.body)) {
                e.preventDefault(); setBuscando(true);
            }
            if (e.key === 'Escape') { setEditando(null); setMenuConexion(null); setMenuFuentes(null); setBuscando(false); }
        };
        window.addEventListener('keydown', tecla);
        return () => window.removeEventListener('keydown', tecla);
    }, [isActive]);

    const [menuMas, setMenuMas] = useState(false);
    // Los menús se cierran con un clic fuera de ellos (y con Esc).
    useEffect(() => {
        if (!menuMas && !menuFuentes && !menuConexion) return undefined;
        const fuera = (e) => {
            if (e.target.closest?.('.lz-menu, .lz-herr > button, .lz-mas > button')) return;
            setMenuMas(false); setMenuFuentes(null); setMenuConexion(null);
        };
        document.addEventListener('mousedown', fuera);
        return () => document.removeEventListener('mousedown', fuera);
    }, [menuMas, menuFuentes, menuConexion]);
    const ctx = useMemo(() => ({
        resultados, estados, corriendo, editando, setEditando, correr, cambiar, renombrar, redimensionar,
        problemas, theme, editorSettings, sqlDe: sqlDeTarjeta,
    }), [resultados, estados, corriendo, editando, correr, cambiar, renombrar, redimensionar, problemas, theme, editorSettings]);

    if (error) {
        return (
            <div className="lz-raiz lz-roto">
                <LuTriangleAlert size={22} />
                <p>{error}</p>
                <p className="lz-roto-nota">The file was left as it is. Open it as text to fix it, or restore it from git.</p>
            </div>
        );
    }

    return (
        <LienzoCtx.Provider value={ctx}>
            <div className="lz-raiz" onDragOver={e => e.preventDefault()} onDrop={alSoltar}>
                <div className="lz-barra">
                    <span className="lz-titulo">{lienzo.titulo || 'Canvas'}</span>
                    <span className="lz-sp" />
                    {viejas > 0 && <span className="lz-aviso" title="Cards not up to date in this session">{viejas === 1 ? '1 card to refresh' : `${viejas} cards to refresh`}</span>}
                    <button type="button" className="lz-btn" onClick={() => setBuscando(b => !b)} title="Find a card (Ctrl+F)"><LuSearch size={14} /></button>
                    <button type="button" className="lz-btn lz-btn--prim" disabled={!!corriendo || viejas === 0} onClick={() => refrescar(null)} title="Run what is not up to date, in dependency order">
                        <LuRefreshCw size={13} /> Refresh all
                    </button>
                    <div className="lz-mas">
                        <button type="button" className="lz-btn" onClick={() => setMenuMas(m => !m)} title="More"><LuEllipsis size={14} /></button>
                        {menuMas && (
                            <div className="lz-menu lz-menu--derecha">
                                {seleccion && DEJAN_VISTA.has(tarjetas.find(t => t.id === seleccion)?.tipo) && (
                                    <button type="button" onClick={() => { setMenuMas(false); refrescar(seleccion); }}><LuRefreshCw size={13} /> Refresh from “{seleccion}”</button>
                                )}
                                <button type="button" onClick={() => { setMenuMas(false); actualizar(l => sinFotos(l)); toast.success('Snapshots cleared: the canvas file has no data in it now'); }}>
                                    <LuEraser size={13} /> Clear snapshots
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {buscando && (
                    <div className="lz-buscar">
                        <LuSearch size={13} />
                        <input autoFocus value={busqueda} placeholder="Find a card by name, SQL or text" onChange={e => setBusqueda(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') irA(busqueda); if (e.key === 'Escape') setBuscando(false); }} />
                        <button type="button" onClick={() => setBuscando(false)} title="Close"><LuX size={13} /></button>
                    </div>
                )}

                <div className="lz-herr" role="toolbar" aria-label="Add to the canvas">
                    <button type="button" onClick={abrirFuentes} title="Source: a named source, a table or a file (or drag one from the explorers)"><LuInbox size={16} /></button>
                    <button type="button" onClick={nuevaQuery} title="Query"><LuDatabase size={16} /></button>
                    <hr />
                    <button type="button" onClick={() => anadir({ id: idLibre('nota'), tipo: 'note', texto: '' })} title="Note"><LuStickyNote size={16} /></button>
                    <button type="button" onClick={() => anadir({ id: idLibre('texto'), tipo: 'text', texto: '' })} title="Text"><LuType size={16} /></button>
                    <button type="button" onClick={() => anadir({ id: idLibre('marco'), tipo: 'frame', titulo: 'Frame' })} title="Frame: groups cards, and is one slide when presenting"><LuFrame size={16} /></button>
                    {menuFuentes && (
                        <div className="lz-menu lz-menu--herr">
                            <h4>Named sources</h4>
                            {menuFuentes.fuentes.length === 0 && <p className="lz-menu-nada">This project has no named sources.</p>}
                            {menuFuentes.fuentes.map(f => (
                                <button type="button" key={f.nombre} onClick={() => { setMenuFuentes(null); nuevaFuente({ tipo: 'fuente', nombre: f.nombre }); }}>
                                    <LuInbox size={13} /> {f.nombre}
                                </button>
                            ))}
                            <hr />
                            <button type="button" onClick={fuenteATexto}><LuDatabase size={13} /> A table or a file…</button>
                        </div>
                    )}
                </div>

                <div className="lz-flujo">
                    <ReactFlow
                        nodes={nodos}
                        edges={bordes}
                        nodeTypes={TIPOS_DE_NODO}
                        onNodesChange={alCambiarNodos}
                        onNodeDragStop={recolocarEnMarcos}
                        onNodesDelete={(ns) => borrar(ns.map(n => n.id))}
                        onConnectEnd={alTerminarConexion}
                        onPaneClick={() => { setSeleccion(null); setEditando(null); setMenuConexion(null); }}
                        onMoveEnd={(_, v) => { vistaRef.current = v; }}
                        defaultViewport={lienzo.vista ? { x: lienzo.vista.x, y: lienzo.vista.y, zoom: lienzo.vista.zoom } : undefined}
                        fitView={!lienzo.vista}
                        minZoom={0.15}
                        maxZoom={2}
                        deleteKeyCode={['Delete', 'Backspace']}
                        edgesFocusable={false}
                        nodesConnectable
                        proOptions={{ hideAttribution: true }}
                    >
                        <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
                        <MiniMap pannable zoomable className="lz-mini" nodeClassName={(n) => `lz-mini-${n.type}`} />
                        <Controls showInteractive={false} />
                    </ReactFlow>
                    {tarjetas.length === 0 && (
                        <div className="lz-vacio-lienzo">
                            <p>Start from a <strong>Source</strong> (drag a named source, a table or a data file from the explorers), or a <strong>Query</strong>.</p>
                            <p>Drag from the edge of a card to a gap: a new query that reads it. The arrows come from what each query reads.</p>
                        </div>
                    )}
                </div>

                {menuConexion && (
                    <div className="lz-menu lz-menu--conexion" style={{ left: menuConexion.x, top: menuConexion.y }}>
                        <h4>New card reading {menuConexion.padre}</h4>
                        <button type="button" onClick={() => crearDesde('filtrar')}><LuFilter size={13} /> Filter… <small>WHERE</small></button>
                        <button type="button" onClick={() => crearDesde('agrupar')}><LuGroup size={13} /> Group by… <small>GROUP BY</small></button>
                        <button type="button" onClick={() => crearDesde('unir')}><LuMerge size={13} /> Join with… <small>JOIN</small></button>
                        <button type="button" onClick={() => crearDesde('vacia')}><LuDatabase size={13} /> Empty query <small>SELECT *</small></button>
                    </div>
                )}
            </div>
        </LienzoCtx.Provider>
    );
}

export default function LienzoEditor(props) {
    return (
        <ReactFlowProvider>
            <Interior {...props} />
        </ReactFlowProvider>
    );
}
