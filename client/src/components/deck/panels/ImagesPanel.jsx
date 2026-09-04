/**
 * ImagesPanel — Report Flow Studio "Images" tab (Fase 5 — el slide como
 * lienzo).
 *
 * Lists every image file in the project (one GET /api/files/find-by-extension
 * call per extension, merged — the endpoint only takes one extension at a
 * time) so an image can be inserted into the active slide's prose with one
 * click, using the exact project-root-relative path — same convention
 * ChartsPanel already uses for `.amoxvis` references, so no directory math
 * and no hand-typed path is ever needed.
 */
import { useState, useEffect, useCallback } from 'react';
import { LuLoaderCircle, LuTriangleAlert, LuRefreshCw, LuImage, LuFolder } from 'react-icons/lu';
import { API_BASE } from '../../../api.js';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];

function splitPath(path) {
    const idx = path.lastIndexOf('/');
    return idx === -1 ? { dir: '', name: path } : { dir: path.slice(0, idx), name: path.slice(idx + 1) };
}

const ImagesPanel = ({ onInsertImage }) => {
    const [state, setState] = useState({ status: 'loading', images: [], error: null });

    const load = useCallback(async () => {
        setState((s) => ({ ...s, status: 'loading', error: null }));
        try {
            const lists = await Promise.all(IMAGE_EXTENSIONS.map(async (ext) => {
                const res = await fetch(`${API_BASE}/api/files/find-by-extension?ext=${ext}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `Failed to list ${ext} files`);
                return data;
            }));
            const images = lists.flat().sort((a, b) => a.path.localeCompare(b.path));
            setState({ status: 'ready', images, error: null });
        } catch (err) {
            setState({ status: 'error', images: [], error: err.message });
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    return (
        <div className="deck-panel deck-panel--charts">
            <div className="deck-panel-row">
                <p className="deck-panel-hint">Click an image to add it to the current slide's text.</p>
                <button type="button" className="deck-panel-refresh" onClick={load} title="Refresh list">
                    <LuRefreshCw size={13} className={state.status === 'loading' ? 'spin' : ''} />
                </button>
            </div>

            {state.status === 'loading' && (
                <div className="deck-panel-status">
                    <LuLoaderCircle size={16} className="spin" />
                    <span>Loading images…</span>
                </div>
            )}

            {state.status === 'error' && (
                <div className="deck-panel-status deck-panel-status--error">
                    <LuTriangleAlert size={14} />
                    <span>{state.error}</span>
                </div>
            )}

            {state.status === 'ready' && state.images.length === 0 && (
                <div className="deck-panel-status">No images found in this project yet.</div>
            )}

            {state.status === 'ready' && state.images.length > 0 && (
                <div className="deck-chart-list">
                    {state.images.map((img) => {
                        const { dir, name } = splitPath(img.path);
                        return (
                            <button
                                key={img.path}
                                type="button"
                                className="deck-chart-item"
                                onClick={() => onInsertImage(img.path)}
                                title={`Insert ${img.path}`}
                            >
                                <LuImage size={14} className="deck-chart-item-icon" />
                                <div className="deck-chart-item-info">
                                    <span className="deck-chart-item-name">{name}</span>
                                    {dir && (
                                        <span className="deck-chart-item-dir">
                                            <LuFolder size={10} /> {dir}
                                        </span>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ImagesPanel;
