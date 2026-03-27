const Parser = require('web-tree-sitter');

(async () => {
    await Parser.init();
    const SQL = await Parser.Language.load('./public/tree-sitter-sql.wasm');
    const parser = new Parser();
    parser.setLanguage(SQL);

    const testQueries = [
        `SELECT u.name, u.email FROM usuarios u WHERE u.id IN (SELECT id FROM compras WHERE total > 100) AND u.created_at > '2024-01-01'`,
        `WITH my_cte AS (SELECT * FROM usuarios) SELECT * FROM my_cte`,
        `SELECT * FROM usuarios u LEFT JOIN compras c ON c.user_id = u.id WHERE c.total > 50`,
    ];

    for (const sql of testQueries) {
        console.log('\n' + '='.repeat(80));
        console.log('SQL:', sql.substring(0, 80) + (sql.length > 80 ? '...' : ''));
        console.log('='.repeat(80));
        const tree = parser.parse(sql);
        printNode(tree.rootNode, 0);
    }

    function printNode(node, indent) {
        const prefix = '  '.repeat(indent);
        if (node.isNamed) {
            const text = node.text.length > 60 ? node.text.substring(0, 60) + '...' : node.text.replace(/\n/g, '\\n');
            console.log(`${prefix}${node.type} [${node.startPosition.row}:${node.startPosition.column}-${node.endPosition.row}:${node.endPosition.column}] "${text}"`);
        }
        for (let i = 0; i < node.namedChildCount; i++) {
            printNode(node.namedChild(i), indent + 1);
        }
    }
})();
