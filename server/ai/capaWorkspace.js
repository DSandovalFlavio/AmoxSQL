/**
 * La capa del workspace en el contexto de la IA (B2), fase 7.1 del plan.
 *
 * Lo que una persona escribe para un cliente —sus métricas, su glosario, sus
 * reglas, sus skills— vive una vez en `<home>/workspaces/<id>/` (Dec-5) y vale
 * para todos sus proyectos. Cada proyecto puede añadir o sobrescribir:
 *
 *   métricas y joins   por nombre; gana el proyecto
 *   glosario           los dos, cada uno bajo su título
 *   ejemplos           los dos, sin repetir pregunta
 *   RULES.md           los dos, cada uno bajo su título
 *   skills             por id: los de serie < los del workspace < los del proyecto
 *
 * La carpeta del workspace refleja la del proyecto con nombres propios:
 *
 *   <home>/workspaces/<id>/RULES.md
 *   <home>/workspaces/<id>/contexto/metrics.yml · joins.yml · glossary.md · examples/*.sql
 *   <home>/workspaces/<id>/skills/<skill>/SKILL.md
 *
 * Sólo lee archivos: no necesita la base de AmoxSQL (el nombre del workspace
 * sale del project.json de la carpeta).
 */
const fs = require('fs');
const path = require('path');
const { homeAmox } = require('../rutas');

/** El workspace de una carpeta de proyecto, si lo tiene y su carpeta existe. */
function workspaceDelProyecto(projectPath) {
    if (!projectPath) return null;
    let pj = null;
    try { pj = JSON.parse(fs.readFileSync(path.join(projectPath, '.amoxsql', 'project.json'), 'utf8')); } catch { return null; }
    const id = pj?.workspace?.id;
    if (!id || !/^[\w-]{4,64}$/.test(String(id))) return null;
    const dir = path.join(homeAmox(), 'workspaces', String(id));
    if (!fs.existsSync(dir)) return null;
    return { id: String(id), nombre: String(pj.workspace.nombre || ''), dir };
}

/** Fusiona el contexto del workspace (abajo) con el del proyecto (arriba). */
function fusionarContexto(delWs, delProyecto, nombreWs) {
    if (!delWs) return delProyecto;
    const marcar = (lista) => (lista || []).map(x => ({ ...x, compartida: nombreWs || true }));
    if (!delProyecto) {
        return {
            metrics: marcar(delWs.metrics),
            joins: marcar(delWs.joins),
            glossary: delWs.glossary ? `#### Shared — ${nombreWs}\n${delWs.glossary.trim()}` : '',
            examples: delWs.examples || [],
        };
    }
    const porNombre = new Map();
    for (const m of marcar(delWs.metrics)) porNombre.set(m.name, m);
    for (const m of delProyecto.metrics || []) porNombre.set(m.name, m);
    const porUnion = new Map();
    for (const j of marcar(delWs.joins)) porUnion.set(`${j.from}→${j.to}`, j);
    for (const j of delProyecto.joins || []) porUnion.set(`${j.from}→${j.to}`, j);
    const glosario = [
        delWs.glossary ? `#### Shared — ${nombreWs}\n${delWs.glossary.trim()}` : '',
        delProyecto.glossary ? `#### This project\n${delProyecto.glossary.trim()}` : '',
    ].filter(Boolean).join('\n\n');
    const preguntas = new Set((delProyecto.examples || []).map(e => e.question));
    return {
        metrics: [...porNombre.values()],
        joins: [...porUnion.values()],
        glossary: glosario,
        examples: [...(delProyecto.examples || []), ...(delWs.examples || []).filter(e => !preguntas.has(e.question))],
    };
}

/** Las reglas de los dos, cada una bajo su título. */
function fusionarReglas(delWs, delProyecto, nombreWs) {
    if (!delWs) return delProyecto;
    const compartidas = `### Shared rules — ${nombreWs}\n${delWs}`;
    return delProyecto ? `${compartidas}\n\n### This project's rules\n${delProyecto}` : compartidas;
}

module.exports = { workspaceDelProyecto, fusionarContexto, fusionarReglas };
