/**
 * Los eventos de ventana de AmoxSQL, en un solo sitio (6.0, M8 · E6).
 *
 * Varias partes de la interfaz se hablan con `CustomEvent` sobre `window`
 * (abrir un panel desde otro, avisar de que algo cambió). Funciona, pero los
 * nombres se descubrían buscando texto. Aquí está cada uno: qué lleva en
 * `detail`, quién lo emite y quién lo escucha.
 *
 * Reglas:
 *   - Un evento nuevo se añade aquí primero; `scripts/probarEventos.mjs` falla
 *     si el código emite o escucha un `amox_*` que no está en la lista, o si la
 *     lista tiene uno que ya nadie usa.
 *   - Se emite con `emitir(nombre, detalle)` y se escucha con
 *     `escuchar(nombre, (detalle, evento) => …)`, que devuelve la función para
 *     dejar de escuchar (lo que pide un `useEffect`). En desarrollo, un nombre
 *     que no está aquí avisa en la consola.
 *   - El código viejo que usa `window.dispatchEvent` / `addEventListener`
 *     directamente sigue funcionando: es el mismo evento. Se pasa a estas dos
 *     funciones al tocar cada archivo.
 */

/** @type {Record<string, { detalle: string, emite: string, escucha: string }>} */
export const EVENTOS = {
    // ── Abrir algo desde otra parte ──
    amox_abrir_ajustes: { detalle: 'la sección de Settings (string) o nada', emite: 'workspaces/VistaWorkspaces, ai/SinModelo (sin modelo → AI)', escucha: 'App' },
    amox_abrir_ayuda: { detalle: "'shortcuts' | 'storyflow' | 'dataflow'", emite: 'CommandPalette, SettingsModal (un enlace viejo)', escucha: 'App' },
    amox_abrir_ejecucion: { detalle: '{ runId }', emite: 'Data Flow (formulario), dbt, Operations, Needs attention, Retomar', escucha: 'App (FichaEjecucion)' },
    amox_abrir_operacion: { detalle: '—', emite: 'WindowTitleBar, Operations, Needs attention', escucha: 'App, WelcomeScreen, VistaWorkspaces' },
    amox_open_gallery_chart: { detalle: '{ chartPath }', emite: 'ChartGalleryModal', escucha: 'App' },
    amox_open_workspace_wizard: { detalle: '—', emite: 'SettingsModal (Project)', escucha: 'App' },
    amox_exportar_proyecto: { detalle: '{ plantilla: boolean }', emite: 'WindowTitleBar', escucha: 'App' },
    amox_nueva_consulta: { detalle: '{ sql, nombre? }', emite: 'DbtLineageGraph (las filas que fallan un test)', escucha: 'App' },
    amox_create_chart: { detalle: '{ title, … } la configuración inicial del gráfico', emite: 'DataProfiler', escucha: 'App' },
    amox_plegar_barra_lateral: { detalle: '—', emite: 'AiDivingPanel', escucha: 'App' },
    amox_atajo_de_editor: { detalle: '{ accion } (un atajo global pulsado dentro de Monaco)', emite: 'utils/atajosEnMonaco (constante ATAJO_DE_EDITOR)', escucha: 'App' },
    amox_replay_storyflow_tour: { detalle: '—', emite: 'ayuda/GuiaStoryFlow', escucha: 'onboarding/OnboardingHost (legacyReplayEvent del registro de tours)' },
    amox_replay_dataflow_tour: { detalle: '—', emite: 'ayuda/GuiaDataFlow', escucha: 'onboarding/OnboardingHost (legacyReplayEvent del registro de tours)' },

    // ── El Assistant ──
    amox_asistir: { detalle: "{ tabId, accion?: 'preguntar' | …, pregunta? } — una puerta al Assistant", emite: 'App, EditorPane, los editores (cuaderno, deck, diagrama, Canvas, Data Flow, gráfico), conectarAsistente', escucha: 'App, AiAssistantPanel' },
    amox_ai_prompt: { detalle: '{ prompt }', emite: 'DataProfiler, QueryPlanModal', escucha: 'App, AiAssistantPanel' },
    amox_activate_skill: { detalle: '{ skillId }', emite: 'App', escucha: 'AiAssistantPanel' },
    amox_foco: { detalle: '{ tabId, seleccion?, … } dónde está el usuario en el archivo', emite: 'utils/memoriaDePestana (fijarFoco)', escucha: 'AiAssistantPanel, onboarding/OnboardingHost (retira la pista de un tour al cambiar de pestaña)' },
    amox_revisar_propuesta: { detalle: '{ toolCallId, … } una propuesta del Assistant para revisar en su editor', emite: 'ai/propuestasEnEditor', escucha: 'RevisionEnMonaco y los editores (gráfico, Data Flow, cuaderno, deck, diagrama, Canvas)' },
    amox_settings_updated: { detalle: '—', emite: 'SettingsModal, useAiChat', escucha: 'useAiChat' },
    amox_conversation_created: { detalle: '{ id }', emite: 'useAiChat, AiDivingPanel, ConversationList', escucha: 'AiDivingPanel, ConversationList' },
    amox_deep_dive_espera: { detalle: '{ conversationId, espera }', emite: 'AiDivingPanel', escucha: 'ConversationList' },
    amox_artifacts_changed: { detalle: '— (nadie lo escucha hoy)', emite: 'AiDivingPanel', escucha: '—' },

    // ── Gráficos ──
    amox_update_chart_config: { detalle: '{ tabId, changes? | spec? | reemplazar? }', emite: 'AmoxvisPane, LayoutManager', escucha: 'DataVisualizer' },
    amox_consulta_seguida: { detalle: '{ path, consulta } un .amoxvis que siguió a su .sql al guardarlo', emite: 'LayoutManager', escucha: 'AmoxvisPane' },

    // ── Algo cambió (vuelve a leer) ──
    amox_files_changed: { detalle: '—', emite: 'AiDivingPanel, Lago, Settings (Project, AI)', escucha: 'App' },
    amox_catalog_refreshed: { detalle: '—', emite: 'SettingsModal (Editor)', escucha: 'FunctionReference' },
    amox_dbt_cambio: { detalle: '—', emite: 'DbtPanel, dbt/BarraModelo, dbt/PuenteDbt, dbt/useCorrerDbt', escucha: 'DbtLineageGraph, SqlEditor (completado de dbt)' },
    amox_medidas_cambio: { detalle: '— (nadie lo emite hoy: el editor también relee las medidas al volver a la ventana)', emite: '—', escucha: 'SqlEditor' },
    amox_variables: { detalle: '{ variables }', emite: 'utils/variablesProyecto', escucha: 'LayoutManager, VariablesDelProyecto' },
    amox_fuentes_cambiaron: { detalle: '—', emite: 'fuentes/api', escucha: 'FuentesDelWorkspace, FuentesExplorador' },
    amox_destinos_cambiaron: { detalle: '—', emite: 'fuentes/api', escucha: 'SelectorDeDestino, DestinosDeEntrega' },
    amox_workspaces_cambiaron: { detalle: '—', emite: 'WorkspacesPanel', escucha: 'WelcomeScreen, VistaWorkspaces' },
    amox_atencion_cambio: { detalle: '—', emite: 'operacion/Atencion', escucha: 'Atencion, VistaOperacion' },
    amox_proyecto_abierto: { detalle: 'la carpeta (string)', emite: 'App', escucha: 'WorkspacesHost' },
    amox_proyecto_cerrado: { detalle: '—', emite: 'App', escucha: 'WorkspacesHost' },
    amox_enlazar_proyecto: { detalle: '—', emite: 'WorkspacesHost', escucha: 'WorkspacesHost' },
};

/** @typedef {keyof typeof EVENTOS} NombreDeEvento */

const avisarSiNoExiste = (nombre) => {
    if (!(nombre in EVENTOS) && import.meta.env?.DEV) {
        console.error(`[eventos] «${nombre}» no está en client/src/eventos.js: añádelo allí.`);
    }
};

/**
 * Emite un evento de ventana.
 * @param {NombreDeEvento} nombre
 * @param {*} [detalle]
 */
export function emitir(nombre, detalle) {
    avisarSiNoExiste(nombre);
    window.dispatchEvent(new CustomEvent(nombre, { detail: detalle }));
}

/**
 * Escucha un evento de ventana. Devuelve la función que deja de escucharlo.
 * @param {NombreDeEvento} nombre
 * @param {(detalle: *, evento: CustomEvent) => void} alRecibir
 * @returns {() => void}
 */
export function escuchar(nombre, alRecibir) {
    avisarSiNoExiste(nombre);
    const manejador = (e) => alRecibir(e.detail, e);
    window.addEventListener(nombre, manejador);
    return () => window.removeEventListener(nombre, manejador);
}
