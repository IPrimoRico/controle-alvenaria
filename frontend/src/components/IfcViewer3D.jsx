import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { IFCLoader } from 'web-ifc-three/IFCLoader';
import {
  buildProcedural21StoreyBimTower,
  extractStoreysAndWallsFromIfc,
  generateDeterministicIfcGuid,
  TOTAL_PAVIMENTOS,
} from '../utils/ifcHelper';

const COLOR_FINALIZADA = new THREE.Color('#10b981');
const COLOR_REPARO = new THREE.Color('#ef4444');
const COLOR_PENDENTE = new THREE.Color('#cbd5e1');
const COLOR_SELECIONADA = new THREE.Color('#38bdf8');
const COLOR_HOVER = new THREE.Color('#93c5fd');

// Materiais para Subsets do IFC.js quando um arquivo .ifc nativo é aberto
const MAT_IFC_FINALIZADA = new THREE.MeshLambertMaterial({
  color: 0x10b981,
  transparent: true,
  opacity: 0.88,
  depthTest: true,
});

const MAT_IFC_REPARO = new THREE.MeshLambertMaterial({
  color: 0xef4444,
  transparent: true,
  opacity: 0.88,
  depthTest: true,
});

const MAT_IFC_SELECIONADA = new THREE.MeshLambertMaterial({
  color: 0x38bdf8,
  transparent: true,
  opacity: 0.92,
  depthTest: true,
});

