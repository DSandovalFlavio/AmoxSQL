/**
 * Chart state management with useReducer.
 * Replaces the ~53 individual useState hooks from the monolithic DataVisualizer.
 */
import { useReducer, useCallback, useRef, useEffect } from 'react';
import { DEFAULT_CONFIG } from './constants';

// ─── Action Types ────────────────────────────────────────────
export const ACTIONS = {
    SET_FIELD: 'SET_FIELD',
    SET_FIELDS: 'SET_FIELDS',
    LOAD_CONFIG: 'LOAD_CONFIG',
    RESET: 'RESET',
};

// ─── Reducer ─────────────────────────────────────────────────
function chartReducer(state, action) {
    switch (action.type) {
        case ACTIONS.SET_FIELD:
            return { ...state, [action.field]: action.value };

        case ACTIONS.SET_FIELDS:
            return { ...state, ...action.fields };

        case ACTIONS.LOAD_CONFIG: {
            const cfg = action.config;
            const newState = { ...DEFAULT_CONFIG };

            // Map all known keys, preserving legacy migrations
            Object.keys(DEFAULT_CONFIG).forEach(key => {
                if (cfg[key] !== undefined) {
                    newState[key] = cfg[key];
                }
            });

            // ── Legacy migrations ──
            // barStacked → barStackMode
            if (cfg.barStacked !== undefined && cfg.barStackMode === undefined) {
                newState.barStackMode = cfg.barStacked ? 'stack' : 'none';
            }
            // lineSmooth → lineType
            if (cfg.lineSmooth !== undefined && cfg.lineType === undefined) {
                newState.lineType = cfg.lineSmooth ? 'monotone' : 'linear';
            }
            // yAxisLog → yLogScale
            if (cfg.yAxisLog !== undefined && cfg.yLogScale === undefined) {
                newState.yLogScale = cfg.yAxisLog;
            }
            // maxItems → limit
            if (cfg.maxItems !== undefined && cfg.limit === undefined) {
                newState.limit = cfg.maxItems;
            }

            // Map the bar-stacked / bar-100 / bar-horizontal-stacked / bar-horizontal-100 
            // into chartType + barStackMode
            if (cfg.chartType === 'bar-stacked') {
                newState.chartType = 'bar';
                newState.barStackMode = 'stack';
            } else if (cfg.chartType === 'bar-100') {
                newState.chartType = 'bar';
                newState.barStackMode = 'expand';
            } else if (cfg.chartType === 'bar-horizontal-stacked') {
                newState.chartType = 'bar-horizontal';
                newState.barStackMode = 'stack';
            } else if (cfg.chartType === 'bar-horizontal-100') {
                newState.chartType = 'bar-horizontal';
                newState.barStackMode = 'expand';
            }

            return newState;
        }

        case ACTIONS.RESET:
            return { ...DEFAULT_CONFIG };

        default:
            return state;
    }
}

// ─── Hook ────────────────────────────────────────────────────
export function useChartState(initialConfig = null) {
    const initialState = initialConfig
        ? chartReducer(DEFAULT_CONFIG, { type: ACTIONS.LOAD_CONFIG, config: initialConfig })
        : { ...DEFAULT_CONFIG };

    const [state, dispatch] = useReducer(chartReducer, initialState);

    // ── Sync with external initialConfig changes (e.g., AI assistant updates) ──
    const isExternalUpdateRef = useRef(false);
    const prevInitialConfigRef = useRef(initialConfig ? JSON.stringify(initialConfig) : null);

    useEffect(() => {
        if (!initialConfig) return;
        const serialized = JSON.stringify(initialConfig);
        if (serialized !== prevInitialConfigRef.current) {
            prevInitialConfigRef.current = serialized;
            isExternalUpdateRef.current = true;
            dispatch({ type: ACTIONS.LOAD_CONFIG, config: initialConfig });
        }
    }, [initialConfig]);

    /** Set a single field */
    const setField = useCallback((field, value) => {
        dispatch({ type: ACTIONS.SET_FIELD, field, value });
    }, []);

    /** Set multiple fields at once */
    const setFields = useCallback((fields) => {
        dispatch({ type: ACTIONS.SET_FIELDS, fields });
    }, []);

    /** Load a full config (from .amoxvis or initialConfig) with migrations */
    const loadConfig = useCallback((config) => {
        dispatch({ type: ACTIONS.LOAD_CONFIG, config });
    }, []);

    /** Reset to defaults */
    const resetConfig = useCallback(() => {
        dispatch({ type: ACTIONS.RESET });
    }, []);

    /** 
     * Get the effective chart type for rendering.
     * Maps compound types back to base types used by renderers.
     */
    const effectiveChartType = (() => {
        switch (state.chartType) {
            case 'bar-stacked':
            case 'bar-100':
                return 'bar';
            case 'bar-horizontal-stacked':
            case 'bar-horizontal-100':
                return 'bar-horizontal';
            case 'bubble':
                return 'scatter';
            default:
                return state.chartType;
        }
    })();

    /**
     * Get the effective bar stack mode from compound chart types.
     */
    const effectiveBarStackMode = (() => {
        if (state.chartType === 'bar-stacked' || state.chartType === 'bar-horizontal-stacked') return 'stack';
        if (state.chartType === 'bar-100' || state.chartType === 'bar-horizontal-100') return 'expand';
        return state.barStackMode;
    })();

    /**
     * Is this a horizontal bar variant?
     */
    const isHorizontal = state.chartType.startsWith('bar-horizontal');

    // ── Debounced config change notification ──
    const configChangeTimer = useRef(null);
    const isInitialMount = useRef(true);

    const useConfigChangeNotifier = (onConfigChange) => {
        useEffect(() => {
            if (isInitialMount.current) {
                isInitialMount.current = false;
                return;
            }
            // Skip notification when state change was triggered by external prop update
            // to prevent feedback loop: prop → LOAD_CONFIG → state → onConfigChange → prop
            if (isExternalUpdateRef.current) {
                isExternalUpdateRef.current = false;
                return;
            }
            if (!onConfigChange) return;

            if (configChangeTimer.current) clearTimeout(configChangeTimer.current);
            configChangeTimer.current = setTimeout(() => {
                onConfigChange(state);
            }, 500);

            return () => {
                if (configChangeTimer.current) clearTimeout(configChangeTimer.current);
            };
        }, [state, onConfigChange]);
    };

    /**
     * Build the config object for saving.
     */
    const getConfigForSave = () => ({ ...state });

    return {
        state,
        dispatch,
        setField,
        setFields,
        loadConfig,
        resetConfig,
        effectiveChartType,
        effectiveBarStackMode,
        isHorizontal,
        useConfigChangeNotifier,
        getConfigForSave,
    };
}
