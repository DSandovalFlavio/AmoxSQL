// Curated list of extensions highlighted in the Extensions panel.
// fromCommunity: true means INSTALL <name> FROM community is required.
// postInstall: optional key to trigger a special setup flow after install.
const FEATURED_EXTENSIONS = [
    {
        name: 'rapidfuzz',
        tagline: 'Fuzzy string matching de alto rendimiento',
        description: 'Funciones SQL para similitud de strings (Levenshtein, Jaro-Winkler, token ratio). Ideal para deduplicación y búsqueda aproximada.',
        docsUrl: 'https://duckdb.org/community_extensions/extensions/rapidfuzz',
        category: 'Text',
        fromCommunity: true,
    },
    {
        name: 'prql',
        tagline: 'Pipeline query language que compila a SQL',
        description: 'Escribe queries como pipelines legibles (from → filter → select → aggregate) y compílalas a SQL estándar.',
        docsUrl: 'https://prql-lang.org/',
        category: 'Language',
        fromCommunity: true,
    },
    {
        name: 'httpfs',
        tagline: 'Lee archivos remotos (S3, GCS, HTTP)',
        description: 'Accede directamente a Parquet, CSV y JSON en S3, Google Cloud Storage o cualquier URL HTTP desde DuckDB.',
        docsUrl: 'https://duckdb.org/docs/extensions/httpfs/overview',
        category: 'I/O',
        fromCommunity: false,
    },
    {
        name: 'spatial',
        tagline: 'Geometría y datos geoespaciales',
        description: 'Tipos GEOMETRY, funciones ST_*, proyecciones, lectura de GeoJSON, Shapefile y más. Prerrequisito para análisis geoespacial local.',
        docsUrl: 'https://duckdb.org/docs/extensions/spatial/overview',
        category: 'Geo',
        fromCommunity: false,
    },
    {
        name: 'fts',
        tagline: 'Full-text search con BM25',
        description: 'Índices de texto completo con ranking BM25. Ideal para búsqueda full-text y ranking de relevancia.',
        docsUrl: 'https://duckdb.org/docs/extensions/full_text_search',
        category: 'Search',
        fromCommunity: false,
    },
];

export default FEATURED_EXTENSIONS;
