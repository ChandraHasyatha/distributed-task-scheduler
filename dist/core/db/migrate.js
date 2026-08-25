import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { withTransaction, closeDb } from './client.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export async function runMigrations() {
    console.log('Running database migrations...');
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
        console.error(`Migrations directory not found: ${migrationsDir}`);
        return;
    }
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    await withTransaction(async (client) => {
        await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
        for (const file of files) {
            const { rows } = await client.query('SELECT version FROM schema_migrations WHERE version = $1', [file]);
            if (rows.length === 0) {
                console.log(`Applying migration: ${file}...`);
                const filePath = path.join(migrationsDir, file);
                const sql = fs.readFileSync(filePath, 'utf-8');
                await client.query(sql);
                await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
                console.log(`Successfully applied: ${file}`);
            }
            else {
                console.log(`Migration already applied: ${file}`);
            }
        }
    });
    console.log('All migrations completed successfully.');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    runMigrations()
        .then(() => closeDb())
        .catch((err) => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
}
//# sourceMappingURL=migrate.js.map