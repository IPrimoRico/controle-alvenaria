import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { IFCLoader } from 'web-ifc-three/IFCLoader';

export default function Predio3DAndares({
  dwgData,
  medicoesMap,
  configuracoes,
  onSelectAndarTipo,
}) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const floorHitBoxesRef = useRef([]);
  const wallMeshesByGuidRef = useRef({});
  const hoveredFloorRef = useRef(null);

  const [hoveredAndarInfo, setHoveredAndarInfo] = useState(null);
  const [loadingRawIfc, setLoadingRawIfc] = useState(false);
  const [rawIfcLoaded, setRawIfcLoaded] = useState(false);

  const totalParedesPorTipo = dwgData?.wallPieces?.length || 137;
  const precoLev = Number(configuracoes?.preco_m2_levantamento) || 16.0;
  const precoFiada = Number(configuracoes?.preco_m_primeira_fiada) || 10.0;

  // Calcula o avanço individual de cada um dos 14 Andares Tipos
  const resumo14Tipos = useMemo(() => {
    const lista = [];
    const storeysIfc = dwgData?.ifcStoreys || [];

    for (let tipo = 1; tipo <= 14; tipo++) {
      const nome = `TIPO ${String(tipo).padStart(2, '0')}`;
      const ifcStorey = storeysIfc.find((s) => s.numeroTipo === tipo);
      const elevacao = ifcStorey ? ifcStorey.elevation : 18.6 + tipo * 3.15;

      let fiadaCount = 0;
      let fiadaMetros = 0;
      let fiadaRs = 0;
      let levCount = 0;
      let levM2 = 0;
      let levRs = 0;
      let reparoCount = 0;

      for (const wp of dwgData?.wallPieces || []) {
        const guid = `TIPO-${String(tipo).padStart(2, '0')}::${wp.id}`;
        const m = medicoesMap?.[guid];
        if (!m) continue;

        if (m.fiada_status === 'Finalizada') {
          fiadaCount += 1;
          fiadaMetros += Number(m.comprimento_m) || wp.comprimentoM;
          fiadaRs +=
            Number(m.fiada_valor_rs) ||
            (Number(m.comprimento_m) || wp.comprimentoM) * precoFiada;
        }
        if (m.status === 'Finalizada') {
          levCount += 1;
          levM2 += Number(m.area_liquida_m2) || 0;
          levRs += Number(m.levantamento_valor_rs) || 0;
        }
        if (m.status === 'Reparo' || m.fiada_status === 'Reparo') {
          reparoCount += 1;
        }
      }

      const pctLev = Math.min(100, Math.round((levCount / totalParedesPorTipo) * 100));
      const pctFiada = Math.min(100, Math.round((fiadaCount / totalParedesPorTipo) * 100));

      lista.push({
        andarTipo: tipo,
        nome,
        guidIfc: ifcStorey?.guid || `IFC-TIPO-${tipo}`,
        elevacao,
        fiadaCount,
        fiadaMetros,
        fiadaRs,
        levCount,
        levM2,
        levRs,
        reparoCount,
        pctLev,
        pctFiada,
      });
    }
    return lista;
  }, [dwgData, medicoesMap, totalParedesPorTipo, precoLev, precoFiada]);

  // Constrói o modelo 3D completo do Edifício NEW LIFE (25 níveis do IFC + 14 Andares Tipos clicáveis com as paredes do DWG)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !dwgData) return;

    const width = container.clientWidth || 900;
    const height = container.clientHeight || 420;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0b1120');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 1500);
    camera.position.set(52, 55, 68);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, 36, 0);
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.78));
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight1.position.set(70, 120, 80);
    scene.add(dirLight1);
    const dirLight2 = new THREE.DirectionalLight(0x60a5fa, 0.4);
    dirLight2.position.set(-70, 50, -60);
    scene.add(dirLight2);

    const grid = new THREE.GridHelper(80, 40, 0x334155, 0x1e293b);
    grid.position.y = -2.8;
    scene.add(grid);

    const buildingGroup = new THREE.Group();
    scene.add(buildingGroup);

    const bounds = dwgData.bounds;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const scaleCmToM = 0.01;
    const slabW = bounds.width * scaleCmToM + 0.8;
    const slabD = bounds.height * scaleCmToM + 0.8;

    floorHitBoxesRef.current = [];
    wallMeshesByGuidRef.current = {};

    // 1. Níveis de Embasamento e Cobertura do arquivo NEW LIFE_05072024.ifc
    const baseStoreys = (dwgData.ifcStoreys || []).filter((s) => !s.isTipo);
    const baseSlabMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.8,
      metalness: 0.15,
      transparent: true,
      opacity: 0.55,
    });

    for (const st of baseStoreys) {
      const isPodium = st.elevation < 20;
      const w = isPodium ? slabW * 1.25 : slabW * 0.55;
      const d = isPodium ? slabD * 1.2 : slabD * 0.55;
      const slabMesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.25, d),
        baseSlabMat
      );
      slabMesh.position.set(0, st.elevation, 0);
      buildingGroup.add(slabMesh);
    }

    // 2. Os 14 Andares Tipos (TIPO 01 a TIPO 14) com as 137 paredes reais do DWG extrudadas em 3D!
    for (let tipo = 1; tipo <= 14; tipo++) {
      const stInfo = resumo14Tipos.find((r) => r.andarTipo === tipo);
      const yBase = stInfo ? stInfo.elevacao : 18.6 + tipo * 3.15;
      const floorGroup = new THREE.Group();
      floorGroup.position.y = yBase;

      // Laje do Pavimento Tipo (Hitbox clicável para abrir o DWG daquele pavimento)
      const slabGeo = new THREE.BoxGeometry(slabW, 0.22, slabD);
      const slabMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.7,
        metalness: 0.1,
        transparent: true,
        opacity: 0.78,
      });
      const slabMesh = new THREE.Mesh(slabGeo, slabMat);
      slabMesh.userData = {
        isFloorHitBox: true,
        andarTipo: tipo,
        nome: `TIPO ${String(tipo).padStart(2, '0')}`,
      };
      floorGroup.add(slabMesh);
      floorHitBoxesRef.current.push(slabMesh);

      // Hitbox invisível envolvendo o volume do pavimento para facilitar o clique em qualquer parte do andar no 3D
      const volGeo = new THREE.BoxGeometry(slabW + 0.5, 2.9, slabD + 0.5);
      const volMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
      });
      const volMesh = new THREE.Mesh(volGeo, volMat);
      volMesh.position.y = 1.45;
      volMesh.userData = {
        isFloorHitBox: true,
        andarTipo: tipo,
        nome: `TIPO ${String(tipo).padStart(2, '0')}`,
        slabMesh,
      };
      floorGroup.add(volMesh);
      floorHitBoxesRef.current.push(volMesh);

      // Paredes do DWG extrudadas em 3D neste pavimento
      const wallHeight = 2.65;
      for (const wp of dwgData.wallPieces) {
        const guid = `TIPO-${String(tipo).padStart(2, '0')}::${wp.id}`;
        const minX = Math.min(...wp.polygon.map((p) => p.x));
        const maxX = Math.max(...wp.polygon.map((p) => p.x));
        const minY = Math.min(...wp.polygon.map((p) => p.y));
        const maxY = Math.max(...wp.polygon.map((p) => p.y));

        const wM = Math.max(0.09, (maxX - minX) * scaleCmToM);
        const dM = Math.max(0.09, (maxY - minY) * scaleCmToM);
        const cxM = ((minX + maxX) / 2 - centerX) * scaleCmToM;
        const czM = -((minY + maxY) / 2 - centerY) * scaleCmToM;

        const wGeo = new THREE.BoxGeometry(wM, wallHeight, dM);
        const wMat = new THREE.MeshStandardMaterial({
          color: 0xcbd5e1,
          roughness: 0.55,
        });
        const wMesh = new THREE.Mesh(wGeo, wMat);
        wMesh.position.set(cxM, 0.11 + wallHeight / 2, czM);
        wMesh.userData = {
          isFloorHitBox: true,
          andarTipo: tipo,
          nome: `TIPO ${String(tipo).padStart(2, '0')}`,
          slabMesh,
        };
        floorGroup.add(wMesh);
        wallMeshesByGuidRef.current[guid] = wMesh;
      }

      buildingGroup.add(floorGroup);
    }

    update3DWallColors();

    // Raycaster para clique ou hover num pavimento 3D
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let downPos = { x: 0, y: 0 };

    const onPointerDown = (e) => {
      downPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const hits = raycaster.intersectObjects(floorHitBoxesRef.current, false);
      if (hits.length > 0) {
        const hitObj = hits[0].object;
        const tipo = hitObj.userData.andarTipo;
        renderer.domElement.style.cursor = 'pointer';

        if (hoveredFloorRef.current !== tipo) {
          hoveredFloorRef.current = tipo;
          setHoveredAndarInfo(tipo);
          floorHitBoxesRef.current.forEach((hb) => {
            if (hb.geometry.parameters.height < 0.5) {
              if (hb.userData.andarTipo === tipo) {
                hb.material.color.setHex(0x38bdf8);
                hb.material.opacity = 0.95;
              } else {
                hb.material.color.setHex(0x475569);
                hb.material.opacity = 0.78;
              }
            }
          });
        }
      } else {
        renderer.domElement.style.cursor = 'grab';
        if (hoveredFloorRef.current !== null) {
          hoveredFloorRef.current = null;
          setHoveredAndarInfo(null);
          floorHitBoxesRef.current.forEach((hb) => {
            if (hb.geometry.parameters.height < 0.5) {
              hb.material.color.setHex(0x475569);
              hb.material.opacity = 0.78;
            }
          });
        }
      }
    };

    const onPointerUp = (e) => {
      const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      if (dist > 6) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const hits = raycaster.intersectObjects(floorHitBoxesRef.current, false);
      if (hits.length > 0) {
        const andarTipo = hits[0].object.userData.andarTipo;
        if (andarTipo) {
          onSelectAndarTipo(andarTipo);
        }
      }
    };

    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointermove', onPointerMove);
    dom.addEventListener('pointerup', onPointerUp);

    const onResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    let reqId;
    const animate = () => {
      reqId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(reqId);
      window.removeEventListener('resize', onResize);
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointermove', onPointerMove);
      dom.removeEventListener('pointerup', onPointerUp);
      renderer.dispose();
    };
  }, [dwgData]);

  // Atualiza cores das paredes 3D nos 14 andares tipos sempre que medicoesMap mudar
  useEffect(() => {
    update3DWallColors();
  }, [medicoesMap]);

  function update3DWallColors() {
    const mapMeshes = wallMeshesByGuidRef.current || {};
    Object.entries(mapMeshes).forEach(([guid, mesh]) => {
      const m = medicoesMap?.[guid];
      if (!m) {
        mesh.material.color.setHex(0xcbd5e1);
      } else if (m.status === 'Finalizada') {
        mesh.material.color.setHex(0x10b981); // Verde
      } else if (m.status === 'Reparo' || m.fiada_status === 'Reparo') {
        mesh.material.color.setHex(0xef4444); // Vermelho
      } else if (m.fiada_status === 'Finalizada') {
        mesh.material.color.setHex(0xf59e0b); // Âmbar (1ª Fiada pronta)
      } else {
        mesh.material.color.setHex(0xcbd5e1);
      }
    });
  }

  // Opcional: Carrega também a malha IFC bruta completa de 64MB via IFC.js se o usuário clicar
  const handleLoadRawIfc = () => {
    if (!sceneRef.current || loadingRawIfc || rawIfcLoaded) return;
    setLoadingRawIfc(true);
    const ifcLoader = new IFCLoader();
    try {
      ifcLoader.ifcManager.setWasmPath('https://unpkg.com/web-ifc@0.0.36/');
    } catch {
      // ignore
    }
    ifcLoader.load(
      '/api/arquivos/new-life.ifc',
      (ifcModel) => {
        ifcModel.position.set(28, 0, 0);
        sceneRef.current.add(ifcModel);
        setLoadingRawIfc(false);
        setRawIfcLoaded(true);
      },
      undefined,
      () => {
        setLoadingRawIfc(false);
      }
    );
  };

  const hoveredStats = hoveredAndarInfo
    ? resumo14Tipos.find((r) => r.andarTipo === hoveredAndarInfo)
    : null;

  return (
    <div className="tab-3d-andares-container">
      {/* Parte Superior: Visualizador 3D do Edifício NEW LIFE */}
      <div className="building-3d-card">
        <div className="building-3d-header">
          <div>
            <h2>🏢 Modelo 3D do Edifício NEW LIFE (`NEW LIFE_05072024.ifc`)</h2>
            <p>
              Clique diretamente em qualquer <strong>Pavimento Tipo (01 a 14) no 3D</strong> ou na{' '}
              <strong>tabela abaixo</strong> para abrir a planta `.DWG` de medição daquele andar
            </p>
          </div>

          <div className="building-3d-actions">
            {!rawIfcLoaded && (
              <button
                type="button"
                className="btn-load-raw-ifc"
                disabled={loadingRawIfc}
                onClick={handleLoadRawIfc}
              >
                {loadingRawIfc
                  ? '⏳ Carregando NEW LIFE_05072024.ifc (64 MB)...'
                  : '📦 Anexar Malha IFC Completa (64 MB)'}
              </button>
            )}
          </div>
        </div>

        <div className="building-3d-canvas-wrap">
          <div ref={containerRef} className="building-3d-canvas" />

          {hoveredStats && (
            <div className="floating-floor-tooltip">
              <strong>{hoveredStats.nome}</strong>
              <span>Cota IFC: +{hoveredStats.elevacao}m</span>
              <span>
                1ª Fiada: {hoveredStats.fiadaCount}/{totalParedesPorTipo} ({hoveredStats.pctFiada}%)
              </span>
              <span>
                Alvenaria: {hoveredStats.levCount}/{totalParedesPorTipo} ({hoveredStats.pctLev}%)
              </span>
              <em className="click-cta">🖱️ Clique para abrir a medição DWG deste andar</em>
            </div>
          )}

          <div className="viewer-legend">
            <div className="legend-item">
              <span className="legend-dot finalizada" />
              <span>Levantamento Finalizado</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot fiada" />
              <span>1ª Fiada Concluída</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot reparo" />
              <span>Em Reparo</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot pendente" />
              <span>Pendente</span>
            </div>
          </div>
        </div>
      </div>

      {/* Parte Inferior: Tabela dos 14 Andares Tipos para Escolha e Acompanhamento de Avanço */}
      <div className="floors-table-card">
        <div className="section-title-row">
          <div>
            <h2>📋 Tabela dos 14 Andares Tipos — Escolha o Pavimento para Medição (`.DWG`)</h2>
            <p className="section-subtitle">
              O projeto `.DWG` (`app medição.dwg`) foi multiplicado pelos 14 andares tipos com controle de avanço e pedreiros independente por andar
            </p>
          </div>
        </div>

        <div className="table-responsive-wrap">
          <table className="floors-selection-table">
            <thead>
              <tr>
                <th>Pavimento Tipo</th>
                <th>Cota 3D (IFC)</th>
                <th>1ª Fiada (R$ {precoFiada}/m)</th>
                <th>Levantamento (R$ {precoLev}/m²)</th>
                <th>Reparos</th>
                <th>Progresso do Andar</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {resumo14Tipos.map((row) => (
                <tr
                  key={row.andarTipo}
                  className="clickable-floor-row"
                  onClick={() => onSelectAndarTipo(row.andarTipo)}
                >
                  <td>
                    <strong className="floor-name-badge">{row.nome}</strong>
                  </td>
                  <td>+{row.elevacao.toFixed(2)} m</td>
                  <td>
                    <div className="prod-cell">
                      <strong>
                        {row.fiadaMetros.toFixed(2)} m ({row.fiadaCount}/{totalParedesPorTipo})
                      </strong>
                      <span>
                        R$ {row.fiadaRs.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="prod-cell">
                      <strong>
                        {row.levM2.toFixed(2)} m² ({row.levCount}/{totalParedesPorTipo})
                      </strong>
                      <span>
                        R$ {row.levRs.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </td>
                  <td>
                    {row.reparoCount > 0 ? (
                      <span className="status-tag reparo">⚠ {row.reparoCount}</span>
                    ) : (
                      <span className="text-muted-sm">0</span>
                    )}
                  </td>
                  <td style={{ minWidth: '170px' }}>
                    <div className="floor-table-progress">
                      <div className="progress-labels">
                        <span>Alv: {row.pctLev}%</span>
                        <span>1ªF: {row.pctFiada}%</span>
                      </div>
                      <div className="floor-progress-track">
                        <div
                          className="floor-progress-fill finalizada"
                          style={{ width: `${row.pctLev}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-open-dwg-floor"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectAndarTipo(row.andarTipo);
                      }}
                    >
                      📐 Medir no DWG →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
