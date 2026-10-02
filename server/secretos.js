/**
 * El llavero (A1): los secretos, cifrados por el sistema operativo.
 *
 * Hasta la 5.8 las claves de API y de la nube vivían en texto plano en
 * `~/.amoxsql/config.json`, y el renderer las recibía en claro para enseñarlas
 * enmascaradas. Desde la 5.9:
 *
 * - Se cifran con `safeStorage` de Electron (DPAPI en Windows, Keychain en
 *   macOS). Sólo existe en el proceso principal, así que el servidor —que corre
 *   en un utilityProcess— se lo pide por `parentPort`. Lo cifrado va en base64 a
 *   la tabla `credenciales` de la base de AmoxSQL; el valor en claro no la toca.
 * - Al arrancar se descifran una vez y quedan en la memoria del servidor, como
 *   antes quedaba `config.json` entero: `AiManager.getModel` es síncrono y no
 *   puede esperar al llavero en cada llamada.
 * - El cliente nunca recibe un valor: recibe `SENTINELA` si hay algo guardado.
 *   Si la devuelve tal cual al guardar, no se toca; vacía, se borra; otra cosa,
 *   se guarda.
 * - Durante las prereleases de la 5.9 el texto plano de `config.json` se COPIA
 *   al llavero y se deja donde está, congelado, para que la 5.8 siga
 *   funcionando. La purga es de la 5.9.0 (fase 9 del plan).
 *
 * Modos (`modo()`):
 *   'pendiente' — hay proceso principal pero aún no se ha preguntado si el
 *                 llavero funciona. Mientras tanto no se lee texto plano.
 *   'llavero'   — lo normal dentro de la aplicación.
 *   'texto'     — sin Electron (servidor lanzado suelto, pruebas): se comporta
 *                 EXACTAMENTE como la 5.8, con `config.json` en claro.
 *
 * Para probar el modo 'llavero' sin Electron existe un llavero de prueba
 * (AMOXSQL_LLAVERO_DE_PRUEBA=1). Cifra con una clave aleatoria que vive sólo en
 * memoria: lo que guarda es ilegible en cuanto el proceso termina, así que no
 * puede pasar por un llavero de verdad sin que se note.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const baseCentral = require('./central/BaseCentral');
const { homeAmox } = require('./rutas');

/** Lo que el cliente ve en lugar de un secreto que existe. */
const SENTINELA = '__amox_en_el_llavero__';

/** Claves de API: un campo de config.json ↔ un nombre en el llavero. */
const CLAVES_DE_IA = [
    { proveedor: 'gemini',    campo: 'geminiApiKey',    nombre: 'ia-gemini',    entorno: 'GOOGLE_GENERATIVE_AI_API_KEY' },
    { proveedor: 'anthropic', campo: 'anthropicApiKey', nombre: 'ia-anthropic', entorno: 'ANTHROPIC_API_KEY' },
    { proveedor: 'minimax',   campo: 'minimaxApiKey',   nombre: 'ia-minimax',   entorno: 'MINIMAX_API_KEY' },
];

/** La nube: de cada objeto de config sólo son secretos estos dos campos. */
const NUBE = [
    { tipo: 's3',  campo: 's3Config',  nombre: 'nube-s3' },
    { tipo: 'gcs', campo: 'gcsConfig', nombre: 'nube-gcs' },
];
const CAMPOS_SECRETOS_NUBE = ['accessKeyId', 'secretKey'];

const NOMBRE_VALIDO = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

// ── El proveedor de cifrado ──────────────────────────────────────────────────

/** Pide al proceso principal que cifre o descifre. Una petición, una respuesta. */
function proveedorDelLlavero() {
    let secuencia = 0;
    const pendientes = new Map();
    process.parentPort.on('message', (e) => {
        const m = e?.data ?? e;
        if (!m || m.type !== 'secreto:respuesta') return;
        const p = pendientes.get(m.id);
        if (!p) return;
        pendientes.delete(m.id);
        clearTimeout(p.reloj);
        if (m.ok) p.resolver(m.valor); else p.rechazar(new Error(m.error || 'El llavero no contestó.'));
    });
    const pedir = (op, valor) => new Promise((resolver, rechazar) => {
        const id = ++secuencia;
        const reloj = setTimeout(() => {
            pendientes.delete(id);
            rechazar(new Error('El llavero del sistema no contestó en 5 s.'));
        }, 5000);
        pendientes.set(id, { resolver, rechazar, reloj });
        process.parentPort.postMessage({ type: 'secreto', id, op, valor });
    });
    return {
        nombre: 'llavero',
        disponible: () => pedir('disponible'),
        cifrar: (claro) => pedir('cifrar', claro),
        descifrar: (b64) => pedir('descifrar', b64),
    };
}

