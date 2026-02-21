import sys

with open('src/components/DataVisualizer.jsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

lines = lines[:1707]

tail = """                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Chart Area */}
            <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--chart-bg)', overflow: 'hidden',
                ...(isFullscreen ? {
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 9999,
                    padding: '40px'
                } : {})
            }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: isFullscreen ? '0 0 10px 0' : '10px 20px 0 0' }}>
                    <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Data'}
                        style={{
                            background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', borderRadius: '4px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.2s'
                        }}
                        onMouseOver={(e) => e.target.style.color = 'var(--text-active)'}
                        onMouseOut={(e) => e.target.style.color = 'var(--text-muted)'}
                    >
                        {isFullscreen ? <LuMinimize size={18} /> : <LuMaximize size={16} />}
                    </button>
                </div>
                <div ref={chartRef} style={{ flex: 1, padding: isFullscreen ? '0 20px 20px 20px' : '0 20px 20px 20px', display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
                    {chartTitle && <h2 style={{ textAlign: textAlign, margin: '0 0 5px 0', color: 'var(--text-active)', fontSize: '18px', fontWeight: '600', paddingLeft: textAlign === 'left' ? '50px' : '0' }}>{chartTitle}</h2>}
                    {chartSubtitle && <h3 style={{ textAlign: textAlign, margin: '0 0 5px 0', color: 'var(--text-muted)', fontSize: '14px', fontWeight: '400', paddingLeft: textAlign === 'left' ? '50px' : '0' }}>{chartSubtitle}</h3>}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
                        {ChartContent}
                    </div>
                    {chartFootnote && <div style={{ textAlign: textAlign, marginTop: '5px', color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic', borderTop: '1px solid var(--border-color)', paddingTop: '5px', whiteSpace: 'pre-wrap', paddingLeft: textAlign === 'left' ? '50px' : '0' }}>{chartFootnote}</div>}
                </div>
            </div>
        </div>
    );
};

export default DataVisualizer;
"""

lines.append(tail)

with open('src/components/DataVisualizer.jsx', 'w', encoding='utf-8') as f:
    f.writelines(lines)
