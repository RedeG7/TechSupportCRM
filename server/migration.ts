import { checkDatabaseConnection, pool } from './db';

async function createTables() {
  console.log('Skipping table creation - using existing database structure');
  await pool.query(
    'ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reminder_notified_at TIMESTAMP'
  );
  return true;
}

async function seedData() {
  console.log('Skipping data seeding - using existing data');
  return true;
}

async function runMigration() {
  console.log('Starting database migration...');
  
  // Check database connection
  const isConnected = await checkDatabaseConnection();
  if (!isConnected) {
    console.error('Failed to connect to the database. Migration aborted.');
    return;
  }
  
  try {
    // Create tables
    await createTables();
    
    // Seed initial data
    await seedData();
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Não podemos verificar require.main === module no formato ESM
// Executaremos a migração quando solicitada explicitamente por outras partes do código

export { runMigration };