/** Sólo para pruebas: AES con una clave que muere con el proceso. */
function proveedorDePrueba() {
    const clave = crypto.randomBytes(32);
    return {
        nombre: 'prueba',
        disponible: async () => true,
        cifrar: async (claro) => {
            const iv = crypto.randomBytes(12);
            const c = crypto.createCipheriv('aes-256-gcm', clave, iv);
            const cuerpo = Buffer.concat([c.update(String(claro), 'utf8'), c.final()]);
            return Buffer.concat([iv, c.getAuthTag(), cuerpo]).toString('base64');
        },
        descifrar: async (b64) => {
            const b = Buffer.from(String(b64), 'base64');
            const d = crypto.createDecipheriv('aes-256-gcm', clave, b.subarray(0, 12));
            d.setAuthTag(b.subarray(12, 28));
            return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
        },
    };
}

let proveedor = null;
let _modo = 'texto';
if (process.parentPort) { proveedor = proveedorDelLlavero(); _modo = 'pendiente'; }
else if (process.env.AMOXSQL_LLAVERO_DE_PRUEBA === '1') { proveedor = proveedorDePrueba(); _modo = 'pendiente'; }

const cache = new Map();          // nombre → valor en claro, sólo en memoria
const ilegibles = new Set();      // lo que no se pudo descifrar (otro usuario, otra máquina)
const ultimoToque = new Map();    // para no escribir «último uso» en cada lectura

const modo = () => _modo;
const disponible = () => _modo === 'llavero';

function exigirLlavero() {
    if (!disponible()) throw new Error(
        _modo === 'pendiente' ? 'El llavero todavía no está listo.' : 'El llavero del sistema no está disponible en este modo.'
    );
}

function validarNombre(nombre) {
    if (!NOMBRE_VALIDO.test(String(nombre || ''))) {
        throw new Error(`Nombre de credencial no válido: «${nombre}». Letras, números, punto, guion y guion bajo; hasta 64.`);
    }
}

// ── Lo que se puede hacer con una credencial ────────────────────────────────

async function guardar(nombre, tipo, valor) {
    exigirLlavero();
    validarNombre(nombre);
    if (typeof valor !== 'string' || !valor) throw new Error('Una credencial necesita un valor.');
    const cifrado = await proveedor.cifrar(valor);
    await baseCentral.abrir();
    await baseCentral.query(
        `INSERT INTO credenciales (nombre, tipo, cifrado) VALUES ($1, $2, $3)
         ON CONFLICT (nombre) DO UPDATE SET tipo = excluded.tipo, cifrado = excluded.cifrado`,
        [nombre, String(tipo || 'secreto'), cifrado]
    );
    cache.set(nombre, valor);
    ilegibles.delete(nombre);
}

/** Lee de la base y descifra, sin pasar por la memoria. */
async function leerDeLaBase(nombre) {
    exigirLlavero();
    await baseCentral.abrir();
    const filas = await baseCentral.query(`SELECT cifrado FROM credenciales WHERE nombre = $1`, [nombre]);
    if (!filas.length) return null;
    return proveedor.descifrar(filas[0].cifrado);
}

async function obtener(nombre) {
    if (cache.has(nombre)) { tocar(nombre); return cache.get(nombre); }
    if (!disponible()) return null;
    const valor = await leerDeLaBase(nombre);
    if (valor !== null) { cache.set(nombre, valor); tocar(nombre); }
    return valor;
}

/**
 * Síncrona, para quien no puede esperar (getModel). Sólo lo ya descifrado.
 *
 * `usar` anota «último uso». Sólo cuenta como uso lo que de verdad usa la
 * clave —llamar al modelo, exportar—: enseñar en Settings que una clave existe
 * no lo es, y antes abrir Settings marcaba todas como usadas.
 */
