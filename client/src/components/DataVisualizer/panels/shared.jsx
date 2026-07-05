/**
 * Shared UI primitives for chart configuration panels.
 * Provides consistent styling and reduces inline style duplication.
 */
import { memo, useState, useRef, useEffect } from 'react';
import { COLOR_PALETTES } from '../constants';

// ─── Styles ──────────────────────────────────────────────────
export const panelStyles = {
    section: {
        marginBottom: '16px', padding: '10px',
        backgroundColor: 'var(--panel-section-bg)',
        borderRadius: '6px', border: '1px solid var(--border-color)',
    },
    sectionTitle: {
        margin: '0 0 10px 0', fontSize: '10px',
        color: 'var(--text-active)', textTransform: 'uppercase',
        fontWeight: '600', letterSpacing: '0.4px',
    },
    label: {
        display: 'block', fontSize: '11px',
        color: 'var(--text-muted)', marginBottom: '6px',
        fontWeight: '500',
    },
    labelSmall: {
        display: 'block', fontSize: '10px',
        color: 'var(--text-tertiary)', marginBottom: '4px',
    },
    select: {
        width: '100%', backgroundColor: 'var(--input-bg)',
        color: 'var(--text-active)', border: '1px solid var(--border-color)',
        padding: '5px 8px', borderRadius: '4px', fontSize: '11px',
    },
    input: {
        width: '100%', background: 'var(--input-bg)',
        border: '1px solid var(--border-color)',
        color: 'var(--text-active)', padding: '5px 8px',
        fontSize: '11px', borderRadius: '4px', boxSizing: 'border-box',
    },
    checkbox: {
        display: 'flex', alignItems: 'center', gap: '8px',
        cursor: 'pointer', fontSize: '11px',
        color: 'var(--text-secondary)', marginBottom: '6px',
    },
    checkboxInput: {
        accentColor: 'var(--accent-primary)',
    },
    row: {
        display: 'flex', gap: '8px', marginBottom: '8px',
    },
    flex1: { flex: 1 },
    flex2: { flex: 2 },
    divider: {
        height: '1px', backgroundColor: 'var(--border-color)',
        margin: '10px 0',
    },
};

// ─── Section Container ───────────────────────────────────────
export const Section = memo(({ title, children, style }) => (
    <div style={{ ...panelStyles.section, ...style }}>
        {title && <h4 style={panelStyles.sectionTitle}>{title}</h4>}
        {children}
    </div>
));
Section.displayName = 'Section';

// ─── Toggle (Checkbox) ──────────────────────────────────────
export const Toggle = memo(({ label, checked, onChange, disabled }) => (
    <label style={{ ...panelStyles.checkbox, opacity: disabled ? 0.5 : 1 }}>
        <input
            type="checkbox"
            checked={checked}
            onChange={e => onChange(e.target.checked)}
            disabled={disabled}
            style={panelStyles.checkboxInput}
        />
        {label}
    </label>
));
Toggle.displayName = 'Toggle';

// ─── Select Field ────────────────────────────────────────────
export const SelectField = memo(({ label, value, onChange, options, children, disabled, style }) => (
    <div style={style}>
        {label && <label style={panelStyles.labelSmall}>{label}</label>}
        <select
            value={value}
            onChange={e => onChange(e.target.value)}
            style={{ ...panelStyles.select, opacity: disabled ? 0.5 : 1 }}
            disabled={disabled}
        >
            {children || options?.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
        </select>
    </div>
));
SelectField.displayName = 'SelectField';

// ─── Input Field ─────────────────────────────────────────────
export const InputField = memo(({ label, type = 'text', value, onChange, placeholder, disabled, style, min, max }) => (
    <div style={style}>
        {label && <label style={panelStyles.labelSmall}>{label}</label>}
        <input
            type={type}
            value={value}
            onChange={e => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            min={min}
            max={max}
            style={{ ...panelStyles.input, opacity: disabled ? 0.5 : 1 }}
        />
    </div>
));
InputField.displayName = 'InputField';

// ─── Slider Field ────────────────────────────────────────────
export const SliderField = memo(({ label, value, onChange, min = 0, max = 100, suffix = '' }) => (
    <div style={{ marginBottom: '8px' }}>
        <label style={{ ...panelStyles.labelSmall, display: 'flex', justifyContent: 'space-between' }}>
            <span>{label}</span>
            <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>{value}{suffix}</span>
        </label>
        <input
            type="range" min={min} max={max} value={value}
            onChange={e => onChange(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent-primary)' }}
        />
    </div>
));
SliderField.displayName = 'SliderField';

// ─── Color Picker ────────────────────────────────────────────
export const SimpleColorPicker = memo(({ color, onChange, swatches }) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const displayColor = color || '#ffffff';

    return (
        <div style={{ position: 'relative', display: 'inline-block' }} ref={wrapperRef}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    width: '28px', height: '20px',
                    backgroundColor: displayColor,
                    border: '1px solid var(--border-color)',
                    cursor: 'pointer', borderRadius: '4px',
                }}
                title="Click to select color"
            />
            {isOpen && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, zIndex: 1000,
                    backgroundColor: 'var(--tooltip-bg)', border: '1px solid var(--border-color)',
                    padding: '10px', borderRadius: '6px',
                    boxShadow: 'var(--shadow-md)',
                    width: '260px', marginTop: '4px',
                    display: 'flex', flexDirection: 'column', gap: '8px'
                }}>
                    <div style={{ overflowY: 'auto', maxHeight: '180px', paddingRight: '4px' }}>
                        {swatches ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                                {swatches.map(c => (
                                    <div
                                        key={c}
                                        onClick={() => { onChange(c); setIsOpen(false); }}
                                        style={{
                                            width: '18px', height: '18px',
                                            backgroundColor: c, cursor: 'pointer',
                                            border: color === c ? '2px solid var(--text-primary)' : '1px solid var(--border-subtle)',
                                            borderRadius: '3px', boxSizing: 'border-box',
                                            transition: 'transform 0.1s',
                                        }}
                                        className="dv-color-swatch"
                                        title={c}
                                    />
                                ))}
                            </div>
                        ) : (
                            Object.entries(COLOR_PALETTES).map(([category, colors]) => (
                                <div key={category} style={{ marginBottom: '6px' }}>
                                    <div style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '3px' }}>
                                        {category}
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                                        {colors.map(c => (
                                            <div
                                                key={c}
                                                onClick={() => { onChange(c); setIsOpen(false); }}
                                                style={{
                                                    width: '18px', height: '18px',
                                                    backgroundColor: c, cursor: 'pointer',
                                                    border: color === c ? '2px solid var(--text-primary)' : '1px solid var(--border-subtle)',
                                                    borderRadius: '3px', boxSizing: 'border-box',
                                                    transition: 'transform 0.1s',
                                                }}
                                                className="dv-color-swatch"
                                                title={c}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        borderTop: '1px solid var(--border-color)', paddingTop: '8px'
                    }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Hex:</span>
                        <input
                            type="text" value={color || ''}
                            onChange={e => onChange(e.target.value)}
                            placeholder="#FFFFFF"
                            style={{
                                flex: 1, background: 'var(--input-bg)',
                                border: '1px solid var(--border-color)',
                                color: 'var(--text-active)', fontSize: '11px',
                                padding: '4px', minWidth: 0, borderRadius: '3px',
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
});
SimpleColorPicker.displayName = 'SimpleColorPicker';

// ─── Divider ─────────────────────────────────────────────────
export const Divider = () => <div style={panelStyles.divider} />;
