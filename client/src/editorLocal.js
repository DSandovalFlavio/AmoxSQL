/**
 * El editor de código se carga **del disco**, no de internet.
 *
 * `@monaco-editor/loader` trae una URL por omisión —`cdn.jsdelivr.net`— y aquí
 * nadie se la cambiaba, así que el editor se descargaba al abrir la aplicación
 * por primera vez en cada equipo. No era una decisión: era un valor por defecto
 * pensado para páginas web, donde tiene todo el sentido, heredado sin mirar.
 *
 * En una aplicación de escritorio **para análisis local** no lo tiene. No hay
 * ancho de banda que ahorrar, el instalable ya pesa lo que pesa, y a cambio se
 * introducía una dependencia de red justo donde la promesa del producto es la
 * contraria: en un portátil con el CDN bloqueado, en un avión o en una máquina
 * aislada, la primera vez no había editor. Y sin editor no hay SQL, ni markdown,
 * ni el crudo del deck — es casi toda la aplicación.
 *
 * El resto del producto ya lo hacía bien: las fuentes van empaquetadas
 * precisamente «offline — no external CDN calls». Esto era la excepción.
 *
 * ## Por qué una ruta absoluta desde la raíz
 *
 * `/vs` funciona en los dos sitios donde vive esta interfaz: en desarrollo Vite
 * sirve `public/` en la raíz, y en producción el esquema propio `amoxsql://app`
 * sirve `client/dist`. Una ruta relativa se rompería en cuanto la página se
 * cargara desde una subcarpeta.
 *
 * ## Se importa lo primero
 *
 * Antes de que se monte ningún editor. Los editores van en carga diferida, así
 * que basta con que esto corra al arrancar; si alguna vez dejaran de serlo,
 * este módulo tendría que seguir yendo por delante.
 */
// El cargador se coge de la envoltura, que lo reexporta, y no del paquete
// suelto: ése es una dependencia transitiva y con pnpm no se resuelve desde
// aquí. Añadirlo a mano seria una dependencia directa más para llegar al mismo
// objeto.
import { loader } from '@monaco-editor/react';

loader.config({ paths: { vs: '/vs' } });

/** Dónde se está cargando el editor. Para poder decirlo si algo va mal. */
export const RUTA_EDITOR = '/vs';
