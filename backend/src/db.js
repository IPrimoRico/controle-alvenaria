const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'database-state.json');

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'controle_alvenaria',
      connectionTimeoutMillis: 2500,
    };

const pool = new Pool(poolConfig);
let isPostgresConnected = false;

pool.on('error', () => {
  isPostgresConnected = false;
});

const DEFAULT_STATE = {
  configuracoes: {
    preco_m2_levantamento: 16.0,
    preco_m_primeira_fiada: 10.0,
    altura_padrao_m: 2.65,
    descontar_vaos: false,
    limite_vao_m2: 2.0,
    regra_vao: 'excedente', // 'excedente' (só desconta o que passar do limite) ou 'integral'
    dias_uteis_padrao: 22,
  },
  pedreiros: [
    {
      id: 1,
      nome: 'João da Silva',
      especialidade: 'Ambos',
      dias_trabalhados_mes: 22,
      ativo: true,
    },
    {
      id: 2,
      nome: 'Carlos Ferreira (1ª Fiada)',
      especialidade: 'Primeira Fiada',
      dias_trabalhados_mes: 22,
      ativo: true,
    },
    {
      id: 3,
      nome: 'Antônio Oliveira (Alvenaria)',
      especialidade: 'Levantamento',
      dias_trabalhados_mes: 22,
      ativo: true,
    },
  ],
  // Mapa por guid ("TIPO-01::P-008"): registro completo de medição
  medicoes: {},
  // Alturas customizadas por parede que valem como padrão nos 14 andares tipos se desejado
  alturasPorParede: {},
};

function loadState() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(STATE_FILE)) {
      fs.writeFileSync(STATE_FILE, JSON.stringify(DEFAULT_STATE, null, 2), 'utf8');
      return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      configuracoes: { ...DEFAULT_STATE.configuracoes, ...(parsed.configuracoes || {}) },
      pedreiros: Array.isArray(parsed.pedreiros) ? parsed.pedreiros : DEFAULT_STATE.pedreiros,
      medicoes: parsed.medicoes || {},
      alturasPorParede: parsed.alturasPorParede || {},
    };
  } catch (err) {
    console.warn('[DB] Aviso ao ler estado em disco, usando padrão:', err.message);
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}

function saveState(state) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('[DB] Erro ao persistir estado:', err.message);
  }
}

async function initializeDatabase() {
  loadState();
  try {
    const client = await pool.connect();
    try {
      const schemaPath = path.join(__dirname, '..', 'sql', 'schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await client.query(schemaSql);
      isPostgresConnected = true;
      console.log('✅ [PostgreSQL] Conectado e tabelas sincronizadas.');
    } finally {
      client.release();
    }
  } catch {
    isPostgresConnected = false;
    console.log(
      '💾 [Banco de Dados] Persistência ativa em disco (backend/data/database-state.json) + suporte PostgreSQL.'
    );
  }
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  initializeDatabase,
  getConnectionStatus: () => isPostgresConnected,
  loadState,
  saveState,
};
