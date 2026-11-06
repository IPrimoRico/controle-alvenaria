const express = require('express');
const router = express.Router();
const db = require('../db');

function calcularAreasEValores(item, config) {
  const isChurr = Boolean(item.is_churrasqueira || item.churrasqueira_id);
  const comprimentoM = Number(item.comprimento_m) || 0;
  const alturaM = Number(item.altura_m) || Number(config.altura_padrao_m) || 2.85;
  const areaVaoM2 = Math.max(0, Number(item.area_vao_m2) || 0);

  if (isChurr) {
    const status = item.status || 'Pendente';
    const precoChurrRaw = config.preco_churrasqueira_rs;
    const precoChurr =
      precoChurrRaw !== undefined && precoChurrRaw !== null && String(precoChurrRaw).trim() !== ''
        ? Number(precoChurrRaw) || 0
        : 0;
    const isPrincipal = Boolean(item.is_churrasqueira_principal);
    const churrasqueiraValorRs =
      status === 'Finalizada' && isPrincipal && precoChurr > 0 ? +precoChurr.toFixed(2) : 0;

    return {
      comprimento_m: +comprimentoM.toFixed(3),
      altura_m: +alturaM.toFixed(3),
      area_vao_m2: 0,
      desconto_vao_aplicado_m2: 0,
      area_bruta_m2: 0,
      area_liquida_m2: 0,
      fiada_valor_rs: 0,
      levantamento_valor_rs: 0,
      churrasqueira_valor_rs: churrasqueiraValorRs,
    };
  }

  const areaBrutaM2 = +(comprimentoM * alturaM).toFixed(3);

  const deveDescontarVao =
    item.descontar_vao_nesta_parede !== undefined && item.descontar_vao_nesta_parede !== null
      ? Boolean(item.descontar_vao_nesta_parede)
      : Boolean(config.descontar_vaos);

  let descontoVaoAplicadoM2 = 0;
  const limiteVao = Number(config.limite_vao_m2) || 0;

  if (deveDescontarVao && areaVaoM2 > limiteVao) {
    if (config.regra_vao === 'integral') {
      descontoVaoAplicadoM2 = areaVaoM2;
    } else {
      descontoVaoAplicadoM2 = +(areaVaoM2 - limiteVao).toFixed(3);
    }
  }

  const areaLiquidaM2 = +Math.max(0, areaBrutaM2 - descontoVaoAplicadoM2).toFixed(3);

  const precoFiada = Number(config.preco_m_primeira_fiada) || 10.0;
  const precoLev = Number(config.preco_m2_levantamento) || 16.0;

  const fiadaStatus = item.fiada_status || 'Pendente';
  const status = item.status || 'Pendente';

  const fiadaValorRs =
    fiadaStatus === 'Finalizada' ? +(comprimentoM * precoFiada).toFixed(2) : 0;
  const levantamentoValorRs =
    status === 'Finalizada' ? +(areaLiquidaM2 * precoLev).toFixed(2) : 0;

  return {
    comprimento_m: +comprimentoM.toFixed(3),
    altura_m: +alturaM.toFixed(3),
    area_vao_m2: +areaVaoM2.toFixed(3),
    desconto_vao_aplicado_m2: descontoVaoAplicadoM2,
    area_bruta_m2: areaBrutaM2,
    area_liquida_m2: areaLiquidaM2,
    fiada_valor_rs: fiadaValorRs,
    levantamento_valor_rs: levantamentoValorRs,
    churrasqueira_valor_rs: 0,
  };
}

/**
 * GET /api/paredes/estado
 * Retorna configurações, pedreiros, medições de todos os 14 andares tipos e alturas customizadas
 */
router.get('/estado', (req, res) => {
  const state = db.loadState();
  return res.json({
    postgresConnected: db.getConnectionStatus(),
    ...state,
  });
});

/**
 * POST /api/paredes/configuracoes
 * Atualiza preços (R$16/m² levantamento, R$10/m 1ª fiada), altura padrão e regra de desconto de vãos
 */
router.post('/configuracoes', (req, res) => {
  const state = db.loadState();
  state.configuracoes = {
    ...state.configuracoes,
    ...req.body,
  };

  // Recalcula valores e áreas líquidas das medições existentes com a nova regra
  for (const guid of Object.keys(state.medicoes)) {
    const m = state.medicoes[guid];
    const calc = calcularAreasEValores(m, state.configuracoes);
    state.medicoes[guid] = {
      ...m,
      ...calc,
    };
  }

  db.saveState(state);
  return res.json({
    message: 'Configurações de medição e preços atualizadas com sucesso!',
    configuracoes: state.configuracoes,
    medicoes: state.medicoes,
  });
});

