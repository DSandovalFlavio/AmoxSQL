/**
 * ChartTypeSelector — Visual grid for selecting chart types with icons.
 * Replaces the old <select> dropdown.
 */
import { memo, useState } from 'react';
import { CHART_TYPES, CHART_CATEGORIES } from '../constants';

// ─── Mini SVG Icons for each chart type ──────────────────────
const ChartIcon = ({ type, size = 28 }) => {
    const s = size;
    const half = s / 2;
    const color = 'currentColor';

    const icons = {
        'bar': (
            <svg width={s} height={s} viewBox="0 0 28 28" fill="none">
                <rect x="4" y="14" width="4" height="10" rx="1" fill={color} opacity="0.5" />
                <rect x="10" y="8" width="4" height="16" rx="1" fill={color} opacity="0.7" />
                <rect x="16" y="4" width="4" height="20" rx="1" fill={color} />
                <rect x="22" y="10" width="4" height="14" rx="1" fill={color} opacity="0.6" />
            </svg>
        ),
        'bar-stacked': (
            <svg width={s} height={s} viewBox="0 0 28 28" fill="none">
                <rect x="4" y="14" width="5" height="6" rx="1" fill={color} opacity="0.4" />
                <rect x="4" y="20" width="5" height="4" rx="1" fill={color} opacity="0.7" />
                <rect x="11" y="6" width="5" height="10" rx="1" fill={color} opacity="0.4" />
                <rect x="11" y="16" width="5" height="8" rx="1" fill={color} opacity="0.7" />
                <rect x="18" y="4" width="5" height="12" rx="1" fill={color} opacity="0.4" />
                <rect x="18" y="16" width="5" height="8" rx="1" fill={color} opacity="0.7" />
            </svg>
        ),
        'bar-100': (
            <svg width={s} height={s} viewBox="0 0 28 28" fill="none">
                <rect x="4" y="4" width="5" height="10" rx="1" fill={color} opacity="0.3" />
                <rect x="4" y="14" width="5" height="10" rx="1" fill={color} opacity="0.7" />
                <rect x="11" y="4" width="5" height="14" rx="1" fill={color} opacity="0.3" />
                <rect x="11" y="18" width="5" height="6" rx="1" fill={color} opacity="0.7" />
                <rect x="18" y="4" width="5" height="8" rx="1" fill={color} opacity="0.3" />
                <rect x="18" y="12" width="5" height="12" rx="1" fill={color} opacity="0.7" />
            </svg>
        ),
        'bar-horizontal': (
            <svg width={s} height={s} viewBox="0 0 28 28" fill="none">
                <rect x="4" y="4" width="16" height="4" rx="1" fill={color} />
                <rect x="4" y="10" width="20" height="4" rx="1" fill={color} opacity="0.7" />
                <rect x="4" y="16" width="12" height="4" rx="1" fill={color} opacity="0.5" />
                <rect x="4" y="22" width="8" height="4" rx="1" fill={color} opacity="0.3" />
            </svg>
        ),
        'bar-horizontal-stacked': (
            <svg width={s} height={s} viewBox="0 0 28 28" fill="none">
                <rect x="4" y="4" width="10" height="4" rx="1" fill={color} opacity="0.7" />
                <rect x="14" y="4" width="6" height="4" rx="1" fill={color} opacity="0.4" />
                <rect x="4" y="10" width="14" height="4" rx="1" fill={color} opacity="0.7" />
                <rect x="18" y="10" width="6" height="4" rx="1" fill={color} opacity="0.4" />
                <rect x="4" y="16" width="8" height="4" rx="1" fill={color} opacity="0.7" />
                <rect x="12" y="16" width="4" height="4" rx="1" fill={color} opacity="0.4" />
            </svg>
        ),
        'bar-horizontal-100': (
            <svg width={s} height={s} viewBox="0 0 28 28" fill="none">
                <rect x="4" y="4" width="14" height="4" rx="1" fill={color} opacity="0.7" />
                <rect x="18" y="4" width="6" height="4" rx="1" fill={color} opacity="0.3" />
                <rect x="4" y="10" width="8" height="4" rx="1" fill={color} opacity="0.7" />
                <rect x="12" y="10" width="12" height="4" rx="1" fill={color} opacity="0.3" />
                <rect x="4" y="16" width="18" height="4" rx="1" fill={color} opacity="0.7" />
                <rect x="22" y="16" width="2" height="4" rx="1" fill={color} opacity="0.3" />
            </svg>
        ),
        'line': (
            <svg width={s} height={s} viewBox="0 0 28 28" fill="none">
                <polyline points="4,20 9,16 14,10 19,14 24,6" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="4" cy="20" r="1.5" fill={color} />
                <circle cx="14" cy="10" r="1.5" fill={color} />
                <circle cx="24" cy="6" r="1.5" fill={color} />
            </svg>
        ),
        'area': (
            <svg width={s} height={s} viewBox="0 0 28 28" fill="none">
                <path d="M4,22 L9,16 L14,12 L19,14 L24,8 L24,24 L4,24 Z" fill={color} opacity="0.3" />
                <path d="M4,20 L9,18 L14,20 L19,16 L24,18 L24,24 L4,24 Z" fill={color} opacity="0.5" />
                <polyline points="4,22 9,16 14,12 19,14 24,8" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.6" />
            </svg>
        ),
        'donut': (
            <svg width={s} height={s} viewBox="0 0 28 28" fill="none">
                <path d="M14,4 A10,10 0 0,1 24,14" stroke={color} strokeWidth="4" fill="none" opacity="0.8" />
                <path d="M24,14 A10,10 0 0,1 14,24" stroke={color} strokeWidth="4" fill="none" opacity="0.5" />
                <path d="M14,24 A10,10 0 0,1 4,14" stroke={color} strokeWidth="4" fill="none" opacity="0.3" />
                <path d="M4,14 A10,10 0 0,1 14,4" stroke={color} strokeWidth="4" fill="none" opacity="0.6" />
            </svg>
        ),
        'pie': (
            <svg width={s} height={s} viewBox="0 0 28 28" fill="none">
                <circle cx="14" cy="14" r="10" fill={color} opacity="0.4" />
                <path d="M14,14 L14,4 A10,10 0 0,1 24,14 Z" fill={color} opacity="0.9" />
            </svg>
        ),
        'waterfall': (
            <svg width={s} height={s} viewBox="0 0 28 28" fill="none">
                <rect x="3" y="16" width="4" height="6" rx="1" fill={color} opacity="0.5" />
                <rect x="9" y="11" width="4" height="6" rx="1" fill={color} opacity="0.7" />
                <rect x="15" y="7" width="4" height="6" rx="1" fill={color} opacity="0.9" />
                <rect x="21" y="4" width="4" height="9" rx="1" fill={color} />
            </svg>
        ),
        'scatter': (
            <svg width={s} height={s} viewBox="0 0 28 28" fill="none">
                <circle cx="8" cy="18" r="2.5" fill={color} opacity="0.6" />
                <circle cx="14" cy="10" r="2" fill={color} opacity="0.8" />
                <circle cx="20" cy="14" r="3" fill={color} opacity="0.5" />
                <circle cx="10" cy="8" r="1.5" fill={color} opacity="0.7" />
                <circle cx="22" cy="20" r="2" fill={color} opacity="0.4" />
                <circle cx="16" cy="20" r="1.5" fill={color} opacity="0.6" />
            </svg>
        ),
        'bubble': (
            <svg width={s} height={s} viewBox="0 0 28 28" fill="none">
                <circle cx="8" cy="16" r="4" fill={color} opacity="0.5" />
                <circle cx="16" cy="10" r="3" fill={color} opacity="0.7" />
                <circle cx="22" cy="16" r="5" fill={color} opacity="0.4" />
                <circle cx="12" cy="22" r="2" fill={color} opacity="0.6" />
            </svg>
        ),
        'combo': (
            <svg width={s} height={s} viewBox="0 0 28 28" fill="none">
                <rect x="4" y="14" width="4" height="10" rx="1" fill={color} opacity="0.5" />
                <rect x="10" y="10" width="4" height="14" rx="1" fill={color} opacity="0.6" />
                <rect x="16" y="6" width="4" height="18" rx="1" fill={color} opacity="0.5" />
                <rect x="22" y="12" width="4" height="12" rx="1" fill={color} opacity="0.4" />
                <polyline points="6,12 12,8 18,4 24,10" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="6" cy="12" r="1.5" fill={color} />
                <circle cx="18" cy="4" r="1.5" fill={color} />
            </svg>
        ),
        'funnel': (
            <svg width={s} height={s} viewBox="0 0 28 28" fill="none">
                <rect x="2" y="4" width="24" height="4" rx="1" fill={color} opacity="0.8" />
                <rect x="5" y="10" width="18" height="4" rx="1" fill={color} opacity="0.6" />
                <rect x="8" y="16" width="12" height="4" rx="1" fill={color} opacity="0.4" />
                <rect x="11" y="22" width="6" height="4" rx="1" fill={color} opacity="0.3" />
            </svg>
        ),
        'heatmap': (
            <svg width={s} height={s} viewBox="0 0 28 28" fill="none">
                <rect x="4" y="4" width="5" height="5" rx="1" fill={color} opacity="0.9" />
                <rect x="11" y="4" width="5" height="5" rx="1" fill={color} opacity="0.5" />
                <rect x="18" y="4" width="5" height="5" rx="1" fill={color} opacity="0.3" />
                <rect x="4" y="11" width="5" height="5" rx="1" fill={color} opacity="0.6" />
                <rect x="11" y="11" width="5" height="5" rx="1" fill={color} opacity="0.8" />
                <rect x="18" y="11" width="5" height="5" rx="1" fill={color} opacity="0.4" />
                <rect x="4" y="18" width="5" height="5" rx="1" fill={color} opacity="0.2" />
                <rect x="11" y="18" width="5" height="5" rx="1" fill={color} opacity="0.7" />
                <rect x="18" y="18" width="5" height="5" rx="1" fill={color} opacity="0.9" />
            </svg>
        ),
        'treemap': (
            <svg width={s} height={s} viewBox="0 0 28 28" fill="none">
                <rect x="4" y="4" width="12" height="12" rx="1" fill={color} opacity="0.8" />
                <rect x="18" y="4" width="6" height="6" rx="1" fill={color} opacity="0.5" />
                <rect x="18" y="12" width="6" height="4" rx="1" fill={color} opacity="0.6" />
                <rect x="4" y="18" width="8" height="6" rx="1" fill={color} opacity="0.4" />
                <rect x="14" y="18" width="10" height="6" rx="1" fill={color} opacity="0.7" />
            </svg>
        ),
    };

    return icons[type] || icons['bar'];
};

