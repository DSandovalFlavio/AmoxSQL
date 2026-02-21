import React, { useState, useEffect } from 'react';
import { LuX, LuPalette, LuMoon, LuSun, LuCpu, LuDownload, LuCheck, LuLoader } from 'react-icons/lu';

const RECOMMENDED_MODELS = [
    { id: 'qwen2.5:1.5b', label: 'Qwen 2.5 (1.5B)', size: '1.4GB RAM', desc: 'Ideal for ultralight machines.' },
    { id: 'llama3.2:3b', label: 'Llama 3.2 (3B)', size: '2.0GB RAM', desc: 'Very balanced and fast.' },
    { id: 'llama3.1:8b', label: 'Llama 3.1 (8B)', size: '4.9GB RAM', desc: 'Powerful SQL & Code model.' },
    { id: 'gemma2:2b', label: 'Gemma 2 (2B)', size: '1.6GB RAM', desc: 'Great reasoning for small memory.' }
];

const SettingsModal = ({ isOpen, onClose, currentTheme, onThemeChange }) => {
    const [activeTab, setActiveTab] = useState('appearance');

    // AI Settings State
    const [geminiApiKey, setGeminiApiKey] = useState('');
    const [provider, setProvider] = useState('ollama');
    const [defaultModel, setDefaultModel] = useState('qwen3:1.7b');
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const [geminiUsage, setGeminiUsage] = useState({ flashLite: 0, flash: 0, pro: 0, tokens: 0 });

    // Ollama Specific State
    const [installedModels, setInstalledModels] = useState([]);
    const [isLoadingModels, setIsLoadingModels] = useState(false);

    // Download State
    const [customModelInput, setCustomModelInput] = useState('');
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(null); // { status: string, percent: number }

    useEffect(() => {
        if (isOpen) {
            // Load base config
            fetch('http://localhost:3001/api/settings/config')
                .then(res => res.json())
                .then(data => {
                    setGeminiApiKey(data.geminiApiKey || '');
                    setProvider(data.provider || 'ollama');
                    setDefaultModel(data.defaultModel || 'qwen3:1.7b');
                    if (data.usage) {
                        setGeminiUsage(data.usage);
                    }
                    if (data.provider !== 'gemini') {
                        fetchInstalledModels();
                    }
                })
                .catch(err => console.error("Failed to load config", err));
        }
    }, [isOpen]);

    // Fetch Ollama Models when switching provider
    useEffect(() => {
        if (isOpen && provider === 'ollama' && !isDownloading) {
            fetchInstalledModels();
        }
    }, [provider, isOpen, isDownloading]);

    const fetchInstalledModels = async () => {
        setIsLoadingModels(true);
        try {
            const res = await fetch('http://localhost:3001/api/settings/ollama/models');
            const data = await res.json();
            if (data.models) {
                setInstalledModels(data.models);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoadingModels(false);
        }
    };

    const handleSaveConfig = async () => {
        setIsSaving(true);
        setSaveMessage(null);
        try {
            await fetch('http://localhost:3001/api/settings/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ geminiApiKey, provider, defaultModel })
            });

            // Dispatch event to sync other components
            window.dispatchEvent(new Event('amox_settings_updated'));

            setSaveMessage({ type: 'success', text: 'Settings saved successfully' });
            setTimeout(() => setSaveMessage(null), 3000);
        } catch (err) {
            console.error("Failed to save config", err);
            setSaveMessage({ type: 'error', text: 'Failed to save settings' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDownloadModel = async (modelId) => {
        if (!modelId.trim() || isDownloading) return;

        setIsDownloading(true);
        setDownloadProgress({ status: 'Starting download...', percent: 0 });

        try {
            const response = await fetch('http://localhost:3001/api/settings/ollama/pull', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelId })
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.substring(6));
                            if (data.status === "success") {
                                setDownloadProgress({ status: 'Download Complete!', percent: 100 });
                            } else if (data.total && data.completed) {
                                const percent = Math.round((data.completed / data.total) * 100);
                                setDownloadProgress({ status: data.status, percent });
                            } else if (data.error) {
                                throw new Error(data.error);
                            } else {
                                setDownloadProgress({ status: data.status, percent: prev => prev?.percent || 0 });
                            }
                        } catch (e) {
                            // ignore parse err for incomplete chunks
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Download failed:", err);
            setDownloadProgress({ status: 'Error: ' + err.message, percent: 0, error: true });
        } finally {
            setTimeout(() => {
                setIsDownloading(false);
                setDownloadProgress(null);
                setCustomModelInput('');
                fetchInstalledModels();
            }, 3000);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000,
            backdropFilter: 'blur(2px)'
        }}>
            <div style={{
                backgroundColor: 'var(--modal-bg)',
                color: 'var(--text-color)',
                width: '1350px', // Enlarged width
                height: '975px', // Enlarged height
                borderRadius: '8px',
                display: 'flex',
                overflow: 'hidden',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                border: '1px solid var(--border-color)'
            }}>
                {/* Sidebar */}
                <div style={{
                    width: '220px',
                    backgroundColor: 'var(--sidebar-bg)',
                    borderRight: '1px solid var(--border-color)',
                    padding: '20px 0',
                    flexShrink: 0
                }}>
                    <div style={{ padding: '0 20px 20px', fontWeight: 'bold', fontSize: '18px', color: 'var(--text-active)' }}>
                        Settings
                    </div>

                    <div
                        onClick={() => setActiveTab('appearance')}
                        style={{
                            padding: '12px 20px', cursor: 'pointer',
                            backgroundColor: activeTab === 'appearance' ? 'var(--sidebar-item-active-bg)' : 'transparent',
                            color: activeTab === 'appearance' ? 'var(--text-active)' : 'var(--text-color)',
                            display: 'flex', alignItems: 'center', gap: '10px',
                            borderLeft: activeTab === 'appearance' ? '3px solid var(--accent-color-user)' : '3px solid transparent'
                        }}
                    >
                        <LuPalette size={18} /> Appearance
                    </div>

                    <div
                        onClick={() => setActiveTab('ai')}
                        style={{
                            padding: '12px 20px', cursor: 'pointer',
                            backgroundColor: activeTab === 'ai' ? 'var(--sidebar-item-active-bg)' : 'transparent',
                            color: activeTab === 'ai' ? 'var(--text-active)' : 'var(--text-color)',
                            display: 'flex', alignItems: 'center', gap: '10px',
                            borderLeft: activeTab === 'ai' ? '3px solid var(--accent-color-user)' : '3px solid transparent'
                        }}
                    >
                        <LuCpu size={18} /> AI Assistant
                    </div>
                </div>

                {/* Content */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--editor-bg)' }}>
                    <div style={{
                        padding: '20px 25px',
                        borderBottom: '1px solid var(--border-color)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                        <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--text-active)' }}>
                            {activeTab === 'appearance' ? 'Appearance' : activeTab === 'ai' ? 'AI Settings' : 'Settings'}
                        </h2>
                        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-color)', padding: '5px', cursor: 'pointer', display: 'flex' }}>
                            <LuX size={22} />
                        </button>
                    </div>

                    <div style={{ padding: '25px', flex: 1, overflowY: 'auto' }}>
                        {activeTab === 'appearance' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>

                                {/* Theme Selection */}
                                <div>
                                    <h3 style={{ fontSize: '15px', marginBottom: '15px', color: 'var(--text-active)' }}>Color Theme</h3>
                                    <div style={{ display: 'flex', gap: '20px' }}>

                                        {/* Dark Option */}
                                        <div
                                            onClick={() => onThemeChange('dark')}
                                            style={{
                                                flex: 1, cursor: 'pointer',
                                                border: currentTheme === 'dark' ? '2px solid var(--accent-color-user)' : '1px solid var(--border-color)',
                                                borderRadius: '8px', padding: '15px', backgroundColor: '#1e1f22',
                                                opacity: currentTheme === 'dark' ? 1 : 0.7, transition: 'all 0.2s'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#fff' }}>
                                                <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '1px solid #555', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {currentTheme === 'dark' && <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#00ffff' }}></div>}
                                                </div>
                                                <LuMoon size={18} /> Dark
                                            </div>
                                            <div style={{ display: 'flex', height: '80px', borderRadius: '6px', overflow: 'hidden', fontSize: '10px' }}>
                                                <div style={{ width: '30%', background: '#141517', borderRight: '1px solid #333' }}></div>
                                                <div style={{ flex: 1, background: '#1e1f22', color: '#ccc', padding: '8px' }}>
                                                    SELECT * FROM...
                                                </div>
                                            </div>
                                        </div>

                                        {/* Light Option */}
                                        <div
                                            onClick={() => onThemeChange('light')}
                                            style={{
                                                flex: 1, cursor: 'pointer',
                                                border: currentTheme === 'light' ? '2px solid var(--accent-color-user)' : '1px solid var(--border-color)',
                                                borderRadius: '8px', padding: '15px', backgroundColor: '#ffffff',
                                                opacity: currentTheme === 'light' ? 1 : 0.7, transition: 'all 0.2s'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#000' }}>
                                                <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '1px solid #ddd', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {currentTheme === 'light' && <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#0059ff' }}></div>}
                                                </div>
                                                <LuSun size={18} /> Light
                                            </div>
                                            <div style={{ display: 'flex', height: '80px', borderRadius: '6px', overflow: 'hidden', fontSize: '10px', border: '1px solid #eee' }}>
                                                <div style={{ width: '30%', background: '#f8f9fa', borderRight: '1px solid #dee2e6' }}></div>
                                                <div style={{ flex: 1, background: '#ffffff', color: '#333', padding: '8px' }}>
                                                    SELECT * FROM...
                                                </div>
                                            </div>
                                        </div>

                                    </div>
                                </div>

                                <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    Current Accent Color: <span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: 'var(--accent-color-user)', borderRadius: '50%' }}></span> {currentTheme === 'dark' ? 'Cyan #00ffff' : 'Blue #0059ff'}
                                </div>

                            </div>
                        )}

                        {activeTab === 'ai' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '25px', height: '100%' }}>
                                {/* Provider Selection & Main Save */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                        <h3 style={{ fontSize: '15px', marginBottom: '10px', color: 'var(--text-active)' }}>AI Engine Provider</h3>
                                        <select
                                            value={provider}
                                            onChange={(e) => setProvider(e.target.value)}
                                            style={{
                                                width: '100%', maxWidth: '300px', padding: '10px 12px', backgroundColor: 'var(--input-bg)',
                                                color: 'var(--text-active)', border: '1px solid var(--border-color)', borderRadius: '6px', outline: 'none', cursor: 'pointer'
                                            }}
                                        >
                                            <option value="ollama">Ollama (Local Engine)</option>
                                            <option value="gemini">Google Gemini (Cloud)</option>
                                        </select>
                                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: '1.4' }}>
                                            Choose between running fully private local models or using Google's Cloud API.
                                        </p>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                                        <button
                                            onClick={handleSaveConfig}
                                            disabled={isSaving}
                                            style={{
                                                padding: '10px 20px', backgroundColor: 'var(--accent-color-user)',
                                                color: 'var(--button-text-color)', border: 'none', borderRadius: '6px', cursor: 'pointer',
                                                fontWeight: 'bold', opacity: isSaving ? 0.7 : 1, transition: 'all 0.2s', fontSize: '14px'
                                            }}
                                        >
                                            {isSaving ? 'Saving...' : 'Save AI Settings'}
                                        </button>
                                        {saveMessage && (
                                            <div style={{ fontSize: '13px', color: saveMessage.type === 'success' ? '#4ade80' : '#ff6b6b' }}>
                                                {saveMessage.type === 'success' ? '✓ ' : '× '} {saveMessage.text}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '0' }} />

                                {/* Gemini Specific */}
                                {provider === 'gemini' && (
                                    <div style={{ animation: 'fadeIn 0.3s', display: 'flex', gap: '25px', flexDirection: 'column' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                            <div style={{ backgroundColor: 'transparent', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '20px' }}>
                                                <h3 style={{ fontSize: '15px', margin: '0 0 15px 0', color: 'var(--text-active)' }}>Authentication</h3>

                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <input
                                                        type={geminiApiKey ? "password" : "text"}
                                                        value={geminiApiKey}
                                                        onChange={(e) => setGeminiApiKey(e.target.value)}
                                                        placeholder="Enter your Gemini API Key"
                                                        style={{
                                                            flex: 1, padding: '12px', backgroundColor: 'var(--input-bg)',
                                                            color: 'var(--text-active)', border: '1px solid var(--border-color)', borderRadius: '6px', outline: 'none',
                                                            fontFamily: geminiApiKey ? 'monospace' : 'inherit'
                                                        }}
                                                    />
                                                    {geminiApiKey && (
                                                        <button
                                                            onClick={() => setGeminiApiKey('')}
                                                            title="Clear API Key"
                                                            style={{
                                                                padding: '12px', backgroundColor: 'var(--sidebar-item-active-bg)',
                                                                border: '1px solid var(--border-color)', borderRadius: '6px',
                                                                color: '#ff6b6b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                            }}
                                                        >
                                                            <LuX size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '10px', lineHeight: '1.4' }}>
                                                    Your key is stored securely in your computer's home directory (`~/.amoxsql/`). Removing it here will delete it from your local storage upon saving.
                                                </p>
                                            </div>
                                        </div>

                                        <div style={{ backgroundColor: 'var(--sidebar-item-active-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '20px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                                <h3 style={{ fontSize: '15px', margin: 0, color: 'var(--text-active)' }}>Daily Free Tier Usage (2026 Limits)</h3>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                                                <div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-active)', marginBottom: '6px', fontWeight: '500' }}>
                                                        <span>2.5 Flash-Lite</span>
                                                        <span>{geminiUsage.flashLite} / 1000</span>
                                                    </div>
                                                    <div style={{ height: '6px', backgroundColor: 'var(--input-bg)', borderRadius: '3px', overflow: 'hidden' }}>
                                                        <div style={{ height: '100%', width: `${Math.min((geminiUsage.flashLite / 1000) * 100, 100)}%`, backgroundColor: '#ff9800', transition: 'width 0.3s ease' }}></div>
                                                    </div>
                                                </div>

                                                <div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-active)', marginBottom: '6px', fontWeight: '500' }}>
                                                        <span>2.5 Flash</span>
                                                        <span>{geminiUsage.flash} / 250</span>
                                                    </div>
                                                    <div style={{ height: '6px', backgroundColor: 'var(--input-bg)', borderRadius: '3px', overflow: 'hidden' }}>
                                                        <div style={{ height: '100%', width: `${Math.min((geminiUsage.flash / 250) * 100, 100)}%`, backgroundColor: '#4ade80', transition: 'width 0.3s ease' }}></div>
                                                    </div>
                                                </div>

                                                <div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-active)', marginBottom: '6px', fontWeight: '500' }}>
                                                        <span>2.5 Pro</span>
                                                        <span>{geminiUsage.pro} / 100</span>
                                                    </div>
                                                    <div style={{ height: '6px', backgroundColor: 'var(--input-bg)', borderRadius: '3px', overflow: 'hidden' }}>
                                                        <div style={{ height: '100%', width: `${Math.min((geminiUsage.pro / 100) * 100, 100)}%`, backgroundColor: '#00ffff', transition: 'width 0.3s ease' }}></div>
                                                    </div>
                                                </div>

                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '10px', textAlign: 'right', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '15px' }}>
                                                    <span>Total Tokens Consumed</span>
                                                    <span style={{ color: 'var(--text-active)', fontWeight: 'bold', fontSize: '14px' }}>{geminiUsage.tokens.toLocaleString()} <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'normal' }}>/ 4,000,000</span></span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Ollama Specific */}
                                {provider === 'ollama' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', animation: 'fadeIn 0.3s', flex: 1 }}>

                                        <div>
                                            <h3 style={{ fontSize: '15px', marginBottom: '10px', color: 'var(--text-active)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span>Installed Local Models</span>
                                                {isLoadingModels && <LuLoader size={16} style={{ animation: 'spin 2s linear infinite', color: 'var(--text-muted)' }} />}
                                            </h3>

                                            <div style={{
                                                backgroundColor: 'var(--sidebar-item-active-bg)', border: '1px solid var(--border-color)',
                                                borderRadius: '6px', padding: '12px', maxHeight: '120px', overflowY: 'auto'
                                            }}>
                                                {installedModels.length === 0 && !isLoadingModels ? (
                                                    <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '10px' }}>
                                                        No models installed. You need to install at least one model below.
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                        {installedModels.map((m, i) => (
                                                            <div key={i} style={{
                                                                backgroundColor: 'var(--input-bg)', padding: '6px 12px', borderRadius: '4px',
                                                                fontSize: '13px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '6px',
                                                                color: 'var(--text-active)'
                                                            }}>
                                                                <LuCpu size={14} color="var(--accent-color-user)" />
                                                                {m.name}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ backgroundColor: 'transparent', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '20px' }}>
                                            <h3 style={{ fontSize: '15px', margin: '0 0 15px 0', color: 'var(--text-active)' }}>Install New Model</h3>

                                            {/* Progress Bar */}
                                            {downloadProgress && (
                                                <div style={{ marginBottom: '20px', backgroundColor: 'var(--sidebar-item-active-bg)', padding: '15px', borderRadius: '6px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px', color: downloadProgress.error ? '#ff6b6b' : 'var(--text-active)' }}>
                                                        <span>{downloadProgress.status}</span>
                                                        <span>{downloadProgress.percent}%</span>
                                                    </div>
                                                    <div style={{ height: '6px', backgroundColor: 'var(--input-bg)', borderRadius: '3px', overflow: 'hidden' }}>
                                                        <div style={{
                                                            height: '100%', width: `${downloadProgress.percent}%`,
                                                            backgroundColor: downloadProgress.error ? '#ff6b6b' : 'var(--accent-color-user)',
                                                            transition: 'width 0.2s'
                                                        }}></div>
                                                    </div>
                                                </div>
                                            )}

                                            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                                                {RECOMMENDED_MODELS.map(m => {
                                                    const isInstalled = installedModels.some(im => im.name.startsWith(m.id));
                                                    return (
                                                        <div key={m.id} style={{
                                                            flex: 1, backgroundColor: 'var(--sidebar-item-active-bg)', border: '1px solid var(--border-color)',
                                                            borderRadius: '6px', padding: '12px', display: 'flex', flexDirection: 'column'
                                                        }}>
                                                            <div style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--text-active)', marginBottom: '4px' }}>{m.label}</div>
                                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', flex: 1 }}>{m.desc}</div>

                                                            <button
                                                                onClick={() => handleDownloadModel(m.id)}
                                                                disabled={isDownloading || isInstalled}
                                                                style={{
                                                                    width: '100%', padding: '6px', border: 'none', borderRadius: '4px', cursor: (isDownloading || isInstalled) ? 'default' : 'pointer',
                                                                    backgroundColor: isInstalled ? 'transparent' : 'var(--input-bg)',
                                                                    color: isInstalled ? '#4ade80' : 'var(--text-color)', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                                                    border: isInstalled ? '1px solid #4ade8055' : '1px solid var(--border-color)'
                                                                }}
                                                            >
                                                                {isInstalled ? <><LuCheck size={14} /> Installed</> : <><LuDownload size={14} /> Install</>}
                                                            </button>
                                                        </div>
                                                    )
                                                })}
                                            </div>

                                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                <input
                                                    type="text"
                                                    value={customModelInput}
                                                    onChange={(e) => setCustomModelInput(e.target.value)}
                                                    placeholder="Or pull any custom Ollama model (e.g., mistral:latest)"
                                                    style={{
                                                        flex: 1, padding: '10px 12px', backgroundColor: 'var(--input-bg)',
                                                        color: 'var(--text-active)', border: '1px solid var(--border-color)', borderRadius: '6px', outline: 'none', fontSize: '13px'
                                                    }}
                                                />
                                                <button
                                                    onClick={() => handleDownloadModel(customModelInput)}
                                                    disabled={isDownloading || !customModelInput.trim()}
                                                    style={{
                                                        padding: '10px 20px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--border-color)',
                                                        color: 'var(--text-active)', borderRadius: '6px', cursor: (isDownloading || !customModelInput.trim()) ? 'not-allowed' : 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px',
                                                        opacity: (isDownloading || !customModelInput.trim()) ? 0.5 : 1
                                                    }}
                                                >
                                                    <LuDownload size={16} /> Pull Custom
                                                </button>
                                            </div>
                                            <p style={{ marginTop: '15px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                                Don't have Ollama installed? <a href="https://ollama.com/download" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-color-user)' }}>Download it from ollama.com</a>.
                                            </p>
                                        </div>

                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
