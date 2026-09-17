// Curated list of extensions highlighted in the Extensions panel.
// fromCommunity: true means INSTALL <name> FROM community is required.
// postInstall: optional key to trigger a special setup flow after install.
const FEATURED_EXTENSIONS = [
    {
        name: 'rapidfuzz',
        tagline: 'High-performance fuzzy string matching',
        description: 'SQL functions for string similarity (Levenshtein, Jaro-Winkler, token ratio). Ideal for deduplication and approximate search.',
        docsUrl: 'https://duckdb.org/community_extensions/extensions/rapidfuzz',
        category: 'Text',
        fromCommunity: true,
    },
    {
        name: 'prql',
        tagline: 'A pipeline query language that compiles to SQL',
        description: 'Write queries as readable pipelines (from → filter → select → aggregate) and compile them to standard SQL.',
        docsUrl: 'https://prql-lang.org/',
        category: 'Language',
        fromCommunity: true,
    },
    {
        name: 'httpfs',
        tagline: 'Read remote files (S3, GCS, HTTP)',
        description: 'Reach Parquet, CSV and JSON on S3, Google Cloud Storage or any HTTP URL directly from DuckDB.',
        docsUrl: 'https://duckdb.org/docs/extensions/httpfs/overview',
        category: 'I/O',
        fromCommunity: false,
    },
    {
        name: 'spatial',
        tagline: 'Geometry and geospatial data',
        description: 'GEOMETRY types, ST_* functions, projections, reading GeoJSON, Shapefile and more. A prerequisite for local geospatial analysis.',
        docsUrl: 'https://duckdb.org/docs/extensions/spatial/overview',
        category: 'Geo',
        fromCommunity: false,
    },
    {
        name: 'fts',
        tagline: 'Full-text search with BM25',
        description: 'Full-text indexes with BM25 ranking. Ideal for full-text search and relevance ranking.',
        docsUrl: 'https://duckdb.org/docs/extensions/full_text_search',
        category: 'Search',
        fromCommunity: false,
    },
];

export default FEATURED_EXTENSIONS;
