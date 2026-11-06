const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
require('dotenv').config();

const { initializeDatabase, getConnectionStatus } = require('./db');
const paredesRouter = require('./routes/paredes');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '15mb' }));

function getAllLocalIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push({ interface: name, ip: net.address });
      }
    }
  }
  return ips;
}

// Healthcheck e informações de IP da rede atual
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'controle-alvenaria-new-life',
    database: getConnectionStatus()
      ? 'PostgreSQL + Disco'
      : 'Persistência Ativa (Servidor Local)',
    ips: getAllLocalIps(),
    timestamp: new Date().toISOString(),
  });
});

// Serve o arquivo NEW LIFE_05072024.ifc real para o visualizador 3D IFC.js
app.get('/api/arquivos/new-life.ifc', (req, res) => {
  const ifcPath = path.join(__dirname, '..', '..', 'NEW LIFE_05072024.ifc');
  if (fs.existsSync(ifcPath)) {
    res.setHeader('Content-Type', 'application/octet-stream');
    return res.sendFile(ifcPath);
  }
  return res.status(404).json({ error: 'Arquivo NEW LIFE_05072024.ifc não encontrado.' });
});

// Serve os dados geométricos extraídos do app medição.dwg
app.get('/api/arquivos/planta-dwg', (req, res) => {
  const jsonPath = path.join(__dirname, '..', 'data', 'dwgMeasurementPlan.json');
  if (fs.existsSync(jsonPath)) {
    return res.sendFile(jsonPath);
  }
  return res.status(404).json({ error: 'Dados da planta DWG não encontrados.' });
});

// Rotas de medição, pedreiros e configurações
app.use('/api/paredes', paredesRouter);

// Serve também o frontend compilado (dist) para que uma única porta/IP funcione em qualquer lugar
const distDir = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distDir, 'index.html'));
    }
  });
}

initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    const ips = getAllLocalIps();
    console.log(`🚀 [Servidor] Rodando em todos os IPs da máquina (0.0.0.0):`);
    console.log(`   💻 Local: http://localhost:${PORT}`);
    ips.forEach((item) => {
      console.log(`   🌐 Rede (${item.interface}): http://${item.ip}:${PORT} e http://${item.ip}:5173`);
    });
  });
});
