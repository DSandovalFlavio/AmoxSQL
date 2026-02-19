import { useState } from 'react';

const WelcomeScreen = ({ onOpenProject }) => {
    const [path, setPath] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (path.trim()) {
            onOpenProject(path.trim());
        }
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            width: '100vw',
            backgroundColor: '#0F1012', // VS Code dark theme bg
            color: '#ccccc7',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
        }}>
            <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                <div style={{ marginBottom: '-60px' }}>
                    {/* AmoxSQL Logo */}
                    <svg width="360" height="360" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <linearGradient id="neonGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" style={{ stopColor: 'var(--accent-color-user)', stopOpacity: 1 }} />
                                <stop offset="100%" style={{ stopColor: '#0055ff', stopOpacity: 1 }} />
                            </linearGradient>
                            <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
                                <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
                                <feMerge>
                                    <feMergeNode in="blur" />
                                    <feMergeNode in="SourceGraphic" />
                                </feMerge>
                            </filter>
                        </defs>
                        {/* Adjusted ViewBox/Scale for icon usage */}
                        <g transform="translate(50, 0) scale(0.8)">
                            <g stroke="url(#neonGradient)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" fill="none" filter="url(#neonGlow)">
                                <path d="M 135 285 Q 125 290 115 275 L 185 75 Q 200 45 215 75 L 285 275 Q 275 290 265 285" />
                                <path d="M 130 210 Q 200 330 270 210" />
                            </g>
                        </g>
                    </svg>
                </div>
                <h1 style={{ fontSize: '42px', fontWeight: '700', color: '#ffffff', margin: '0', letterSpacing: '1px' }}>
                    Amox<span style={{ color: 'var(--accent-color-user)' }}>SQL</span>
                </h1>
                <p style={{ fontSize: '16px', color: '#888', marginTop: '10px', fontStyle: 'italic' }}>
                    The Modern Codex for Local Data Analysis
                </p>
            </div>

            <div style={{
                width: '450px',
                padding: '30px',
                backgroundColor: '#141517',
                borderRadius: '8px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                border: '1px solid var(--accent-color-user)'
            }}>
                <h2 style={{ marginTop: 0, fontSize: '18px', color: '#fff', marginBottom: '20px' }}>Open Workspace</h2>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '500' }}>Project Path</label>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <input
                                type="text"
                                value={path}
                                onChange={(e) => setPath(e.target.value)}
                                placeholder="C:/Users/Dev/MyProject"
                                autoFocus
                                style={{
                                    flex: 1,
                                    padding: '10px',
                                    borderRadius: '4px',
                                    border: '1px solid #3c3c3c',
                                    backgroundColor: '#3c3c3c',
                                    color: '#fff',
                                    fontSize: '14px',
                                    outline: 'none'
                                }}
                            />
                        </div>
                        <p style={{ fontSize: '11px', color: '#666', marginTop: '6px' }}>
                            Paste the absolute path to your folder.
                        </p>
                    </div>

                    <button
                        type="submit"
                        disabled={!path.trim()}
                        style={{
                            marginTop: '10px',
                            padding: '12px',
                            backgroundColor: path.trim() ? '#0092acff' : '#1f2124ff',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: path.trim() ? 'pointer' : 'default',
                            transition: 'background-color 0.2s'
                        }}
                    >
                        Open Project
                    </button>

                    {/* Optional: Recent Projects list could go here later */}
                </form>
            </div>

            <div style={{ position: 'absolute', bottom: '20px', fontSize: '12px', color: '#555' }}>
                v1.0.0
            </div>
        </div>
    );
};

export default WelcomeScreen;
