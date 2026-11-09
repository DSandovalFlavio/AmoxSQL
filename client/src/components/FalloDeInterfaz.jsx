import { Component } from 'react';
import { LuTriangleAlert, LuRefreshCw } from 'react-icons/lu';

/**
 * **Un error de pintado no deja la ventana vacía** (fase 5).
 *
 * Sin esto, un solo error al pintar desmontaba React entero: la ventana se quedaba
 * sin contenido y sin ninguna salida. El servidor y la base siguen bien en ese
 * caso, así que **Reload** vuelve directo a la sesión (`?reanudar=1`, ver App.jsx)
 * y no a la selección de proyectos.
 *
 *   <FalloDeInterfaz>            la raíz: toda la ventana
 *   <FalloDeInterfaz compacto>   un panel: lo demás sigue funcionando
 */
export function recargarSesion() {
    const u = new URL(window.location.href);
    u.searchParams.set('reanudar', '1');
    window.location.replace(u.href);
}

export default class FalloDeInterfaz extends Component {
    state = { error: null };

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error('[Interface] Render failed:', error, info?.componentStack);
    }

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;
        const { compacto } = this.props;
        const detalle = String(error?.message || error).slice(0, 600);

        if (compacto) {
            return (
                <div className="fallo-interfaz fallo-interfaz--compacto" role="alert">
                    <LuTriangleAlert size={15} />
                    <span>This panel could not be drawn. The rest of the app keeps working. <code>{detalle}</code></span>
                    <button type="button" onClick={() => this.setState({ error: null })}>Try again</button>
                </div>
            );
        }
        return (
            <div className="fallo-interfaz" role="alert">
                <LuTriangleAlert size={28} />
                <h1>The window ran into a problem</h1>
                <p>Your project and database are fine. Reload to go back to your tabs; files you saved stay as they are, and unsaved edits are offered back when you reopen them.</p>
                <button type="button" onClick={recargarSesion}><LuRefreshCw size={14} /> Reload</button>
                <details>
                    <summary>Details</summary>
                    <pre>{detalle}</pre>
                </details>
            </div>
        );
    }
}
