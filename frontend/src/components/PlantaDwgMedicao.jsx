import React, { useState, useRef, useMemo, useEffect } from 'react';

export default function PlantaDwgMedicao({
  andarTipo, // 1 a 14
  onChangeAndarTipo,
  dwgData,
  medicoesMap,
  alturasPorParede,
  pedreiros,
  configuracoes,
  onSaveMedicao,
  onAddPedreiro,
  onVoltar3D,
}) {
  const [selectedWallIds, setSelectedWallIds] = useState(['P-008']);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [filtroLayer, setFiltroLayer] = useState('TODAS');
  const [modoCor, setModoCor] = useState('levantamento'); // 'levantamento' | 'fiada' | 'layer'
  const [mostrarLinhasMedicao, setMostrarLinhasMedicao] = useState(true);
  const [mostrarCodigos, setMostrarCodigos] = useState(true);
  const [mostrarEstruturalOverlay, setMostrarEstruturalOverlay] = useState(true);

  // Controles de Zoom e Pan (compatível com Mouse e Touch Celular/Tablet)
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  // Estados do formulário de inspeção/medição da parede selecionada
  const hojeStr = new Date().toISOString().slice(0, 10);
  const [modoCanto, setModoCanto] = useState('padrao_sem_duplicar');
  const [comprimentoInput, setComprimentoInput] = useState(3.07);
  const [alturaInput, setAlturaInput] = useState(2.65);
  const [aplicarAlturaNos14Tipos, setAplicarAlturaNos14Tipos] = useState(false);
  const [areaVaoInput, setAreaVaoInput] = useState(0);
  const [descontarVaoParede, setDescontarVaoParede] = useState(false);

  // Primeira Fiada (R$ 10/m)
  const [fiadaPedreiroId, setFiadaPedreiroId] = useState('');
  const [fiadaData, setFiadaData] = useState(hojeStr);
  const [replicarTodos14Tipos, setReplicarTodos14Tipos] = useState(false);

  // Levantamento de Alvenaria (R$ 16/m²)
  const [levPedreiroId, setLevPedreiroId] = useState('');
  const [levData, setLevData] = useState(hojeStr);
  const [observacao, setObservacao] = useState('');

  // Novo pedreiro inline
  const [showAddPedreiro, setShowAddPedreiro] = useState(false);
  const [novoPedreiroNome, setNovoPedreiroNome] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);

  const precoLev = Number(configuracoes?.preco_m2_levantamento) || 16.0;
  const precoFiada = Number(configuracoes?.preco_m_primeira_fiada) || 10.0;

  const walls = dwgData?.wallPieces || [];
  const primaryWallId = selectedWallIds[0] || null;
  const primaryWall = useMemo(
    () => walls.find((w) => w.id === primaryWallId) || null,
    [walls, primaryWallId]
  );

  // Sincroniza formulário quando o usuário clica numa parede ou troca de andar (1..14)
  useEffect(() => {
    if (!primaryWall) return;
    const guid = `TIPO-${String(andarTipo).padStart(2, '0')}::${primaryWall.id}`;
    const saved = medicoesMap?.[guid];
    const alturaPadraoParede =
      alturasPorParede?.[primaryWall.id] ||
      primaryWall.alturaPadraoM ||
      Number(configuracoes?.altura_padrao_m) ||
      2.85;

    if (saved) {
      setModoCanto(saved.modo_canto || 'padrao_sem_duplicar');
      setComprimentoInput(Number(saved.comprimento_m) || primaryWall.comprimentoM);
      setAlturaInput(Number(saved.altura_m) || alturaPadraoParede);
      setAreaVaoInput(Number(saved.area_vao_m2) || 0);
      setDescontarVaoParede(
        saved.descontar_vao_nesta_parede !== null &&
          saved.descontar_vao_nesta_parede !== undefined
          ? Boolean(saved.descontar_vao_nesta_parede)
          : Boolean(configuracoes?.descontar_vaos)
      );
      setFiadaPedreiroId(saved.fiada_pedreiro_id ? String(saved.fiada_pedreiro_id) : '');
      setFiadaData(saved.fiada_data || hojeStr);
      setLevPedreiroId(
        saved.levantamento_pedreiro_id ? String(saved.levantamento_pedreiro_id) : ''
      );
      setLevData(saved.levantamento_data || hojeStr);
      setObservacao(saved.observacao || '');
    } else {
      setModoCanto('padrao_sem_duplicar');
      setComprimentoInput(primaryWall.comprimentoM);
      setAlturaInput(alturaPadraoParede);
      setAreaVaoInput(0);
      setDescontarVaoParede(Boolean(configuracoes?.descontar_vaos));
      setObservacao('');
    }
  }, [primaryWall, andarTipo, medicoesMap, alturasPorParede, configuracoes]);

  // Troca comprimento ao alternar regra de canto (Sem duplicar vs Face Externa vs Face Interna)
  const handleSelectModoCanto = (novoModo) => {
    setModoCanto(novoModo);
    if (!primaryWall) return;
    if (novoModo === 'padrao_sem_duplicar') {
      setComprimentoInput(primaryWall.comprimentoM);
    } else if (novoModo === 'face_externa') {
      setComprimentoInput(primaryWall.comprimentoBrutoM);
    } else if (novoModo === 'face_interna') {
      setComprimentoInput(primaryWall.comprimentoInternoM);
    }
  };

  // Cálculo em tempo real da parede selecionada
  const calculoPreview = useMemo(() => {
    const comp = Number(comprimentoInput) || 0;
    const alt = Number(alturaInput) || 2.65;
    const vao = Math.max(0, Number(areaVaoInput) || 0);
    const areaBruta = +(comp * alt).toFixed(3);

    let descVao = 0;
    const limite = Number(configuracoes?.limite_vao_m2) || 2.0;
    if (descontarVaoParede && vao > limite) {
      descVao =
        configuracoes?.regra_vao === 'integral' ? vao : +(vao - limite).toFixed(3);
    }
    const areaLiquida = +Math.max(0, areaBruta - descVao).toFixed(3);
    const valorFiada = +(comp * precoFiada).toFixed(2);
    const valorLev = +(areaLiquida * precoLev).toFixed(2);

    return {
      comp,
      alt,
      areaBruta,
      descVao,
      areaLiquida,
      valorFiada,
      valorLev,
    };
  }, [comprimentoInput, alturaInput, areaVaoInput, descontarVaoParede, configuracoes, precoFiada, precoLev]);

  // Salva status de Levantamento ou de 1ª Fiada para a(s) parede(s) selecionada(s)
  const dispararSalvamento = async (overrides = {}) => {
    if (selectedWallIds.length === 0) return;
    setSaving(true);
    setFeedback(null);

    try {
      const pFiadaObj = pedreiros.find((p) => String(p.id) === String(fiadaPedreiroId));
      const pLevObj = pedreiros.find((p) => String(p.id) === String(levPedreiroId));

      const itemsPayload = selectedWallIds.map((wId) => {
        const wObj = walls.find((w) => w.id === wId);
        const guid = `TIPO-${String(andarTipo).padStart(2, '0')}::${wId}`;
        const existente = medicoesMap?.[guid] || {};

        const isSingle = selectedWallIds.length === 1;
        const compUsado = isSingle
          ? Number(comprimentoInput)
          : Number(existente.comprimento_m) || wObj.comprimentoM;
        const altUsada = isSingle
          ? Number(alturaInput) || wObj.alturaPadraoM || 2.85
          : Number(existente.altura_m) ||
            alturasPorParede?.[wId] ||
            wObj.alturaPadraoM ||
            2.85;

        return {
          andar_tipo: Number(andarTipo),
          parede_id: wId,
          layer: wObj.layer,
          espessura_cm: wObj.espessuraCm,
          modo_canto: isSingle ? modoCanto : existente.modo_canto || 'padrao_sem_duplicar',
          comprimento_m: compUsado,
          altura_m: altUsada,
          area_vao_m2: isSingle ? Number(areaVaoInput) || 0 : Number(existente.area_vao_m2) || 0,
          descontar_vao_nesta_parede: descontarVaoParede,
          fiada_status:
            overrides.fiada_status !== undefined
              ? overrides.fiada_status
              : existente.fiada_status || 'Pendente',
          fiada_pedreiro_id: pFiadaObj ? pFiadaObj.id : existente.fiada_pedreiro_id || null,
          fiada_pedreiro_nome: pFiadaObj
            ? pFiadaObj.nome
            : existente.fiada_pedreiro_nome || '',
          fiada_data: fiadaData || existente.fiada_data || hojeStr,
          status:
            overrides.status !== undefined
              ? overrides.status
              : existente.status || 'Pendente',
          levantamento_pedreiro_id: pLevObj
            ? pLevObj.id
            : existente.levantamento_pedreiro_id || null,
          levantamento_pedreiro_nome: pLevObj
            ? pLevObj.nome
            : existente.levantamento_pedreiro_nome || '',
          levantamento_data: levData || existente.levantamento_data || hojeStr,
          observacao,
        };
      });

      const andaresParaReplicar = replicarTodos14Tipos
        ? Array.from({ length: 14 }, (_, i) => i + 1)
        : [Number(andarTipo)];

      await onSaveMedicao({
        items: itemsPayload,
        aplicarAlturaEmTodosOsTipos: aplicarAlturaNos14Tipos,
        andaresParaReplicar,
      });

      setFeedback(
        replicarTodos14Tipos
          ? `✅ Salvo em todos os 14 Andares Tipos (${selectedWallIds.length} parede(s))!`
          : `✅ Medição salva no TIPO ${String(andarTipo).padStart(2, '0')} (${selectedWallIds.length} parede(s))!`
      );
      setTimeout(() => setFeedback(null), 3500);
    } finally {
      setSaving(false);
    }
  };

  // Clique em uma parede na planta DWG
  const handleWallClick = (wallId, e) => {
    e.stopPropagation();
    if (multiSelectMode || e.shiftKey || e.ctrlKey) {
      setSelectedWallIds((prev) =>
        prev.includes(wallId)
          ? prev.filter((id) => id !== wallId)
          : [...prev, wallId]
      );
    } else {
      setSelectedWallIds([wallId]);
    }
  };

  // Selecionar todas as paredes visíveis no filtro atual
  const handleSelectAllFiltered = () => {
    const ids = walls
      .filter((w) => filtroLayer === 'TODAS' || w.layer === filtroLayer)
      .map((w) => w.id);
    setSelectedWallIds(ids);
    setMultiSelectMode(true);
  };

  // ViewBox do SVG baseado no bounding box do DWG (invertendo eixo Y do AutoCAD para tela)
  const bounds = dwgData?.bounds || {
    minX: 2300,
    minY: 1500,
    maxX: 5050,
    maxY: 3050,
    width: 2750,
    height: 1550,
  };
  const pad = 90;
  const vbWidth = bounds.width + pad * 2;
  const vbHeight = bounds.height + pad * 2;

  // Converte coordenada (x, y) do DWG para coordenada do SVG
  const toSvgX = (x) => x - bounds.minX + pad;
  const toSvgY = (y) => bounds.maxY - y + pad;

  const handlePointerDownCanvas = (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handlePointerMoveCanvas = (e) => {
    if (!isPanningRef.current) return;
    setPan({
      x: e.clientX - panStartRef.current.x,
      y: e.clientY - panStartRef.current.y,
    });
  };

  const handlePointerUpCanvas = () => {
    isPanningRef.current = false;
  };

  const guidAtual = primaryWall
    ? `TIPO-${String(andarTipo).padStart(2, '0')}::${primaryWall.id}`
    : '';
  const statusSalvo = medicoesMap?.[guidAtual];

  return (
    <div className="dwg-medicao-layout">
      {/* Barra Superior dos 14 Andares Tipos */}
      <div className="dwg-top-floors-bar">
        <button type="button" className="btn-back-3d" onClick={onVoltar3D}>
          ← Voltar ao Prédio 3D
        </button>

        <div className="tipo-pills-scroll">
          {Array.from({ length: 14 }, (_, i) => i + 1).map((num) => {
            const isSel = Number(andarTipo) === num;
            return (
              <button
                key={num}
                type="button"
                className={`tipo-pill-btn ${isSel ? 'active' : ''}`}
                onClick={() => onChangeAndarTipo(num)}
              >
                TIPO {String(num).padStart(2, '0')}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid Principal: Planta DWG à Esquerda/Centro + Painel de Medição à Direita */}
      <div className="dwg-workspace-split">
        {/* Visualizador CAD 2D Interativo (`app medição.dwg`) */}
        <div className="dwg-canvas-panel">
          {/* Barra de Ferramentas do Visualizador CAD */}
          <div className="dwg-toolbar">
            <div className="toolbar-group">
              <label>Layer (Espessura Tijolo):</label>
              <select
                value={filtroLayer}
                onChange={(e) => setFiltroLayer(e.target.value)}
              >
                <option value="TODAS">Todas as Layers (137 paredes)</option>
                {Object.entries(dwgData?.layers || {}).map(([layerName, info]) => (
                  <option key={layerName} value={layerName}>
                    {layerName} ({info.label})
                  </option>
                ))}
              </select>
            </div>

            <div className="toolbar-group">
              <label>Colorir Planta por:</label>
              <select value={modoCor} onChange={(e) => setModoCor(e.target.value)}>
                <option value="levantamento">Status do Levantamento (m²)</option>
                <option value="fiada">Status da 1ª Fiada (m linear)</option>
                <option value="layer">Cores das Layers do AutoCAD</option>
              </select>
            </div>

            <label className="checkbox-inline-pill">
              <input
                type="checkbox"
                checked={mostrarLinhasMedicao}
                onChange={(e) => setMostrarLinhasMedicao(e.target.checked)}
              />
              <span>📏 Linha Vermelha Escura (Sem Duplicar Canto)</span>
            </label>

            <label className="checkbox-inline-pill">
              <input
                type="checkbox"
                checked={mostrarEstruturalOverlay}
                onChange={(e) => setMostrarEstruturalOverlay(e.target.checked)}
              />
              <span>🟪 Vigas + 368 Cubetas (IFC Estrutural)</span>
            </label>

            <label className="checkbox-inline-pill">
              <input
                type="checkbox"
                checked={multiSelectMode}
                onChange={(e) => setMultiSelectMode(e.target.checked)}
              />
              <span>☑️ Seleção em Lote ({selectedWallIds.length})</span>
            </label>

            <button
              type="button"
              className="btn-toolbar-sm"
              onClick={handleSelectAllFiltered}
            >
              Selecionar Filtro
            </button>

            <div className="zoom-controls">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(4.5, +(z + 0.35).toFixed(2)))}
                title="Aumentar Zoom"
              >
                ➕
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(1.0);
                  setPan({ x: 0, y: 0 });
                }}
                title="Centralizar Planta"
              >
                100%
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.35).toFixed(2)))}
                title="Reduzir Zoom"
              >
                ➖
              </button>
            </div>
          </div>

          {/* Canvas Vetorial SVG do `app medição.dwg` */}
          <div
            className="dwg-svg-viewport"
            onPointerDown={handlePointerDownCanvas}
            onPointerMove={handlePointerMoveCanvas}
            onPointerUp={handlePointerUpCanvas}
            onWheel={(e) => {
              const delta = e.deltaY < 0 ? 0.18 : -0.18;
              setZoom((z) => Math.min(5, Math.max(0.6, +(z + delta).toFixed(2))));
            }}
          >
            <svg
              viewBox={`0 0 ${vbWidth} ${vbHeight}`}
              className="dwg-svg-element"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              }}
            >
              {/* 1. Perímetro Estrutural e Pilares de Referência (igual ao AutoCAD) */}
              {(dwgData?.structuralPolylines || []).map((poly, idx) => {
                const pts = poly.vertices
                  .map((v) => `${toSvgX(v.x)},${toSvgY(v.y)}`)
                  .join(' ');
                const isPilar = poly.layer.toLowerCase().includes('pilar');
                return (
                  <polygon
                    key={`str-${idx}`}
                    points={pts}
                    fill={isPilar ? 'rgba(249, 115, 22, 0.22)' : 'none'}
                    stroke={isPilar ? '#fb923c' : '#a855f7'}
                    strokeWidth={isPilar ? 2.4 : 1.8}
                    opacity={0.75}
                  />
                );
              })}

              {/* 1b. Overlay do IFC Estrutural TQS: 368 Cubetas Atex 800 + 65 Vigas (V701..V718 / Vborda) */}
              {mostrarEstruturalOverlay && dwgData?.structuralIfc && (
                <g className="structural-ifc-overlay" style={{ pointerEvents: 'none' }}>
                  {(dwgData.structuralIfc.cubetas || []).map((c, idx) => (
                    <rect
                      key={`cub-${idx}`}
                      x={toSvgX(c.minX)}
                      y={toSvgY(c.maxY)}
                      width={Math.max(1, c.maxX - c.minX)}
                      height={Math.max(1, c.maxY - c.minY)}
                      fill="rgba(168, 85, 247, 0.08)"
                      stroke="rgba(168, 85, 247, 0.28)"
                      strokeWidth="0.9"
                      strokeDasharray="3 2"
                    />
                  ))}
                  {(dwgData.structuralIfc.beams || []).map((b, idx) => {
                    const pts = (b.poly || [])
                      .map(([px, py]) => `${toSvgX(px)},${toSvgY(py)}`)
                      .join(' ');
                    return (
                      <polygon
                        key={`beam-${idx}`}
                        points={pts}
                        fill="rgba(56, 189, 248, 0.10)"
                        stroke="rgba(56, 189, 248, 0.42)"
                        strokeWidth="1.2"
                      />
                    );
                  })}
                </g>
              )}

              {/* 2. Os 137 Pedaços de Parede Clicáveis */}
              {walls.map((w) => {
                const isFilteredOut =
                  filtroLayer !== 'TODAS' && w.layer !== filtroLayer;
                const isSelected = selectedWallIds.includes(w.id);
                const guid = `TIPO-${String(andarTipo).padStart(2, '0')}::${w.id}`;
                const saved = medicoesMap?.[guid];

                let fillColor = 'rgba(203, 213, 225, 0.25)';
                let strokeColor = w.corLayer || '#eab308';

                if (modoCor === 'levantamento') {
                  if (saved?.status === 'Finalizada') {
                    fillColor = 'rgba(16, 185, 129, 0.65)';
                    strokeColor = '#10b981';
                  } else if (saved?.status === 'Reparo') {
                    fillColor = 'rgba(239, 68, 68, 0.72)';
                    strokeColor = '#ef4444';
                  } else if (saved?.fiada_status === 'Finalizada') {
                    fillColor = 'rgba(245, 158, 11, 0.5)';
                    strokeColor = '#f59e0b';
                  }
                } else if (modoCor === 'fiada') {
                  if (saved?.fiada_status === 'Finalizada') {
                    fillColor = 'rgba(56, 189, 248, 0.68)';
                    strokeColor = '#38bdf8';
                  } else if (saved?.fiada_status === 'Reparo') {
                    fillColor = 'rgba(239, 68, 68, 0.72)';
                    strokeColor = '#ef4444';
                  }
                } else {
                  fillColor = `${w.corLayer}44`;
                  strokeColor = w.corLayer;
                }

                if (isSelected) {
                  fillColor = 'rgba(56, 189, 248, 0.85)';
                  strokeColor = '#ffffff';
                }

                const pts = w.polygon
                  .map((p) => `${toSvgX(p.x)},${toSvgY(p.y)}`)
                  .join(' ');

                // Linha Vermelha Escura de Medição (indica exatamente a face que está sendo medida, descontando cantos duplicados!)
                const activeCornerMode =
                  isSelected && selectedWallIds.length === 1
                    ? modoCanto
                    : saved?.modo_canto || 'padrao_sem_duplicar';

                const linhaMed =
                  activeCornerMode === 'padrao_sem_duplicar'
                    ? w.linhaMedicaoPadrao
                    : w.linhaMedicaoAlternativa || w.linhaMedicaoPadrao;

                const compExibido =
                  saved?.comprimento_m !== undefined
                    ? saved.comprimento_m
                    : w.comprimentoM;

                return (
                  <g
                    key={w.id}
                    className={`dwg-wall-group ${isFilteredOut ? 'dimmed' : ''}`}
                    onClick={(e) => handleWallClick(w.id, e)}
                  >
                    {/* Área clicável expandida para facilitar toque no celular/tablet */}
                    <polygon
                      points={pts}
                      fill="transparent"
                      stroke="transparent"
                      strokeWidth="18"
                    />

                    {/* Geometria real da parede (2 linhas paralelas + espessura do tijolo) */}
                    <polygon
                      points={pts}
                      fill={fillColor}
                      stroke={strokeColor}
                      strokeWidth={isSelected ? 3.2 : 1.8}
                    />

                    {/* Linha Vermelha Escura de Medição (como no exemplo do usuário) */}
                    {mostrarLinhasMedicao && !isFilteredOut && linhaMed && (
                      <line
                        x1={toSvgX(linhaMed.x1)}
                        y1={toSvgY(linhaMed.y1)}
                        x2={toSvgX(linhaMed.x2)}
                        y2={toSvgY(linhaMed.y2)}
                        stroke={isSelected ? '#ff1e1e' : '#b91c1c'}
                        strokeWidth={isSelected ? 4.2 : 2.6}
                        strokeLinecap="round"
                      />
                    )}

                    {/* Rótulo de comprimento / código da parede */}
                    {(mostrarCodigos || isSelected) && !isFilteredOut && (
                      <text
                        x={toSvgX(w.center.x)}
                        y={toSvgY(w.center.y)}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={isSelected ? '#ffffff' : '#e2e8f0'}
                        fontSize={isSelected ? '13' : '9.5'}
                        fontWeight="700"
                        className="dwg-wall-label"
                      >
                        {w.id} ({compExibido}m)
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Legenda rápida sobre o desenho DWG */}
            <div className="dwg-overlay-badge">
              <span>
                <strong>TIPO {String(andarTipo).padStart(2, '0')}</strong> • Linha{' '}
                <strong style={{ color: '#ef4444' }}>Vermelha Escura</strong> = Face exata de
                medição (canto sem duplicidade)
              </span>
            </div>
          </div>
        </div>

        {/* Painel Direito: Inspetor de Medição da Parede, Altura na Laje, Canto e Pedreiros */}
        <aside className="dwg-inspector-panel">
          {!primaryWall ? (
            <div className="empty-inspector-card">
              <h3>Toque ou clique em um pedaço de parede na planta DWG</h3>
            </div>
          ) : (
            <div className="dwg-inspector-content">
              <div className="dwg-wall-header-box">
                <div>
                  <span className="wall-floor-tag">
                    TIPO {String(andarTipo).padStart(2, '0')} • Layer: {primaryWall.layer}
                  </span>
                  <h3>
                    {selectedWallIds.length > 1
                      ? `${selectedWallIds.length} Paredes Selecionadas em Lote`
                      : `Parede ${primaryWall.id} (${primaryWall.layerLabel})`}
                  </h3>
                </div>
                <code className="wall-guid-pill">{guidAtual}</code>
              </div>

              {/* 1. Cuidado com o Canto (Não contar encontro duas vezes) e Altura na Laje / Estrutural */}
              <div className="inspector-section-box">
                <h4>📏 1. Geometria, Canto e Altura pelo 3D Estrutural</h4>

                {selectedWallIds.length === 1 && primaryWall.estruturaAcima && (
                  <div
                    style={{
                      background: 'rgba(168, 85, 247, 0.14)',
                      border: '1px solid rgba(168, 85, 247, 0.4)',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      marginBottom: '10px',
                      fontSize: '0.82rem',
                    }}
                  >
                    <div style={{ color: '#e9d5ff', fontWeight: 700, marginBottom: '4px' }}>
                      🏗️ Estrutura Acima (`New Life Studios 2025-02-06.IFC`):
                    </div>
                    <div style={{ color: '#f8fafc', fontWeight: 600 }}>
                      {primaryWall.estruturaAcima}
                    </div>
                    {primaryWall.qtdCubetasAcima > 0 && (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                        <button
                          type="button"
                          className={`chip-height ${Number(alturaInput) === 3.1 ? 'active' : ''}`}
                          onClick={() => setAlturaInput(3.1)}
                        >
                          🟪 Dentro da Cubeta até Capa: 3,10m
                        </button>
                        <button
                          type="button"
                          className={`chip-height ${Number(alturaInput) === primaryWall.alturaComCubetaExataM ? 'active' : ''}`}
                          onClick={() => setAlturaInput(primaryWall.alturaComCubetaExataM)}
                        >
                          📐 Descontar Nervuras 12,5cm: {primaryWall.alturaComCubetaExataM}m
                        </button>
                        <button
                          type="button"
                          className={`chip-height ${Number(alturaInput) === 2.85 ? 'active' : ''}`}
                          onClick={() => setAlturaInput(2.85)}
                        >
                          🧱 Fundo da Nervura: 2,85m
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {selectedWallIds.length === 1 && (
                  <div className="corner-rule-selector">
                    <label>Regra do Encontro / Canto desta Parede:</label>
                    <div className="corner-btns-grid">
                      <button
                        type="button"
                        className={modoCanto === 'padrao_sem_duplicar' ? 'active' : ''}
                        onClick={() => handleSelectModoCanto('padrao_sem_duplicar')}
                      >
                        ✓ Sem Duplicar Canto ({primaryWall.comprimentoM}m)
                      </button>
                      <button
                        type="button"
                        className={modoCanto === 'face_externa' ? 'active' : ''}
                        onClick={() => handleSelectModoCanto('face_externa')}
                      >
                        Face Maior / Com Canto ({primaryWall.comprimentoBrutoM}m)
                      </button>
                      <button
                        type="button"
                        className={modoCanto === 'face_interna' ? 'active' : ''}
                        onClick={() => handleSelectModoCanto('face_interna')}
                      >
                        Face Interna / Sem Canto ({primaryWall.comprimentoInternoM}m)
                      </button>
                    </div>
                    {primaryWall.descontouCantoCm > 0 &&
                      modoCanto === 'padrao_sem_duplicar' && (
                        <small className="corner-note-ok">
                          🛡️ Canto descontado automaticamente (-{primaryWall.descontouCantoCm} cm)
                          para não contar duas vezes com a parede perpendicular!
                        </small>
                      )}
                  </div>
                )}

                <div className="dims-inputs-row">
                  <div className="form-group">
                    <label>Comprimento Medido (m linear)</label>
                    <input
                      type="number"
                      step="0.005"
                      value={comprimentoInput}
                      disabled={selectedWallIds.length > 1}
                      onChange={(e) => {
                        setModoCanto('manual');
                        setComprimentoInput(e.target.value);
                      }}
                    />
                  </div>

                  <div className="form-group">
                    <label>Altura na Laje / Viga / Cubeta (m)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={alturaInput}
                      onChange={(e) => setAlturaInput(e.target.value)}
                    />
                  </div>
                </div>

                {/* Botões rápidos de altura sob laje/viga/cubeta */}
                <div className="quick-heights-row">
                  <span>Alturas estruturais:</span>
                  {[2.45, 2.65, 2.75, 2.85, 3.0, 3.1].map((h) => (
                    <button
                      key={h}
                      type="button"
                      className={`chip-height ${Number(alturaInput) === h ? 'active' : ''}`}
                      onClick={() => setAlturaInput(h)}
                    >
                      {h.toFixed(2)}m
                    </button>
                  ))}
                </div>

                <label className="checkbox-apply-all">
                  <input
                    type="checkbox"
                    checked={aplicarAlturaNos14Tipos}
                    onChange={(e) => setAplicarAlturaNos14Tipos(e.target.checked)}
                  />
                  <span>
                    Fixar esta altura ({alturaInput}m) para esta parede nos 14 Andares Tipos
                  </span>
                </label>

                {/* Vão de Porta opcional */}
                <div className="vao-porta-row">
                  <label className="checkbox-apply-all">
                    <input
                      type="checkbox"
                      checked={descontarVaoParede}
                      onChange={(e) => setDescontarVaoParede(e.target.checked)}
                    />
                    <span>
                      Descontar vão de porta/janela (Regra: acima de{' '}
                      {configuracoes?.limite_vao_m2 || 2.0} m²)
                    </span>
                  </label>
                  {descontarVaoParede && (
                    <div className="form-group" style={{ marginTop: '6px' }}>
                      <label>Área do Vão nesta parede (m²):</label>
                      <input
                        type="number"
                        step="0.05"
                        value={areaVaoInput}
                        onChange={(e) => setAreaVaoInput(e.target.value)}
                        placeholder="Ex: 1.68 (porta 0.80x2.10) ou 2.50"
                      />
                    </div>
                  )}
                </div>

                {/* Resumo Matemático da Parede */}
                <div className="calc-preview-banner">
                  <div>
                    <span>1ª Fiada (Metro Linear):</span>
                    <strong>
                      {calculoPreview.comp.toFixed(2)} m × R$ {precoFiada.toFixed(2)} = R${' '}
                      {calculoPreview.valorFiada.toFixed(2)}
                    </strong>
                  </div>
                  <div>
                    <span>Área Alvenaria ({calculoPreview.comp.toFixed(2)}m × {calculoPreview.alt.toFixed(2)}m):</span>
                    <strong>
                      {calculoPreview.areaLiquida.toFixed(2)} m² × R$ {precoLev.toFixed(2)} = R${' '}
                      {calculoPreview.valorLev.toFixed(2)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* 2. Produção da 1ª Fiada (R$ 10 / metro linear) */}
              <div className="inspector-section-box fiada-box">
                <div className="box-title-flex">
                  <h4>🧱 2. Produção da 1ª Fiada (R$ {precoFiada}/m linear)</h4>
                  <span className={`status-pill ${(statusSalvo?.fiada_status || 'Pendente').toLowerCase()}`}>
                    {statusSalvo?.fiada_status || 'Pendente'}
                  </span>
                </div>

                <div className="dims-inputs-row">
                  <div className="form-group">
                    <label>Pedreiro da 1ª Fiada</label>
                    <select
                      value={fiadaPedreiroId}
                      onChange={(e) => setFiadaPedreiroId(e.target.value)}
                    >
                      <option value="">-- Selecione o Pedreiro --</option>
                      {pedreiros.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Data (Mês/Ano)</label>
                    <input
                      type="date"
                      value={fiadaData}
                      onChange={(e) => setFiadaData(e.target.value)}
                    />
                  </div>
                </div>

                <div className="status-btns-3">
                  <button
                    type="button"
                    disabled={saving}
                    className="btn-act fiada-ok"
                    onClick={() => dispararSalvamento({ fiada_status: 'Finalizada' })}
                  >
                    ✓ Marcar 1ª Fiada Pronta
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    className="btn-act reparo"
                    onClick={() => dispararSalvamento({ fiada_status: 'Reparo' })}
                  >
                    ⚠ Reparo
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    className="btn-act pendente"
                    onClick={() => dispararSalvamento({ fiada_status: 'Pendente' })}
                  >
                    Limpar
                  </button>
                </div>
              </div>

              {/* 3. Produção do Levantamento de Alvenaria (R$ 16 / m²) */}
              <div className="inspector-section-box lev-box">
                <div className="box-title-flex">
                  <h4>🏗️ 3. Levantamento da Parede (R$ {precoLev}/m²)</h4>
                  <span className={`status-pill ${(statusSalvo?.status || 'Pendente').toLowerCase()}`}>
                    {statusSalvo?.status || 'Pendente'}
                  </span>
                </div>

                <div className="dims-inputs-row">
                  <div className="form-group">
                    <label>Pedreiro do Levantamento</label>
                    <select
                      value={levPedreiroId}
                      onChange={(e) => setLevPedreiroId(e.target.value)}
                    >
                      <option value="">-- Selecione o Pedreiro --</option>
                      {pedreiros.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Data (Mês/Ano)</label>
                    <input
                      type="date"
                      value={levData}
                      onChange={(e) => setLevData(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Observação (Prumo, Esquadro, Encunhamento)</label>
                  <input
                    type="text"
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="Opcional..."
                  />
                </div>

                <label className="checkbox-apply-all highlight-replicate">
                  <input
                    type="checkbox"
                    checked={replicarTodos14Tipos}
                    onChange={(e) => setReplicarTodos14Tipos(e.target.checked)}
                  />
                  <span>
                    🔁 Replicar este lançamento em TODOS os 14 Andares Tipos de uma vez
                  </span>
                </label>

                <div className="status-btns-3">
                  <button
                    type="button"
                    disabled={saving}
                    className="btn-act lev-ok"
                    onClick={() => dispararSalvamento({ status: 'Finalizada' })}
                  >
                    ✓ Finalizada (R$ {precoLev}/m²)
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    className="btn-act reparo"
                    onClick={() => dispararSalvamento({ status: 'Reparo' })}
                  >
                    ⚠ Marcar Reparo
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    className="btn-act pendente"
                    onClick={() => dispararSalvamento({ status: 'Pendente' })}
                  >
                    Limpar
                  </button>
                </div>
              </div>

              {/* Botão rápido para cadastrar novo pedreiro sem sair da planta DWG */}
              <div className="quick-pedreiro-box">
                {!showAddPedreiro ? (
                  <button
                    type="button"
                    className="btn-link-new-pedreiro"
                    onClick={() => setShowAddPedreiro(true)}
                  >
                    + Cadastrar Novo Pedreiro Rapidamente
                  </button>
                ) : (
                  <div className="inline-new-pedreiro">
                    <input
                      type="text"
                      placeholder="Nome do pedreiro..."
                      value={novoPedreiroNome}
                      onChange={(e) => setNovoPedreiroNome(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (!novoPedreiroNome.trim()) return;
                        const res = await onAddPedreiro({
                          nome: novoPedreiroNome.trim(),
                          especialidade: 'Ambos',
                          dias_trabalhados_mes: 22,
                        });
                        if (res?.pedreiro?.id) {
                          setFiadaPedreiroId(String(res.pedreiro.id));
                          setLevPedreiroId(String(res.pedreiro.id));
                        }
                        setNovoPedreiroNome('');
                        setShowAddPedreiro(false);
                      }}
                    >
                      Salvar
                    </button>
                    <button type="button" onClick={() => setShowAddPedreiro(false)}>
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {feedback && <div className="feedback-alert">{feedback}</div>}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
