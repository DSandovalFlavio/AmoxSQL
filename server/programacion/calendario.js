/**
 * calendario.js — qué días se trabaja (5.11, D1; Dec-18).
 *
 * El calendario es del workspace: `<home>/workspaces/<id>/calendario.json`,
 * texto que escribe una persona y viaja en el `.amoxworkspace` como el resto de
 * su contexto. `{ laborables: [1..7], festivos: ['AAAA-MM-DD', …] }`. Un
 * proyecto sin workspace usa el de por defecto: de lunes a viernes, sin festivos.
 */
const fs = require('fs');
const path = require('path');
const { homeAmox } = require('../rutas');
const { normalizarCalendario, CALENDARIO_POR_DEFECTO } = require('./reglas');

const archivo = (workspaceId) => {
    if (!/^[\w-]{4,64}$/.test(String(workspaceId || ''))) throw new Error('Invalid workspace id.');
    return path.join(homeAmox(), 'workspaces', String(workspaceId), 'calendario.json');
};

function leer(workspaceId) {
    if (!workspaceId) return { ...CALENDARIO_POR_DEFECTO, propio: false };
    try {
        return { ...normalizarCalendario(JSON.parse(fs.readFileSync(archivo(workspaceId), 'utf8'))), propio: true };
    } catch {
        return { ...CALENDARIO_POR_DEFECTO, propio: false };
    }
}

function guardar(workspaceId, cal) {
    const limpio = normalizarCalendario(cal);
    const a = archivo(workspaceId);
    fs.mkdirSync(path.dirname(a), { recursive: true });
    fs.writeFileSync(a, JSON.stringify(limpio, null, 2) + '\n', 'utf8');
    return { ...limpio, propio: true };
}

module.exports = { leer, guardar, archivo };
