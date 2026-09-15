/**
 * ¿Se va a leer este acento sobre la lámina?
 *
 * La pregunta 32 de la auditoría —«¿dónde cambio el color de toda la
 * presentación?»— trae una trampa detrás: elegir un acento que no contrasta
 * contra el lienzo del tono elegido. Eso no se descubre en el Studio, donde la
 * lámina mide 400 px y uno ya sabe qué pone; se descubre proyectado en una sala
 * a oscuras, cuando la pastilla de variación de un KPI es una mancha.
 *
 * El acento NO se resuelve de una tabla: se compone en CSS y cambia con el
 * tema, con el modo claro u oscuro y con el tono de la lámina. Así que se
 * pregunta al navegador, aplicando la clase a un elemento de prueba y leyendo
 * lo que sale. Cuesta un reflow por acento y se hace una vez al abrir el panel.
 *
 * El umbral es 4,5:1, que es el mismo piso que usa `scripts/checkThemeContrast`
 * para los acentos de la aplicación. Podría defenderse un 3:1 —el acento pinta
 * filetes y pastillas, que son objetos gráficos y no texto corrido— pero tener
 * dos pisos distintos para la misma pregunta es cómo se acaban colando los
 * colores que no se leen.
 */

// La aritmética del contraste vive en `utils/contraste.js`, compartida con las
// etiquetas de los gráficos. Estaba aquí, y una tercera copia mal hecha en
// `ChartRenderer` es la que pintaba etiquetas blancas sobre baldosas claras.
import { aRgb, contraste } from '../../utils/contraste';

export { contraste };

export const PISO_CONTRASTE = 4.5;

/**
 * Resuelve `--accent-primary` para cada acento **tal y como lo vería la lámina**,
 * y mide su contraste contra el lienzo.
 *
 * `dentroDe` es el elemento sobre el que se monta la prueba: pasando la propia
 * lámina, el cálculo hereda su tono —una lámina invertida tiene el lienzo al
 * revés— y el acento sale medido contra el fondo real y no contra el del tema.
 */
export function medirAcentos(acentos, dentroDe) {
    const anfitrion = dentroDe || document.body;
    if (!anfitrion || typeof getComputedStyle !== 'function') return new Map();

    const sonda = document.createElement('div');
    sonda.setAttribute('aria-hidden', 'true');
    // La marca es para el observador de desborde del diseñador: la sonda entra
    // y sale del lienzo que él vigila, y sin marcarla le hace medir doce veces
    // seguidas para no cambiar nada. Ver la nota de `useDesborde`.
    sonda.setAttribute('data-sonda', '1');
    sonda.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    anfitrion.appendChild(sonda);

    // El lienzo es el fondo que la lámina pinta de verdad. Se lee del anfitrión
    // y no del token, porque una lámina con `tone: dark` lo tiene invertido.
    const fondoLamina = getComputedStyle(anfitrion).backgroundColor;
    const fondo = aRgb(fondoLamina) ? fondoLamina
        : getComputedStyle(document.body).getPropertyValue('--surface-raised').trim();

    const medidas = new Map();
    for (const acento of acentos) {
        sonda.className = `accent-${acento.id}`;
        // `--accent-primary` se compone con var(), así que hay que leer el valor
        // ya resuelto de una propiedad que lo use, no la variable en crudo.
        sonda.style.color = 'var(--accent-primary)';
        const color = getComputedStyle(sonda).color;
        const razon = contraste(color, fondo);
        medidas.set(acento.id, {
            color: aRgb(color) ? color : acento.color,
            razon,
            pasa: razon === null ? true : razon >= PISO_CONTRASTE,
        });
    }

    sonda.remove();
    return medidas;
}
