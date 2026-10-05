# Correr un proceso desde la línea de comandos

**🌐 [English](../../en/data-flow/command-line.md) · Español**

> Un proceso de [Data Flow](data-flow.md) puede correr sin abrir AmoxSQL: desde una consola, desde un script, o a una hora fija con el Programador de tareas de Windows. Devuelve un código de salida y deja un registro de lo que hizo.

## Qué es

```
AmoxSQL.exe run <proceso.sqlchain> --project <carpeta> [--param nombre=valor]… [--batch <lote.csv>]
```

Es el mismo AmoxSQL, no un programa aparte: usa tus credenciales del llavero y tus extensiones. Si AmoxSQL **ya está abierto**, la orden se le entrega y la corre él; si **no lo está**, corre sin ventana y se cierra al terminar. Si mientras corre abres AmoxSQL, se abre la ventana y sigue con lo suyo.

Cada ejecución queda anotada en el historial del proceso (en el panel **History** de Data Flow), igual que las que lanzas desde la interfaz.

## Cuándo usarlo

- Un proceso que pasa los Excel del mes a un Parquet y quieres que **corra solo** cada lunes.
- Encadenarlo con otros pasos en un script: el código de salida dice si siguió bien.
- Correr el mismo proceso con **otro parámetro** (otra región, otro mes) sin tocar el flujo.

## Cómo usarlo

### Desde la consola: `amoxsql.cmd`
`AmoxSQL.exe` es una aplicación gráfica, y una consola no la espera ni muestra lo que escribe. Por eso AmoxSQL instala junto a ella un `amoxsql.cmd`, que la lanza, **espera**, enseña el resultado y devuelve su código. Está en la carpeta `resources` de la instalación; con la instalación por defecto:

```bat
"%LOCALAPPDATA%\Programs\AmoxSQL\resources\amoxsql.cmd" run flujos\ventas.sqlchain --project "C:\Proyectos\Ventas 2026"
```

La salida dice cómo terminó cada paso, cuánto tardó y dónde está el registro:

```
AmoxSQL: ventas.sqlchain finished
  ok   Leer ventas (5 rows)
  ok   Solo norte (3 rows)
  ok   A Parquet
  1.4 s
  Log: C:\Users\tu-usuario\.amoxsql\registros\20261001-071500-3fa2b9c1.log
```

Si añades esa carpeta `resources` al `PATH`, basta con escribir `amoxsql run …`.

### Los argumentos

| Argumento | Qué es |
|---|---|
| `<proceso.sqlchain>` | El proceso. Ruta absoluta, o relativa a la carpeta desde la que lo lanzas o a la del proyecto |
| `--project <carpeta>` | La carpeta del proyecto al que pertenece. Obligatorio |
| `--param nombre=valor` | Da un valor a un parámetro del proceso para esta ejecución. Se puede repetir |
| `--batch <lote.csv>` | Corre el proceso una vez por fila del archivo: la primera línea nombra los parámetros y cada línea de debajo es una ejecución. También vale una lista de objetos en `.json`. Los `--param` valen para todas |

Los parámetros son los valores `${nombre}` que defines en **Parameters** del flujo: `--param region=sur` hace que esa ejecución use `sur` donde el flujo dice `${region}`.

Un valor dado aquí **nunca cambia la consulta**:
- **Un parámetro con tipo** (número, fecha, lista, sí/no) se comprueba antes de correr nada. `--param desde=05/10/2026` en uno de tipo fecha se para con código 2 y dice que espera `2026-10-05`. En el SQL entra con su tipo.
- **Un parámetro sin tipo** puede ir entre comillas en el SQL (`'${region}'`), donde siempre es texto. Donde entra como código, sólo puede ser un número o una palabra.
- **En un nombre de archivo**, un valor no puede llevar carpetas ni `..`.

Un lote comprueba antes todas las filas: si una está mal, no corre ninguna. Luego las ejecuciones van una detrás de otra, y la consola dice cuántas terminaron y cuáles fallaron.

```bat
AmoxSQL.exe run semanal.sqlchain --project "C:\Tiendas" --batch tiendas.csv
```

### Los códigos de salida

| Código | Significa |
|---|---|
| **0** | Terminó bien |
| **1** | El proceso falló (o se quedó en un checkpoint, que pide a alguien que lo reanude) |
| **2** | Los argumentos no son válidos, o el valor de un parámetro no es de su tipo |
| **3** | Falta una credencial en esta máquina (añádela en **Settings → Credentials**), o una fuente con nombre no tiene ubicación aquí (ubícala en la sección **Sources** del explorador de base) |
| **4** | AmoxSQL estaba abierto y no contestó en 30 segundos |
| **5** | No existe la carpeta del proyecto o el archivo del proceso |

### A una hora fija: el Programador de tareas de Windows
1. Abre el **Programador de tareas** y elige **Crear tarea básica**.
2. Dale un nombre (por ejemplo, *Ventas semanales*) y el desencadenador: **Semanalmente**, el lunes a las 7:00.
3. En **Acción**, elige **Iniciar un programa**:
   - **Programa o script:** `%LOCALAPPDATA%\Programs\AmoxSQL\resources\amoxsql.cmd`
   - **Agregar argumentos:** `run flujos\ventas.sqlchain --project "C:\Proyectos\Ventas 2026"`
4. Termina el asistente. En el **Historial** de la tarea verás el código de salida de cada vez que corrió: `0` es que fue bien.

La tarea corre con tu usuario, así que usa tus credenciales del llavero. La programación desde la propia aplicación llega en una versión posterior.

## Referencia: dónde queda cada cosa

| Qué | Dónde |
|---|---|
| El registro de cada ejecución | `~/.amoxsql/registros/<id>.log` — uno por ejecución, legible |
| El historial | La base de AmoxSQL; se ve en **History** dentro del flujo |
| Los pasos intermedios | Donde diga el flujo (ver [dónde viven los pasos intermedios](running-and-engine.md#dónde-viven-los-pasos-intermedios)). Un proceso de archivo a archivo no toca la base del proyecto |

## Tips y gemas

- **Un flujo en *Auto* o *Work database* no necesita la base del proyecto**, así que puede correr aunque tengas otro proyecto abierto en AmoxSQL.
- **Si el flujo usa la base del proyecto** y ese proyecto no es el que tienes abierto, AmoxSQL abre su base aparte: la de `defaultDb` en `.amoxsql/project.json`, o la única `.duckdb` de la carpeta.
- **Las credenciales que un proyecto necesita** se anotan por nombre en su manifiesto; si en esta máquina falta alguna, la orden sale con **3** antes de correr nada, en vez de fallar a medias.
- **Un checkpoint en un proceso programado** lo deja pausado (código 1): reanúdalo desde **History**.

## Relacionado

- [Data Flow](data-flow.md)
- [Ejecutar y motor](running-and-engine.md)
- [Referencia de nodos](node-reference.md)
