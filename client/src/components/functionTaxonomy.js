/**
 * Taxonomía del panel de funciones.
 *
 * El catálogo de DuckDB son 965 entradas en orden alfabético, así que encontrar
 * la que usas siempre costaba lo mismo que encontrar una que no has usado nunca
 * — y lo primero que veías eran `__internal_compress_integral_ubigint` y sus
 * hermanas. Aquí vive lo que hace falta para ordenarlo por SIGNIFICADO.
 *
 * Las reglas de abajo NO se escribieron a ojo: se probaron contra el catálogo
 * real y se fueron afinando LEYENDO LAS 918 UNA POR UNA, en tres pasadas.
 * Reparto final, medido ejecutando este módulo contra el catálogo real:
 *
 *    cargar 23 · limpiar 28 · texto 85 · idiomas 135 · fechas 80 · números 72
 *    estructuras 200 · agregar 92 · escribir 2 · catálogo 154 · motor 47
 *
 * 918 de 918, ninguna en "Otras". La primera versión dejaba 636 sin clasificar.
 *
 * Lo que salió de revisarlas de verdad, y que ninguna regla general habría
 * pillado:
 *
 *  - "Cargar datos" listaba 62 funciones e incluía `checkpoint`,
 *    `enable_logging` y `parquet_schema`. Ninguna carga nada: una regla mandaba
 *    TODO lo de tipo `table` ahí. Ahora son 23 y todas leen datos.
 *  - "Texto" tenía 221 porque se tragaba las ~135 colaciones `icu_collate_*`,
 *    que no son funciones de texto sino definiciones de idioma. Tienen grupo
 *    propio y Texto baja a 85.
 *  - Catorce `to_days`, `to_months`, `to_quarters`… estaban en "Limpiar" por el
 *    prefijo `to_`, junto a `to_hex`. Construyen intervalos: son de fechas.
 *  - Los codificadores estaban partidos en dos grupos: `hex` y `base64` en
 *    Texto, pero `to_hex` y `from_base64` en Limpiar. Ahora van juntos.
 *  - "Explorar" creció a 200 mezclando mirar qué hay con mandar sobre el motor.
 *    Partido en "Catálogo y metadatos" y "Motor y ajustes".
 *  - La dirección de conexión (`inet_client_addr`) y los planes SQL
 *    serializados (`json_serialize_sql`) estaban en "Listas y estructuras".
 *
 * Es una heurística declarada, no una verdad. Manda el tipo del motor para la
 * agregación, luego el nombre (los patrones son inequívocos), luego la categoría
 * curada, y por último el tipo. Lo que no encaja cae en "Otras" sin inventarle
 * un sitio.
 */

export const TYPES = {
    scalar: {
        label: 'Escalar',
        short: 'Una fila entra, un valor sale.',
        long: 'Se calcula fila por fila. UPPER(nombre) devuelve un nombre por cada fila que ya tenías.',
    },
    aggregate: {
        label: 'Agregación',
        short: 'Muchas filas entran, un valor sale.',
        long: 'Colapsa un grupo entero en un número. Con GROUP BY da un valor por grupo; sin él, uno para toda la tabla.',
    },
    table: {
        label: 'Tabla',
        short: 'Devuelve una tabla entera.',
        long: 'Va en el FROM, no en el SELECT. read_csv(\'ventas.csv\') no devuelve un valor: devuelve filas y columnas.',
    },
    table_macro: {
        label: 'Macro de tabla',
        short: 'Un atajo que devuelve una tabla.',
        long: 'Como una función de tabla, pero escrita en SQL sobre otras que ya existen.',
    },
    macro: {
        label: 'Macro',
        short: 'Un atajo escrito en SQL.',
        long: 'No está implementada dentro del motor sino definida en SQL: al usarla se expande a la expresión que representa.',
    },
    pragma: {
        label: 'Pragma',
        short: 'Consulta o ajusta el motor.',
        long: 'No trabaja con tus datos sino con DuckDB: versión, ajustes, extensiones cargadas.',
    },
};

