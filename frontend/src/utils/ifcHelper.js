import * as THREE from 'three';

export const TOTAL_PAVIMENTOS = 21;

/**
 * Gera um GlobalId padrão IFC (22 caracteres base64-ifc) determinístico
 * para um pavimento (1..21) e índice de parede.
 */
export function generateDeterministicIfcGuid(pavimento, wallIndex) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  const seedStr = `IFC2X3-PAV${String(pavimento).padStart(2, '0')}-WALL${String(wallIndex).padStart(2, '0')}`;
  let hash = 2166136261;
  const result = ['2', 'O', '2', 'F']; // Prefixo típico de GUID IFC (Revit/Archicad)

  for (let i = 0; i < 14; i++) {
    const code = seedStr.charCodeAt(i % seedStr.length) + i * 31 + pavimento * 17 + wallIndex * 13;
    hash ^= code;
    hash = Math.imul(hash, 16777619);
    const idx = Math.abs(hash) % 64;
    result.push(chars[idx]);
  }

  const suffix = `P${String(pavimento).padStart(2, '0')}${chars[wallIndex % 64]}`;
  return (result.join('') + suffix).slice(0, 22);
}

/**
 * Percorre a árvore espacial (Spatial Structure) retornada pelo IFC.js
 * `ifcManager.getSpatialStructure(modelID, true)` para extrair até 21 pavimentos (IfcBuildingStorey)
 * e mapear cada parede (IfcWall / IfcWallStandardCase) ao seu pavimento e GUID.
 */
export async function extractStoreysAndWallsFromIfc(ifcManager, modelID) {
  const spatialTree = await ifcManager.getSpatialStructure(modelID, true);
  const storeys = [];

  function findStoreys(node) {
    if (!node) return;
    if (node.type === 'IFCBUILDINGSTOREY') {
      storeys.push(node);
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        findStoreys(child);
      }
    }
  }

  findStoreys(spatialTree);

  const wallMapByExpressId = {};
  const storeysFormatted = [];

  // Processa até 21 pavimentos do modelo IFC carregado
  const limit = Math.min(storeys.length, TOTAL_PAVIMENTOS);
  for (let i = 0; i < limit; i++) {
    const storeyNode = storeys[i];
    const numeroPavimento = i + 1;
    let storeyProps = {};
    try {
      storeyProps = await ifcManager.getItemProperties(modelID, storeyNode.expressID, false);
    } catch {
      // Ignora erro caso propriedade não exista
    }

    const nomePavimento =
      storeyProps?.Name?.value || `${String(numeroPavimento).padStart(2, '0')}º Pavimento`;

    const wallExpressIds = [];

    function collectWalls(n) {
      if (!n) return;
      if (
        n.type === 'IFCWALL' ||
        n.type === 'IFCWALLSTANDARDCASE' ||
        n.type === 'IFCCURTAINWALL'
      ) {
        wallExpressIds.push(n.expressID);
      }
      if (Array.isArray(n.children)) {
        for (const c of n.children) collectWalls(c);
      }
    }

    collectWalls(storeyNode);

    for (const expressID of wallExpressIds) {
      try {
        const props = await ifcManager.getItemProperties(modelID, expressID, false);
        const guid =
          props?.GlobalId?.value || generateDeterministicIfcGuid(numeroPavimento, expressID);
        const nomeParede =
          props?.Name?.value || props?.ObjectType?.value || `IfcWallStandardCase #${expressID}`;

        wallMapByExpressId[expressID] = {
          expressID,
          guid,
          pavimento: numeroPavimento,
          pavimento_nome: nomePavimento,
          nome_parede: nomeParede,
          ifcType: props?.type || 'IFCWALLSTANDARDCASE',
        };
      } catch {
        // continua
      }
    }

    storeysFormatted.push({
      pavimento: numeroPavimento,
      expressID: storeyNode.expressID,
      nome: nomePavimento,
      wallExpressIds,
    });
  }

  return {
    storeys: storeysFormatted,
    wallMapByExpressId,
  };
}

/**
 * Constrói um edifício BIM 3D de 21 pavimentos completo em Three.js
 * com metadados compatíveis com IFC (GlobalId GUID, ExpressID, IfcWallStandardCase, Pavimento 1..21)
 * para visualização imediata ou enquanto um arquivo .ifc externo não é carregado.
 */
