import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../../drizzle/schema";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

const DB_PATH = "./data/viber.db";

// Ensure data directory exists
const dataDir = dirname(DB_PATH);
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

// Create SQLite connection
const sqlite = new Database(DB_PATH);

// Enable WAL mode for better concurrency
sqlite.pragma("journal_mode = WAL");

// Create Drizzle ORM instance
export const db = drizzle(sqlite, { schema });

// Initialize database tables
export function initializeDatabase() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS vibers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      platform TEXT,
      version TEXT,
      capabilities TEXT,
      last_connected INTEGER,
      last_disconnected INTEGER,
      total_tasks INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS spaces (
      id TEXT PRIMARY KEY,
      viber_id TEXT NOT NULL REFERENCES vibers(id) ON DELETE CASCADE,
      name TEXT,
      goal TEXT,
      status TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      viber_id TEXT NOT NULL REFERENCES vibers(id) ON DELETE CASCADE,
      space_id TEXT,
      goal TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      result TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      viber_id TEXT NOT NULL REFERENCES vibers(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      auth_user_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      avatar_url TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_spaces_viber_id ON spaces(viber_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_viber_id ON tasks(viber_id);
    CREATE INDEX IF NOT EXISTS idx_messages_viber_id ON messages(viber_id);
    CREATE INDEX IF NOT EXISTS idx_messages_task_id ON messages(task_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `);
}

// Initialize on module load
initializeDatabase();

export { schema };