export const STAGES = [
    { id: 'cargar', label: 'Cargar datos', desc: 'Traer archivos y fuentes externas a la sesión. Casi siempre el primer paso.' },
    { id: 'limpiar', label: 'Limpiar y convertir', desc: 'Tapar huecos, cuadrar tipos y quitar lo que sobra, antes de analizar nada.' },
    { id: 'texto', label: 'Texto', desc: 'Buscar, partir, componer y medir parecido entre cadenas.' },
    { id: 'idiomas', label: 'Idiomas y ordenación', desc: 'Colaciones: cómo ordenar y comparar texto según cada idioma. Se usan con COLLATE, rara vez se llaman.' },
    { id: 'fechas', label: 'Fechas y tiempo', desc: 'Extraer partes, truncar a un periodo y calcular distancias entre momentos.' },
    { id: 'numeros', label: 'Números', desc: 'Redondeo, potencias, trigonometría y bits.' },
    { id: 'estructuras', label: 'Listas y estructuras', desc: 'Listas, mapas, structs y JSON: los datos que no caben en una celda plana.' },
    { id: 'agregar', label: 'Agregar y analizar', desc: 'Resumir muchas filas en pocas, o calcular sobre una ventana de filas vecinas.' },
    { id: 'escribir', label: 'Escribir', desc: 'Son pocas a propósito: en DuckDB se escribe con sentencias (COPY, EXPORT), no con funciones.' },
    { id: 'explorar', label: 'Catálogo y metadatos', desc: 'Qué hay dentro: tablas, columnas, tipos, extensiones, y los metadatos de un archivo antes de leerlo.' },
    { id: 'motor', label: 'Motor y ajustes', desc: 'Mandar sobre DuckDB: activar el registro, forzar un checkpoint, ajustar el optimizador. No tocan tus datos.' },
    { id: 'otras', label: 'Otras', desc: 'Lo que no encaja limpiamente en ninguna de las anteriores.' },
];

/**
 * Operadores (%, &&, ->>) y plomería del motor (__internal_compress_*). No son
 * API para nadie, y al no empezar por letra salían LOS PRIMEROS en la lista
 * alfabética, empujando lo útil fuera de la primera pantalla. Son 47 de 965.
 */
export const isHidden = (fn) => /^[^a-zA-Z]/.test(fn.function_name || '');

