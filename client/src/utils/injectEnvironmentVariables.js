/**
 * Substitutes `{{varName}}` placeholders in a SQL string with values from an
 * environment map. String values are quoted (SQL-safe); other types (numbers)
 * are inserted as-is. Shared between SQL Notebooks and Report Flow decks so
 * both use the exact same `{{var}}` convention.
 */
export function injectEnvironmentVariables(query, env) {
    let injectedQuery = query;
    Object.entries(env || {}).forEach(([key, value]) => {
        const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
        const formattedValue = typeof value === 'string' ? `'${value}'` : value;
        injectedQuery = injectedQuery.replace(regex, formattedValue);
    });
    return injectedQuery;
}
