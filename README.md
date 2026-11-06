# Controle de Alvenaria BIM 3D — 21 Pavimentos (React + IFC.js + Node.js + PostgreSQL)

Aplicação web full-stack para inspeção e controle de qualidade de alvenaria em edifícios de **21 pavimentos** utilizando **React**, **Three.js / IFC.js (`web-ifc-three` & `web-ifc`)**, **Node.js (Express)** e **PostgreSQL**.

---

## 🏗️ Arquitetura do Projeto

```text
controle-alvenaria/
├── docker-compose.yml                 # Container PostgreSQL 16 pré-configurado com schema.sql
├── backend/
│   ├── package.json
│   ├── .env                           # Variáveis de ambiente (PostgreSQL e porta 3001)
│   ├── sql/
│   │   └── schema.sql                 # Tabelas paredes_status e paredes_historico + triggers
│   └── src/
│       ├── db.js                      # Pool de conexão PostgreSQL (pg) e inicialização do schema
│       ├── initDb.js                  # Script utilitário para criar o banco controle_alvenaria
│       ├── server.js                  # Servidor Express (porta 3001)
│       └── routes/
│           └── paredes.js             # Endpoints REST por GUID (Finalizada / Reparo)
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── App.jsx                    # Orquestração dos 21 pavimentos, viewer 3D e painel GUID
        ├── services/
        │   └── api.js                 # Cliente HTTP para o backend PostgreSQL + fallback local
        ├── utils/
        │   └── ifcHelper.js           # Extração de 21 IfcBuildingStorey / GUIDs + torre 3D BIM
        └── components/
            ├── TopBar.jsx             # Indicadores globais, upload de .IFC e status do banco
            ├── FloorNavigation21.jsx  # Seletor dos 21 pavimentos com progresso por andar
            ├── IfcViewer3D.jsx        # Canvas Three.js + IFCLoader + Raycaster por GUID
            └── WallInspectorPanel.jsx # Painel de inspeção da parede clicada (Finalizada / Reparo)
```

---

## 🔍 Como Funciona a Lógica de Clique no GUID (IFC.js)

1. **Carregamento dos 21 Pavimentos (`IfcBuildingStorey`)**:
   - No componente `IfcViewer3D.jsx`, o `IFCLoader` (`web-ifc-three`) carrega o arquivo `.ifc` e consulta `ifcLoader.ifcManager.getSpatialStructure(modelID, true)` através do utilitário `extractStoreysAndWallsFromIfc` em `ifcHelper.js`.
   - Além do upload de qualquer arquivo `.ifc`, o app já inicializa automaticamente uma **Torre BIM 3D de 21 Pavimentos** (252 paredes `IfcWallStandardCase` com `GlobalId` IFC determinísticos) para inspeção imediata.
2. **Captura do `GUID (GlobalId)` no Clique 3D**:
   - Ao clicar em uma parede no canvas 3D, o `THREE.Raycaster` identifica a malha/face atingida (`hit.faceIndex`).
   - No modelo IFC, obtém o `expressID` via `ifcManager.getExpressId(geometry, faceIndex)` e busca as propriedades nativas com `ifcManager.getItemProperties(modelID, expressID, false)`, extraindo `props.GlobalId.value` (o **GUID único de 22 caracteres** da parede).
3. **Persistência de `'Finalizada'` ou `'Reparo'` no PostgreSQL**:
   - O painel lateral exibe o `GUID`, `ExpressID`, `Pavimento (1 a 21)` e permite salvar o status **`Finalizada`** ou **`Reparo`** via `POST /api/paredes/status`.
   - O backend executa um `INSERT INTO paredes_status ... ON CONFLICT (guid) DO UPDATE` no PostgreSQL e grava a trilha de auditoria em `paredes_historico`.
   - Imediatamente, a parede clicada muda de cor no modelo 3D (**Verde `#10b981`** para `Finalizada` e **Vermelho `#ef4444`** para `Reparo`).

---

## 🚀 Como Executar

### 1. Pré-requisitos
- **Node.js** (v18+ ou v20+): [https://nodejs.org](https://nodejs.org) (ou via PowerShell: `winget install OpenJS.NodeJS.LTS`)
- **PostgreSQL** (v14+ local ou via Docker)

### 2. Preparar o Banco PostgreSQL
Opção A — Com PostgreSQL instalado localmente:
```bash
cd backend
npm install
npm run db:init
```
*(Ou execute manualmente o script `backend/sql/schema.sql` no pgAdmin / psql).*

Opção B — Com Docker:
```bash
docker compose up -d
```

### 3. Iniciar o Backend (Node.js + PostgreSQL)
```bash
cd backend
npm install
npm run dev
```
O servidor iniciará em `http://localhost:3001`.

### 4. Iniciar o Frontend (React + IFC.js)
Em outro terminal:
```bash
cd frontend
npm install
npm run dev
```
Acesse `http://localhost:5173` no navegador.