/**
 * POST /api/paredes/pedreiros
 * Adiciona rapidamente um novo pedreiro
 */
router.post('/pedreiros', async (req, res) => {
  const { nome, especialidade = 'Ambos', dias_trabalhados_mes = 22 } = req.body;
  if (!nome || !String(nome).trim()) {
    return res.status(400).json({ error: 'Informe o nome do pedreiro.' });
  }

  const state = db.loadState();
  const nextId =
    state.pedreiros.reduce((max, p) => Math.max(max, Number(p.id) || 0), 0) + 1;

  const novoPedreiro = {
    id: nextId,
    nome: String(nome).trim(),
    especialidade,
    dias_trabalhados_mes: Number(dias_trabalhados_mes) || 22,
    ativo: true,
    created_at: new Date().toISOString(),
  };

  state.pedreiros.push(novoPedreiro);
  db.saveState(state);

  if (db.getConnectionStatus()) {
    try {
      await db.query(
        'INSERT INTO pedreiros (nome, especialidade, dias_trabalhados_mes) VALUES ($1, $2, $3)',
        [novoPedreiro.nome, novoPedreiro.especialidade, novoPedreiro.dias_trabalhados_mes]
      );
    } catch {
      // Continua normalmente com estado persistido
    }
  }

  return res.status(201).json({
    message: `Pedreiro "${novoPedreiro.nome}" adicionado!`,
    pedreiro: novoPedreiro,
    pedreiros: state.pedreiros,
  });
});

/**
 * PUT /api/paredes/pedreiros/:id
 * Atualiza dias trabalhados no mês ou nome do pedreiro
 */
router.put('/pedreiros/:id', (req, res) => {
  const id = Number(req.params.id);
  const state = db.loadState();
  const idx = state.pedreiros.findIndex((p) => Number(p.id) === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Pedreiro não encontrado.' });
  }

  state.pedreiros[idx] = {
    ...state.pedreiros[idx],
    ...req.body,
    id,
  };
  db.saveState(state);

  return res.json({
    pedreiro: state.pedreiros[idx],
    pedreiros: state.pedreiros,
  });
});

/**
 * DELETE /api/paredes/pedreiros/:id
 */
router.delete('/pedreiros/:id', (req, res) => {
  const id = Number(req.params.id);
  const state = db.loadState();
  state.pedreiros = state.pedreiros.filter((p) => Number(p.id) !== id);
  db.saveState(state);
  return res.json({ pedreiros: state.pedreiros });
});

/**
 * POST /api/paredes/medicao
 * Salva medição de uma ou várias paredes (em 1 andar tipo ou replicando para outros andares tipos)
 */