const REGLAS = [
    // ── Correcciones de la revisión función por función (las 918) ──────────
    // Van las primeras porque son casos concretos: si se dejan detrás, las
    // reglas por prefijo se los llevan a un grupo que no les toca.

    // Las colaciones son ~150 entradas casi idénticas que hinchaban "Texto"
    // hasta 221. No son funciones de texto: son definiciones de idioma.
    [/^(icu_collate_|icu_sort_key$|icu_calendar_names$|collations$|pragma_collations$)/i, 'idiomas'],

    // to_days, to_months, to_quarters… construyen INTERVALOS. Caían en
    // "Limpiar" por el prefijo to_, junto a to_hex y to_base64, que sí son
    // conversiones de formato.
    [/^to_(centuries|days|decades|hours|microseconds|millennia|milliseconds|minutes|months|quarters|seconds|weeks|years|timestamp)$/i, 'fechas'],
    [/^(current_date$|current_localtime$|current_localtimestamp$|get_current_time$|get_current_timestamp$)/i, 'fechas'],

    // JSON es estructura, no conversión de formato.
    [/^(to_json$|from_json$|from_json_strict$|remap_struct$)/i, 'estructuras'],

    // get_bit va con el resto de bits, no con las estructuras.
    [/^get_bit$/i, 'numeros'],

    // Dirección de conexión, planes SQL serializados y utilidades internas:
    // son del entorno, no datos anidados.
    [/^(inet_client_|inet_server_|json_serialize_|json_deserialize_|json_execute_serialized_|get_block_size$|get_type$|get_delta_test_expression$|map_to_pg_oid$|aggregate$|combine$|finalize$|is_histogram_other_bin$|write_log$|alias$|format_type$|format_pg_type$|parse_formatted_bytes$)/i, 'explorar'],
    [/^parse_.*(log|logline|message)/i, 'explorar'],

    // Rutas y tamaños legibles son manipulación de texto.
    [/^(parse_dirname$|parse_dirpath$|parse_filename$|parse_path$|character_length$|pg_size_pretty$)/i, 'texto'],

    // Mandos del motor: encender, apagar, forzar, verificar. Separados del
    // catálogo porque "Explorar" había crecido a 200 mezclando dos cosas muy
    // distintas: mirar qué hay, y cambiar cómo se comporta el motor.
    [/^(enable_|disable_|checkpoint$|force_checkpoint$|verify_|test_|check_|truncate_|sleep_ms$|pg_sleep$|error$|add_parquet_key$|copy_dir$|which_secret$|all_profiling_output$|set_iceberg_table_properties$|remove_iceberg_table_properties$|delta_set_transaction_version$|iceberg_to_ducklake$|make_type$|repeat_row$)/i, 'motor'],

    // Los codificadores estaban partidos: hex y base64 en "Texto", pero to_hex
    // y from_base64 en "Limpiar y convertir". Son la misma familia y van juntos
    // donde dice "convertir".
    [/^(bin$|unbin$|hex$|unhex$|base64$|encode$|decode$)/i, 'limpiar'],

    // Secuencias: son objetos de la base, no aritmética.
    [/^(currval$|nextval$)/i, 'explorar'],

    // Un scan es cargar, aunque el nombre acabe raro.
    [/^arrow_scan_dumb$/i, 'cargar'],
    [/^uuid_extract_timestamp$/i, 'fechas'],

    // Mover una base entera es escribir; traerla, cargar.
    [/^copy_database$/i, 'escribir'],
    [/^import_database$/i, 'cargar'],

    // EL ORDEN IMPORTA: gana la primera que encaje. Estas dos van delante de las
    // de carga a propósito, porque `parquet_metadata` e `iceberg_snapshots`
    // empiezan igual que los cargadores de verdad pero no cargan nada: miran
    // dentro del archivo. Lo mismo con mandar sobre el motor.
    [/^(checkpoint$|force_checkpoint$|enable_|disable_|check_|truncate_|which_|test_|sql_auto_complete$|copy_dir$|summary$|repeat_row$|histogram_values$|query_table$|seq_scan$)/i, 'explorar'],
    [/(_metadata$|_schema$|_stats$|_snapshots$|_list_files$|_transaction_version$|_table_properties$|_bloom_probe$|_pushdown_log|_to_ducklake$)/i, 'explorar'],
    [/^(write_|copy_to)/i, 'escribir'],
    [/^(read_|scan_|glob$|parquet_|csv_|iceberg_|delta_|sniff_)/i, 'cargar'],
    [/_scan$/i, 'cargar'],
    // Mandar sobre el motor y mirar dentro de un archivo NO es cargar datos.
    // `checkpoint`, `enable_logging` o `parquet_schema` son funciones de tipo
    // `table`, y una regla que mandaba todo lo `table` a "cargar" las metía
    // ahí: el grupo decía "Cargar datos" y enseñaba cosas que no cargan nada.
    [/^(duckdb_|pragma_|current_|has_|pg_|col_description$|obj_description$|shobj_description$|version$|typeof$|summarize$|database_size$|in_search_path$|txid_current$|session_user$|user$|getvariable$|stats$|index_scan|sleep_ms$|error$|vector_type$|can_cast_implicitly$|make_type$)/i, 'explorar'],
    [/^(trim$|ltrim$|rtrim$|replace$|regexp_replace$|ifnull$|nullif$|strip_accents$|nfc_normalize$|remove_null|translate$|parse_|try_|cast_to_type$|constant_or_null$|replace_type$|remap_struct$|to_|from_|switch$|alias$)/i, 'limpiar'],
    [/^(regexp_|str_|string_|starts_with$|ends_with$|contains$|levenshtein|jaro|jaccard|hamming|damerau|editdist|similarity|mismatches$|prefix$|suffix$|instr$|strpos$|position$|concat|upper$|ucase$|lower$|lcase$|substr|left|right|lpad$|rpad$|repeat$|reverse$|split|format|printf$|text$|excel_text$|chr$|ascii$|ord$|unicode$|length|len$|strlen$|char_|octet_length$|url_|base64|encode$|decode$|hex$|unhex$|bin$|unbin$|md5|sha|hash$|like_escape$|ilike_escape$|not_like_escape$|not_ilike_escape$|create_sort_key$|icu_|bar$)/i, 'texto'],
    [/^(date_|datediff$|datepart$|datesub$|datetrunc$|time_|timezone|epoch|make_date|make_time|make_timestamp|age$|ago$|century$|decade$|millennium$|era$|julian$|strftime$|strptime$|dayname$|monthname$|last_day$|nanosecond|microsecond|millisecond|second$|minute$|hour$|day|week|month|quarter|year|isodow$|isoyear$|normalized_interval$|transaction_timestamp$|timetz_byte_comparable$)/i, 'fechas'],
    [/^(list_|array_|map$|map_|struct_|union_|enum_|json$|json_|jsonb_|variant_|row$|row_to_json$|flatten$|unnest$|unpivot_list$|element_at$|cardinality$|apply$|reduce$|filter$|combine$|aggregate$|finalize$|grade_up$|range$|generate_|get_|st_|inet_)/i, 'estructuras'],
    [/^(abs$|ceil|floor$|round|trunc$|sign$|signbit$|sqrt$|cbrt$|exp$|ln$|lgamma$|gamma$|log|pow|sin|cos|cot$|tan|asin|acos|atan|degrees$|radians$|pi$|random$|setseed$|gcd$|lcm$|greatest_common_divisor$|least_common_multiple$|factorial$|even$|isnan$|isfinite$|isinf$|nextafter$|greatest$|least$|mod$|fmod$|fdiv$|xor$|divide$|multiply$|subtract$|add$|bit_|bitstring$|set_bit$|equi_width_bins$|nextval$|currval$|uuid|gen_random)/i, 'numeros'],
    [/^(geomean$|geometric_mean$|wavg$|weighted_avg$|is_histogram_other_bin$)/i, 'agregar'],
];

