/**
 * El editor llano. **Lo que faltaba: un sitio donde un archivo sea un archivo.**
 *
 * Hasta ahora todo lo que no era de los nuestros ni un conjunto de datos caía
 * en el editor de SQL, con su barra de ejecutar, su panel de resultados y su
 * autocompletado de esquema. Un `profiles.yml` aparecía coloreado con la
 * gramática de SQL y con un botón de ejecutar encima; pulsar Ctrl+Enter mandaba
 * el YAML a la base de datos.
 *
 * Esto es lo contrario de aquello: **no promete nada que no pueda cumplir.**
 *
 * ## Por qué no reutiliza `SqlEditor`
 *
 * `SqlEditor` no es un editor con SQL encima: es el editor **de** SQL. Trae
 * autocompletado contra el esquema vivo, depuración de CTE, marcadores de
 * error, plan de ejecución e historial. Pasarle `language="yaml"` apagaría el
 * coloreado pero **dejaría todo lo demás puesto**, ofreciendo depurar una CTE
 * en un archivo de configuración. Lo que se necesita aquí es menos, no lo mismo
 * con una opción distinta.
 *
 * ## La franja de arriba
 *
 * Dice **qué cree la aplicación que es este archivo**. Parece decorativa y no
 * lo es: cuando algo se ve raro, la primera pregunta es «¿lo está leyendo como
 * lo que es?», y hasta ahora no había dónde mirar la respuesta.
 *
 * ## Los binarios
 *
 * Un PNG metido en un editor de texto no se ve como un archivo ilegible: se ve
 * como una pantalla de basura, que **parece un fallo del programa**. Así que se
 * dice lo que es y no se abre. Verlos de verdad es otra tarea; enseñar ruido no
 * es una versión aproximada de eso, es peor que no hacer nada.
 */
import { useCallback, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import { LuFileText, LuFileLock2 } from 'react-icons/lu';
import { registerMonaco, MONACO_THEME_NAME } from '../monacoTheme.js';
import { tipoDeArchivo } from '../utils/tiposDeArchivo.js';
import './TextEditor.css';

/** Cómo se llama cada idioma cuando se lo enseñas a una persona. */
const ROTULO = {
    plaintext: 'Texto', json: 'JSON', yaml: 'YAML', ini: 'Settings',
    python: 'Python', r: 'R', javascript: 'JavaScript', typescript: 'TypeScript',
    shell: 'Shell', powershell: 'PowerShell', bat: 'Lote', xml: 'XML',
    html: 'HTML', css: 'CSS', markdown: 'Markdown', sql: 'SQL',
    dockerfile: 'Dockerfile', makefile: 'Makefile',
};

const TextEditor = ({ tab, onChange, editorSettings = {} }) => {
    const info = useMemo(() => tipoDeArchivo(tab.path || tab.name), [tab.path, tab.name]);

    const alMontar = useCallback((monaco) => { registerMonaco(monaco); }, []);

    const opciones = useMemo(() => ({
        minimap: { enabled: editorSettings.minimap ?? false },
        wordWrap: editorSettings.wordWrap || 'on',
        fontSize: editorSettings.fontSize || 13,
        fontFamily: editorSettings.fontFamily || 'JetBrains Mono, monospace',
        tabSize: editorSettings.tabSize || 4,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        readOnly: !!tab.readOnly,
        // Sin sugerencias: aquí no hay esquema contra el que sugerir, y un
        // desplegable que propone palabras al azar estorba más que ayuda.
        quickSuggestions: false,
        suggestOnTriggerCharacters: false,
    }), [editorSettings, tab.readOnly]);

    if (info.tipo === 'binario') {
        return (
            <div className="txe">
                <div className="txe-vacio">
                    <LuFileLock2 size={26} strokeWidth={1.6} />
                    <p className="txe-vacio-t">Esto no es texto</p>
                    <p className="txe-vacio-d">
                        {tab.name} es un archivo binario. Abrirlo aquí sólo enseñaría ruido.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="txe">
            <div className="txe-franja">
                <LuFileText size={12} strokeWidth={2.2} />
                <span className="txe-idioma">{ROTULO[info.idioma] || info.idioma}</span>
                <span className="txe-sep" />
                <span className="txe-nota">Este archivo no se ejecuta</span>
            </div>
            <div className="txe-lienzo">
                <Editor
                    value={tab.content}
                    language={info.idioma || 'plaintext'}
                    theme={MONACO_THEME_NAME}
                    beforeMount={alMontar}
                    onChange={(val) => onChange(val ?? '')}
                    options={opciones}
                />
            </div>
        </div>
    );
};

export default TextEditor;
