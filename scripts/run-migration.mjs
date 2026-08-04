import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import pg from "pg"

const migrationFile = process.argv[2] || "supabase/migrations/20260804000100_dms_foundation.sql"
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.error("DATABASE_URL belum di-set.")
  process.exit(1)
}

const sql = readFileSync(resolve(migrationFile), "utf8")
const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
})

try {
  await client.connect()
  await client.query(sql)
  console.log(`Migration applied: ${migrationFile}`)
} finally {
  await client.end().catch(() => {})
}