// Las categorías curadas son de DOMINIO; esto las lleva a su grupo.
const POR_CATEGORIA = {
    'I/O': 'cargar', Table: 'cargar', String: 'texto', Conversion: 'limpiar',
    Date: 'fechas', Math: 'numeros', List: 'estructuras', Struct: 'estructuras',
    Aggregate: 'agregar', Window: 'agregar', Utility: 'explorar',
};

// OJO: `table` NO implica cargar. Una funcion de tabla puede leer un CSV
// (read_csv) o mandar sobre el motor (checkpoint). Los cargadores de verdad los
// reconoce la regla de nombres; el resto de lo `table` es cosa del entorno.
const POR_TIPO = { aggregate: 'agregar', table: 'explorar', table_macro: 'explorar', pragma: 'explorar' };

export function stageFor(fn) {
    // El motor manda para la agregación: string_agg es de agregar aunque su
    // nombre empiece por "string_".
    if (fn.function_type === 'aggregate') return 'agregar';
    const nombre = fn.function_name || '';
    for (const [re, etapa] of REGLAS) {
        if (re.test(nombre)) return etapa;
    }
    if (fn.category && POR_CATEGORIA[fn.category]) return POR_CATEGORIA[fn.category];
    if (fn.function_type && POR_TIPO[fn.function_type]) return POR_TIPO[fn.function_type];
    return 'otras';
}

/**
 * Cinco para empezar. Un proyecto nuevo no tiene historial, y una sección vacía
 * no ayuda: éstas cubren el arranque típico —traer un archivo, contar, sumar,
 * promediar y agrupar por periodo—.
 *
 * Todas comprobadas contra el catálogo real. La primera versión recomendaba
 * `coalesce` y `try_cast`, que NO están en duckdb_functions(): son expresiones
 * del lenguaje, no funciones, y el panel no habría podido enseñarlas.
 */
export const STARTERS = ['read_csv', 'count', 'sum', 'date_trunc', 'avg'];

/** Fondo de descubrimiento, también validado contra el catálogo. */
export const DISCOVERY = [
    'arg_max', 'arg_min', 'quantile_cont', 'mode', 'approx_count_distinct',
    'list_aggregate', 'list_transform', 'unnest', 'histogram',
    'regexp_extract', 'string_split', 'levenshtein', 'jaro_winkler_similarity',
    'date_diff', 'strftime', 'strptime', 'time_bucket',
    'struct_pack', 'map_from_entries', 'nullif',
    'first', 'last', 'lead', 'lag', 'ntile', 'cume_dist',
    'union_extract', 'bit_count', 'hash', 'md5',
];

/**
 * Semana del año, para que el descubrimiento ROTE sin marear: rotando en cada
 * apertura nunca llegarías a fijarte en nada; por semana da tiempo a que una
 * función se te quede.
 */
export function weekSeed(date = new Date()) {
    const inicio = new Date(date.getFullYear(), 0, 1);
    const dias = Math.floor((date - inicio) / 86400000);
    return date.getFullYear() * 53 + Math.floor((dias + inicio.getDay()) / 7);
}

/**
 * Las cinco de esta semana, saltándose las que ya usas: no tiene sentido
 * "descubrirte" algo que llevas usando todo el mes.
 */
export function discoveryPicks(disponibles, yaUsadas, semilla = weekSeed(), n = 5) {
    const usadas = new Set(yaUsadas);
    const pool = DISCOVERY.filter(f => disponibles.has(f) && !usadas.has(f));
    if (pool.length === 0) return [];
    const out = [];
    // Paso coprimo con el tamaño del fondo para recorrerlo entero antes de repetir.
    let paso = 7;
    while (pool.length % paso === 0 && paso < pool.length) paso += 2;
    for (let i = 0; i < Math.min(n, pool.length); i++) {
        out.push(pool[(semilla * paso + i * paso) % pool.length]);
    }
    return [...new Set(out)];
}
