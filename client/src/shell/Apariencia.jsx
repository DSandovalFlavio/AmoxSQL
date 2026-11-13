/**
 * La apariencia de AmoxSQL: tema, acento, resplandor, fuente de la interfaz,
 * zoom, reparto del editor y preferencias del editor (6.0, M8).
 *
 * Vivía en App.jsx, que la bajaba por veinte props a Settings. Ahora la tiene
 * este proveedor, que envuelve el shell (no la ventana emergente de
 * resultados, que aplica el tema por su cuenta), y cada uno la lee con
 * `useApariencia()`. Los efectos que la aplican al documento y la guardan son
 * los mismos y en el mismo orden: el del acento va ANTES que el de su
 * luminosidad, que lee la clase ya puesta.
 *
 * El proveedor es antepasado de quien lo lee, así que sus efectos corren
 * DESPUÉS de los de sus hijos, como cuando esto vivía en App y Settings era
 * su hijo (ver la nota de `effectiveAccentL`).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { themeClassFor, modeClassFor, migrateTheme } from '../theme.js';
import { deriveLogoStops } from '../utils/logoGradient.js';
import { syncMonacoTheme } from '../monacoTheme.js';

const Contexto = createContext(null);

export function AparienciaProvider({ children }) {
  const [theme, setTheme] = useState(() => migrateTheme(localStorage.getItem('amoxsql-theme')));
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem('amoxsql-accent') || 'cyan'); // 'cyan' | 'linear' | 'amox-2' .. 'amox-10'
  // Luminosidad del acento. null = sin personalizar, se usa la L propia del preset.
  // Guardarla como null en vez de un número evita aplanar la rampa amox-2..amox-10,
  // que varía L y tono a la vez: cada preset conserva su identidad hasta que el
  // usuario decide apartarse de ella.
  const [accentL, setAccentL] = useState(() => {
    const v = parseFloat(localStorage.getItem('amoxsql-accent-l'));
    return Number.isFinite(v) ? v : null;
  });
  // L efectiva (la del override si lo hay, si no la propia del preset). Se calcula
  // aquí y no en el modal de ajustes: React corre los efectos de hijo ANTES que
  // los del padre, así que el modal leería el estilo calculado antes de que este
  // componente hubiera cambiado la clase o quitado el override — y mostraría el
  // valor anterior.
  const [effectiveAccentL, setEffectiveAccentL] = useState(0.73);
  // Resplandor del fondo: esquina y fuerza.
  const [glowCorner, setGlowCorner] = useState(() => localStorage.getItem('amoxsql-glow-corner') || 'tl');
  const [glowStrength, setGlowStrength] = useState(() => {
    const v = parseInt(localStorage.getItem('amoxsql-glow-strength'), 10);
    return Number.isFinite(v) ? v : 30;
  });
  // Cambiar de preset devuelve el slider a la L propia de ese acento. Se hace en
  // el manejador y NO en un efecto sobre accentColor: en StrictMode los efectos
  // corren dos veces al montar y la segunda pasada borraba la preferencia
  // guardada. Atarlo a la acción del usuario en vez de al ciclo de vida lo evita.
  const handleAccentChange = useCallback((id) => {
    setAccentColor(id);
    setAccentL(null);
  }, []);
  const [interfaceFont, setInterfaceFont] = useState(() => localStorage.getItem('amoxsql-ui-font') || 'manrope'); // interface font (separate from editor font)
  const [editorLayout, setEditorLayout] = useState(() => localStorage.getItem('amoxsql-editor-layout') || 'horizontal'); // 'horizontal' | 'vertical'

  // Editor & UI Preferences (centralized)
  const [uiZoomLevel, setUiZoomLevel] = useState(() => {
    return parseFloat(localStorage.getItem('amoxsql-ui-zoom')) || 1.0;
  });

  // Persist zoom to localStorage (main process handles the actual zoom)
  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem('amoxsql-ui-zoom', uiZoomLevel.toString()), 150);
    return () => clearTimeout(t);
  }, [uiZoomLevel]);

  // Listen for zoom changes from main process (Ctrl+Plus/Minus/0)
  useEffect(() => {
    if (window.electronAPI?.zoom?.onChanged) {
      const cleanup = window.electronAPI.zoom.onChanged((factor) => {
        const rounded = Math.round(factor * 10) / 10;
        setUiZoomLevel(rounded);
      });
      return cleanup;
    }
  }, []);

  const [editorSettings, setEditorSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('amoxsql-editor-settings');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  // Memoized so its identity is stable across re-renders — otherwise a new object
  // every render would re-render every consumer (LayoutManager/editor) on each nav.
  const mergedEditorSettings = useMemo(() => ({
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'Consolas', monospace",
    minimap: false,
    wordWrap: 'off',
    lineNumbers: 'on',
    tabSize: 4,
    resultsFontSize: 13,
    showRowNumbers: true,
    stickyRowNumbers: true,
    defaultViewMode: 'table',
    mouseWheelZoom: true,
    bracketPairColorization: true,
    renderWhitespace: 'none',
    smoothScrolling: false,
    cursorStyle: 'line',
    cursorBlinking: 'blink',
    formatOnSave: false,
    formatOnPaste: false,
    markdownDefaultView: 'edit',
    markdownToolbarVisible: true,
    showWelcomeOnStart: true,
    confirmBeforeDrop: true,
    queryResultLimit: 10000,
    autoSaveInterval: 0,
    ...editorSettings,
  }), [editorSettings]);

  // Apply Theme & Mode Classes
  useEffect(() => {
    localStorage.setItem('amoxsql-theme', theme);
    // Remove all theme classes first
    // Se barren por prefijo en vez de por lista: una lista hay que acordarse de
    // actualizarla al anadir o retirar un tema, y si se olvida quedan dos clases
    // de tema puestas a la vez.
    [...document.body.classList]
        .filter(c => c.startsWith('theme-'))
        .forEach(c => document.body.classList.remove(c));
    document.body.classList.remove('mode-light', 'mode-dark');
    // Theme class carries per-theme surfaces (dark/obsidian = default, no class)
    const themeClass = themeClassFor(theme);
    if (themeClass) document.body.classList.add(themeClass);
    // Mode class carries everything that only depends on light-vs-dark, so that
    // every light theme (each with its OWN theme class) still receives the light
    // scrollbars, editor chrome, feedback ramps, etc.
    document.body.classList.add(modeClassFor(theme));
    // Re-theme Monaco from the now-current tokens (single `amox` theme, global).
    syncMonacoTheme();
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('amoxsql-accent', accentColor);
    // Remove all accent classes first
    const classes = [...document.body.classList].filter(c => c.startsWith('accent-'));
    classes.forEach(c => document.body.classList.remove(c));
    // Apply new accent class (cyan = default, no class needed)
    if (accentColor !== 'cyan') {
      document.body.classList.add(`accent-${accentColor}`);
    }
    // The accent changes --accent-primary → re-theme Monaco (cursor/highlight).
    syncMonacoTheme();
  }, [accentColor]);

  // Luminosidad del acento. Se aplica como estilo inline sobre body para ganarle
  // a la clase .accent-*; al quitarla reaparece la L propia del preset.
  // Depende también de accentColor: al cambiar de preset sin override activo, la
  // L efectiva cambia aunque accentL siga siendo null. Va declarado DESPUÉS del
  // efecto del acento, así que la clase ya está puesta cuando se lee.
  useEffect(() => {
    if (accentL == null) {
      document.body.style.removeProperty('--acc-l');
      localStorage.removeItem('amoxsql-accent-l');
    } else {
      document.body.style.setProperty('--acc-l', String(accentL));
      localStorage.setItem('amoxsql-accent-l', String(accentL));
    }
    const v = parseFloat(getComputedStyle(document.body).getPropertyValue('--acc-l'));
    setEffectiveAccentL(Number.isFinite(v) ? v : 0.73);
    syncMonacoTheme();
  }, [accentL, accentColor]);

  // Degradado del logo. Se calcula en JS y no en CSS porque hacen falta dos cosas
  // que una hoja de estilos no puede expresar: buscar el croma maximo dentro del
  // gamut sRGB para cada tono (busqueda binaria) y rotar el tono hacia el azul
  // por el camino corto sin pasarse de largo. Ver utils/logoGradient.js.
  useEffect(() => {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;opacity:0;pointer-events:none';
    probe.style.color = 'var(--accent-primary)';
    document.body.appendChild(probe);
    const mode = modeClassFor(theme) === 'mode-light' ? 'light' : 'dark';
    const stops = deriveLogoStops(getComputedStyle(probe).color, mode);
    probe.remove();
    if (stops) {
      document.body.style.setProperty('--logo-grad-a', stops.a);
      document.body.style.setProperty('--logo-grad-b', stops.b);
    }
  }, [accentColor, accentL, theme]);

  // Esquina del resplandor del fondo.
  useEffect(() => {
    localStorage.setItem('amoxsql-glow-corner', glowCorner);
    [...document.body.classList].filter(c => c.startsWith('glow-')).forEach(c => document.body.classList.remove(c));
    document.body.classList.add(`glow-${glowCorner}`);
  }, [glowCorner]);

  // Fuerza del resplandor. Se escribe --glow-strength-user (no el efectivo), para
  // que el modo claro pueda seguir escalándolo y no se ensucie el fondo.
  useEffect(() => {
    localStorage.setItem('amoxsql-glow-strength', String(glowStrength));
    document.body.style.setProperty('--glow-strength-user', `${glowStrength}%`);
  }, [glowStrength]);

  useEffect(() => {
    localStorage.setItem('amoxsql-editor-layout', editorLayout);
  }, [editorLayout]);

  // Apply interface font (separate from the code editor font, which uses --font-mono)
  useEffect(() => {
    localStorage.setItem('amoxsql-ui-font', interfaceFont);
    const FAMILIES = {
      manrope: "'Manrope', system-ui, sans-serif",
      inter: "'Inter', system-ui, sans-serif",
      lato: "'Lato', system-ui, sans-serif",
      'ibm-plex': "'IBM Plex Sans', system-ui, sans-serif",
      'space-grotesk': "'Space Grotesk', system-ui, sans-serif",
      lora: "'Lora', Georgia, serif",
      system: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    };
    document.documentElement.style.setProperty('--font-sans', FAMILIES[interfaceFont] || FAMILIES.manrope);
  }, [interfaceFont]);

  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem('amoxsql-editor-settings', JSON.stringify(editorSettings)), 300);
    return () => clearTimeout(t);
  }, [editorSettings]);

  // Settings › Editor cambia unas cuantas a la vez; las demás se conservan.
  const cambiarEditorSettings = useCallback((cambios) => setEditorSettings(prev => ({ ...prev, ...cambios })), []);

  const valor = useMemo(() => ({
    theme, setTheme,
    accentColor, handleAccentChange,
    accentL, setAccentL, effectiveAccentL,
    glowCorner, setGlowCorner, glowStrength, setGlowStrength,
    interfaceFont, setInterfaceFont,
    editorLayout, setEditorLayout,
    uiZoomLevel, setUiZoomLevel,
    editorSettings, setEditorSettings, mergedEditorSettings, cambiarEditorSettings,
  }), [theme, accentColor, handleAccentChange, accentL, effectiveAccentL, glowCorner, glowStrength,
    interfaceFont, editorLayout, uiZoomLevel, editorSettings, mergedEditorSettings, cambiarEditorSettings]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** La apariencia y cómo cambiarla. Sólo dentro de <AparienciaProvider>. */
export function useApariencia() {
  const v = useContext(Contexto);
  if (!v) throw new Error('useApariencia() fuera de <AparienciaProvider>');
  return v;
}