router.post('/medicao', async (req, res) => {
  const state = db.loadState();
  const config = state.configuracoes;

  const {
    items = [],
    aplicarAlturaEmTodosOsTipos = false,
    andaresParaReplicar = null, // array opcional ex: [1, 2, ..., 14]
  } = req.body;

  const listaItems = Array.isArray(items) ? items : [req.body];
  const hoje = new Date().toISOString().slice(0, 10);

  for (const rawItem of listaItems) {
    const paredeId = rawItem.parede_id;
    if (!paredeId) continue;

    const andarOrigem = Number(rawItem.andar_tipo) || 1;
    if (aplicarAlturaEmTodosOsTipos && rawItem.altura_m) {
      const altBaseTipo1a13 =
        andarOrigem === 14 ? +(Number(rawItem.altura_m) - 0.08).toFixed(2) : Number(rawItem.altura_m);
      state.alturasPorParede[paredeId] = altBaseTipo1a13;
    }

    const andaresAlvo =
      Array.isArray(andaresParaReplicar) && andaresParaReplicar.length > 0
        ? andaresParaReplicar
        : [andarOrigem];

    for (const andar of andaresAlvo) {
      const andarNum = Number(andar);
      const guid = `TIPO-${String(andarNum).padStart(2, '0')}::${paredeId}`;
      const existente = state.medicoes[guid] || {};

      let alturaAndar = Number(rawItem.altura_m) || existente.altura_m || config.altura_padrao_m || 2.85;
      if (rawItem.altura_m && andarNum !== andarOrigem) {
        if (andarNum === 14 && andarOrigem !== 14) {
          alturaAndar = +(Number(rawItem.altura_m) + 0.08).toFixed(2);
        } else if (andarNum !== 14 && andarOrigem === 14) {
          alturaAndar = +(Number(rawItem.altura_m) - 0.08).toFixed(2);
        }
      }

      const merged = {
        ...existente,
        ...rawItem,
        altura_m: alturaAndar,
        guid,
        andar_tipo: andarNum,
        pavimento_nome: `TIPO ${String(andarNum).padStart(2, '0')}`,
        parede_id: paredeId,
        updated_at: new Date().toISOString(),
      };

      if (merged.fiada_status === 'Finalizada' && !merged.fiada_data) {
        merged.fiada_data = hoje;
      }
      if (merged.status === 'Finalizada' && !merged.levantamento_data) {
        merged.levantamento_data = hoje;
      }

      const calculado = calcularAreasEValores(merged, config);
      const registroFinal = {
        ...merged,
        ...calculado,
      };

      state.medicoes[guid] = registroFinal;

      // Se PostgreSQL estiver ativo, faz UPSERT também no banco relacional
      if (db.getConnectionStatus()) {
        try {
          await db.query(
            `INSERT INTO paredes_medicao (
              guid, andar_tipo, pavimento_nome, parede_id, layer, espessura_cm,
              modo_canto, comprimento_m, altura_m, area_vao_m2, area_bruta_m2, area_liquida_m2,
              fiada_status, fiada_pedreiro_id, fiada_pedreiro_nome, fiada_data, fiada_valor_rs,
              status, levantamento_pedreiro_id, levantamento_pedreiro_nome, levantamento_data, levantamento_valor_rs,
              observacao
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
            )
            ON CONFLICT (guid) DO UPDATE SET
              modo_canto = EXCLUDED.modo_canto,
              comprimento_m = EXCLUDED.comprimento_m,
              altura_m = EXCLUDED.altura_m,
              area_vao_m2 = EXCLUDED.area_vao_m2,
              area_bruta_m2 = EXCLUDED.area_bruta_m2,
              area_liquida_m2 = EXCLUDED.area_liquida_m2,
              fiada_status = EXCLUDED.fiada_status,
              fiada_pedreiro_id = EXCLUDED.fiada_pedreiro_id,
              fiada_pedreiro_nome = EXCLUDED.fiada_pedreiro_nome,
              fiada_data = EXCLUDED.fiada_data,
              fiada_valor_rs = EXCLUDED.fiada_valor_rs,
              status = EXCLUDED.status,
              levantamento_pedreiro_id = EXCLUDED.levantamento_pedreiro_id,
              levantamento_pedreiro_nome = EXCLUDED.levantamento_pedreiro_nome,
              levantamento_data = EXCLUDED.levantamento_data,
              levantamento_valor_rs = EXCLUDED.levantamento_valor_rs,
              observacao = EXCLUDED.observacao,
              updated_at = CURRENT_TIMESTAMP`,
            [
              registroFinal.guid,
              registroFinal.andar_tipo,
              registroFinal.pavimento_nome,
              registroFinal.parede_id,
              registroFinal.layer || '4 - TIJ-14',
              registroFinal.espessura_cm || 14,
              registroFinal.modo_canto || 'padrao_sem_duplicar',
              registroFinal.comprimento_m,
              registroFinal.altura_m,
              registroFinal.area_vao_m2,
              registroFinal.area_bruta_m2,
              registroFinal.area_liquida_m2,
              registroFinal.fiada_status,
              registroFinal.fiada_pedreiro_id || null,
              registroFinal.fiada_pedreiro_nome || null,
              registroFinal.fiada_data || null,
              registroFinal.fiada_valor_rs,
              registroFinal.status,
              registroFinal.levantamento_pedreiro_id || null,
              registroFinal.levantamento_pedreiro_nome || null,
              registroFinal.levantamento_data || null,
              registroFinal.levantamento_valor_rs,
              registroFinal.observacao || '',
            ]
          );
        } catch {
          // Segue com persistência em arquivo
        }
      }
    }
  }

  db.saveState(state);

  return res.json({
    message: 'Medição salva com sucesso!',
    medicoes: state.medicoes,
    alturasPorParede: state.alturasPorParede,
  });
});

module.exports = router;
