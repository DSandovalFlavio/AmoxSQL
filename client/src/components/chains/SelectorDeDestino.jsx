/**
 * SelectorDeDestino — "Deliver to" in the nodes that write a file (Excel,
 * Export File, Publish), 5.11 D6. Either a path written in the node, or a
 * named destination ("client-delivery"): then the node only gives the file
 * name, and the folder is the destination's on each machine.
 */
import { useEffect, useState } from 'react';
import { listarDestinos } from '../fuentes/api';

export default function SelectorDeDestino({ valor, onChange, textoRuta = 'A path written here' }) {
    const [lista, setLista] = useState([]);
    useEffect(() => {
        const cargar = () => listarDestinos().then(setLista).catch(() => setLista([]));
        cargar();
        window.addEventListener('amox_destinos_cambiaron', cargar);
        return () => window.removeEventListener('amox_destinos_cambiaron', cargar);
    }, []);
    const actual = lista.find(d => d.nombre === valor);
    return (
        <>
            <label>Deliver to</label>
            <select className="chain-config-select" value={valor || ''} onChange={(e) => onChange(e.target.value || undefined)}>
                <option value="">{textoRuta}</option>
                {lista.length > 0 && (
                    <optgroup label="Destinations">
                        {lista.map(d => <option key={d.nombre} value={d.nombre}>{d.nombre}{d.estado !== 'listo' ? ' (no folder here)' : ''}</option>)}
                    </optgroup>
                )}
                {valor && !actual && <option value={valor}>{valor} (not found)</option>}
            </select>
            {valor && actual && (
                <p className="chain-config-hint">
                    {actual.ubicacionAqui ? <>On this machine: <code>{actual.ubicacionAqui}{actual.subcarpeta ? `/${actual.subcarpeta}` : ''}</code></> : 'This destination has no folder on this machine yet: set it in the Sources panel.'}
                </p>
            )}
            {valor && !actual && <p className="chain-config-hint chain-config-hint-error">There is no destination "{valor}" in this project or its group.</p>}
            {!valor && lista.length === 0 && (
                <p className="chain-config-hint">Tip: name the folder once as a destination (database explorer, under Sources) and every process delivers there, on any machine.</p>
            )}
        </>
    );
}
