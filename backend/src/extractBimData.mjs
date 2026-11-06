import fs from 'fs';
import path from 'path';
import { LibreDwg, Dwg_File_Type } from '../node_modules/@mlightcad/libredwg-web/dist/libredwg-web.js';

const ROOT_DIR = path.resolve('..');
const DWG_PATH = path.join(ROOT_DIR, 'app medição.dwg');
const IFC_PATH = path.join(ROOT_DIR, 'NEW LIFE_05072024.ifc');
const STRUCT_IFC_PATH = path.join(ROOT_DIR, 'New Life Studios 2025-02-06.IFC');

// Offset exato de alinhamento entre coordenadas do IFC Estrutural TQS (cm) e o DWG (cm)
const IFC_TO_DWG_OFFSET_X = 4133.18;
const IFC_TO_DWG_OFFSET_Y = 2910.16;
const FLOOR_ELEV_2TIPO001_CM = 2171.0; // Topo da laje de piso do Tipo 01 (embaixo do teto 2 Tipo-001 em 2486.0 cm -> PD = 315 cm)

const WALL_LAYERS = {
  '4 - TIJ-19': { espessuraCm: 19, corHex: '#ec4899', label: 'Tijolo 19 cm' },
  '4 - TIJ-14': { espessuraCm: 14, corHex: '#eab308', label: 'Tijolo 14 cm' },
  '3 - TIJ-11.5': { espessuraCm: 11.5, corHex: '#f59e0b', label: 'Tijolo 11,5 cm' },
  '1 - TIJ-9': { espessuraCm: 9, corHex: '#a855f7', label: 'Tijolo 9 cm' },
  'SICAL-14': { espessuraCm: 14, corHex: '#fb923c', label: 'Sical 14 cm' },
  'SICAL-10': { espessuraCm: 10, corHex: '#38bdf8', label: 'Sical 10 cm' },
};

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0],
      yi = poly[i][1];
    const xj = poly[j][0],
      yj = poly[j][1];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function boxOverlap(a, b, tol = 0.5) {
  const ox = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const oy = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
  return ox > tol && oy > tol ? ox * oy : 0;
}

