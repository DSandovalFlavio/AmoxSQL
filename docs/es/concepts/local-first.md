# Local-first

**🌐 [English](../../en/concepts/local-first.md) · Español**

> "Local-first" es la idea central de AmoxSQL: tus datos, el motor y hasta la IA viven en tu máquina. Nada se sube a la nube a menos que tú lo decidas explícitamente.

## Qué significa

- **Motor local:** DuckDB corre *in-process* en tu equipo. No hay un servidor de base de datos remoto.
- **Almacenamiento local:** tus proyectos, bases, gráficos y notebooks son archivos en tu disco.
- **IA local opcional:** puedes correr la IA 100% offline con modelos locales (Ollama), sin que ningún dato salga de tu máquina.

## Por qué importa

### Privacidad
Por defecto, tus datos no viajan a ningún servicio externo. Si eliges un proveedor de IA en la nube o exportas a un bucket, eso es una decisión tuya y explícita — no el comportamiento por defecto.

### Velocidad
Sin round-trips de red. Las consultas corren a la velocidad de DuckDB leyendo de tu disco/RAM. Por eso en AmoxSQL no verás spinners de "cargando" al estilo web: las cosas pasan al instante. Trata al motor como local y rápido — no razones sobre latencia de red o caché como en una app web.

### Control
Todo es un archivo que tú posees: `.sql`, `.sqlnb`, `.amoxvis`, `.amoxdeck`, `.sqlchain`. Puedes versionarlos con Git, respaldarlos, compartirlos o abrirlos con otras herramientas.

## Cuándo sí sale algo de tu máquina
Solo cuando tú lo pides:
- Usar un **proveedor de IA en la nube** (Gemini, Anthropic, OpenAI, Vertex, MiniMax) — mandas los prompts/contexto a ese proveedor. La alternativa local (Ollama) no manda nada.
- **Exportar a la nube** (S3/GCS) — subes los datos que exportas.
- **Google Sheets** — lees hojas remotas que tú conectas.
- **Descargar modelos** de Ollama o **instalar extensiones** de DuckDB.

## Relacionado
- [Arquitectura](architecture.md) · [Introducción a la IA](../ai/introduction.md)
- [Proveedores y modelos](../ai/providers-and-models.md)
