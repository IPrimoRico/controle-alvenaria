const { Client } = require('pg');
const { initializeDatabase } = require('./db');
require('dotenv').config();

async function createDatabaseIfNotExists() {
  const dbName = process.env.DB_NAME || 'controle_alvenaria';
  const adminClient = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: 'postgres',
  });

  try {
    await adminClient.connect();
    const res = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName]
    );
    if (res.rowCount === 0) {
      console.log(`[PostgreSQL] Criando banco de dados "${dbName}"...`);
      await adminClient.query(`CREATE DATABASE "${dbName}"`);
      console.log(`✅ [PostgreSQL] Banco "${dbName}" criado com sucesso!`);
    } else {
      console.log(`ℹ️ [PostgreSQL] Banco "${dbName}" já existe.`);
    }
  } catch (err) {
    console.error('❌ Erro ao verificar/criar banco:', err.message);
  } finally {
    await adminClient.end();
  }

  await initializeDatabase();
  process.exit(0);
}

createDatabaseIfNotExists();
