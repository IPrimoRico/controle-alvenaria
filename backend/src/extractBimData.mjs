import fs from 'fs';
import path from 'path';
import { LibreDwg, Dwg_File_Type } from '../node_modules/@mlightcad/libredwg-web/dist/libredwg-web.js';

const ROOT_DIR = path.resolve('..');
const DWG_PATH = path.join(ROOT_DIR, 'app medição.dwg');
const IFC_PATH = path.join(ROOT_DIR, 'NEW LIFE_05072024.ifc');

const WALL_LAYERS = {
  '4 - TIJ-19': { espessuraCm: 19, corHex: '#ec4899', label: 'Tijolo 19 cm' },
  '4 - TIJ-14': { espessuraCm: 14, corHex: '#eab308', label: 'Tijolo 14 cm' },
  '3 - TIJ-11.5': { espessuraCm: 11.5, corHex: '#f59e0b', label: 'Tijolo 11,5 cm' },
  '1 - TIJ-9': { espessuraCm: 9, corHex: '#a855f7', label: 'Tijolo 9 cm' },
  'SICAL-14': { espessuraCm: 14, corHex: '#fb923c', label: 'Sical 14 cm' },
  'SICAL-10': { espessuraCm: 10, corHex: '#38bdf8', label: 'Sical 10 cm' },
};