// ─── Component ───────────────────────────────────────────────
const ChartTypeSelector = memo(({ currentType, onTypeChange }) => {
    const [expandedCategory, setExpandedCategory] = useState(null);

    // Find current type's category
    const currentTypeInfo = CHART_TYPES.find(t => t.key === currentType);

    return (
        <div style={{ marginBottom: '16px' }}>
            <label style={{
                display: 'block', fontSize: '11px', color: 'var(--text-muted)',
                marginBottom: '8px', fontWeight: '600', textTransform: 'uppercase',
                letterSpacing: '0.5px'
            }}>
                Chart Type
            </label>

            {/* Category rows */}
            {CHART_CATEGORIES.map(category => {
                const types = CHART_TYPES.filter(t => t.category === category.key);
                if (types.length === 0) return null;

                const isExpanded = expandedCategory === category.key;
                const hasActiveType = types.some(t => t.key === currentType);

                return (
                    <div key={category.key} style={{ marginBottom: '6px' }}>
                        {/* Category header */}
                        <div
                            onClick={() => setExpandedCategory(isExpanded ? null : category.key)}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '4px 6px', cursor: 'pointer',
                                fontSize: '10px', color: hasActiveType ? 'var(--accent-color-user)' : 'var(--text-tertiary)',
                                fontWeight: hasActiveType ? '600' : '500',
                                textTransform: 'uppercase', letterSpacing: '0.3px',
                                borderRadius: '4px',
                                transition: 'background 0.15s',
                            }}
                            className="dv-category-header"
                        >
                            <span>{category.label}</span>
                            <span style={{
                                fontSize: '8px', transition: 'transform 0.2s',
                                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                            }}>▼</span>
                        </div>

                        {/* Type grid — always show if category has active type, or if expanded */}
                        {(isExpanded || hasActiveType) && (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: `repeat(${Math.min(types.length, 3)}, 1fr)`,
                                gap: '4px', padding: '4px 2px',
                            }}>
                                {types.map(type => {
                                    const isActive = currentType === type.key;
                                    return (
                                        <button
                                            key={type.key}
                                            onClick={() => onTypeChange(type.key)}
                                            title={type.description}
                                            style={{
                                                display: 'flex', flexDirection: 'column',
                                                alignItems: 'center', justifyContent: 'center',
                                                gap: '3px', padding: '6px 4px',
                                                background: isActive
                                                    ? 'var(--accent-color-user)'
                                                    : 'var(--panel-section-bg)',
                                                border: isActive
                                                    ? '1px solid var(--accent-color-user)'
                                                    : '1px solid var(--border-color)',
                                                borderRadius: '6px', cursor: 'pointer',
                                                color: isActive ? 'var(--button-text-color)' : 'var(--text-secondary)',
                                                transition: 'all 0.15s',
                                                minHeight: '48px',
                                            }}
                                            className={isActive ? '' : 'dv-chart-type-btn'}
                                        >
                                            <ChartIcon type={type.key} size={24} />
                                            <span style={{
                                                fontSize: '9px', fontWeight: '500',
                                                lineHeight: 1.1, textAlign: 'center',
                                                whiteSpace: 'nowrap', overflow: 'hidden',
                                                textOverflow: 'ellipsis', maxWidth: '100%'
                                            }}>
                                                {type.label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
});

ChartTypeSelector.displayName = 'ChartTypeSelector';

export default ChartTypeSelector;