function enMemoria(nombre, usar = true) {
    if (!cache.has(nombre)) return null;
    if (usar) tocar(nombre);
    return cache.get(nombre);
}

async function borrar(nombre) {
    exigirLlavero();
    await baseCentral.abrir();
    await baseCentral.query(`DELETE FROM credenciales WHERE nombre = $1`, [nombre]);
    cache.delete(nombre);
    ilegibles.delete(nombre);
}

/** Nombres, tipos y fechas. Nunca valores. */
async function listar() {
    if (!disponible()) return [];
    await baseCentral.abrir();
    const filas = await baseCentral.query(
        `SELECT nombre, tipo, creada, ultimo_uso FROM credenciales ORDER BY nombre`
    );
    return filas.map(f => ({ ...f, legible: !ilegibles.has(f.nombre) }));
}

function tocar(nombre) {
    const ahora = Date.now();
    if (ahora - (ultimoToque.get(nombre) || 0) < 60000) return;
    ultimoToque.set(nombre, ahora);
    baseCentral.query(`UPDATE credenciales SET ultimo_uso = current_timestamp WHERE nombre = $1`, [nombre])
        .catch(() => { /* «último uso» es informativo: si no se anota, no pasa nada */ });
}

// ── Arranque: preguntar, migrar, precargar ──────────────────────────────────

/**
 * Copia al llavero lo que la 5.8 guardaba en texto plano. Una vez, y sólo si se
 * lee de vuelta idéntico. `config.json` no se toca: la 5.8 lo sigue leyendo.
 */
async function migrarDesdeConfig(config) {
    exigirLlavero();
    const hecho = await baseCentral.preferencia('migracion_credenciales');
    if (hecho) return { copiadas: [], yaHecho: true };

    const aCopiar = [];
    for (const c of CLAVES_DE_IA) {
        const v = config?.[c.campo];
        if (typeof v === 'string' && v.trim()) aCopiar.push({ nombre: c.nombre, tipo: 'clave-api', valor: v });
    }
    for (const n of NUBE) {
        const obj = config?.[n.campo] || {};
        const secretos = {};
        for (const f of CAMPOS_SECRETOS_NUBE) if (typeof obj[f] === 'string' && obj[f]) secretos[f] = obj[f];
        if (Object.keys(secretos).length) aCopiar.push({ nombre: n.nombre, tipo: n.tipo, valor: JSON.stringify(secretos) });
    }

    const copiadas = [];
    for (const { nombre, tipo, valor } of aCopiar) {
        await guardar(nombre, tipo, valor);
        const vuelta = await leerDeLaBase(nombre);
        if (vuelta !== valor) throw new Error(`La credencial «${nombre}» no se leyó igual del llavero. No se marca la migración.`);
        copiadas.push(nombre);
    }
    await baseCentral.guardarPreferencia('migracion_credenciales', {
        estado: 'copiadas', en: new Date().toISOString(), nombres: copiadas,
    });
    return { copiadas, yaHecho: false };
}

async function precargar() {
    exigirLlavero();
    await baseCentral.abrir();
    const filas = await baseCentral.query(`SELECT nombre, cifrado FROM credenciales`);
    for (const f of filas) {
        try { cache.set(f.nombre, await proveedor.descifrar(f.cifrado)); ilegibles.delete(f.nombre); }
        catch (e) {
            // Otro usuario de Windows, o una base copiada de otra máquina: el
            // llavero del sistema no puede abrir lo que cifró otro.
            ilegibles.add(f.nombre);
            console.warn(`[Secretos] No se puede descifrar «${f.nombre}»: ${e.message}`);
        }
    }
    return { cargadas: cache.size, ilegibles: [...ilegibles] };
}

/**
 * Lo llama el servidor al arrancar, después de abrir la base de AmoxSQL. Si el
 * llavero no funciona (o no hay proceso principal) se queda en modo texto, que
 * es la 5.8 tal cual.
 */
