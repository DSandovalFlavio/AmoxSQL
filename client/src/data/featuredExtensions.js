// Curated list of extensions highlighted in the Extensions panel.
// fromCommunity: true means INSTALL <name> FROM community is required.
// postInstall: optional key to trigger a special setup flow after install.
const FEATURED_EXTENSIONS = [
    {
        name: 'flock',
        tagline: 'LLM & RAG native en SQL',
        description: 'Ejecuta llm_complete, llm_filter, llm_embedding, llm_reduce y fusion de búsqueda híbrida directamente desde DuckDB. El equivalente open-source local de BigQuery AI Functions.',
        docsUrl: 'https://dais-polymtl.github.io/flock/docs/what-is-flock',
        category: 'AI',
        fromCommunity: true,
        postInstall: 'flock-wizard',
        badge: 'Featured',
    },
    {
        name: 'rapidfuzz',
        tagline: 'Fuzzy string matching de alto rendimiento',
        description: 'Funciones SQL para similitud de strings (Levenshtein, Jaro-Winkler, token ratio). Ideal para deduplicación y búsqueda aproximada.',
        docsUrl: 'https://duckdb.org/community_extensions/extensions/flock',
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
        description: 'Índices de texto completo con ranking BM25. Prerrequisito para búsqueda híbrida con Flock (BM25 + embeddings).',
        docsUrl: 'https://duckdb.org/docs/extensions/full_text_search',
        category: 'Search',
        fromCommunity: false,
    },
];

export default FEATURED_EXTENSIONS;