export function buildProcedural21StoreyBimTower() {
  const towerGroup = new THREE.Group();
  towerGroup.name = 'IFC_Building_21_Storeys';

  const wallMeshes = [];
  const slabMeshes = [];
  const wallMetadataByGuid = {};

  const floorHeight = 3.0; // Pé-direito 3,00m
  const wallHeight = 2.75;
  const wallThickness = 0.18;
  const slabThickness = 0.25;
  const buildingWidth = 16;
  const buildingDepth = 12;

  // Layout planta-tipo de alvenaria por pavimento (12 paredes por andar x 21 andares = 252 paredes)
  const floorPlanWallDefs = [
    // Paredes periféricas (Fachadas)
    {
      code: 'ALV-EXT-N1',
      nome: 'Alvenaria Externa Bloco Cerâmico 19cm - Fachada Norte (Trecho Leste)',
      x: -3.8,
      z: -buildingDepth / 2,
      w: 7.8,
      d: wallThickness,
    },
    {
      code: 'ALV-EXT-N2',
      nome: 'Alvenaria Externa Bloco Cerâmico 19cm - Fachada Norte (Trecho Oeste)',
      x: 4.1,
      z: -buildingDepth / 2,
      w: 7.4,
      d: wallThickness,
    },
    {
      code: 'ALV-EXT-S1',
      nome: 'Alvenaria Externa Bloco Cerâmico 19cm - Fachada Sul (Varanda Leste)',
      x: -4.0,
      z: buildingDepth / 2,
      w: 7.6,
      d: wallThickness,
    },
    {
      code: 'ALV-EXT-S2',
      nome: 'Alvenaria Externa Bloco Cerâmico 19cm - Fachada Sul (Varanda Oeste)',
      x: 4.0,
      z: buildingDepth / 2,
      w: 7.6,
      d: wallThickness,
    },
    {
      code: 'ALV-EXT-L',
      nome: 'Alvenaria Externa Estrutural 19cm - Empena Leste',
      x: -buildingWidth / 2,
      z: 0,
      w: wallThickness,
      d: buildingDepth,
    },
    {
      code: 'ALV-EXT-O',
      nome: 'Alvenaria Externa Estrutural 19cm - Empena Oeste',
      x: buildingWidth / 2,
      z: 0,
      w: wallThickness,
      d: buildingDepth,
    },
    // Paredes internas (Divisórias de apartamentos, hall de elevadores e suítes)
    {
      code: 'ALV-INT-HALL-N',
      nome: 'Alvenaria Interna Bloco 14cm - Hall Elevadores / Circulação Norte',
      x: 0,
      z: -1.8,
      w: 6.2,
      d: 0.15,
    },
    {
      code: 'ALV-INT-HALL-S',
      nome: 'Alvenaria Interna Bloco 14cm - Hall Elevadores / Escada Pressurizada',
      x: 0,
      z: 1.8,
      w: 6.2,
      d: 0.15,
    },
    {
      code: 'ALV-INT-DIV-L1',
      nome: 'Alvenaria Interna Bloco 14cm - Divisória Suíte Master Leste',
      x: -3.2,
      z: -2.9,
      w: 0.15,
      d: 5.6,
    },
    {
      code: 'ALV-INT-DIV-L2',
      nome: 'Alvenaria Interna Bloco 14cm - Divisória Sala / Cozinha Leste',
      x: -3.2,
      z: 2.9,
      w: 0.15,
      d: 5.6,
    },
    {
      code: 'ALV-INT-DIV-O1',
      nome: 'Alvenaria Interna Bloco 14cm - Divisória Suíte Master Oeste',
      x: 3.2,
      z: -2.9,
      w: 0.15,
      d: 5.6,
    },
    {
      code: 'ALV-INT-DIV-O2',
      nome: 'Alvenaria Interna Bloco 14cm - Divisória Sala / Cozinha Oeste',
      x: 3.2,
      z: 2.9,
      w: 0.15,
      d: 5.6,
    },
  ];

  const slabGeo = new THREE.BoxGeometry(buildingWidth + 0.6, slabThickness, buildingDepth + 0.6);
  const edgesMaterial = new THREE.LineBasicMaterial({
    color: 0x334155,
    transparent: true,
    opacity: 0.45,
  });

  for (let pav = 1; pav <= TOTAL_PAVIMENTOS; pav++) {
    const baseElevation = (pav - 1) * floorHeight;
    const pavimentoNome =
      pav === 1
        ? '01º Pavimento (Térreo / Pilotis)'
        : pav === 21
        ? '21º Pavimento (Cobertura / Ático)'
        : `${String(pav).padStart(2, '0')}º Pavimento Tipo`;

    // Laje do pavimento (IfcSlab)
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.85,
      metalness: 0.1,
      transparent: true,
      opacity: 0.65,
    });
    const slabMesh = new THREE.Mesh(slabGeo, slabMat);
    slabMesh.position.set(0, baseElevation + slabThickness / 2, 0);
    slabMesh.userData = {
      isSlab: true,
      pavimento: pav,
      ifcType: 'IFCSLAB',
    };
    towerGroup.add(slabMesh);
    slabMeshes.push(slabMesh);

    // Paredes de alvenaria do pavimento (IfcWallStandardCase)
    floorPlanWallDefs.forEach((def, idx) => {
      const wallIndex = idx + 1;
      const expressID = pav * 1000 + wallIndex;
      const guid = generateDeterministicIfcGuid(pav, wallIndex);

      const wallGeo = new THREE.BoxGeometry(def.w, wallHeight, def.d);
      const wallMat = new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        roughness: 0.55,
        metalness: 0.08,
      });

      const wallMesh = new THREE.Mesh(wallGeo, wallMat);
      wallMesh.position.set(
        def.x,
        baseElevation + slabThickness + wallHeight / 2,
        def.z
      );

      // Contorno arquitetônico sutil para facilitar distinção 3D
      const edgesGeo = new THREE.EdgesGeometry(wallGeo);
      const wireframe = new THREE.LineSegments(edgesGeo, edgesMaterial);
      wallMesh.add(wireframe);

      const metadata = {
        isWall: true,
        guid,
        expressID,
        codigo: `${def.code}-P${String(pav).padStart(2, '0')}`,
        pavimento: pav,
        pavimento_nome: pavimentoNome,
        nome_parede: `${def.nome} [Pav. ${String(pav).padStart(2, '0')}]`,
        ifcType: 'IFCWALLSTANDARDCASE',
        dimensoes: `${def.w.toFixed(2)}m x ${wallHeight.toFixed(2)}m x ${def.d.toFixed(2)}m`,
        areaM2: Number((Math.max(def.w, def.d) * wallHeight).toFixed(2)),
      };

      wallMesh.userData = metadata;
      wallMetadataByGuid[guid] = metadata;
      wallMeshes.push(wallMesh);
      towerGroup.add(wallMesh);
    });
  }

  return {
    towerGroup,
    wallMeshes,
    slabMeshes,
    wallMetadataByGuid,
  };
}