async function iniciar(config) {
    if (!proveedor) { _modo = 'texto'; return { modo: _modo }; }
    let ok = false;
    try { ok = await proveedor.disponible(); } catch { ok = false; }
    if (!ok) {
        _modo = 'texto';
        console.warn('[Secretos] El llavero del sistema no está disponible: se sigue como en la 5.8, con config.json.');
        return { modo: _modo };
    }
    _modo = 'llavero';
    const migracion = await migrarDesdeConfig(config);
    const carga = await precargar();
    const purga = await purgarTextoPlano();
    console.log(`[Secretos] Llavero listo: ${carga.cargadas} credencial(es)` +
        (migracion.copiadas.length ? `, ${migracion.copiadas.length} copiada(s) desde config.json` : '') +
        (carga.ilegibles.length ? `, ${carga.ilegibles.length} ilegible(s)` : '') +
        (purga.borradas.length ? `, ${purga.borradas.length} borrada(s) de config.json` : '') + '.');
    return { modo: _modo, migracion, carga, purga };
}

/**
 * La purga del texto plano (5.9.0, fase 9.2 del plan).
 *
 * Durante las alfas y betas, config.json conservó su copia en claro para poder
 * volver a la 5.8. Desde la 5.9.0 se borra, y sólo cuando es seguro:
 *
 *   - la credencial se lee bien del llavero de esta máquina → se borra su copia;
 *   - no está en el llavero porque el usuario la borró en Settings → Credentials
 *     (la migración ya se hizo) → también se borra: es una clave que no quiso;
 *   - está en el llavero pero no se puede descifrar (otra máquina, otro usuario
 *     de Windows) → se CONSERVA en config.json y se dice: es la única copia útil.
 *
 * Se mira en cada arranque y es idempotente: después de la primera vez no hay
 * nada que borrar. El resto de config.json queda igual. Lo hecho se anota en
 * `preferencias.purga_texto_plano` para que la interfaz lo cuente una vez.
 */
async function purgarTextoPlano(rutaConfig = path.join(homeAmox(), 'config.json')) {
    const nada = { borradas: [], conservadas: [] };
    if (_modo !== 'llavero' || !fs.existsSync(rutaConfig)) return nada;
    if (!(await baseCentral.preferencia('migracion_credenciales'))) return nada;

    let config;
    try { config = JSON.parse(fs.readFileSync(rutaConfig, 'utf8')); } catch { return nada; }
    const migradas = new Set(((await baseCentral.preferencia('migracion_credenciales')) || {}).nombres || []);
    const borradas = [];
    const conservadas = [];

    /**
     * ¿Se puede quitar la copia en claro de esta credencial? Si no está en el
     * llavero y nunca se migró —una clave que se escribió en la 5.8 después de
     * la migración, al volver a ella durante las betas—, se migra ahora, se
     * comprueba que se lee igual, y entonces sí. Si no está porque el usuario
     * la borró en Settings (se migró y ya no está), se borra también.
     */
    const sePuedeBorrar = async (nombre, tipo, valor) => {
        if (ilegibles.has(nombre)) return false;
        if (cache.has(nombre) || migradas.has(nombre)) return true;
        try {
            await guardar(nombre, tipo, valor);
            if ((await leerDeLaBase(nombre)) !== valor) return false;
            cache.set(nombre, valor);
            return true;
        } catch {
            return false;
        }
    };

    for (const k of CLAVES_DE_IA) {
        const v = config[k.campo];
        if (typeof v !== 'string' || !v) continue;
        if (await sePuedeBorrar(k.nombre, 'clave-api', v)) { config[k.campo] = ''; borradas.push(k.campo); }
        else conservadas.push(k.campo);
    }
    for (const n of NUBE) {
        const obj = config[n.campo];
        if (!obj || typeof obj !== 'object') continue;
        const tiene = CAMPOS_SECRETOS_NUBE.filter(f => typeof obj[f] === 'string' && obj[f]);
        if (!tiene.length) continue;
        const valor = JSON.stringify(Object.fromEntries(tiene.map(f => [f, obj[f]])));
        if (await sePuedeBorrar(n.nombre, n.tipo, valor)) {
            for (const f of tiene) delete obj[f];
            borradas.push(...tiene.map(f => `${n.campo}.${f}`));
        } else {
            conservadas.push(...tiene.map(f => `${n.campo}.${f}`));
        }
    }

    if (borradas.length) {
        // De una vez: a un temporal y rename, para no dejar nunca medio archivo.
        const temporal = `${rutaConfig}.${process.pid}.tmp`;
        fs.writeFileSync(temporal, JSON.stringify(config, null, 2));
        fs.renameSync(temporal, rutaConfig);
        await baseCentral.guardarPreferencia('purga_texto_plano', {
            en: new Date().toISOString(), borradas, conservadas, avisada: false,
        });
    } else if (conservadas.length) {
        const antes = await baseCentral.preferencia('purga_texto_plano');
        await baseCentral.guardarPreferencia('purga_texto_plano', {
            ...(antes || {}), conservadas, en: antes?.en || null, borradas: antes?.borradas || [], avisada: antes?.avisada ?? true,
        });
    }
    return { borradas, conservadas };
}

