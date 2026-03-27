/**
 * Quick test script to see tree-sitter-sql AST node types.
 * Run from client/ with: node --experimental-wasm-modules test_ast.mjs
 */
import TreeSitter from 'web-tree-sitter';
import { readFileSync } from 'fs';

await TreeSitter.init();

const SQL = TreeSitter.Language.load('./public/tree-sitter-sql.wasm');
const parser = new TreeSitter();
parser.setLanguage(await SQL);

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
    const isNamed = node.isNamed;
    if (isNamed) {
        const text = node.text.length > 60 ? node.text.substring(0, 60) + '...' : node.text;
        console.log(`${prefix}${node.type} [${node.startPosition.row}:${node.startPosition.column}-${node.endPosition.row}:${node.endPosition.column}] "${text}"`);
    }
    for (let i = 0; i < node.namedChildCount; i++) {
        printNode(node.namedChild(i), indent + 1);
    }
}
