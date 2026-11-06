import React, { useEffect, useState } from 'react';

export default function WallInspectorPanel({
  selectedWall,
  wallStatusesMap,
  onSaveStatus,
  onResetStatus,
  onSelectWallFromList,
  saving,
  feedbackMessage,
}) {
  const [observacao, setObservacao] = useState('');
  const [responsavel, setResponsavel] = useState('Eng. Residente');

  const currentSaved = selectedWall
    ? wallStatusesMap[selectedWall.guid]
    : null;
  const currentStatus = currentSaved?.status || 'Pendente';

  useEffect(() => {
    if (selectedWall) {
      const saved = wallStatusesMap[selectedWall.guid];
      setObservacao(saved?.observacao || '');
      setResponsavel(saved?.responsavel || 'Eng. Residente');
    }
  }, [selectedWall, wallStatusesMap]);

  const recentWalls = Object.values(wallStatusesMap || {}).sort((a, b) => {
    const da = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const db = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    return db - da;
  });

  return (
    <aside className="inspector-sidebar">
      <div className="sidebar-section-header">
        <h2>Inspeção de Parede (GUID)</h2>
        <span className="badge-count">IFC.js + PostgreSQL</span>
      </div>

      {!selectedWall ? (
        <div className="empty-inspector-card">
          <div className="empty-icon">🧱</div>
          <h3>Nenhuma Parede Selecionada</h3>
          <p>
            Clique diretamente em qualquer parede no modelo 3D ao centro para capturar
            seu <strong>GUID (GlobalId)</strong> do IFC e registrar o status{' '}
            <span className="text-finalizada">Finalizada</span> ou{' '}
            <span className="text-reparo">Reparo</span> no banco PostgreSQL.
          </p>
        </div>
      ) : (
        <div className="inspector-card">
          <div className="guid-banner">
            <span className="guid-label">GUID (IFC GlobalId Único)</span>
            <code className="guid-code">{selectedWall.guid}</code>
          </div>

          <div className="meta-grid">
            <div className="meta-box">
              <span className="meta-label">Pavimento</span>
              <strong className="meta-value">
                {String(selectedWall.pavimento).padStart(2, '0')}º Pavimento
              </strong>
            </div>
            <div className="meta-box">
              <span className="meta-label">ExpressID (IFC)</span>
              <strong className="meta-value">#{selectedWall.expressID}</strong>
            </div>
          </div>

          <div className="meta-full">
            <span className="meta-label">Elemento / Parede</span>
            <p className="meta-wall-name">{selectedWall.nome_parede}</p>
          </div>

          {selectedWall.dimensoes && (
            <div className="meta-grid">
              <div className="meta-box">
                <span className="meta-label">Dimensões</span>
                <strong className="meta-value">{selectedWall.dimensoes}</strong>
              </div>
              <div className="meta-box">
                <span className="meta-label">Área Líquida</span>
                <strong className="meta-value">{selectedWall.areaM2} m²</strong>
              </div>
            </div>
          )}

          {/* Status Atual */}
          <div className="current-status-row">
            <span className="meta-label">Status Atual no Banco:</span>
            <span className={`status-pill ${currentStatus.toLowerCase()}`}>
              {currentStatus === 'Finalizada' && '✓ Finalizada'}
              {currentStatus === 'Reparo' && '⚠ Reparo'}
              {currentStatus === 'Pendente' && '⏳ Pendente'}
            </span>
          </div>

          {/* Campos de Observação e Responsável */}
          <div className="form-group">
            <label htmlFor="resp-input">Responsável pela Inspeção</label>
            <input
              id="resp-input"
              type="text"
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              placeholder="Nome do engenheiro ou inspetor"
            />
          </div>

          <div className="form-group">
            <label htmlFor="obs-textarea">
              Observação Técnica (Prumo, Esquadro, Fissuras, Argamassa)
            </label>
            <textarea
              id="obs-textarea"
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: Alvenaria aprovada no prumo / Necessita reparo de encunhamento..."
            />
          </div>

          {/* Botões de Ação Principal: Finalizada ou Reparo */}
          <div className="action-buttons-title">
            Salvar Status por GUID no PostgreSQL:
          </div>

          <div className="status-action-buttons">
            <button
              type="button"
              disabled={saving}
              className={`btn-status btn-finalizada ${
                currentStatus === 'Finalizada' ? 'active-choice' : ''
              }`}
              onClick={() =>
                onSaveStatus({
                  ...selectedWall,
                  status: 'Finalizada',
                  observacao,
                  responsavel,
                })
              }
            >
              <span className="btn-icon">✓</span>
              <div className="btn-text">
                <strong>Finalizada</strong>
                <small>Alvenaria liberada</small>
              </div>
            </button>

            <button
              type="button"
              disabled={saving}
              className={`btn-status btn-reparo ${
                currentStatus === 'Reparo' ? 'active-choice' : ''
              }`}
              onClick={() =>
                onSaveStatus({
                  ...selectedWall,
                  status: 'Reparo',
                  observacao,
                  responsavel,
                })
              }
            >
              <span className="btn-icon">⚠</span>
              <div className="btn-text">
                <strong>Reparo</strong>
                <small>Requer correção</small>
              </div>
            </button>
          </div>

          {currentStatus !== 'Pendente' && (
            <button
              type="button"
              disabled={saving}
              className="btn-reset-status"
              onClick={() => onResetStatus(selectedWall.guid)}
            >
              Limpar Status (Voltar para Pendente)
            </button>
          )}

          {feedbackMessage && (
            <div className="feedback-alert">{feedbackMessage}</div>
          )}
        </div>
      )}

      {/* Histórico recente de paredes salvas */}
      <div className="recent-updates-section">
        <div className="sidebar-section-header">
          <h3>Registros Salvos ({recentWalls.length})</h3>
        </div>
        {recentWalls.length === 0 ? (
          <p className="empty-recent-text">
            Nenhuma parede inspecionada ainda. Clique em uma parede 3D e selecione{' '}
            <strong>Finalizada</strong> ou <strong>Reparo</strong>.
          </p>
        ) : (
          <div className="recent-list">
            {recentWalls.slice(0, 15).map((item) => (
              <button
                key={item.guid}
                type="button"
                className={`recent-item ${
                  selectedWall?.guid === item.guid ? 'active' : ''
                }`}
                onClick={() => onSelectWallFromList(item.guid)}
              >
                <div className="recent-item-top">
                  <code className="recent-guid">{item.guid}</code>
                  <span
                    className={`status-tag ${item.status?.toLowerCase()}`}
                  >
                    {item.status}
                  </span>
                </div>
                <div className="recent-item-bottom">
                  <span>{String(item.pavimento).padStart(2, '0')}º Pav.</span>
                  <span className="recent-wall-name">{item.nome_parede}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
