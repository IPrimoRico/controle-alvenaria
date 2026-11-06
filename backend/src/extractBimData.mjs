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

// Definição espacial das 5 Churrasqueiras de Sical por Pavimento Tipo (feitas inteiras de uma vez, fora da área m²)
function classifyChurrasqueira(polygon, layer) {
  if (!layer.startsWith('SICAL')) return null;
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const lenX = Math.max(...xs) - Math.min(...xs);
  const lenY = Math.max(...ys) - Math.min(...ys);
  const maxSpan = Math.max(lenX, lenY);

  // Paredes da escada/elevador central (X=3300..3760, Y=2470..2980 com comprimentos grandes ou coladas ao núcleo) não são churrasqueiras
  if (cx >= 3300 && cx <= 3760 && cy >= 2470 && cy <= 2980) {
    return null;
  }
  if (maxSpan > 150) return null;

  if (cy > 2850 && cx < 3350) {
    return {
      id: 'CHURR-01',
      nome: 'Churrasqueira 01 (Sacada Sup. Oeste)',
      apto: 'Apto Final 01 (Noroeste)',
    };
  }
  if (cy > 2850 && cx >= 4000) {
    return {
      id: 'CHURR-02',
      nome: 'Churrasqueira 02 (Sacada Sup. Leste)',
      apto: 'Apto Final 02 (Nordeste)',
    };
  }
  if (cy < 2000 && cx < 3000) {
    return {
      id: 'CHURR-03',
      nome: 'Churrasqueira 03 (Sacada Inf. Oeste)',
      apto: 'Aptos Inferiores Oeste',
    };
  }
  if (cy < 2000 && cx >= 3700 && cx <= 4100) {
    return {
      id: 'CHURR-04',
      nome: 'Churrasqueira 04 (Sacada Inf. Central)',
      apto: 'Aptos Inferiores Centrais',
    };
  }
  if (cy < 2000 && cx > 4350) {
    return {
      id: 'CHURR-05',
      nome: 'Churrasqueira 05 (Sacada Inf. Leste)',
      apto: 'Aptos Inferiores Leste',
    };
  }
  return null;
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

  // 1. Extrai elementos do pavimento tipo padrão (#264438 -> #201 '2 Tipo-001', cota 2486 cm, piso abaixo em 2171 cm)
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

  // 2. Extrai todas as cubetas (IFCOPENINGELEMENT de L1 #111084 e L2 #116952)
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

  // 3. Extrai todo o Estrutural 3D das Garagens (Térreo 1, Térreo 2, Mezanino, Garagens, Lazer, Esc, 1 Tipo)
  // e da Cobertura / Caixa d'Água (Cobertura, Casa Máq, Reservatório, Fechamento)
  const garageAndRoofElements = [];
  for (const [, val] of map.entries()) {
    if (!val.startsWith('IFCRELCONTAINEDINSPATIALSTRUCTURE(')) continue;
    const stId = val.match(/,#(\d+)\)$/)?.[1];
    const stDef = map.get(stId) || '';
    const sm = stDef.match(
      /IFCBUILDINGSTOREY\('[^']+',#\d+,'([^']*)',[^,]*,[^,]*,#\d+,[^,]*,[^,]*,\.ELEMENT\.,([0-9.E+-]+)\)/
    );
    if (!sm) continue;
    const rawStoreyName = sm[1]
      .replace(/\\X\\E9/g, 'é')
      .replace(/\\X\\E1/g, 'á');
    // Ignora os '2 Tipo-001'..'2 Tipo-013' pois já são renderizados no loop dos Tipos
    if (rawStoreyName.startsWith('2 Tipo-')) continue;

    const eIds = [...val.matchAll(/#(\d+)/g)].map((x) => x[1]).slice(0, -1);
    for (const eid of eIds) {
      const def = map.get(eid);
      if (!def) continue;
      let kind = null;
      if (def.startsWith('IFCCOLUMN(')) kind = 'column';
      else if (def.startsWith('IFCBEAM(')) kind = 'beam';
      else if (def.startsWith('IFCSLAB(')) kind = 'slab';
      else if (def.startsWith('IFCRAMP(')) kind = 'ramp';
      else if (def.startsWith('IFCSTAIR(')) kind = 'stair';
      if (!kind) continue;

      const m = def.match(
        /IFC(?:COLUMN|BEAM|SLAB|RAMP|STAIR)\('[^']+',#\d+,'([^']*)','([^']*)','[^']*',#(\d+),#(\d+)/
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
            if (!poly2d.length) continue;
            const pos3d = getAxis2Placement(em[2]);
            const depthCm = Number(em[4]);
            const worldPts = poly2d.map((pt) =>
              transform2D([pt[0], pt[1], 0], [...lp, pos3d])
            );
            const xs = worldPts.map((p) => +(p[0] + IFC_TO_DWG_OFFSET_X).toFixed(1));
            const ys = worldPts.map((p) => +(p[1] + IFC_TO_DWG_OFFSET_Y).toFixed(1));
            const zBottomCm = worldPts[0] ? worldPts[0][2] : 0;
            garageAndRoofElements.push({
              kind,
              storey: rawStoreyName,
              name: m[1],
              minX: Math.min(...xs),
              maxX: Math.max(...xs),
              minY: Math.min(...ys),
              maxY: Math.max(...ys),
              zBottomM: +(zBottomCm / 100).toFixed(2),
              heightM: +(depthCm / 100).toFixed(2),
            });
          }
        }
      }
    }
  }

  return {
    arquivo: 'New Life Studios 2025-02-06.IFC',
    sistema: 'TQS 21.15.25 — Exata / SEP Engenharia',
    peDireitoEstruturalTipoCm: 315,
    peDireitoEstruturalTipo14Cm: 323,
    acrescimoTipo14M: 0.08,
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
    garageAndRoofElements,
  };
}

async function extractAll() {
  const wasmDir = path.resolve('./node_modules/@mlightcad/libredwg-web/wasm');
  const libredwg = await LibreDwg.create(wasmDir);
  const buf = fs.readFileSync(DWG_PATH);
  const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const data = libredwg.dwg_read_data(arrayBuf, Dwg_File_Type.DWG);
  const db = libredwg.convert(data);

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

  const structuralIfc = extractStructuralIfc();

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

  /**
   * Calcula a geometria exata da parede segundo as regras do usuário:
   * 1. Trecho Verde (Dentro das Cubetas, unindo nervuras intermediárias pelo encunhamento): H = 3,10m (3,18m no Tipo 14)
   * 2. Trecho Vermelho (Onde acabam as cubetas no canto da parede / maciço / capitel): H = 2,85m (2,93m no Tipo 14)
   * 3. Paredes exatamente embaixo da nervura longitudinal: H = 2,85m igual laje maciça (2,93m no Tipo 14)
   * 4. Vigas e dentes de vigas de borda com rebaixo: desconta o dente no trecho exato da viga
   */
  function computeWallStructuralMetrics(polygon, orientacao, espessuraCm, comprimentoM, churrInfo) {
    if (churrInfo) {
      return {
        isChurrasqueira: true,
        churrasqueiraId: churrInfo.id,
        churrasqueiraNome: churrInfo.nome,
        churrasqueiraApto: churrInfo.apto,
        estruturaAcima: `${churrInfo.nome} — Medição por Unidade Inteira (Fora da Área m²)`,
        tipoEstruturaAcima: 'churrasqueira',
        qtdCubetasAcima: 0,
        compCubetaVerdeM: 0,
        compMacicoVermelhoM: 0,
        compDenteVigaM: 0,
        alturaDenteVigaM: 0,
        trechosVisualizacao: [],
        alturaPadraoM: 2.85,
        alturaPadraoTipo14M: 2.93,
      };
    }

    if (!structuralIfc) {
      return {
        isChurrasqueira: false,
        churrasqueiraId: null,
        estruturaAcima: 'Altura Padrão (2,85 m)',
        tipoEstruturaAcima: 'padrao',
        qtdCubetasAcima: 0,
        compCubetaVerdeM: 0,
        compMacicoVermelhoM: comprimentoM,
        compDenteVigaM: 0,
        alturaDenteVigaM: 0,
        trechosVisualizacao: [],
        alturaPadraoM: 2.85,
        alturaPadraoTipo14M: 2.93,
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
    const isH = orientacao === 'H';
    const wStart = isH ? minX : minY;
    const wEnd = isH ? maxX : maxY;
    const rawLenCm = Math.max(1, wEnd - wStart);
    const scaleFactor = (comprimentoM * 100) / rawLenCm;
    const posTransversal = isH ? (minY + maxY) / 2 : (minX + maxX) / 2;

    // 1. Verifica interseção com vigas ao longo do eixo da parede
    const beamIntervals = [];
    for (const b of structuralIfc.beams) {
      if (boxOverlap(wb, b, 0.3) > 0) {
        const bStart = Math.max(wStart, isH ? b.minX : b.minY);
        const bEnd = Math.min(wEnd, isH ? b.maxX : b.maxY);
        if (bEnd > bStart) {
          beamIntervals.push({
            name: b.name,
            depthCm: b.depthCm,
            heightM: b.heightM,
            start: bStart,
            end: bEnd,
            spanCm: bEnd - bStart,
          });
        }
      }
    }

    const totalBeamSpanCm = beamIntervals.reduce((acc, b) => acc + b.spanCm, 0);
    const isLongitudinalBeam = totalBeamSpanCm / rawLenCm >= 0.65;

    // 2. Verifica se é parede inteiramente sob viga longitudinal
    if (isLongitudinalBeam) {
      const minBeam = beamIntervals.reduce((a, b) => (a.heightM <= b.heightM ? a : b));
      const beamNames = [...new Set(beamIntervals.map((b) => `${b.name} (h=${b.depthCm}cm)`))].join(' + ');
      const hTipo = +minBeam.heightM.toFixed(2);
      return {
        isChurrasqueira: false,
        churrasqueiraId: null,
        estruturaAcima: `Sob Viga ${beamNames} → H=${hTipo.toFixed(2)}m`,
        tipoEstruturaAcima: 'viga',
        qtdCubetasAcima: 0,
        compCubetaVerdeM: 0,
        compMacicoVermelhoM: comprimentoM,
        compDenteVigaM: 0,
        alturaDenteVigaM: hTipo,
        trechosVisualizacao: [
          {
            tipo: 'vermelho_fundo',
            label: `Viga ${minBeam.name} (${hTipo.toFixed(2)}m)`,
            x1: isH ? wStart : posTransversal,
            y1: isH ? posTransversal : wStart,
            x2: isH ? wEnd : posTransversal,
            y2: isH ? posTransversal : wEnd,
          },
        ],
        alturaPadraoM: hTipo,
        alturaPadraoTipo14M: +(hTipo + 0.08).toFixed(2),
      };
    }

    // 3. Verifica cubetas que cruzam esta parede
    const hitCubetas = structuralIfc.cubetas.filter((c) => boxOverlap(wb, c, 0.8) > 0);
    const hitSlabs = structuralIfc.slabs.filter((s) => boxOverlap(wb, s, 0.5) > 0);

    // Dentes de vigas que têm rebaixo (heightM < 2.85m) cruzando parcialmente a parede
    const droppedTeeth = beamIntervals.filter((b) => b.heightM < 2.85);
    const toothRawCm = Math.min(
      rawLenCm,
      droppedTeeth.reduce((acc, b) => acc + b.spanCm, 0)
    );
    const compDenteVigaM = +(toothRawCm * scaleFactor / 100).toFixed(3);
    const alturaDenteVigaM =
      droppedTeeth.length > 0
        ? Math.min(...droppedTeeth.map((b) => b.heightM))
        : 2.85;
    const nomesDenteViga = [...new Set(droppedTeeth.map((b) => `${b.name} (H=${b.heightM}m)`))].join(', ');

    if (hitCubetas.length > 0) {
      // Projeta cada cubeta no eixo da parede e une cubetas consecutivas separadas apenas pela nervura (<= 22 cm)
      const cubIntervals = hitCubetas
        .map((c) => [
          Math.max(wStart, isH ? c.minX : c.minY),
          Math.min(wEnd, isH ? c.maxX : c.maxY),
        ])
        .filter(([a, b]) => b > a)
        .sort((a, b) => a[0] - b[0]);

      const mergedGreen = [];
      for (const intv of cubIntervals) {
        if (!mergedGreen.length) mergedGreen.push([...intv]);
        else {
          const last = mergedGreen[mergedGreen.length - 1];
          if (intv[0] - last[1] <= 22.0) {
            last[1] = Math.max(last[1], intv[1]);
          } else {
            mergedGreen.push([...intv]);
          }
        }
      }

      const greenRawCm = mergedGreen.reduce((acc, [a, b]) => acc + (b - a), 0);
      const compCubetaVerdeM = +Math.min(
        comprimentoM,
        +(greenRawCm * scaleFactor / 100).toFixed(3)
      ).toFixed(3);
      const restanteForaCubetaM = +Math.max(0, comprimentoM - compCubetaVerdeM).toFixed(3);
      const compDenteEfetivoM = +Math.min(restanteForaCubetaM, compDenteVigaM).toFixed(3);
      const compMacicoVermelhoM = +Math.max(
        0,
        restanteForaCubetaM - compDenteEfetivoM
      ).toFixed(3);

      // Cálculo exato da área somando Trecho Verde (3,10m) + Trecho Vermelho Fundo da Laje (2,85m) + Dente de Viga (se houver)
      const areaTipoPadraoM2 =
        compCubetaVerdeM * 3.1 +
        compMacicoVermelhoM * 2.85 +
        compDenteEfetivoM * alturaDenteVigaM;
      const alturaEquivalenteM = +(areaTipoPadraoM2 / comprimentoM).toFixed(3);
      const alturaEquivalenteTipo14M = +(alturaEquivalenteM + 0.08).toFixed(3);

      // Monta os segmentos visuais Verde (Cubeta) e Vermelho (Fundo da Laje / Dente) para mostrar na planta DWG!
      const trechosVisualizacao = [];
      let cursor = wStart;
      for (const [gStart, gEnd] of mergedGreen) {
        if (gStart - cursor > 1.0) {
          trechosVisualizacao.push({
            tipo: 'vermelho_fundo',
            label: `Fundo da Laje 2,85m (${(((gStart - cursor) * scaleFactor) / 100).toFixed(2)}m)`,
            x1: isH ? cursor : posTransversal,
            y1: isH ? posTransversal : cursor,
            x2: isH ? gStart : posTransversal,
            y2: isH ? posTransversal : gStart,
          });
        }
        trechosVisualizacao.push({
          tipo: 'verde_cubeta',
          label: `Cubeta +25cm = 3,10m (${(((gEnd - gStart) * scaleFactor) / 100).toFixed(2)}m)`,
          x1: isH ? gStart : posTransversal,
          y1: isH ? posTransversal : gStart,
          x2: isH ? gEnd : posTransversal,
          y2: isH ? posTransversal : gEnd,
        });
        cursor = gEnd;
      }
      if (wEnd - cursor > 1.0) {
        trechosVisualizacao.push({
          tipo: 'vermelho_fundo',
          label: `Fundo da Laje 2,85m (${(((wEnd - cursor) * scaleFactor) / 100).toFixed(2)}m)`,
          x1: isH ? cursor : posTransversal,
          y1: isH ? posTransversal : cursor,
          x2: isH ? wEnd : posTransversal,
          y2: isH ? posTransversal : wEnd,
        });
      }

      const slabName = hitCubetas[0].slab;
      const resumoPartes = [];
      if (compCubetaVerdeM > 0) resumoPartes.push(`🟢 ${compCubetaVerdeM}m na Cubeta (3,10m)`);
      if (compMacicoVermelhoM > 0) resumoPartes.push(`🔴 ${compMacicoVermelhoM}m no Fundo da Laje (2,85m)`);
      if (compDenteEfetivoM > 0)
        resumoPartes.push(`🔵 ${compDenteEfetivoM}m sob Dente ${nomesDenteViga}`);

      return {
        isChurrasqueira: false,
        churrasqueiraId: null,
        estruturaAcima: `Laje ${slabName}: ${resumoPartes.join(' + ')} → H méd=${alturaEquivalenteM}m`,
        tipoEstruturaAcima: 'cubeta_parcial',
        qtdCubetasAcima: hitCubetas.length,
        compCubetaVerdeM,
        compMacicoVermelhoM,
        compDenteVigaM: compDenteEfetivoM,
        alturaDenteVigaM,
        nomesDenteViga,
        trechosVisualizacao,
        alturaPadraoM: alturaEquivalenteM,
        alturaPadraoTipo14M: alturaEquivalenteTipo14M,
      };
    }

    // 4. Paredes sem cubeta (Exatamente embaixo da nervura longitudinal, capitel maciço ou laje maciça/rebaixada)
    let baseSlabH = 2.85;
    let tipoEst = 'nervura_capitel';
    let descEst = 'Sob Nervura/Laje Maciça (h=30cm) → Pé-direito normal H=2,85m';

    if (hitSlabs.some((s) => s.name === 'L6' || s.name === 'L7')) {
      const sName = hitSlabs.find((s) => s.name === 'L6' || s.name === 'L7').name;
      baseSlabH = 3.0;
      tipoEst = 'laje_rebaixada';
      descEst = `Laje ${sName} (h=15cm) → H=3,00m`;
    } else if (hitSlabs.some((s) => s.name === 'L1' || s.name === 'L2')) {
      const sName = hitSlabs.find((s) => s.name === 'L1' || s.name === 'L2').name;
      baseSlabH = 2.85;
      tipoEst = 'nervura_capitel';
      descEst = `Embaixo da Nervura / Maciço ${sName} (h=30cm) → H=2,85m`;
    } else if (hitSlabs.length > 0) {
      const s = hitSlabs[0];
      baseSlabH = +s.heightM.toFixed(2);
      tipoEst = 'laje_macica';
      descEst = `Laje Maciça ${s.name} (h=${s.depthCm}cm) → H=${baseSlabH.toFixed(2)}m`;
    }

    const compDenteEfetivoM = +Math.min(comprimentoM, compDenteVigaM).toFixed(3);
    const compMacicoVermelhoM = +Math.max(0, comprimentoM - compDenteEfetivoM).toFixed(3);
    const areaTotal =
      compMacicoVermelhoM * baseSlabH + compDenteEfetivoM * alturaDenteVigaM;
    const alturaEq = +(areaTotal / comprimentoM).toFixed(3);

    if (compDenteEfetivoM > 0) {
      descEst += ` (Descontado dente de ${compDenteEfetivoM}m na ${nomesDenteViga})`;
    }

    return {
      isChurrasqueira: false,
      churrasqueiraId: null,
      estruturaAcima: descEst,
      tipoEstruturaAcima: tipoEst,
      qtdCubetasAcima: 0,
      compCubetaVerdeM: 0,
      compMacicoVermelhoM,
      compDenteVigaM: compDenteEfetivoM,
      alturaDenteVigaM,
      nomesDenteViga,
      trechosVisualizacao: [
        {
          tipo: 'vermelho_fundo',
          label: `Fundo da Laje ${alturaEq.toFixed(2)}m`,
          x1: isH ? wStart : posTransversal,
          y1: isH ? posTransversal : wStart,
          x2: isH ? wEnd : posTransversal,
          y2: isH ? posTransversal : wEnd,
        },
      ],
      alturaPadraoM: alturaEq,
      alturaPadraoTipo14M: +(alturaEq + 0.08).toFixed(3),
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
    const churrInfo = classifyChurrasqueira(polygon, layer);
    const structMetrics = computeWallStructuralMetrics(
      polygon,
      orientacao,
      t,
      comprimentoM,
      churrInfo
    );

    wallPieces.push({
      id: codigo,
      codigo,
      guid,
      layer,
      layerLabel: churrInfo ? `🔥 ${churrInfo.nome}` : WALL_LAYERS[layer].label,
      corLayer: churrInfo ? '#f97316' : WALL_LAYERS[layer].corHex,
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

  // Agrupa resumo das 5 Churrasqueiras por Pavimento Tipo
  const churrasqueirasMap = {};
  for (const w of wallPieces) {
    if (!w.isChurrasqueira) continue;
    if (!churrasqueirasMap[w.churrasqueiraId]) {
      churrasqueirasMap[w.churrasqueiraId] = {
        id: w.churrasqueiraId,
        nome: w.churrasqueiraNome,
        apto: w.churrasqueiraApto,
        wallIds: [],
      };
    }
    churrasqueirasMap[w.churrasqueiraId].wallIds.push(w.id);
  }
  const churrasqueirasPorTipo = Object.values(churrasqueirasMap);

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

  const paredesAlvenariaCount = wallPieces.filter((w) => !w.isChurrasqueira).length;

  const outputData = {
    projeto: 'NEW LIFE — Controle de Medição de Alvenaria',
    arquivoIfc: 'NEW LIFE_05072024.ifc',
    arquivoIfcEstrutural: 'New Life Studios 2025-02-06.IFC',
    arquivoDwg: 'app medição.dwg',
    totalPedaçosParedePorTipo: paredesAlvenariaCount,
    totalChurrasqueirasPorTipo: churrasqueirasPorTipo.length,
    totalAndaresTipo: 14,
    bounds: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
    layers: WALL_LAYERS,
    churrasqueirasPorTipo,
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
  console.log('Paredes de alvenaria por Tipo (fora churrasqueiras):', paredesAlvenariaCount);
  console.log('Churrasqueiras de Sical por Tipo:', churrasqueirasPorTipo.length, churrasqueirasPorTipo.map((c) => `${c.id} (${c.wallIds.length} peças)`));
  console.log('Elementos 3D das Garagens + Caixa d\'Água:', structuralIfc?.garageAndRoofElements?.length || 0);
}

extractAll();