/** Lo que la interfaz cuenta una vez: qué se borró de config.json y qué no. */
async function avisoDePurga() {
    if (!disponible()) return null;
    const p = await baseCentral.preferencia('purga_texto_plano');
    return p || null;
}

async function marcarPurgaAvisada() {
    const p = await baseCentral.preferencia('purga_texto_plano');
    if (p) await baseCentral.guardarPreferencia('purga_texto_plano', { ...p, avisada: true });
}

// ── Lo que usa el resto del servidor ────────────────────────────────────────

/** La clave de un proveedor de IA, del sitio que toque según el modo. */
function claveDeIA(proveedorIA, config) {
    const c = CLAVES_DE_IA.find(x => x.proveedor === proveedorIA);
    if (!c) return null;
    const entorno = process.env[c.entorno] || null;
    if (_modo === 'llavero') return enMemoria(c.nombre) || entorno;
    if (_modo === 'pendiente') return entorno;           // nada de texto plano mientras se decide
    return config?.[c.campo] || entorno;                  // 'texto': la 5.8
}

/**
 * ¿Hay en ESTA máquina una credencial con este nombre, y se puede leer? Para el
 * manifiesto (A2). En modo texto sólo existen las que la 5.8 guardaba en
 * config.json, así que se miran allí.
 */
function existe(nombre, config) {
    if (_modo === 'llavero') return cache.has(nombre) && !ilegibles.has(nombre);
    const ia = CLAVES_DE_IA.find(k => k.nombre === nombre);
    if (ia) return !!(config?.[ia.campo] || process.env[ia.entorno]);
    const nube = NUBE.find(n => n.nombre === nombre);
    if (nube) {
        const c = credencialNube(nube.tipo, config, false);
        return !!(c.accessKeyId || c.secretKey);
    }
    return false;
}

/** Las claves de la nube ({accessKeyId, secretKey}) más lo que no es secreto. */
function credencialNube(tipo, config, usar = true) {
    const n = NUBE.find(x => x.tipo === tipo);
    if (!n) return {};
    const publico = { ...(config?.[n.campo] || {}) };
    if (_modo === 'llavero') {
        for (const f of CAMPOS_SECRETOS_NUBE) delete publico[f];
        let secretos = {};
        try { secretos = JSON.parse(enMemoria(n.nombre, usar) || '{}'); } catch { secretos = {}; }
        return { ...publico, ...secretos };
    }
    if (_modo === 'pendiente') { for (const f of CAMPOS_SECRETOS_NUBE) delete publico[f]; }
    return publico;
}

/** La configuración tal como puede verla el renderer: sin un solo secreto. */
function configParaElCliente(config) {
    const c = JSON.parse(JSON.stringify(config || {}));
    for (const k of CLAVES_DE_IA) {
        const hay = _modo === 'llavero' ? !!enMemoria(k.nombre, false) : !!(config?.[k.campo]);
        c[k.campo] = hay ? SENTINELA : '';
    }
    for (const n of NUBE) {
        const guardado = credencialNube(n.tipo, config, false);
        if (!c[n.campo] && !Object.keys(guardado).length) continue;
        c[n.campo] = { ...(c[n.campo] || {}) };
        for (const f of CAMPOS_SECRETOS_NUBE) c[n.campo][f] = guardado[f] ? SENTINELA : '';
    }
    // No es un secreto: dónde viven las claves, para que Settings lo diga bien.
    c._llavero = _modo;
    return c;
}

/**
 * Aplica lo que llega del formulario de Settings. Los secretos van al llavero
 * (o a `config` en modo texto); el resto, a `config`. Devuelve `config`.
 *
 * Por campo secreto: `undefined` o SENTINELA → no se toca; `''` → se borra;
 * cualquier otra cosa → se guarda.
 */
