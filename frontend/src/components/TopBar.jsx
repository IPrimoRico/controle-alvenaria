import React, { useRef } from 'react';
import { TOTAL_PAVIMENTOS } from '../utils/ifcHelper';

export default function TopBar({
  backendOnline,
  modelMetadata,
  wallStatusesMap,
  onUploadIfcFile,
}) {
  const fileInputRef = useRef(null);

  const statuses = Object.values(wallStatusesMap || {});
  const countFinalizada = statuses.filter((s) => s.status === 'Finalizada').length;
  const countReparo = statuses.filter((s) => s.status === 'Reparo').length;
  const totalWalls = modelMetadata?.totalWalls || 252;
  const pctConcluido = Math.min(
    100,
    Math.round((countFinalizada / totalWalls) * 100)
  );

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file && onUploadIfcFile) {
      onUploadIfcFile(file);
    }
  };

  return (
    <header className="top-bar">
      <div className="brand-block">
        <div className="brand-logo">🏗️</div>
        <div>
          <h1>Controle de Alvenaria BIM 3D — {TOTAL_PAVIMENTOS} Pavimentos</h1>
          <p className="brand-subtitle">
            Frontend React + IFC.js (Three.js) • Backend Node.js + PostgreSQL • Seleção por GUID
          </p>
        </div>
      </div>

      {/* KPIs globais dos 21 pavimentos */}
      <div className="kpi-group">
        <div className="kpi-pill">
          <span className="kpi-label">Pavimentos</span>
          <strong className="kpi-val">{TOTAL_PAVIMENTOS}</strong>
        </div>
        <div className="kpi-pill finalizada">
          <span className="kpi-label">Finalizadas</span>
          <strong className="kpi-val">{countFinalizada}</strong>
        </div>
        <div className="kpi-pill reparo">
          <span className="kpi-label">Para Reparo</span>
          <strong className="kpi-val">{countReparo}</strong>
        </div>
        <div className="kpi-pill progress">
          <span className="kpi-label">Avanço Físico</span>
          <strong className="kpi-val">{pctConcluido}%</strong>
        </div>
      </div>

      {/* Upload .IFC + Status do Banco PostgreSQL */}
      <div className="top-actions">
        <input
          ref={fileInputRef}
          type="file"
          accept=".ifc"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button
          type="button"
          className="btn-upload-ifc"
          onClick={() => fileInputRef.current?.click()}
        >
          📂 Abrir Arquivo .IFC (21 Pav.)
        </button>

        <div
          className={`db-status-badge ${backendOnline ? 'online' : 'offline'}`}
          title={
            backendOnline
              ? 'Conectado à API Node.js + PostgreSQL (porta 3001)'
              : 'API PostgreSQL offline — salvando com fallback automático em localStorage'
          }
        >
          <span className="status-dot" />
          <span>{backendOnline ? 'PostgreSQL Online' : 'Modo Local (Fallback)'}</span>
        </div>
      </div>
    </header>
  );
}