export default function IfcViewer3D({
  selectedFloor, // 'all' ou número 1..21
  modoCorte, // 'isolar' | 'fantasma'
  wallStatusesMap, // { [guid]: { status: 'Finalizada' | 'Reparo', ... } }
  selectedWall, // { guid, expressID, pavimento, ... }
  onSelectWall,
  ifcFileToLoad,
  onModelMetadataReady,
}) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const ifcLoaderRef = useRef(null);

  const proceduralDataRef = useRef(null);
  const loadedIfcModelRef = useRef(null);
  const ifcWallMapRef = useRef({});
  const hoveredMeshRef = useRef(null);

  const wallStatusesRef = useRef(wallStatusesMap);
  const selectedWallRef = useRef(selectedWall);
  const selectedFloorRef = useRef(selectedFloor);

  const [loadingIfc, setLoadingIfc] = useState(false);
  const [ifcNotice, setIfcNotice] = useState(null);

  useEffect(() => {
    wallStatusesRef.current = wallStatusesMap;
    updateMaterialsAndSubsets();
  }, [wallStatusesMap]);

  useEffect(() => {
    selectedWallRef.current = selectedWall;
    updateMaterialsAndSubsets();
  }, [selectedWall]);

  useEffect(() => {
    selectedFloorRef.current = selectedFloor;
    applyFloorVisibility(selectedFloor, modoCorte);
  }, [selectedFloor, modoCorte]);

  // Inicializa cena Three.js + IFCLoader + Raycaster
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 900;
    const height = container.clientHeight || 650;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0b1120');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(36, 42, 48);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.localClippingEnabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, 30, 0);
    controls.update();
    controlsRef.current = controls;

    // Iluminação técnica BIM
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.72);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight1.position.set(50, 90, 60);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x93c5fd, 0.35);
    dirLight2.position.set(-50, 40, -45);
    scene.add(dirLight2);

    // Grid de referência no nível térreo
    const gridHelper = new THREE.GridHelper(60, 30, 0x334155, 0x1e293b);
    gridHelper.position.y = -0.02;
    scene.add(gridHelper);

    // Configura o IFCLoader oficial do IFC.js (web-ifc-three)
    const ifcLoader = new IFCLoader();
    try {
      ifcLoader.ifcManager.setWasmPath('https://unpkg.com/web-ifc@0.0.36/');
    } catch (e) {
      console.warn('[IFC.js] Aviso ao configurar WASM path:', e);
    }
    ifcLoaderRef.current = ifcLoader;

    // Constrói modelo BIM de 21 pavimentos inicial
    const procedural = buildProcedural21StoreyBimTower();
    proceduralDataRef.current = procedural;
    scene.add(procedural.towerGroup);

    if (onModelMetadataReady) {
      onModelMetadataReady({
        mode: 'BIM 21 Pavimentos (Padrão IFC)',
        totalFloors: TOTAL_PAVIMENTOS,
        totalWalls: procedural.wallMeshes.length,
        wallMetadataByGuid: procedural.wallMetadataByGuid,
      });
    }

    updateMaterialsAndSubsets();

    // Raycaster para clique na parede e extração do GUID
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    const handlePointerDown = (e) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (loadedIfcModelRef.current) {
        renderer.domElement.style.cursor = 'pointer';
        return;
      }

      if (!proceduralDataRef.current) return;
      raycaster.setFromCamera(mouse, camera);

      const candidateWalls = proceduralDataRef.current.wallMeshes.filter(
        (m) => m.visible && m.material.opacity > 0.25
      );
      const intersects = raycaster.intersectObjects(candidateWalls, false);

      if (intersects.length > 0) {
        const hitMesh = intersects[0].object;
        renderer.domElement.style.cursor = 'pointer';
        if (hoveredMeshRef.current !== hitMesh) {
          hoveredMeshRef.current = hitMesh;
          updateMaterialsAndSubsets();
        }
      } else {
        renderer.domElement.style.cursor = 'grab';
        if (hoveredMeshRef.current !== null) {
          hoveredMeshRef.current = null;
          updateMaterialsAndSubsets();
        }
      }
    };

    const handlePointerUp = async (e) => {
      // Ignora se o usuário arrastou a câmera (orbit/pan)
      const dist = Math.hypot(
        e.clientX - pointerDownPos.x,
        e.clientY - pointerDownPos.y
      );
      if (dist > 5) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // 1) Caso um arquivo .IFC real esteja carregado via IFCLoader
      if (loadedIfcModelRef.current && ifcLoaderRef.current) {
        const ifcModel = loadedIfcModelRef.current;
        const hits = raycaster.intersectObject(ifcModel, true);
        if (hits.length > 0) {
          const hit = hits[0];
          const faceIndex = hit.faceIndex;
          const geometry = hit.object.geometry;
          const ifcManager = ifcLoaderRef.current.ifcManager;
          const modelID = ifcModel.modelID;

          const expressID = ifcManager.getExpressId(geometry, faceIndex);
          const props = await ifcManager.getItemProperties(
            modelID,
            expressID,
            false
          );

          // Determina pavimento a partir do mapa espacial ou da cota Y do ponto clicado
          const mappedInfo = ifcWallMapRef.current[expressID];
          const estimatedFloor = Math.min(
            TOTAL_PAVIMENTOS,
            Math.max(1, Math.floor(hit.point.y / 3.0) + 1)
          );

          const guid =
            props?.GlobalId?.value ||
            mappedInfo?.guid ||
            generateDeterministicIfcGuid(estimatedFloor, expressID);

          const pavimento = mappedInfo?.pavimento || estimatedFloor;
          const pavimento_nome =
            mappedInfo?.pavimento_nome ||
            `${String(pavimento).padStart(2, '0')}º Pavimento`;
          const nome_parede =
            props?.Name?.value ||
            props?.ObjectType?.value ||
            mappedInfo?.nome_parede ||
            `Elemento IFC #${expressID}`;

          onSelectWall({
            guid,
            expressID,
            pavimento,
            pavimento_nome,
            nome_parede,
            ifcType: 'IFCWALLSTANDARDCASE',
          });
        }
        return;
      }

      // 2) Caso esteja no modelo BIM 3D de 21 pavimentos padrão
      if (proceduralDataRef.current) {
        const candidateWalls = proceduralDataRef.current.wallMeshes.filter(
          (m) => m.visible && m.material.opacity > 0.25
        );
        const hits = raycaster.intersectObjects(candidateWalls, false);
        if (hits.length > 0) {
          const clickedWall = hits[0].object;
          onSelectWall(clickedWall.userData);
        }
      }
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('pointerdown', handlePointerDown);
    domElem.addEventListener('pointermove', handlePointerMove);
    domElem.addEventListener('pointerup', handlePointerUp);

    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current)
        return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    let reqId;
    const animate = () => {
      reqId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(reqId);
      window.removeEventListener('resize', handleResize);
      domElem.removeEventListener('pointerdown', handlePointerDown);
      domElem.removeEventListener('pointermove', handlePointerMove);
      domElem.removeEventListener('pointerup', handlePointerUp);
      renderer.dispose();
    };
  }, []);

  // Carrega arquivo .IFC externo quando selecionado pelo usuário
  useEffect(() => {
    if (!ifcFileToLoad || !ifcLoaderRef.current || !sceneRef.current) return;

    const fileUrl = URL.createObjectURL(ifcFileToLoad);
    setLoadingIfc(true);
    setIfcNotice(`Processando ${ifcFileToLoad.name} com IFC.js...`);

    const ifcLoader = ifcLoaderRef.current;
    const scene = sceneRef.current;

    ifcLoader.load(
      fileUrl,
      async (ifcModel) => {
        try {
          if (proceduralDataRef.current?.towerGroup) {
            proceduralDataRef.current.towerGroup.visible = false;
          }
          if (loadedIfcModelRef.current) {
            scene.remove(loadedIfcModelRef.current);
          }

          loadedIfcModelRef.current = ifcModel;
          scene.add(ifcModel);

          // Centraliza câmera no modelo IFC carregado
          const box = new THREE.Box3().setFromObject(ifcModel);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          if (controlsRef.current && cameraRef.current) {
            controlsRef.current.target.copy(center);
            cameraRef.current.position.set(
              center.x + size.x * 1.4,
              center.y + size.y * 0.9,
              center.z + size.z * 1.4
            );
            controlsRef.current.update();
          }

          // Extrai estrutura espacial dos 21 pavimentos e paredes
          const { wallMapByExpressId } = await extractStoreysAndWallsFromIfc(
            ifcLoader.ifcManager,
            ifcModel.modelID
          );
          ifcWallMapRef.current = wallMapByExpressId;

          const metadataByGuid = {};
          Object.values(wallMapByExpressId).forEach((w) => {
            metadataByGuid[w.guid] = w;
          });

          if (onModelMetadataReady) {
            onModelMetadataReady({
              mode: `Arquivo IFC: ${ifcFileToLoad.name}`,
              totalFloors: TOTAL_PAVIMENTOS,
              totalWalls: Object.keys(wallMapByExpressId).length || 252,
              wallMetadataByGuid: metadataByGuid,
            });
          }

          setIfcNotice(
            `Modelo "${ifcFileToLoad.name}" carregado via IFC.js! Clique em qualquer parede para ler o GUID.`
          );
          setTimeout(() => setIfcNotice(null), 6000);
        } catch (err) {
          console.error('[IFC.js] Erro ao extrair árvore espacial:', err);
          setIfcNotice(
            'Arquivo IFC carregado. Clique em qualquer parede 3D para obter o GUID.'
          );
        } finally {
          setLoadingIfc(false);
          URL.revokeObjectURL(fileUrl);
        }
      },
      undefined,
      (error) => {
        console.error('[IFC.js] Erro ao abrir arquivo .ifc:', error);
        setLoadingIfc(false);
        setIfcNotice(
          'Não foi possível abrir este arquivo .ifc. Mantendo modelo BIM de 21 pavimentos.'
        );
        URL.revokeObjectURL(fileUrl);
      }
    );
  }, [ifcFileToLoad]);

  // Atualiza cores das paredes conforme o status ('Finalizada' = Verde, 'Reparo' = Vermelho)
  function updateMaterialsAndSubsets() {
    const statuses = wallStatusesRef.current || {};
    const selWall = selectedWallRef.current;
    const hovered = hoveredMeshRef.current;

    // Atualiza cores no modelo BIM 3D de 21 pavimentos
    if (proceduralDataRef.current) {
      proceduralDataRef.current.wallMeshes.forEach((mesh) => {
        const { guid } = mesh.userData;
        const saved = statuses[guid];
        const isSelected = selWall && selWall.guid === guid;
        const isHovered = hovered === mesh;

        if (isSelected) {
          mesh.material.color.copy(COLOR_SELECIONADA);
          mesh.material.emissive.setHex(0x0284c7);
          mesh.material.emissiveIntensity = 0.35;
        } else if (saved?.status === 'Finalizada') {
          mesh.material.color.copy(COLOR_FINALIZADA);
          mesh.material.emissive.setHex(0x065f46);
          mesh.material.emissiveIntensity = isHovered ? 0.3 : 0.12;
        } else if (saved?.status === 'Reparo') {
          mesh.material.color.copy(COLOR_REPARO);
          mesh.material.emissive.setHex(0x7f1d1d);
          mesh.material.emissiveIntensity = isHovered ? 0.35 : 0.18;
        } else if (isHovered) {
          mesh.material.color.copy(COLOR_HOVER);
          mesh.material.emissive.setHex(0x1e3a8a);
          mesh.material.emissiveIntensity = 0.2;
        } else {
          mesh.material.color.copy(COLOR_PENDENTE);
          mesh.material.emissive.setHex(0x000000);
          mesh.material.emissiveIntensity = 0;
        }
      });
    }

    // Atualiza Subsets do IFC.js caso um arquivo .ifc nativo esteja carregado
    if (loadedIfcModelRef.current && ifcLoaderRef.current && sceneRef.current) {
      const ifcManager = ifcLoaderRef.current.ifcManager;
      const modelID = loadedIfcModelRef.current.modelID;
      const scene = sceneRef.current;

      const idsFinalizadas = [];
      const idsReparo = [];

      Object.values(statuses).forEach((st) => {
        if (!st?.express_id) return;
        if (st.status === 'Finalizada') idsFinalizadas.push(Number(st.express_id));
        if (st.status === 'Reparo') idsReparo.push(Number(st.express_id));
      });

      try {
        ifcManager.removeSubset(modelID, MAT_IFC_FINALIZADA, 'subset-finalizada');
        if (idsFinalizadas.length > 0) {
          ifcManager.createSubset({
            modelID,
            ids: idsFinalizadas,
            material: MAT_IFC_FINALIZADA,
            scene,
            removePrevious: true,
            customID: 'subset-finalizada',
          });
        }

        ifcManager.removeSubset(modelID, MAT_IFC_REPARO, 'subset-reparo');
        if (idsReparo.length > 0) {
          ifcManager.createSubset({
            modelID,
            ids: idsReparo,
            material: MAT_IFC_REPARO,
            scene,
            removePrevious: true,
            customID: 'subset-reparo',
          });
        }

        ifcManager.removeSubset(modelID, MAT_IFC_SELECIONADA, 'subset-selecionada');
        if (selWall?.expressID) {
          ifcManager.createSubset({
            modelID,
            ids: [Number(selWall.expressID)],
            material: MAT_IFC_SELECIONADA,
            scene,
            removePrevious: true,
            customID: 'subset-selecionada',
          });
        }
      } catch {
        // Ignora caso algum expressID não pertença ao modelo atual
      }
    }
  }

  // Isola ou aplica transparência aos 21 pavimentos conforme seleção do usuário
  function applyFloorVisibility(floorSelection, mode) {
    const floorHeight = 3.0;

    if (proceduralDataRef.current) {
      const { wallMeshes, slabMeshes } = proceduralDataRef.current;

      wallMeshes.forEach((mesh) => {
        const pav = mesh.userData.pavimento;
        if (floorSelection === 'all') {
          mesh.visible = true;
          mesh.material.transparent = false;
          mesh.material.opacity = 1.0;
        } else if (pav === Number(floorSelection)) {
          mesh.visible = true;
          mesh.material.transparent = false;
          mesh.material.opacity = 1.0;
        } else if (mode === 'fantasma') {
          mesh.visible = true;
          mesh.material.transparent = true;
          mesh.material.opacity = 0.08;
        } else {
          mesh.visible = false;
        }
      });

      slabMeshes.forEach((slab) => {
        const pav = slab.userData.pavimento;
        if (floorSelection === 'all') {
          slab.visible = true;
          slab.material.opacity = 0.65;
        } else if (pav === Number(floorSelection)) {
          slab.visible = true;
          slab.material.opacity = 0.85;
        } else if (mode === 'fantasma') {
          slab.visible = true;
          slab.material.opacity = 0.05;
        } else {
          slab.visible = false;
        }
      });
    }

    // Planos de corte (Clipping Planes) para arquivo .IFC nativo e ajuste de câmera
    if (rendererRef.current && controlsRef.current && cameraRef.current) {
      if (floorSelection === 'all') {
        rendererRef.current.clippingPlanes = [];
        controlsRef.current.target.set(0, 30, 0);
        cameraRef.current.position.set(36, 42, 48);
        controlsRef.current.update();
      } else {
        const floorNum = Number(floorSelection);
        const yMin = (floorNum - 1) * floorHeight - 0.1;
        const yMax = floorNum * floorHeight + 0.1;

        if (loadedIfcModelRef.current) {
          const bottomPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -yMin);
          const topPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), yMax);
          rendererRef.current.clippingPlanes = [bottomPlane, topPlane];
        } else {
          rendererRef.current.clippingPlanes = [];
        }

        const targetY = (floorNum - 1) * floorHeight + 1.4;
        controlsRef.current.target.set(0, targetY, 0);
        cameraRef.current.position.set(18, targetY + 14, 22);
        controlsRef.current.update();
      }
    }
  }

  return (
    <div className="viewer-wrapper">
      <div ref={containerRef} className="three-canvas-container" />

      {/* Legenda 3D flutuante */}
      <div className="viewer-legend">
        <div className="legend-item">
          <span className="legend-dot finalizada" />
          <span>Finalizada</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot reparo" />
          <span>Reparo</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot pendente" />
          <span>Pendente</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot selecionada" />
          <span>Selecionada (GUID)</span>
        </div>
      </div>

      {/* Dica de controles 3D */}
      <div className="viewer-controls-hint">
        <span>🖱️ Clique na parede: Selecionar GUID</span>
        <span>•</span>
        <span>Arrastar Esq.: Rotacionar 3D</span>
        <span>•</span>
        <span>Scroll: Zoom</span>
      </div>

      {loadingIfc && (
        <div className="viewer-toast loading">
          Carregando geometria IFC e extraindo 21 pavimentos...
        </div>
      )}

      {ifcNotice && !loadingIfc && (
        <div className="viewer-toast info">{ifcNotice}</div>
      )}
    </div>
  );
}
