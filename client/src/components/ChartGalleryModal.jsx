/**
 * ChartGalleryModal — fullscreen overlay for the Chart Gallery.
 * Wraps the existing ChartGallery component.
 *
 * Access points:
 *   1. WelcomeScreen "View Chart Gallery" button
 *   2. ActivityBar gallery icon (LuGalleryHorizontalEnd)
 *   3. DataVisualizer chart-type picker "View Gallery" button
 */
import { useEffect } from 'react';
import { LuX } from 'react-icons/lu';
import ChartGallery from './ChartGallery';

export default function ChartGalleryModal({ isOpen, onClose }) {
    // Close on Escape
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="cgm-overlay"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="cgm-panel">
                {/* Header */}
                <div className="cgm-header">
                    <div className="cgm-header-title">
                        <span className="cgm-header-emoji">📊</span>
                        Chart Gallery
                    </div>
                    <button className="cgm-close-btn" onClick={onClose} title="Close (Esc)">
                        <LuX size={18} />
                    </button>
                </div>

                {/* Gallery body — uses the full panel width */}
                <div className="cgm-body">
                    <ChartGallery
                        onOpenChart={(chartPath) => {
                            onClose();
                            window.dispatchEvent(new CustomEvent('amox_open_gallery_chart', {
                                detail: { chartPath }
                            }));
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
