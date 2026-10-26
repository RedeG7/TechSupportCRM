import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../shared/schema';

// Load environment variables
dotenv.config();

// Create a PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create a drizzle instance
export const db = drizzle(pool, { schema });

// Export pool for direct query access if needed
export { pool };

// Helper function to check database connection
export async function checkDatabaseConnection() {
  try {
    const client = await pool.connect();
    console.log('Database connection successful');
    client.release();
    return true;
  } catch (error) {
    console.error('Database connection error:', error);
    return false;
  }
}