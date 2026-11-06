import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

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
  const [mostrarEstrutural3D, setMostrarEstrutural3D] = useState(true);
  const [mostrarCubetas3D, setMostrarCubetas3D] = useState(true);
  const [mostrarGaragensCaixaDagua3D, setMostrarGaragensCaixaDagua3D] = useState(true);
  const [andarIsolado3D, setAndarIsolado3D] = useState('TODOS'); // 'TODOS' ou 1..14

  const totalParedesPorTipo = dwgData?.totalPedaçosParedePorTipo || 100;
  const totalChurrPorTipo = dwgData?.totalChurrasqueirasPorTipo || 5;
  const precoLev = Number(configuracoes?.preco_m2_levantamento) || 16.0;
  const precoFiada = Number(configuracoes?.preco_m_primeira_fiada) || 10.0;
  const structIfc = dwgData?.structuralIfc || null;

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
      let areaTotalPotencialM2 = 0;
      const churrFinalizadasSet = new Set();

      for (const wp of dwgData?.wallPieces || []) {
        const guid = `TIPO-${String(tipo).padStart(2, '0')}::${wp.id}`;
        const m = medicoesMap?.[guid];

        if (wp.isChurrasqueira) {
          if (m?.status === 'Finalizada' && wp.churrasqueiraId) {
            churrFinalizadasSet.add(wp.churrasqueiraId);
          }
          continue;
        }

        const altPadrao =
          tipo === 14
            ? wp.alturaPadraoTipo14M || +(wp.alturaPadraoM + 0.08).toFixed(2)
            : wp.alturaPadraoM || 2.85;
        areaTotalPotencialM2 += wp.comprimentoM * altPadrao;

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
        churrDoneCount: churrFinalizadasSet.size,
        pctLev,
        pctFiada,
        areaTotalPotencialM2: +areaTotalPotencialM2.toFixed(2),
      });
    }
    return lista;
  }, [dwgData, medicoesMap, totalParedesPorTipo, precoLev, precoFiada]);

  // Constrói o modelo 3D integrado: Arquitetônico (NEW LIFE_05072024.ifc) + Estrutural TQS (New Life Studios 2025-02-06.IFC) + Paredes DWG
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !dwgData) return;

    const width = container.clientWidth || 900;
    const height = container.clientHeight || 460;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0b1120');
    sceneRef.current = scene;

    const isIsolated = andarIsolado3D !== 'TODOS';
    const isolatedTipoNum = isIsolated ? Number(andarIsolado3D) : null;
    const targetY = isIsolated
      ? (resumo14Tipos.find((r) => r.andarTipo === isolatedTipoNum)?.elevacao || 25) + 1.5
      : 38;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.3, 1500);
    if (isIsolated) {
      camera.position.set(18, targetY + 8, 22);
    } else {
      camera.position.set(52, 55, 68);
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, targetY, 0);
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight1.position.set(70, 120, 80);
    scene.add(dirLight1);
    const dirLight2 = new THREE.DirectionalLight(0x60a5fa, 0.45);
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
    const slabW = bounds.width * scaleCmToM + 0.4;
    const slabD = bounds.height * scaleCmToM + 0.4;

    floorHitBoxesRef.current = [];
    wallMeshesByGuidRef.current = {};

    // Materiais compartilhados para alta performance em celular/tablet/notebook
    const pilarMat = new THREE.MeshStandardMaterial({
      color: 0xf97316, // Laranja estrutural TQS (Pilares P1..P15)
      roughness: 0.5,
      metalness: 0.2,
    });
    const beamMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8, // Azul estrutural TQS (Vigas V701..V718 / Vborda)
      roughness: 0.45,
      metalness: 0.15,
      transparent: true,
      opacity: isIsolated ? 0.72 : 0.55,
    });
    const cubetaMat = new THREE.MeshStandardMaterial({
      color: 0xa855f7, // Roxo translúcido indicando as cubetas Atex 800 (H=25cm, capa=5cm)
      roughness: 0.4,
      transparent: true,
      opacity: isIsolated ? 0.48 : 0.35,
    });

    // Geometria unitária para InstancedMesh das 368 cubetas por andar e dos 1.176 elementos das Garagens + Caixa d'Água
    const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);

    // 1. Estrutural 3D das Garagens (Térreo 1, Térreo 2, Mezanino, Garagens, Lazer) e da Caixa d'Água / Cobertura (New Life Studios 2025-02-06.IFC)
    if (!isIsolated && mostrarGaragensCaixaDagua3D && structIfc?.garageAndRoofElements?.length > 0) {
      const elems = structIfc.garageAndRoofElements.filter((el) => el.storey !== '1 Tipo');
      const cols = elems.filter((e) => e.kind === 'column');
      const beams = elems.filter((e) => e.kind === 'beam');
      const slabsAndRamps = elems.filter(
        (e) => e.kind === 'slab' || e.kind === 'ramp' || e.kind === 'stair'
      );

      const dummy = new THREE.Object3D();

      const addInstancedGroup = (arr, material, minThickness = 0.12) => {
        if (!arr.length) return;
        const inst = new THREE.InstancedMesh(unitBoxGeo, material, arr.length);
        arr.forEach((el, idx) => {
          const wM = Math.max(minThickness, (el.maxX - el.minX) * scaleCmToM);
          const dM = Math.max(minThickness, (el.maxY - el.minY) * scaleCmToM);
          const hM = Math.max(0.12, Number(el.heightM) || 0.25);
          const cxM = ((el.minX + el.maxX) / 2 - centerX) * scaleCmToM;
          const czM = -((el.minY + el.maxY) / 2 - centerY) * scaleCmToM;
          const cyM = (Number(el.zBottomM) || 0) + hM / 2;
          dummy.position.set(cxM, cyM, czM);
          dummy.scale.set(wM, hM, dM);
          dummy.updateMatrix();
          inst.setMatrixAt(idx, dummy.matrix);
        });
        inst.instanceMatrix.needsUpdate = true;
        buildingGroup.add(inst);
      };

      const garageSlabMat = new THREE.MeshStandardMaterial({
        color: 0x64748b,
        roughness: 0.65,
        metalness: 0.15,
        transparent: true,
        opacity: 0.62,
      });

      addInstancedGroup(cols, pilarMat, 0.18);
      addInstancedGroup(beams, beamMat, 0.12);
      addInstancedGroup(slabsAndRamps, garageSlabMat, 0.2);
    }

    // 2. Os 14 Andares Tipos (TIPO 01 a TIPO 14, sendo TIPO 14 com +8 cm de pé-direito = 3,23 m)
    for (let tipo = 1; tipo <= 14; tipo++) {
      if (isIsolated && tipo !== isolatedTipoNum) continue;

      const isTipo14 = tipo === 14;
      const deltaTipo14 = isTipo14 ? 0.08 : 0;
      const peDireitoAndar = isTipo14 ? 3.23 : 3.15;

      const stInfo = resumo14Tipos.find((r) => r.andarTipo === tipo);
      const yBase = stInfo ? stInfo.elevacao : 18.6 + tipo * 3.15;
      const floorGroup = new THREE.Group();
      floorGroup.position.y = yBase;

      // Laje de Piso do Pavimento Tipo (Hitbox clicável para abrir o DWG daquele pavimento)
      const slabGeo = new THREE.BoxGeometry(slabW, 0.1, slabD);
      const slabMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.7,
        metalness: 0.1,
        transparent: true,
        opacity: 0.75,
      });
      const slabMesh = new THREE.Mesh(slabGeo, slabMat);
      slabMesh.userData = {
        isFloorHitBox: true,
        andarTipo: tipo,
        nome: `TIPO ${String(tipo).padStart(2, '0')}`,
      };
      floorGroup.add(slabMesh);
      floorHitBoxesRef.current.push(slabMesh);

      // Hitbox invisível envolvendo o volume do pavimento
      const volGeo = new THREE.BoxGeometry(slabW + 0.4, peDireitoAndar, slabD + 0.4);
      const volMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
      });
      const volMesh = new THREE.Mesh(volGeo, volMat);
      volMesh.position.y = peDireitoAndar / 2;
      volMesh.userData = {
        isFloorHitBox: true,
        andarTipo: tipo,
        nome: `TIPO ${String(tipo).padStart(2, '0')}`,
        slabMesh,
      };
      floorGroup.add(volMesh);
      floorHitBoxesRef.current.push(volMesh);

      // 2a. Elementos do IFC Estrutural TQS (New Life Studios 2025-02-06.IFC)
      if (mostrarEstrutural3D && structIfc) {
        // Pilares P1..P15 (altura 3.15 m nos Tipos 01..13 e 3.23 m no Tipo 14)
        for (const col of structIfc.columns || []) {
          const wM = Math.max(0.15, (col.maxX - col.minX) * scaleCmToM);
          const dM = Math.max(0.15, (col.maxY - col.minY) * scaleCmToM);
          const cxM = ((col.minX + col.maxX) / 2 - centerX) * scaleCmToM;
          const czM = -((col.minY + col.maxY) / 2 - centerY) * scaleCmToM;
          const colMesh = new THREE.Mesh(
            new THREE.BoxGeometry(wM, peDireitoAndar, dM),
            pilarMat
          );
          colMesh.position.set(cxM, peDireitoAndar / 2, czM);
          floorGroup.add(colMesh);
        }

        // Vigas V701..V718 e Vborda 1..15 posicionadas na cota exata do fundo da viga no teto do pavimento!
        for (const b of structIfc.beams || []) {
          const wM = Math.max(0.1, (b.maxX - b.minX) * scaleCmToM);
          const dM = Math.max(0.1, (b.maxY - b.minY) * scaleCmToM);
          const hM = Math.max(0.15, (b.depthCm || 50) * scaleCmToM);
          const yBotM = Math.max(1.2, (b.heightM || 2.65) + deltaTipo14);
          const cxM = ((b.minX + b.maxX) / 2 - centerX) * scaleCmToM;
          const czM = -((b.minY + b.maxY) / 2 - centerY) * scaleCmToM;

          const bMesh = new THREE.Mesh(
            new THREE.BoxGeometry(wM, hM, dM),
            beamMat
          );
          bMesh.position.set(cxM, yBotM + hM / 2, czM);
          floorGroup.add(bMesh);
        }
      }

      // 2b. As 368 Cubetas Atex 800 (64,8x64,8 cm, H=25 cm, de 2,85 m a 3,10 m nos Tipos 01..13; 2,93 m a 3,18 m no Tipo 14)
      if (mostrarCubetas3D && structIfc?.cubetas?.length > 0) {
        const shouldRenderAllCubetas = isIsolated || tipo === 14 || tipo === 1;
        if (shouldRenderAllCubetas) {
          const cubetasArr = structIfc.cubetas;
          const instMesh = new THREE.InstancedMesh(
            unitBoxGeo,
            cubetaMat,
            cubetasArr.length
          );
          const dummy = new THREE.Object3D();
          const yFundoNervura = 2.85 + deltaTipo14;
          cubetasArr.forEach((c, idx) => {
            const wM = Math.max(0.1, (c.maxX - c.minX) * scaleCmToM);
            const dM = Math.max(0.1, (c.maxY - c.minY) * scaleCmToM);
            const cxM = ((c.minX + c.maxX) / 2 - centerX) * scaleCmToM;
            const czM = -((c.minY + c.maxY) / 2 - centerY) * scaleCmToM;
            dummy.position.set(cxM, yFundoNervura + 0.25 / 2, czM);
            dummy.scale.set(wM, 0.25, dM);
            dummy.updateMatrix();
            instMesh.setMatrixAt(idx, dummy.matrix);
          });
          instMesh.instanceMatrix.needsUpdate = true;
          floorGroup.add(instMesh);
        }
      }

      // 2c. As Paredes do DWG extrudadas com sua ALTURA ESTRUTURAL REAL (+8cm no Tipo 14)
      for (const wp of dwgData.wallPieces) {
        const guid = `TIPO-${String(tipo).padStart(2, '0')}::${wp.id}`;
        const minX = Math.min(...wp.polygon.map((p) => p.x));
        const maxX = Math.max(...wp.polygon.map((p) => p.x));
        const minY = Math.min(...wp.polygon.map((p) => p.y));
        const maxY = Math.max(...wp.polygon.map((p) => p.y));

        const wallHeight = isTipo14
          ? Number(wp.alturaPadraoTipo14M) || +(Number(wp.alturaPadraoM || 2.85) + 0.08).toFixed(2)
          : Number(wp.alturaPadraoM) || 2.85;
        const wM = Math.max(0.09, (maxX - minX) * scaleCmToM);
        const dM = Math.max(0.09, (maxY - minY) * scaleCmToM);
        const cxM = ((minX + maxX) / 2 - centerX) * scaleCmToM;
        const czM = -((minY + maxY) / 2 - centerY) * scaleCmToM;

        const wGeo = new THREE.BoxGeometry(wM, wallHeight, dM);
        const wMat = new THREE.MeshStandardMaterial({
          color: wp.isChurrasqueira ? 0xfb923c : 0xcbd5e1,
          roughness: 0.55,
        });
        const wMesh = new THREE.Mesh(wGeo, wMat);
        wMesh.position.set(cxM, 0.05 + wallHeight / 2, czM);
        wMesh.userData = {
          isFloorHitBox: true,
          andarTipo: tipo,
          isChurrasqueira: Boolean(wp.isChurrasqueira),
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
                hb.material.opacity = 0.75;
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
              hb.material.opacity = 0.75;
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
  }, [dwgData, mostrarEstrutural3D, mostrarCubetas3D, mostrarGaragensCaixaDagua3D, andarIsolado3D]);

  // Atualiza cores das paredes 3D nos 14 andares tipos sempre que medicoesMap mudar
  useEffect(() => {
    update3DWallColors();
  }, [medicoesMap, mostrarEstrutural3D, mostrarCubetas3D, mostrarGaragensCaixaDagua3D, andarIsolado3D]);

  function update3DWallColors() {
    const mapMeshes = wallMeshesByGuidRef.current || {};
    Object.entries(mapMeshes).forEach(([guid, mesh]) => {
      const m = medicoesMap?.[guid];
      const isChurr = mesh.userData?.isChurrasqueira;
      if (!m) {
        mesh.material.color.setHex(isChurr ? 0xfb923c : 0xcbd5e1);
      } else if (m.status === 'Finalizada') {
        mesh.material.color.setHex(0x10b981); // Verde
      } else if (m.status === 'Reparo' || m.fiada_status === 'Reparo') {
        mesh.material.color.setHex(0xef4444); // Vermelho
      } else if (m.fiada_status === 'Finalizada') {
        mesh.material.color.setHex(0xf59e0b); // Âmbar (1ª Fiada pronta)
      } else {
        mesh.material.color.setHex(isChurr ? 0xfb923c : 0xcbd5e1);
      }
    });
  }

  const hoveredStats = hoveredAndarInfo
    ? resumo14Tipos.find((r) => r.andarTipo === hoveredAndarInfo)
    : null;

  return (
    <div className="tab-3d-andares-container">
      {/* Parte Superior: Visualizador 3D Integrado (Arquitetônico + Estrutural TQS + Paredes DWG) */}
      <div className="building-3d-card">
        <div className="building-3d-header">
          <div>
            <h2>
              🏢 Modelo 3D Integrado: Arquitetônico (`NEW LIFE_05072024.ifc`) + Estrutural TQS (`New Life Studios 2025-02-06.IFC`)
            </h2>
            <p>
              Paredes já configuradas com as alturas reais das <strong>Vigas (2,45m a 2,85m)</strong> e subindo por dentro das{' '}
              <strong>368 Cubetas Atex 800 (H=3,10m até a capa de 5cm)</strong>. Clique em um andar para abrir o `.DWG`!
            </p>
          </div>

          <div className="building-3d-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <label className="checkbox-inline-pill">
              <input
                type="checkbox"
                checked={mostrarEstrutural3D}
                onChange={(e) => setMostrarEstrutural3D(e.target.checked)}
              />
              <span>🏗️ Pilares e Vigas TQS</span>
            </label>

            <label className="checkbox-inline-pill">
              <input
                type="checkbox"
                checked={mostrarCubetas3D}
                onChange={(e) => setMostrarCubetas3D(e.target.checked)}
              />
              <span>🟪 368 Cubetas Atex 800</span>
            </label>

            <label className="checkbox-inline-pill">
              <input
                type="checkbox"
                checked={mostrarGaragensCaixaDagua3D}
                onChange={(e) => setMostrarGaragensCaixaDagua3D(e.target.checked)}
              />
              <span>🚗💧 Garagens + Caixa d'Água 3D</span>
            </label>

            <select
              value={andarIsolado3D}
              onChange={(e) => setAndarIsolado3D(e.target.value)}
              style={{
                background: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #38bdf8',
                borderRadius: '8px',
                padding: '6px 10px',
                fontSize: '0.82rem',
                fontWeight: 600,
              }}
            >
              <option value="TODOS">🏢 Ver Prédio Completo (14 Tipos)</option>
              {Array.from({ length: 14 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  🔍 Isolar Raio-X TIPO {String(n).padStart(2, '0')} (Vigas + Cubetas)
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="building-3d-canvas-wrap">
          <div ref={containerRef} className="building-3d-canvas" />

          {hoveredStats && (
            <div className="floating-floor-tooltip">
              <strong>{hoveredStats.nome}</strong>
              <span>Cota IFC: +{hoveredStats.elevacao}m • Área Total: {hoveredStats.areaTotalPotencialM2} m²</span>
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
              <span>Alvenaria Finalizada</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot fiada" />
              <span>1ª Fiada Pronta</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot" style={{ background: '#f97316' }} />
              <span>Pilares TQS (P1..P15)</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot" style={{ background: '#38bdf8' }} />
              <span>Vigas TQS (V701..V718)</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot" style={{ background: '#a855f7' }} />
              <span>Cubetas Atex 800 (H=3,10m)</span>
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
              Cada andar tipo possui {totalParedesPorTipo} paredes pré-configuradas com as alturas exatas do projeto estrutural (`708,30 m²` por andar considerando a alvenaria dentro das cubetas)
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
                <th>🔥 Churrasqueiras (Sical)</th>
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
                    <strong className="floor-name-badge">
                      {row.nome} {row.andarTipo === 14 ? '(+8cm)' : ''}
                    </strong>
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
                        {row.levM2.toFixed(2)} / {row.areaTotalPotencialM2} m² ({row.levCount}/{totalParedesPorTipo})
                      </strong>
                      <span>
                        R$ {row.levRs.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span
                      style={{
                        color: row.churrDoneCount > 0 ? '#fb923c' : '#94a3b8',
                        fontWeight: 600,
                      }}
                    >
                      🔥 {row.churrDoneCount}/{totalChurrPorTipo} feitas
                    </span>
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