async function extractAll() {
  const wasmDir = path.resolve('./node_modules/@mlightcad/libredwg-web/wasm');
  const libredwg = await LibreDwg.create(wasmDir);
  const buf = fs.readFileSync(DWG_PATH);
  const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const data = libredwg.dwg_read_data(arrayBuf, Dwg_File_Type.DWG);
  const db = libredwg.convert(data);

  // 1. Extrai elementos estruturais de referência (Pilares, Perímetro Estrutural, Janelas)
  const insertEnt = db.entities.find((e) => e.type === 'INSERT' && e.name === 'estrutural');
  const offsetX = insertEnt?.insertionPoint?.x || 0;
  const offsetY = insertEnt?.insertionPoint?.y || 0;

  const blocks = db.tables?.BLOCK_RECORD?.entries || [];
  const estBlock = blocks.find((b) => b.name === 'estrutural');
  const pilBlock = blocks.find((b) => b.name === 'pilares');

  const structuralPolylines = [];

  if (estBlock?.entities) {
    for (const ent of estBlock.entities) {
      if (ent.type === 'LWPOLYLINE' && Array.isArray(ent.vertices)) {
        structuralPolylines.push({
          layer: ent.layer || 'perimetro estrutural',
          closed: true,
          vertices: ent.vertices.map((v) => ({
            x: +(v.x + offsetX).toFixed(2),
            y: +(v.y + offsetY).toFixed(2),
          })),
        });
      }
    }
  }

  if (pilBlock?.entities) {
    for (const ent of pilBlock.entities) {
      if (ent.type === 'LWPOLYLINE' && Array.isArray(ent.vertices)) {
        structuralPolylines.push({
          layer: ent.layer || 'Pilar',
          closed: true,
          vertices: ent.vertices.map((v) => ({
            x: +(v.x + offsetX).toFixed(2),
            y: +(v.y + offsetY).toFixed(2),
          })),
        });
      }
    }
  }

  const windowLines = db.entities
    .filter((e) => e.type === 'LINE' && e.layer === 'janelas')
    .map((l) => ({
      x1: +l.startPoint.x.toFixed(2),
      y1: +l.startPoint.y.toFixed(2),
      x2: +l.endPoint.x.toFixed(2),
      y2: +l.endPoint.y.toFixed(2),
    }));

  // 2. Extrai e agrupa as linhas de paredes por Layer
  const rawLines = db.entities
    .filter((e) => e.type === 'LINE' && WALL_LAYERS[e.layer])
    .map((l) => {
      const dx = l.endPoint.x - l.startPoint.x;
      const dy = l.endPoint.y - l.startPoint.y;
      const len = Math.hypot(dx, dy);
      const isHoriz = Math.abs(dx) >= Math.abs(dy);
      const isDiag = Math.abs(dx) > 1.5 && Math.abs(dy) > 1.5;
      const t = WALL_LAYERS[l.layer].espessuraCm;

      return {
        handle: l.handle,
        layer: l.layer,
        t,
        x1: +l.startPoint.x.toFixed(2),
        y1: +l.startPoint.y.toFixed(2),
        x2: +l.endPoint.x.toFixed(2),
        y2: +l.endPoint.y.toFixed(2),
        pos: isHoriz
          ? (l.startPoint.y + l.endPoint.y) / 2
          : (l.startPoint.x + l.endPoint.x) / 2,
        start: isHoriz
          ? Math.min(l.startPoint.x, l.endPoint.x)
          : Math.min(l.startPoint.y, l.endPoint.y),
        end: isHoriz
          ? Math.max(l.startPoint.x, l.endPoint.x)
          : Math.max(l.startPoint.y, l.endPoint.y),
        len,
        isHoriz,
        isDiag,
        isCap: !isDiag && (Math.abs(len - t) < 0.9 || len <= 20.5),
      };
    });

  const mainOrtho = rawLines.filter((l) => !l.isCap && !l.isDiag);
  const visited = new Set();
  const rawGroups = [];

  for (const a of mainOrtho) {
    if (visited.has(a.handle)) continue;
    const group = [a];
    visited.add(a.handle);
    const queue = [a];
    while (queue.length > 0) {
      const curr = queue.shift();
      for (const cand of mainOrtho) {
        if (visited.has(cand.handle)) continue;
        if (cand.layer !== curr.layer || cand.isHoriz !== curr.isHoriz) continue;
        const dist = Math.abs(curr.pos - cand.pos);
        const validDist =
          Math.abs(dist - curr.t) < 0.9 ||
          (curr.layer === 'SICAL-14' && Math.abs(dist - 11.5) < 0.9);
        const overlap = Math.min(curr.end, cand.end) - Math.max(curr.start, cand.start);
        if (validDist && overlap > 1.0) {
          visited.add(cand.handle);
          group.push(cand);
          queue.push(cand);
        }
      }
    }
    rawGroups.push(group);
  }

  // Transforma cada grupo em pedaço(s) de parede individual(is)
  // Se um grupo tem 3 linhas (1 face contínua e 2 faces divididas por encontro em T),
  // dividimos em 2 pedaços de parede individuais para medição separada por ambiente!
  const wallPieces = [];

  function addWallPiece({
    layer,
    t,
    isHoriz,
    minPos,
    maxPos,
    faceMinStart,
    faceMinEnd,
    faceMaxStart,
    faceMaxEnd,
    handles,
  }) {
    const lenMinCm = +(faceMinEnd - faceMinStart).toFixed(2);
    const lenMaxCm = +(faceMaxEnd - faceMaxStart).toFixed(2);
    if (Math.max(lenMinCm, lenMaxCm) < 22) return; // ignora bonecas/tampas minúsculas

    const startOuter = Math.min(faceMinStart, faceMaxStart);
    const startInner = Math.max(faceMinStart, faceMaxStart);
    const endInner = Math.min(faceMinEnd, faceMaxEnd);
    const endOuter = Math.max(faceMinEnd, faceMaxEnd);

    const hasCornerStart = Math.abs(startInner - startOuter) >= 4.0;
    const hasCornerEnd = Math.abs(endOuter - endInner) >= 4.0;

    // Regra de ouro para não duplicar cantos em L (conforme exemplo enviado pelo usuário):
    // - Paredes Horizontais levam o canto externo (Face Maior / Com Canto)
    // - Paredes Verticais descontam o canto onde encontram paredes horizontais (Face Interna / Sem Canto)
    const usarCantoInicial = isHoriz ? true : false;
    const usarCantoFinal = isHoriz ? true : false;

    const measuredStart = hasCornerStart
      ? usarCantoInicial
        ? startOuter
        : startInner
      : startOuter;
    const measuredEnd = hasCornerEnd
      ? usarCantoFinal
        ? endOuter
        : endInner
      : endOuter;

    const comprimentoPadraoCm = +(measuredEnd - measuredStart).toFixed(2);
    const comprimentoBrutoCm = +(endOuter - startOuter).toFixed(2);
    const comprimentoInternoCm = +(endInner - startInner).toFixed(2);
    const descontouCantoCm = +(comprimentoBrutoCm - comprimentoPadraoCm).toFixed(2);

    // Qual coordenada transversal (pos) desenhar a linha vermelha escura de medição:
    // Se estamos medindo com canto (outer), usamos a face que é maior; se sem canto (inner), usamos a face que é menor
    let posLinhaMedicao = lenMaxCm >= lenMinCm ? maxPos : minPos;
    if (!isHoriz && (hasCornerStart || hasCornerEnd)) {
      posLinhaMedicao = lenMinCm <= lenMaxCm ? minPos : maxPos;
    } else if (isHoriz && (hasCornerStart || hasCornerEnd)) {
      posLinhaMedicao = lenMaxCm >= lenMinCm ? maxPos : minPos;
    }

    const idx = wallPieces.length + 1;
    const codigo = `P-${String(idx).padStart(3, '0')}`;
    const guid = `DWG-${layer.replace(/[^A-Z0-9]/gi, '')}-${codigo}`;

    // Polígono de 4 vértices da parede (em cm) para clique e pintura no canvas 2D
    const polygon = isHoriz
      ? [
          { x: faceMinStart, y: minPos },
          { x: faceMinEnd, y: minPos },
          { x: faceMaxEnd, y: maxPos },
          { x: faceMaxStart, y: maxPos },
        ]
      : [
          { x: minPos, y: faceMinStart },
          { x: minPos, y: faceMinEnd },
          { x: maxPos, y: faceMaxEnd },
          { x: maxPos, y: faceMaxStart },
        ];

    const linhaMedicaoPadrao = isHoriz
      ? {
          x1: measuredStart,
          y1: posLinhaMedicao,
          x2: measuredEnd,
          y2: posLinhaMedicao,
        }
      : {
          x1: posLinhaMedicao,
          y1: measuredStart,
          x2: posLinhaMedicao,
          y2: measuredEnd,
        };

    const linhaMedicaoAlternativa = isHoriz
      ? {
          x1: isHoriz ? startInner : startOuter,
          y1: posLinhaMedicao === maxPos ? minPos : maxPos,
          x2: isHoriz ? endInner : endOuter,
          y2: posLinhaMedicao === maxPos ? minPos : maxPos,
        }
      : {
          x1: posLinhaMedicao === maxPos ? minPos : maxPos,
          y1: startOuter,
          x2: posLinhaMedicao === maxPos ? minPos : maxPos,
          y2: endOuter,
        };

    wallPieces.push({
      id: codigo,
      codigo,
      guid,
      layer,
      layerLabel: WALL_LAYERS[layer].label,
      corLayer: WALL_LAYERS[layer].corHex,
      espessuraCm: t,
      orientacao: isHoriz ? 'H' : 'V',
      temCanto: hasCornerStart || hasCornerEnd,
      hasCornerStart,
      hasCornerEnd,
      comprimentoM: +(comprimentoPadraoCm / 100).toFixed(3),
      comprimentoBrutoM: +(comprimentoBrutoCm / 100).toFixed(3),
      comprimentoInternoM: +(comprimentoInternoCm / 100).toFixed(3),
      descontouCantoCm,
      alturaPadraoM: 2.65,
      polygon,
      center: {
        x: +(
          polygon.reduce((acc, p) => acc + p.x, 0) / polygon.length
        ).toFixed(2),
        y: +(
          polygon.reduce((acc, p) => acc + p.y, 0) / polygon.length
        ).toFixed(2),
      },
      linhaMedicaoPadrao,
      linhaMedicaoAlternativa,
      handles,
    });
  }

  for (const group of rawGroups) {
    const a = group[0];
    const positions = group.map((g) => g.pos);
    const minPos = +Math.min(...positions).toFixed(2);
    const maxPos = +Math.max(...positions).toFixed(2);
    const actualT = +(maxPos - minPos > 1 ? maxPos - minPos : a.t).toFixed(2);

    const sideMin = group
      .filter((g) => Math.abs(g.pos - minPos) < 1.0)
      .sort((x, y) => x.start - y.start);
    const sideMax = group
      .filter((g) => Math.abs(g.pos - maxPos) < 1.0)
      .sort((x, y) => x.start - y.start);

    // Se um dos lados está dividido em 2 segmentos por uma parede em T (ex: 255cm e 52.5cm),
    // criamos os 2 pedaços separados para que o usuário possa medir cada pedaço individualmente!
    if (sideMin.length === 2 && sideMax.length === 1) {
      const seg1 = sideMin[0];
      const seg2 = sideMin[1];
      const full = sideMax[0];
      // Pedaço 1 vai até o encontro T (sem contar a espessura da parede T)
      addWallPiece({
        layer: a.layer,
        t: actualT,
        isHoriz: a.isHoriz,
        minPos,
        maxPos,
        faceMinStart: seg1.start,
        faceMinEnd: seg1.end,
        faceMaxStart: full.start,
        faceMaxEnd: seg1.end,
        handles: [seg1.handle, full.handle],
      });
      // Pedaço 2 inclui o encontro T até o final (para que Pedaço 1 + Pedaço 2 = Comprimento Total sem perder nem duplicar o T)
      addWallPiece({
        layer: a.layer,
        t: actualT,
        isHoriz: a.isHoriz,
        minPos,
        maxPos,
        faceMinStart: seg1.end,
        faceMinEnd: seg2.end,
        faceMaxStart: seg1.end,
        faceMaxEnd: full.end,
        handles: [seg2.handle, full.handle],
      });
    } else if (sideMax.length === 2 && sideMin.length === 1) {
      const seg1 = sideMax[0];
      const seg2 = sideMax[1];
      const full = sideMin[0];
      addWallPiece({
        layer: a.layer,
        t: actualT,
        isHoriz: a.isHoriz,
        minPos,
        maxPos,
        faceMinStart: full.start,
        faceMinEnd: seg1.end,
        faceMaxStart: seg1.start,
        faceMaxEnd: seg1.end,
        handles: [seg1.handle, full.handle],
      });
      addWallPiece({
        layer: a.layer,
        t: actualT,
        isHoriz: a.isHoriz,
        minPos,
        maxPos,
        faceMinStart: seg1.end,
        faceMinEnd: full.end,
        faceMaxStart: seg1.end,
        faceMaxEnd: seg2.end,
        handles: [seg2.handle, full.handle],
      });
    } else {
      const startMin = Math.min(...sideMin.map((g) => g.start));
      const endMin = Math.max(...sideMin.map((g) => g.end));
      const startMax = sideMax.length
        ? Math.min(...sideMax.map((g) => g.start))
        : startMin;
      const endMax = sideMax.length
        ? Math.max(...sideMax.map((g) => g.end))
        : endMin;

      addWallPiece({
        layer: a.layer,
        t: actualT,
        isHoriz: a.isHoriz,
        minPos,
        maxPos,
        faceMinStart: startMin,
        faceMinEnd: endMin,
        faceMaxStart: startMax,
        faceMaxEnd: endMax,
        handles: group.map((g) => g.handle),
      });
    }
  }

  // Calcula bounding box geral do desenho DWG
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const w of wallPieces) {
    for (const p of w.polygon) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }

  // 3. Extrai os pavimentos reais do arquivo NEW LIFE_05072024.ifc
  const ifcContent = fs.readFileSync(IFC_PATH, 'latin1');
  const storeyRegex =
    /#(\d+)=IFCBUILDINGSTOREY\('([^']+)',#\d+,'([^']+)',[^,]*,[^,]*,#\d+,[^,]*,'([^']+)',\.ELEMENT\.,([-\d.]+)\);/g;
  const ifcStoreys = [];
  let match;
  while ((match = storeyRegex.exec(ifcContent)) !== null) {
    const expressID = Number(match[1]);
    const guid = match[2];
    const rawName = match[3]
      .replace(/\\X\\C1/g, 'Á')
      .replace(/\\X\\D3/g, 'Ó')
      .replace(/\\X\\ED/g, 'í')
      .replace(/\\X\\E7/g, 'ç')
      .replace(/\\X\\E3/g, 'ã');
    const elevation = Number(parseFloat(match[5]).toFixed(3));
    const isTipo = /^TIPO\s+\d+/i.test(rawName);
    const tipoNumMatch = rawName.match(/^TIPO\s+(\d+)/i);
    const numeroTipo = tipoNumMatch ? Number(tipoNumMatch[1]) : null;

    ifcStoreys.push({
      expressID,
      guid,
      nome: rawName,
      elevation,
      isTipo,
      numeroTipo,
    });
  }

  ifcStoreys.sort((a, b) => a.elevation - b.elevation);

  const outputData = {
    projeto: 'NEW LIFE — Controle de Medição de Alvenaria',
    arquivoIfc: 'NEW LIFE_05072024.ifc',
    arquivoDwg: 'app medição.dwg',
    totalPedaçosParedePorTipo: wallPieces.length,
    totalAndaresTipo: 14,
    bounds: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
    layers: WALL_LAYERS,
    ifcStoreys,
    structuralPolylines,
    windowLines,
    wallPieces,
  };

  const frontDataDir = path.join(ROOT_DIR, 'frontend', 'src', 'data');
  const backDataDir = path.join(ROOT_DIR, 'backend', 'data');
  fs.mkdirSync(frontDataDir, { recursive: true });
  fs.mkdirSync(backDataDir, { recursive: true });

  fs.writeFileSync(
    path.join(frontDataDir, 'dwgMeasurementPlan.json'),
    JSON.stringify(outputData, null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(backDataDir, 'dwgMeasurementPlan.json'),
    JSON.stringify(outputData, null, 2),
    'utf8'
  );

  console.log('✅ Extração concluída com sucesso!');
  console.log('Total de pedaços de parede por Pavimento Tipo:', wallPieces.length);
  console.log('Total nos 14 Andares Tipos:', wallPieces.length * 14);
  console.log('Total de Pavimentos no IFC:', ifcStoreys.length);
  const sampleCorner = wallPieces.filter(
    (w) => w.layer === '3 - TIJ-11.5' && w.handles.some((h) => ['9F7', '9F8'].includes(h))
  );
  console.log('Verificação do canto do print (9F7 / 9F8):', sampleCorner.map((s) => ({
    codigo: s.codigo,
    orientacao: s.orientacao,
    comprimentoM: s.comprimentoM,
    comprimentoBrutoM: s.comprimentoBrutoM,
    descontouCantoCm: s.descontouCantoCm,
    linhaMedicaoPadrao: s.linhaMedicaoPadrao,
  })));
}

extractAll();
