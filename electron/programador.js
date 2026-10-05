/**
 * programador.js (proceso principal) — la tarea del sistema y los avisos
 * (5.11, D1 y D2; Dec-16, Dec-22, Dec-25).
 *
 * La tarea del Programador de tareas de Windows es OPCIONAL y está apagada por
 * defecto (Settings → «Run even when AmoxSQL is closed»). Encendida, hay UNA
 * tarea, con un único disparador a la hora de la próxima programación pendiente
 * y StartWhenAvailable (si la máquina estaba apagada, corre al iniciar sesión).
 * Llama a `AmoxSQL.exe tick`. Corre como el usuario, sólo con su sesión
 * iniciada (InteractiveToken): sin contraseña ni privilegios, y puede leer su
 * llavero. Se reescribe cada vez que cambia la próxima hora; apagarla la borra.
 * Fuera de Windows no hay tarea: las programaciones corren con AmoxSQL abierto.
 *
 * Los avisos son avisos del sistema (Notification de Electron).
 */
const { app, Notification } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const NOMBRE_TAREA = process.env.AMOXSQL_TAREA || 'AmoxSQL - scheduled processes';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** La hora local sin zona, como la quiere el Programador de tareas: 2026-10-06T07:00:00. */
function horaLocal(iso) {
    const d = new Date(iso);
    const dos = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}:00`;
}

/** Qué lanza la tarea: el ejecutable instalado, o Electron con la carpeta de la app en desarrollo. */
let comando = function comandoReal() {
    if (app.isPackaged) return { exe: process.execPath, args: 'tick' };
    return { exe: process.execPath, args: `"${app.getAppPath()}" tick` };
};

/** El XML de la tarea (pura: la usan las pruebas). */
function xmlDeTarea(proximaIso, { exe, args }) {
    return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Author>AmoxSQL</Author>
    <Description>Runs AmoxSQL's scheduled processes at the time they are due. Managed by AmoxSQL: turn it off in Settings, Schedules.</Description>
  </RegistrationInfo>
  <Triggers>
    <TimeTrigger>
      <StartBoundary>${horaLocal(proximaIso)}</StartBoundary>
      <Enabled>true</Enabled>
    </TimeTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <ExecutionTimeLimit>PT6H</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${esc(exe)}</Command>
      <Arguments>${esc(args)}</Arguments>
    </Exec>
  </Actions>
</Task>
`;
}

/** schtasks.exe, sin ventana. `ejecutar` se puede cambiar en las pruebas. */
let ejecutar = (args) => new Promise((resolve) => {
    execFile('schtasks.exe', args, { windowsHide: true, timeout: 20000 }, (err, stdout, stderr) => {
        resolve({ ok: !err, salida: String(stdout || ''), error: err ? String(stderr || err.message).trim() : null });
    });
});

let ultima = { proxima: undefined, activo: undefined };
let cola = Promise.resolve();

/**
 * Deja la tarea como debe estar: con la hora de la próxima, o borrada si está
 * apagada o no hay nada programado. Sólo actúa si algo cambió.
 * @returns {Promise<{ hecho: string, error?: string }>}
 */
function aplicar(proximaIso, activo) {
    cola = cola.then(async () => {
        if (process.platform !== 'win32') return { hecho: 'sin-programador' };
        if (ultima.proxima === proximaIso && ultima.activo === activo) return { hecho: 'igual' };
        if (!activo || !proximaIso) {
            const r = await ejecutar(['/Delete', '/TN', NOMBRE_TAREA, '/F']);
            ultima = { proxima: proximaIso, activo };
            return { hecho: 'borrada', error: r.ok || /cannot find|no puede encontrar|does not exist/i.test(r.error || '') ? undefined : r.error };
        }
        const archivo = path.join(os.tmpdir(), `amoxsql-tarea-${process.pid}.xml`);
        // El Programador de tareas lee el XML en UTF-16 con su marca.
        fs.writeFileSync(archivo, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xmlDeTarea(proximaIso, comando()), 'utf16le')]));
        const r = await ejecutar(['/Create', '/TN', NOMBRE_TAREA, '/XML', archivo, '/F']);
        try { fs.unlinkSync(archivo); } catch { /* ya no está */ }
        if (r.ok) ultima = { proxima: proximaIso, activo };
        return r.ok ? { hecho: 'escrita' } : { hecho: 'error', error: r.error };
    }).catch((e) => ({ hecho: 'error', error: e.message }));
    return cola;
}

/** ¿Existe la tarea, y para cuándo? (Settings la enseña.) */
async function consultar() {
    if (process.platform !== 'win32') return { existe: false, soportado: false };
    const r = await ejecutar(['/Query', '/TN', NOMBRE_TAREA, '/XML']);
    if (!r.ok) return { existe: false, soportado: true };
    const m = /<StartBoundary>([^<]+)<\/StartBoundary>/.exec(r.salida);
    return { existe: true, soportado: true, proxima: m ? m[1] : null };
}

// ── Avisos (D2) ─────────────────────────────────────────────────────────────

let avisosPendientes = 0;

/**
 * Un aviso del sistema. Con la ventana abierta, su clic la trae delante y abre
 * la ejecución; sin ventana (un tick sin AmoxSQL abierto) es sólo informativo:
 * la ejecución queda en la bitácora.
 */
function avisar({ titulo, texto, runId = null, ok = true }, ventana = null) {
    if (!Notification.isSupported()) return false;
    const n = new Notification({ title: titulo, body: texto, silent: ok });
    avisosPendientes++;
    n.on('click', () => {
        if (ventana && !ventana.isDestroyed()) {
            if (ventana.isMinimized()) ventana.restore();
            ventana.focus();
            if (runId) ventana.webContents.send('amox:abrir-ejecucion', runId);
        }
    });
    n.on('show', () => { avisosPendientes = Math.max(0, avisosPendientes - 1); });
    n.show();
    return true;
}

/** Antes de salir de un arranque sin ventana: que dé tiempo a que se vean los avisos. */
async function esperarAvisos(maxMs = 4000) {
    const inicio = Date.now();
    while (avisosPendientes > 0 && Date.now() - inicio < maxMs) await new Promise(r => setTimeout(r, 100));
    if (avisosPendientes === 0) await new Promise(r => setTimeout(r, 1500));
}

module.exports = {
    NOMBRE_TAREA, xmlDeTarea, horaLocal, aplicar, consultar, avisar, esperarAvisos,
    _probar: {
        cambiarEjecutor: (f) => { ejecutar = f; },
        cambiarComando: (f) => { comando = f; },
        reiniciar: () => { ultima = { proxima: undefined, activo: undefined }; },
    },
};