async function aplicarCambiosDeConfig(config, cuerpo) {
    // Mientras se decide el modo, guardar un secreto tomaría el camino de la
    // 5.8 y lo escribiría en claro. Son milisegundos al arrancar, pero no.
    if (_modo === 'pendiente') {
        const tocaSecretos = CLAVES_DE_IA.some(k => cuerpo?.[k.campo] !== undefined)
            || NUBE.some(n => cuerpo?.[n.campo] !== undefined);
        if (tocaSecretos) throw new Error('El llavero todavía se está preparando. Vuelve a guardar en un momento.');
    }
    for (const k of CLAVES_DE_IA) {
        const v = cuerpo?.[k.campo];
        if (v === undefined || v === SENTINELA) continue;
        if (_modo === 'llavero') {
            if (v === '') await borrar(k.nombre);
            else await guardar(k.nombre, 'clave-api', String(v));
            // En config.json no se escribe: el llavero es el único sitio (la copia
            // en claro de la 5.8 la quita purgarTextoPlano al arrancar).
        } else {
            config[k.campo] = v;
        }
    }
    for (const n of NUBE) {
        const obj = cuerpo?.[n.campo];
        if (obj === undefined || obj === null || typeof obj !== 'object') continue;
        const publico = { ...obj };
        for (const f of CAMPOS_SECRETOS_NUBE) delete publico[f];
        if (_modo === 'llavero') {
            let guardado = {};
            try { guardado = JSON.parse(enMemoria(n.nombre, false) || '{}'); } catch { guardado = {}; }
            for (const f of CAMPOS_SECRETOS_NUBE) {
                const v = obj[f];
                if (v === undefined || v === SENTINELA) continue;
                if (v === '') delete guardado[f]; else guardado[f] = String(v);
            }
            if (Object.keys(guardado).length) await guardar(n.nombre, n.tipo, JSON.stringify(guardado));
            else if (cache.has(n.nombre)) await borrar(n.nombre);
            // Lo público va a config; los secretos, sólo al llavero.
            config[n.campo] = { ...(config[n.campo] || {}), ...publico };
        } else {
            const anterior = config[n.campo] || {};
            const nuevo = { ...anterior, ...publico };
            for (const f of CAMPOS_SECRETOS_NUBE) {
                const v = obj[f];
                if (v === undefined || v === SENTINELA) continue;
                nuevo[f] = v;
            }
            config[n.campo] = nuevo;
        }
    }
    return config;
}

/**
 * El SQL que crea un secreto TEMPORAL de DuckDB. Nunca PERSISTENT: esos los
 * escribe el motor en claro en disco.
 *
 * CREATE SECRET no admite parámetros, así que cada valor se escapa. `alcance`
 * limita el secreto a un prefijo (`s3://bucket/…`); sin él vale para todo el
 * esquema de URLs de su tipo.
 */
function sqlCrearSecreto({ nombre, tipo, claves = {}, alcance }) {
    if (!/^[a-z_][a-z0-9_]{0,62}$/i.test(String(nombre || ''))) throw new Error(`Nombre de secreto no válido: ${nombre}`);
    if (!['s3', 'gcs'].includes(tipo)) throw new Error(`Tipo de secreto no admitido: ${tipo}`);
    const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
    const partes = [`TYPE ${tipo}`];
    for (const [k, v] of Object.entries(claves)) {
        if (v === undefined || v === null || v === '') continue;
        if (!/^[A-Z_]+$/.test(k)) throw new Error(`Opción de secreto no válida: ${k}`);
        partes.push(`${k} ${lit(v)}`);
    }
    if (alcance) partes.push(`SCOPE ${lit(alcance)}`);
    return `CREATE OR REPLACE TEMPORARY SECRET ${nombre} (${partes.join(', ')})`;
}

