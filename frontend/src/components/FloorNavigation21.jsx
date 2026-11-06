import React from 'react';
import { TOTAL_PAVIMENTOS } from '../utils/ifcHelper';

export default function FloorNavigation21({
  selectedFloor,
  onSelectFloor,
  modoCorte,
  onChangeModoCorte,
  wallStatusesMap,
  wallsPerFloor = 12,
}) {
  // Calcula estatísticas por pavimento (1 a 21)
  const statsByFloor = {};
  for (let p = 1; p <= TOTAL_PAVIMENTOS; p++) {
    statsByFloor[p] = { finalizadas: 0, reparo: 0 };
  }

  Object.values(wallStatusesMap || {}).forEach((item) => {
    const pav = Number(item.pavimento);
    if (statsByFloor[pav]) {
      if (item.status === 'Finalizada') statsByFloor[pav].finalizadas += 1;
      if (item.status === 'Reparo') statsByFloor[pav].reparo += 1;
    }
  });

  // Lista do 21º pavimento (topo da torre) até o 1º pavimento (térreo)
  const floorsDescending = Array.from(
    { length: TOTAL_PAVIMENTOS },
    (_, i) => TOTAL_PAVIMENTOS - i
  );

  return (
    <aside className="floor-sidebar">
      <div className="sidebar-section-header">
        <h2>21 Pavimentos (IFC)</h2>
        <span className="badge-count">Torre 3D</span>
      </div>

      {/* Botão para visualizar todos os 21 pavimentos simultaneamente */}
      <button
        type="button"
        className={`floor-all-btn ${selectedFloor === 'all' ? 'active' : ''}`}
        onClick={() => onSelectFloor('all')}
      >
        <span>🏢 Visão Geral (21 Pavimentos)</span>
      </button>

      {/* Modo de isolamento quando um andar específico está selecionado */}
      {selectedFloor !== 'all' && (
        <div className="slice-mode-toggle">
          <span className="slice-label">Modo de Corte 3D:</span>
          <div className="slice-buttons">
            <button
              type="button"
              className={modoCorte === 'isolar' ? 'active' : ''}
              onClick={() => onChangeModoCorte('isolar')}
            >
              Isolar Andar
            </button>
            <button
              type="button"
              className={modoCorte === 'fantasma' ? 'active' : ''}
              onClick={() => onChangeModoCorte('fantasma')}
            >
              Torre Fantasma
            </button>
          </div>
        </div>
      )}

      {/* Lista vertical de todos os 21 pavimentos */}
      <div className="floor-list">
        {floorsDescending.map((pav) => {
          const st = statsByFloor[pav] || { finalizadas: 0, reparo: 0 };
          const pctFinalizada = Math.min(
            100,
            Math.round((st.finalizadas / wallsPerFloor) * 100)
          );
          const isSelected = Number(selectedFloor) === pav;

          return (
            <button
              key={pav}
              type="button"
              className={`floor-item-btn ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectFloor(pav)}
            >
              <div className="floor-item-top">
                <span className="floor-number">
                  {String(pav).padStart(2, '0')}º Pavimento
                </span>
                <div className="floor-badges">
                  {st.finalizadas > 0 && (
                    <span
                      className="mini-badge finalizada"
                      title={`${st.finalizadas} parede(s) finalizada(s)`}
                    >
                      ✓ {st.finalizadas}
                    </span>
                  )}
                  {st.reparo > 0 && (
                    <span
                      className="mini-badge reparo"
                      title={`${st.reparo} parede(s) em reparo`}
                    >
                      ⚠ {st.reparo}
                    </span>
                  )}
                  {st.finalizadas === 0 && st.reparo === 0 && (
                    <span className="mini-badge neutral">0/{wallsPerFloor}</span>
                  )}
                </div>
              </div>

              <div className="floor-progress-track">
                <div
                  className="floor-progress-fill finalizada"
                  style={{ width: `${pctFinalizada}%` }}
                />
                {st.reparo > 0 && (
                  <div
                    className="floor-progress-fill reparo"
                    style={{
                      width: `${Math.min(
                        100 - pctFinalizada,
                        Math.round((st.reparo / wallsPerFloor) * 100)
                      )}%`,
                    }}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
