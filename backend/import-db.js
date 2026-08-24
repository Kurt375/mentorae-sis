const fs = require('fs');
const mysql = require('mysql2');

const connectionString = 'mysql://root:wOPYfVUGhHCtyIBJfZRRLODtbZgUVlrt@trolley.proxy.rlwy.net:31822/railway';

const conn = mysql.createConnection(connectionString);

conn.connect(err => {
    if (err) {
        console.error('Connection failed:', err);
        return;
    }
    console.log('Connected to Railway database. Importing schema...');

    const schema = fs.readFileSync('./db/schema.sql', 'utf8');
    
    // Split statements by semicolon, filtering out empty lines or pure comments
    const statements = schema
        .split(/;\s*$/m)
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    let index = 0;

    function executeNext() {
        if (index >= statements.length) {
            console.log('Schema imported successfully!');
            conn.end();
            return;
        }

        const stmt = statements[index++];
        conn.query(stmt, (err) => {
            if (err) {
                console.error(`Error executing statement at index ${index}:`, err.message);
                console.error('Statement was:', stmt);
            }
            executeNext();
        });
    }

    executeNext();
});