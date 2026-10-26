/**
 * Capturador de pantallas para la documentación: una ventana de Electron con la
 * interfaz de desarrollo, manejada por HTTP.
 *
 *     pnpm exec electron scripts/ejemplos/capturador.cjs [--url <url>] [--ancho 1440] [--alto 900]
 *
 * Órdenes (POST a http://localhost:3999, cuerpo JSON):
 *   /ir      { url }                       navega
 *   /js      { codigo }                    ejecuta en la página (await permitido) y devuelve el valor
 *   /raton   { tipo, x, y, boton?, veces? } mouseDown | mouseUp | mouseMove | click | doble
 *   /tecla   { tecla, mods? }              una tecla con modificadores (['control','shift'])
 *   /texto   { texto }                     escribe
 *   /tam     { ancho, alto }               cambia el tamaño de la ventana
 *   /foto    { ruta, recorte? }            guarda un PNG (recorte: { x, y, width, height } en px CSS)
 *
 * Las fotos salen a escala 1.5 y se reducen a `--salida` px de ancho (1600 por
 * defecto): nítidas y de un tamaño razonable para el repositorio.
 */
const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const arg = (n, def) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : def; };
const URL_INICIAL = arg('--url', 'http://localhost:5173/?apiPort=3911');
const ANCHO = Number(arg('--ancho', 1440));
const ALTO = Number(arg('--alto', 900));
const SALIDA = Number(arg('--salida', 1600));

app.commandLine.appendSwitch('force-device-scale-factor', '1.5');
app.setName('AmoxSQL capturas');
app.setPath('userData', path.join(os.tmpdir(), 'amox-capturador'));

app.whenReady().then(() => {
    const win = new BrowserWindow({ width: ANCHO, height: ALTO, useContentSize: true, frame: false, show: false, backgroundColor: '#0b0d12' });
    win.loadURL(URL_INICIAL);

    const ordenes = {
        ir: async ({ url }) => { await win.loadURL(url); return 'ok'; },
        js: async ({ codigo }) => win.webContents.executeJavaScript(`(async () => { ${codigo} })()`, true),
        raton: async ({ tipo, x, y, boton = 'left', veces = 1 }) => {
            const ev = (type, extra = {}) => win.webContents.sendInputEvent({ type, x, y, button: boton, clickCount: veces, ...extra });
            if (tipo === 'click' || tipo === 'doble') {
                const n = tipo === 'doble' ? 2 : 1;
                ev('mouseMove');
                for (let i = 1; i <= n; i++) { ev('mouseDown', { clickCount: i }); ev('mouseUp', { clickCount: i }); }
            } else ev(tipo);
            return 'ok';
        },
        tecla: async ({ tecla, mods = [] }) => {
            win.webContents.sendInputEvent({ type: 'keyDown', keyCode: tecla, modifiers: mods });
            win.webContents.sendInputEvent({ type: 'keyUp', keyCode: tecla, modifiers: mods });
            return 'ok';
        },
        texto: async ({ texto }) => { await win.webContents.insertText(texto); return 'ok'; },
        tam: async ({ ancho, alto }) => { win.setContentSize(ancho, alto); return 'ok'; },
        foto: async ({ ruta, recorte }) => {
            let img = await win.webContents.capturePage(recorte);
            const { width } = img.getSize();
            const destino = recorte ? Math.round(width / 1.5 * (SALIDA / ANCHO)) : SALIDA;
            if (width > destino) img = img.resize({ width: destino, quality: 'best' });
            fs.mkdirSync(path.dirname(ruta), { recursive: true });
            fs.writeFileSync(ruta, img.toPNG());
            return { ruta, ...img.getSize(), kb: Math.round(fs.statSync(ruta).size / 1024) };
        },
    };

    http.createServer((req, res) => {
        let cuerpo = '';
        req.on('data', (c) => { cuerpo += c; });
        req.on('end', async () => {
            const orden = ordenes[req.url.replace(/^\//, '')];
            try {
                if (!orden) throw new Error(`Orden desconocida: ${req.url}`);
                const r = await orden(cuerpo ? JSON.parse(cuerpo) : {});
                res.end(JSON.stringify({ ok: true, r: r === undefined ? null : r }));
            } catch (e) {
                res.statusCode = 500;
                res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
            }
        });
    }).listen(3999, () => console.log('Capturador escuchando en 3999'));
});