/** Deja listo en `db` el secreto de exportación del proveedor de nube. */
async function prepararNube(db, tipo, config) {
    const cred = credencialNube(tipo, config);
    if (tipo === 's3') {
        await db.systemQuery(sqlCrearSecreto({
            nombre: 'amox_nube_s3', tipo: 's3',
            claves: { KEY_ID: cred.accessKeyId, SECRET: cred.secretKey, REGION: cred.region, ENDPOINT: cred.endpoint },
        }));
    } else if (tipo === 'gcs') {
        // TYPE gcs se aplica a gs:// y gcs://, y NO toca s3_endpoint: antes se
        // fijaba s3_endpoint='storage.googleapis.com' de forma global, y después
        // de exportar a GCS cualquier lectura de S3 iba al servidor de Google.
        await db.systemQuery(sqlCrearSecreto({
            nombre: 'amox_nube_gcs', tipo: 'gcs',
            claves: { KEY_ID: cred.accessKeyId, SECRET: cred.secretKey },
        }));
    }
    return cred;
}

// ── Credenciales de nube con nombre (C4, 5.10) ──────────────────────────────
// Hasta la 5.9 había una por proveedor (`nube-s3`, `nube-gcs`). Una fuente en
// un bucket nombra la suya (`bucket-tiendas`), y dos buckets con claves
// distintas conviven: cada una se crea en el motor como secreto TEMPORAL con
// SCOPE en su prefijo. El valor es un JSON cifrado con todo dentro —también
// región y endpoint, que no son secretos pero sí de esta credencial—.

const PROVEEDORES_NUBE = ['s3', 'gcs'];
const ESTILOS_URL = ['vhost', 'path'];

async function guardarNube({ nombre, proveedor, accessKeyId, secretKey, region, endpoint, urlStyle }) {
    validarNombre(nombre);
    if (/^(ia|nube)-/.test(nombre)) throw new Error('Names starting with ia- or nube- belong to AmoxSQL. Choose another one.');
    if (!PROVEEDORES_NUBE.includes(proveedor)) throw new Error(`Unknown cloud provider: ${proveedor}`);
    if (!accessKeyId || !secretKey) throw new Error('A cloud credential needs a key id and a secret.');
    const limpio = (v, max = 300) => (v === undefined || v === null ? undefined : String(v).trim().slice(0, max) || undefined);
    const valor = {
        proveedor,
        accessKeyId: String(accessKeyId),
        secretKey: String(secretKey),
        region: limpio(region, 64),
        endpoint: limpio(endpoint),
        urlStyle: ESTILOS_URL.includes(urlStyle) ? urlStyle : undefined,
    };
    await guardar(nombre, `nube-${proveedor}`, JSON.stringify(valor));
    return { nombre, proveedor };
}

/** La credencial de nube con nombre, descifrada; null si no está o no lo es. */
async function credencialDeNube(nombre) {
    const v = await obtener(nombre);
    if (!v) return null;
    try {
        const c = JSON.parse(v);
        return PROVEEDORES_NUBE.includes(c.proveedor) ? c : null;
    } catch {
        return null;
    }
}

/** Las sentencias que dejan lista en el motor una credencial con nombre, limitada a `alcance`. */
async function sqlDeCredencial(nombre, alcance) {
    const c = await credencialDeNube(nombre);
    if (!c) throw new Error(`The credential "${nombre}" is not on this machine. Add it in Settings → Credentials.`);
    const id = `amox_f_${crypto.createHash('sha1').update(`${nombre}|${alcance || ''}`).digest('hex').slice(0, 12)}`;
    return sqlCrearSecreto({
        nombre: id, tipo: c.proveedor, alcance,
        claves: c.proveedor === 's3'
            ? { KEY_ID: c.accessKeyId, SECRET: c.secretKey, REGION: c.region, ENDPOINT: c.endpoint, URL_STYLE: c.urlStyle }
            : { KEY_ID: c.accessKeyId, SECRET: c.secretKey },
    });
}

module.exports = {
    guardarNube, credencialDeNube, sqlDeCredencial, PROVEEDORES_NUBE,
    SENTINELA, CLAVES_DE_IA, NUBE,
    modo, disponible, iniciar,
    guardar, obtener, enMemoria, borrar, listar, existe,
    claveDeIA, credencialNube, configParaElCliente, aplicarCambiosDeConfig,
    purgarTextoPlano, avisoDePurga, marcarPurgaAvisada,
    sqlCrearSecreto, prepararNube,
    // sólo para pruebas
    _leerDeLaBase: leerDeLaBase,
};
