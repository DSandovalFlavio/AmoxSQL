# Integración de AmoxSQL con Ollama - Guía de Arquitectura e Implementación

Este documento detalla cómo funciona la comunicación e integración entre la aplicación AmoxSQL y el motor de IA local de Ollama.

## Arquitectura General

AmoxSQL está diseñado para delegar las tareas pesadas de procesamiento de Lenguaje Natural a un motor externo dedicado. En lugar de empotrar un motor pesado dentro de la aplicación de Electron (como sucedía anteriormente con `node-llama-cpp`, lo cual ralentizaba la máquina), ahora nos conectamos a **Ollama**.

Ollama es una herramienta independiente escrita en Go que se encarga de servir modelos LLM a través de una API RESTful local (típicamente en http://localhost:11434).

El flujo de comunicación es el siguiente:
1. **Frontend (React)**: El componente `AiSidebar.jsx` recopila el esquema de la base de datos (tablas habilitadas) y la pregunta del usuario. Luego lo envía con un POST a nuestro backend de Node/Express.
2. **Backend (Express)**: El endpoint `/api/ai/generate` en `index.js` canaliza la petición y la envía al archivo `AiManager.js`.
3. **Manejador de IA (AiManager.js)**: Forma un "System Prompt" que le da el rol al modelo ("You are a DuckDB SQL Expert...") e inicializa la librería `@ollama/ollama`.
4. **Ollama local**: La librería SDK manda la solicitud por red local a Ollama. Ollama localiza el modelo especificado en su registro interno o devuelve un error si no lo tienes descargado.
5. **Respuesta**: El backend recibe el SQL en la respuesta, lo limpia (`cleanSql`) eliminando posibles bloques de markdown y devuelve el texto puro de la query al frontend de React para previsualización.

## Solución de Errores Comunes (Troubleshooting)

### Error 1: Model 'xxxx' not found
**Formato en UI:** `Model 'llama3.1:8b' not found in Ollama.`
**¿Por qué sucede?**
Si bien AmoxSQL lista los modelos en un menú desplegable, AmoxSQL **no descarga los modelos pesados por sí mismo**. Esto previene que llenemos tu disco duro sin tu permiso y nos evita lidiar con múltiples gigabytes por modelo interactuando pesadamente con Node.
Ollama requiere que tú autorices la descarga y poseas el modelo deseado pre-alojado localmente en tu sistema operativo antes de llamarlo.
**Solución:**
1. Abre CMD, PowerShell o tu terminal preferida (incluso desde VSCode).
2. Asegúrate que `ollama` esté encendido.
3. Ejecuta el comando de tracción manual: `ollama pull llama3.1:8b` (o el nombre del modelo que te haya faltado).
4. Espera a que baje (son entre 1.5GB a 6GB dependiendo el tamaño del modelo).
5. Vuelve a AmoxSQL y dale clic a "Generate" de nuevo. Ahora funcionará.

### Error 2: Could not connect to Ollama (ECONNREFUSED / fetch failed)
**¿Por qué sucede?**
Esto indica que tu servidor Node en Express intentó hacer una llamada de red local al puerto de Ollama en (por defecto) `11434`, pero nadie respondió. No hay servidor de Ollama corriendo en tu computadora actualmente.
**Solución:**
Abre la aplicación "Ollama" desde el menú de inicio de tu Windows o Mac. Verás un icono en tu bandeja del sistema que te avisa que está activo. Reinicia el IDE e intenta nuevamente.

## Modelos Soportados y RAM

Debes elegir cuidadosamente el modelo a descargar ("pull") con base en la cantidad de memoria RAM en tu computadora:
- **Qwen 2.5 (1.5B)** - Ideal para máquinas ultraligeras, ocupa alrededor de 1.4GB de RAM. `ollama pull qwen2.5:1.5b`
- **Llama 3.2 (3B)** - Muy balanceado y veloz. Requiere 2.0GB de RAM libre. `ollama pull llama3.2:3b`
- **CodeLlama (7B) / Llama 3.1 (8B)** - Fuertemente entrenado en código y SQL. Necesita en torno de 4 y 5 GB RAM respectivamente. `ollama pull llama3.1` o `ollama pull codellama`

Para añadir nuevos modelos al sistema, simplemente ve a `AiSidebar.jsx`, búscate el arreglo `OLLAMA_MODELS` y añade la nueva opción con el ID exacto y etiqueta que desees. También puedes usar la opción de "Custom Model" que habilitamos para meter nombres directos que pruebes después en la terminal.
