/**
 * Settings › Versión, enlaces y créditos.
 * Sale de SettingsModal (6.0, M8): lo que necesita del modal llega por props y
 * se carga la primera vez que se abre la sección.
 */
import { LuInfo, LuGlobe, LuHeart, LuGithub } from 'react-icons/lu';

export default function AcercaDe({ duckdbVersion, openExternalLink }) {
    return (
        <div className="stg-section">
            <div className="stg-about-header">
                <div className="stg-about-icon"><LuInfo size={32} /></div>
                <div>
                    <h2 className="stg-about-name">AmoxSQL</h2>
                    <p className="stg-about-version">Version {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?.?.?'}</p>
                    <p className="stg-about-engine">DuckDB Engine: {duckdbVersion}</p>
                </div>
            </div>

            <div className="stg-card">
                <p className="stg-about-body">
                    <strong>The Modern Codex for Local Data Analysis.</strong><br /><br />
                    AmoxSQL is a professional, high-performance Local Data IDE built specifically for DuckDB.
                    Designed for serious data analysts and engineers who need speed, privacy, and advanced tooling without the cloud overhead.
                </p>
            </div>

            <hr className="stg-divider" />

            <div>
                <h3 className="stg-section-heading stg-section-heading--mb10">Key Features</h3>
                <ul className="stg-about-features">
                    <li><strong>100% Offline & Private:</strong> Process data and run AI entirely on your local machine.</li>
                    <li><strong>Blazing Fast:</strong> Built on DuckDB for unmatched analytical performance.</li>
                    <li><strong>Smart Visualization:</strong> Create and save advanced Recharts configurations instantly.</li>
                    <li><strong>Integrated AI Assistance:</strong> Support for local Ollama models and Google Gemini.</li>
                    <li><strong>Drag & Drop Workflow:</strong> Seamlessly move tables and columns into the powerful Monaco Editor.</li>
                    <li><strong>Extension Gallery:</strong> Explore and install DuckDB extensions with a visual gallery.</li>
                    <li><strong>Vertical Split Layout:</strong> Arrange editor and results side-by-side for ultrawide monitors.</li>
                    <li><strong>Premium Animations:</strong> Smooth transitions across all modals, panels, and view modes.</li>
                </ul>
            </div>

            <div className="stg-sponsor-cta">
                <LuHeart size={20} className="stg-sponsor-icon" />
                <p className="stg-sponsor-text">
                    <strong>Love AmoxSQL?</strong> Your support helps us keep building new features, improving performance, and making data analysis accessible to everyone.
                </p>
                <p className="stg-sponsor-subtitle">
                    Every contribution — big or small — fuels the future of this project.
                </p>
                <a
                    href="https://github.com/sponsors/dsandovalflavio"
                    onClick={(e) => openExternalLink(e, 'https://github.com/sponsors/dsandovalflavio')}
                    className="stg-sponsor-btn"
                >
                    <LuHeart size={14} /> Become a Sponsor
                </a>
            </div>

            <div className="stg-about-footer">
                <p className="stg-about-footer-text">
                    Created with love by <strong>@dsandovalflavio</strong>.<br />
                    <span className="stg-about-footer-muted">From Latin America to the World.</span>
                </p>
                <div className="stg-flex--wrap">
                    <a href="https://github.com/dsandovalflavio/amoxsql" onClick={(e) => openExternalLink(e, 'https://github.com/dsandovalflavio/amoxsql')} className="stg-link-btn">
                        <LuGithub size={14} /> GitHub Repository
                    </a>
                    <a href="https://github.com/dsandovalflavio" onClick={(e) => openExternalLink(e, 'https://github.com/dsandovalflavio')} className="stg-link-btn">
                        <LuGlobe size={14} /> Creator Profile
                    </a>
                    <a href="https://github.com/sponsors/dsandovalflavio" onClick={(e) => openExternalLink(e, 'https://github.com/sponsors/dsandovalflavio')} className="stg-link-btn stg-link-btn--danger">
                        <LuHeart size={14} /> Sponsor
                    </a>
                </div>
            </div>
        </div>
    );
}