function extractStructuralIfc() {
  if (!fs.existsSync(STRUCT_IFC_PATH)) {
    return null;
  }
  const content = fs.readFileSync(STRUCT_IFC_PATH, 'utf8');
  const lines = content.split(/\r?\n/);
  const map = new Map();
  for (const l of lines) {
    const m = l.match(/^#(\d+)\s*=\s*(.+);$/);
    if (m) map.set(m[1], m[2]);
  }

  function getPt(id) {
    const s = map.get(id);
    const m = s?.match(/IFCCARTESIANPOINT\(\(([^)]+)\)\)/);
    return m ? m[1].split(',').map(Number) : [0, 0, 0];
  }
  function getDir(id) {
    const s = map.get(id);
    if (!s || id === '$') return null;
    const m = s.match(/IFCDIRECTION\(\(([^)]+)\)\)/);
    return m ? m[1].split(',').map(Number) : null;
  }
  function getAxis2Placement(id) {
    const s = map.get(id);
    if (!s || id === '$') return { loc: [0, 0, 0], z: [0, 0, 1], x: [1, 0, 0] };
    if (s.startsWith('IFCAXIS2PLACEMENT2D(')) {
      const m = s.match(/IFCAXIS2PLACEMENT2D\(#(\d+),([^)]+)\)/);
      const loc = getPt(m[1]);
      const x = m[2].startsWith('#') ? getDir(m[2].slice(1)) : [1, 0];
      return { loc: [loc[0] || 0, loc[1] || 0], x: [x[0] ?? 1, x[1] ?? 0] };
    }
    const m = s.match(/IFCAXIS2PLACEMENT3D\(#(\d+),([^,]+),([^)]+)\)/);
    const loc = getPt(m[1]);
    const z = m[2].startsWith('#') ? getDir(m[2].slice(1)) : [0, 0, 1];
    const x = m[3].startsWith('#') ? getDir(m[3].slice(1)) : [1, 0, 0];
    return {
      loc: [loc[0] || 0, loc[1] || 0, loc[2] || 0],
      z: [z[0] ?? 0, z[1] ?? 0, z[2] ?? 1],
      x: [x[0] ?? 1, x[1] ?? 0, x[2] ?? 0],
    };
  }
  function getLocalPlacement(id) {
    const s = map.get(id);
    if (!s) return [];
    const m = s.match(/IFCLOCALPLACEMENT\((#?\d*|\$),#(\d+)\)/);
    if (!m) return [];
    const parent = m[1].startsWith('#') ? getLocalPlacement(m[1].slice(1)) : [];
    return [...parent, getAxis2Placement(m[2])];
  }
  function transform2D(pt2d, placements) {
    let x = pt2d[0],
      y = pt2d[1],
      z = pt2d[2] || 0;
    for (let i = placements.length - 1; i >= 0; i--) {
      const p = placements[i];
      const ux = p.x || [1, 0, 0];
      const uz = p.z || [0, 0, 1];
      const uy = [
        uz[1] * ux[2] - uz[2] * ux[1],
        uz[2] * ux[0] - uz[0] * ux[2],
        uz[0] * ux[1] - uz[1] * ux[0],
      ];
      const nx = p.loc[0] + x * ux[0] + y * uy[0] + z * uz[0];
      const ny = p.loc[1] + x * ux[1] + y * uy[1] + z * uz[1];
      const nz = p.loc[2] + x * ux[2] + y * uy[2] + z * uz[2];
      x = nx;
      y = ny;
      z = nz;
    }
    return [x, y, z];
  }
  function getProfilePolygon(profId) {
    const s = map.get(profId);
    if (!s) return [];
    if (s.startsWith('IFCRECTANGLEPROFILEDEF(')) {
      const m = s.match(
        /IFCRECTANGLEPROFILEDEF\([^,]+,[^,]+,#(\d+),([0-9.E+-]+),([0-9.E+-]+)\)/
      );
      const pos2d = getAxis2Placement(m[1]);
      const dx = Number(m[2]) / 2,
        dy = Number(m[3]) / 2;
      const pts = [
        [-dx, -dy],
        [dx, -dy],
        [dx, dy],
        [-dx, dy],
      ];
      const ux = pos2d.x || [1, 0],
        uy = [-ux[1], ux[0]];
      return pts.map(([px, py]) => [
        pos2d.loc[0] + px * ux[0] + py * uy[0],
        pos2d.loc[1] + px * ux[1] + py * uy[1],
      ]);
    } else if (s.startsWith('IFCARBITRARYCLOSEDPROFILEDEF(')) {
      const m = s.match(/#(\d+)/);
      const curve = map.get(m[1]);
      return [...curve.matchAll(/#(\d+)/g)].map((x) => getPt(x[1]));
    }
    return [];
  }

  // Extrai elementos do pavimento tipo padrão (#264438 -> #201 '2 Tipo-001', cota 2486 cm, piso abaixo em 2171 cm)
  const rel = map.get('264438');
  const elemIds = [...rel.matchAll(/#(\d+)/g)].map((x) => x[1]).slice(0, -1);

  const beams = [];
  const slabs = [];
  const columns = [];

  for (const id of elemIds) {
    const def = map.get(id);
    if (!def) continue;
    const isBeam = def.startsWith('IFCBEAM(');
    const isSlab = def.startsWith('IFCSLAB(');
    const isCol = def.startsWith('IFCCOLUMN(');
    if (!isBeam && !isSlab && !isCol) continue;

    const m = def.match(
      /IFC(?:BEAM|SLAB|COLUMN)\('[^']+',#\d+,'([^']*)','([^']*)','[^']*',#(\d+),#(\d+)/
    );
    if (!m) continue;
    const lp = getLocalPlacement(m[3]);
    const pds = map.get(m[4]);
    for (const rMatch of pds.matchAll(/#(\d+)/g)) {
      const rep = map.get(rMatch[1]);
      if (!rep || !rep.startsWith('IFCSHAPEREPRESENTATION(')) continue;
      for (const iMatch of [...rep.matchAll(/#(\d+)/g)].slice(1)) {
        const item = map.get(iMatch[1]);
        if (item && item.startsWith('IFCEXTRUDEDAREASOLID(')) {
          const em = item.match(
            /IFCEXTRUDEDAREASOLID\(#(\d+),#(\d+),#(\d+),([0-9.E+-]+)\)/
          );
          if (!em) continue;
          const poly2d = getProfilePolygon(em[1]);
          const pos3d = getAxis2Placement(em[2]);
          const depth = Number(em[4]);
          const worldPts = poly2d.map((pt) =>
            transform2D([pt[0], pt[1], 0], [...lp, pos3d])
          );
          const xs = worldPts.map((p) => +(p[0] + IFC_TO_DWG_OFFSET_X).toFixed(2));
          const ys = worldPts.map((p) => +(p[1] + IFC_TO_DWG_OFFSET_Y).toFixed(2));
          const zBottom = worldPts[0] ? worldPts[0][2] : 0;
          const heightFromFloorCm = +(zBottom - FLOOR_ELEV_2TIPO001_CM).toFixed(1);
          const obj = {
            id,
            name: m[1],
            depthCm: +depth.toFixed(1),
            zBottomRelCm: heightFromFloorCm,
            heightM: +(heightFromFloorCm / 100).toFixed(3),
            minX: +Math.min(...xs).toFixed(2),
            maxX: +Math.max(...xs).toFixed(2),
            minY: +Math.min(...ys).toFixed(2),
            maxY: +Math.max(...ys).toFixed(2),
            poly: worldPts.map((p) => [
              +(p[0] + IFC_TO_DWG_OFFSET_X).toFixed(1),
              +(p[1] + IFC_TO_DWG_OFFSET_Y).toFixed(1),
            ]),
          };
          if (isBeam) beams.push(obj);
          else if (isSlab) slabs.push(obj);
          else if (isCol) columns.push(obj);
        }
      }
    }
  }

  // Extrai todas as 373 cubetas (IFCOPENINGELEMENT de L1 #111084 e L2 #116952)
  const cubetas = [];
  for (const [, val] of map.entries()) {
    if (
      val.startsWith('IFCRELVOIDSELEMENT(') &&
      (val.includes(',#111084,') || val.includes(',#116952,'))
    ) {
      const m = val.match(/,#(\d+),#(\d+)\)$/);
      if (!m) continue;
      const openId = m[2];
      const odef = map.get(openId);
      const om = odef?.match(
        /IFCOPENINGELEMENT\('[^']+',#\d+,'[^']*',[^,]+,'[^']*',#(\d+),#(\d+)/
      );
      if (!om) continue;
      const lp = getLocalPlacement(om[1]);
      const pds = map.get(om[2]);
      const repId = [...pds.matchAll(/#(\d+)/g)][0]?.[1];
      const solidId = [...(map.get(repId) || '').matchAll(/#(\d+)/g)][1]?.[1];
      const em = map
        .get(solidId)
        ?.match(/IFCEXTRUDEDAREASOLID\(#(\d+),#(\d+),#(\d+),([0-9.E+-]+)\)/);
      if (!em) continue;
      const poly2d = getProfilePolygon(em[1]);
      const pos3d = getAxis2Placement(em[2]);
      const worldPts = poly2d.map((pt) =>
        transform2D([pt[0], pt[1], 0], [...lp, pos3d])
      );
      const xs = worldPts.map((p) => p[0] + IFC_TO_DWG_OFFSET_X);
      const ys = worldPts.map((p) => p[1] + IFC_TO_DWG_OFFSET_Y);
      cubetas.push({
        slab: m[1] === '111084' ? 'L1' : 'L2',
        minX: +Math.min(...xs).toFixed(1),
        maxX: +Math.max(...xs).toFixed(1),
        minY: +Math.min(...ys).toFixed(1),
        maxY: +Math.max(...ys).toFixed(1),
      });
    }
  }

  return {
    arquivo: 'New Life Studios 2025-02-06.IFC',
    sistema: 'TQS 21.15.25 — Exata / SEP Engenharia',
    peDireitoEstruturalTipoCm: 315,
    peDireitoEstruturalTipo14Cm: 323,
    especificacaoCubeta: {
      fabricante: 'Atex',
      modelo: 'Atex 800 Capa 5.0 H 25.0',
      capaCm: 5,
      alturaNervuraCm: 25,
      espessuraTotalLajeCm: 30,
      larguraNervuraCm: 12.5,
      aberturaCubetaCm: 64.8,
      eixoAEixoCm: 80.0,
      alturaAlvenariaFundoNervuraM: 2.85,
      alturaAlvenariaDentroCubetaM: 3.1,
      totalCubetasPorTipo: cubetas.length,
    },
    columns,
    beams,
    slabs,
    cubetas,
  };
}

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

  // 1b. Extrai geometria 3D estrutural real (New Life Studios 2025-02-06.IFC)
  const structuralIfc = extractStructuralIfc();

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

  const wallPieces = [];

  function computeWallStructuralMetrics(polygon, orientacao, espessuraCm, comprimentoM) {
    if (!structuralIfc) {
      return {
        estruturaAcima: 'Altura Padrão (2,65 m)',
        tipoEstruturaAcima: 'padrao',
        qtdCubetasAcima: 0,
        alturaPadraoM: 2.65,
        alturaComCubetaCheiaM: 2.65,
        alturaComCubetaExataM: 2.65,
        alturaSemCubetaM: 2.65,
      };
    }

    const wxs = polygon.map((p) => p.x);
    const wys = polygon.map((p) => p.y);
    let minX = Math.min(...wxs),
      maxX = Math.max(...wxs),
      minY = Math.min(...wys),
      maxY = Math.max(...wys);
    if (maxX - minX < 1) {
      minX -= espessuraCm / 2;
      maxX += espessuraCm / 2;
    }
    if (maxY - minY < 1) {
      minY -= espessuraCm / 2;
      maxY += espessuraCm / 2;
    }
    const wb = { minX, maxX, minY, maxY };
    const wArea = Math.max(1, (maxX - minX) * (maxY - minY));

    // Vigas que se sobrepõem à parede
    const hitBeams = structuralIfc.beams
      .filter((b) => boxOverlap(wb, b, 0.3) > 0)
      .map((b) => ({
        ...b,
        overlapRatio: boxOverlap(wb, b, 0) / wArea,
      }));
    const longBeams = hitBeams.filter((b) => b.overlapRatio >= 0.3);
    const hitCubetas = structuralIfc.cubetas.filter((c) => boxOverlap(wb, c, 0.3) > 0);
    const hitSlabs = structuralIfc.slabs.filter((s) => boxOverlap(wb, s, 0.3) > 0);

    // Amostragem ao longo da parede (a cada 2 cm) para perfil exato sob vigas, nervuras e cubetas
    const steps = Math.max(10, Math.round(comprimentoM * 50));
    let sumExact = 0,
      sumFullCubeta = 0,
      sumNoCubeta = 0;

    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps;
      const x = orientacao === 'H' ? minX + t * (maxX - minX) : (minX + maxX) / 2;
      const y = orientacao === 'V' ? minY + t * (maxY - minY) : (minY + maxY) / 2;
      const crossOffsets = [-espessuraCm * 0.35, 0, espessuraCm * 0.35];

      let beamH = null;
      for (const co of crossOffsets) {
        const px = orientacao === 'V' ? x + co : x;
        const py = orientacao === 'H' ? y + co : y;
        for (const b of structuralIfc.beams) {
          if (
            px >= b.minX - 0.5 &&
            px <= b.maxX + 0.5 &&
            py >= b.minY - 0.5 &&
            py <= b.maxY + 0.5 &&
            pointInPoly(px, py, b.poly)
          ) {
            if (beamH === null || b.heightM < beamH) beamH = b.heightM;
          }
        }
      }

      if (beamH !== null) {
        sumExact += beamH;
        sumFullCubeta += beamH;
        sumNoCubeta += beamH;
        continue;
      }

      let inCubeta = false;
      for (const co of crossOffsets) {
        const px = orientacao === 'V' ? x + co : x;
        const py = orientacao === 'H' ? y + co : y;
        for (const c of structuralIfc.cubetas) {
          if (px >= c.minX && px <= c.maxX && py >= c.minY && py <= c.maxY) {
            inCubeta = true;
            break;
          }
        }
        if (inCubeta) break;
      }

      let slabH = 2.85;
      let isL1L2 = false;
      for (const sl of structuralIfc.slabs) {
        if (
          x >= sl.minX - 2 &&
          x <= sl.maxX + 2 &&
          y >= sl.minY - 2 &&
          y <= sl.maxY + 2 &&
          pointInPoly(x, y, sl.poly)
        ) {
          if (sl.name === 'L1' || sl.name === 'L2') isL1L2 = true;
          else if (sl.name === 'L6' || sl.name === 'L7') slabH = 3.0;
          else slabH = sl.heightM;
        }
      }

      if (inCubeta) {
        sumExact += 3.1;
        sumFullCubeta += 3.1;
        sumNoCubeta += 2.85;
      } else if (isL1L2) {
        sumExact += 2.85;
        sumFullCubeta += 3.1;
        sumNoCubeta += 2.85;
      } else {
        sumExact += slabH;
        sumFullCubeta += slabH;
        sumNoCubeta += slabH;
      }
    }

    const avgExact = +(sumExact / steps).toFixed(3);
    const avgFull = +(sumFullCubeta / steps).toFixed(3);
    const avgNoCubeta = +(sumNoCubeta / steps).toFixed(3);

    let estruturaAcima = '';
    let tipoEstruturaAcima = '';
    let alturaPadraoM = avgFull;

    if (longBeams.length > 0) {
      // Parede corre longitudinalmente sob viga
      const minBeam = longBeams.reduce((a, b) => (a.heightM <= b.heightM ? a : b));
      const beamNames = [...new Set(longBeams.map((b) => `${b.name} (h=${b.depthCm}cm)`))].join(' + ');
      estruturaAcima = `Viga ${beamNames} → H=${minBeam.heightM.toFixed(2)}m`;
      tipoEstruturaAcima = 'viga';
      alturaPadraoM = +minBeam.heightM.toFixed(2);
    } else if (hitCubetas.length > 0) {
      const slabName = hitCubetas[0].slab;
      estruturaAcima = `Laje Cubeta ${slabName} (${hitCubetas.length} cubetas Atex 800, capa 5cm) → H=3,10m`;
      tipoEstruturaAcima = 'cubeta';
      alturaPadraoM = 3.1;
    } else if (hitSlabs.some((s) => s.name === 'L6' || s.name === 'L7')) {
      const sName = hitSlabs.find((s) => s.name === 'L6' || s.name === 'L7').name;
      estruturaAcima = `Laje ${sName} (h=15cm) → H=3,00m`;
      tipoEstruturaAcima = 'laje_rebaixada';
      alturaPadraoM = 3.0;
    } else if (hitSlabs.some((s) => s.name === 'L1' || s.name === 'L2')) {
      const sName = hitSlabs.find((s) => s.name === 'L1' || s.name === 'L2').name;
      estruturaAcima = `Nervura/Capitel ${sName} (h=30cm) → H=2,85m`;
      tipoEstruturaAcima = 'nervura_capitel';
      alturaPadraoM = 2.85;
    } else if (hitSlabs.length > 0) {
      const s = hitSlabs[0];
      estruturaAcima = `Laje Maciça ${s.name} (h=${s.depthCm}cm) → H=${s.heightM.toFixed(2)}m`;
      tipoEstruturaAcima = 'laje_macica';
      alturaPadraoM = +s.heightM.toFixed(2);
    } else if (hitBeams.length > 0) {
      const b = hitBeams[0];
      estruturaAcima = `Viga ${b.name} (h=${b.depthCm}cm) → H=${b.heightM.toFixed(2)}m`;
      tipoEstruturaAcima = 'viga';
      alturaPadraoM = +b.heightM.toFixed(2);
    } else {
      estruturaAcima = 'Laje/Viga de Borda (h=30cm) → H=2,85m';
      tipoEstruturaAcima = 'laje_macica';
      alturaPadraoM = 2.85;
    }

    return {
      estruturaAcima,
      tipoEstruturaAcima,
      qtdCubetasAcima: hitCubetas.length,
      alturaPadraoM,
      alturaComCubetaCheiaM: tipoEstruturaAcima === 'cubeta' ? 3.1 : alturaPadraoM,
      alturaComCubetaExataM: avgExact,
      alturaSemCubetaM: avgNoCubeta,
    };
  }

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
    if (Math.max(lenMinCm, lenMaxCm) < 22) return;

    const startOuter = Math.min(faceMinStart, faceMaxStart);
    const startInner = Math.max(faceMinStart, faceMaxStart);
    const endInner = Math.min(faceMinEnd, faceMaxEnd);
    const endOuter = Math.max(faceMinEnd, faceMaxEnd);

    const hasCornerStart = Math.abs(startInner - startOuter) >= 4.0;
    const hasCornerEnd = Math.abs(endOuter - endInner) >= 4.0;

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

    let posLinhaMedicao = lenMaxCm >= lenMinCm ? maxPos : minPos;
    if (!isHoriz && (hasCornerStart || hasCornerEnd)) {
      posLinhaMedicao = lenMinCm <= lenMaxCm ? minPos : maxPos;
    } else if (isHoriz && (hasCornerStart || hasCornerEnd)) {
      posLinhaMedicao = lenMaxCm >= lenMinCm ? maxPos : minPos;
    }

    const idx = wallPieces.length + 1;
    const codigo = `P-${String(idx).padStart(3, '0')}`;
    const guid = `DWG-${layer.replace(/[^A-Z0-9]/gi, '')}-${codigo}`;

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

    const comprimentoM = +(comprimentoPadraoCm / 100).toFixed(3);
    const orientacao = isHoriz ? 'H' : 'V';
    const structMetrics = computeWallStructuralMetrics(
      polygon,
      orientacao,
      t,
      comprimentoM
    );

    wallPieces.push({
      id: codigo,
      codigo,
      guid,
      layer,
      layerLabel: WALL_LAYERS[layer].label,
      corLayer: WALL_LAYERS[layer].corHex,
      espessuraCm: t,
      orientacao,
      temCanto: hasCornerStart || hasCornerEnd,
      hasCornerStart,
      hasCornerEnd,
      comprimentoM,
      comprimentoBrutoM: +(comprimentoBrutoCm / 100).toFixed(3),
      comprimentoInternoM: +(comprimentoInternoCm / 100).toFixed(3),
      descontouCantoCm,
      ...structMetrics,
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

    if (sideMin.length === 2 && sideMax.length === 1) {
      const seg1 = sideMin[0];
      const seg2 = sideMin[1];
      const full = sideMax[0];
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
    arquivoIfcEstrutural: 'New Life Studios 2025-02-06.IFC',
    arquivoDwg: 'app medição.dwg',
    totalPedaçosParedePorTipo: wallPieces.length,
    totalAndaresTipo: 14,
    bounds: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
    layers: WALL_LAYERS,
    ifcStoreys,
    structuralPolylines,
    structuralIfc,
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
  console.log('Total de cubetas extraídas por Tipo:', structuralIfc?.cubetas?.length || 0);
  const byType = {};
  for (const w of wallPieces) {
    byType[w.tipoEstruturaAcima] = (byType[w.tipoEstruturaAcima] || 0) + 1;
  }
  console.log('Resumo das paredes por estrutura acima:', byType);
}

extractAll();
