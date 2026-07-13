# Introducción a AmoxSQL

**🌐 [English](../../en/user-guide/introduction.md) · Español**

> AmoxSQL es un IDE de datos **local-first** de alto rendimiento, construido específicamente para DuckDB. Velocidad, privacidad y herramientas avanzadas — sin la sobrecarga de la nube.

<img src="../../../images/02_main_ide.png" alt="AmoxSQL IDE" width="100%" />

## Qué es AmoxSQL

AmoxSQL es una aplicación de escritorio para analistas e ingenieros de datos que quieren explorar, transformar, visualizar y documentar datos con SQL — todo en su propia máquina. El motor es [DuckDB](https://duckdb.org/), una base de datos analítica in-process extremadamente rápida, así que no hay servidor que administrar ni latencia de red: las consultas corren local y al instante.

Alrededor de ese motor, AmoxSQL añade lo que un IDE de datos moderno necesita:

- Un **editor SQL** con autocompletado que entiende tu esquema real.
- **Notebooks** tipo cuaderno para análisis narrados.
- **Story Flow** para visualización con storytelling, **Report Flow** para presentaciones, y **Data Flow** para canalizaciones visuales.
- Un **sistema de IA agéntica** que corre local (con Ollama) o en la nube, capaz de explorar tus datos por sí mismo.
- Integración con **DBT**, perfilado estadístico, planes de ejecución y más.

## Filosofía: local-first

Tus datos nunca tienen que salir de tu máquina. El motor es local, el almacenamiento es local, y hasta la IA puede correr 100% offline con modelos locales. Esto significa **privacidad** (nada se sube a un servicio externo salvo que tú lo elijas), **velocidad** (sin round-trips de red) y **control**. Ver [Local-first](../concepts/local-first.md).

## Para quién es

- **Analistas de datos** que viven en SQL y quieren iterar rápido sobre CSVs, Parquet, Excel o bases DuckDB.
- **Ingenieros de datos** que construyen transformaciones, pipelines y modelos DBT localmente.
- **Cualquiera** que quiera explorar datos con ayuda de IA sin mandarlos a la nube.

## El nombre

**"Amox"** viene del náhuatl ***Amoxtli***: "libro" o "códice". En la antigua Mesoamérica, los códices eran repositorios de conocimiento — historia, cálculos, saber. AmoxSQL es un códice digital moderno para la era de los datos: transforma datos crudos y opacos en visualizaciones claras y luminosas.

## Siguientes pasos

1. [Instalación](installation.md) — descarga el instalador o compila desde el código.
2. [Primeros pasos](first-steps.md) — abre tu primer proyecto y ejecuta tu primera query.
3. [La interfaz](interface.md) — un tour por las zonas de la app.

## Relacionado
- [Instalación](installation.md) · [Primeros pasos](first-steps.md) · [La interfaz](interface.md)
- [Arquitectura](../concepts/architecture.md) · [Local-first](../concepts/local-first.md)
