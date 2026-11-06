const API_BASE = import.meta.env.VITE_API_URL || '/api/paredes';
const LOCAL_CACHE_KEY = 'new_life_alvenaria_state_v2';
const CLOUD_CONFIG_KEY = 'new_life_cloud_sync_config_v1';

const DEFAULT_STATE = {
  configuracoes: {
    preco_m2_levantamento: 16.0,
    preco_m_primeira_fiada: 10.0,
    preco_churrasqueira_rs: '',
    altura_padrao_m: 2.85,
    descontar_vaos: false,
    limite_vao_m2: 2.0,
    regra_vao: 'excedente',
    dias_uteis_padrao: 22,
  },
  pedreiros: [
    { id: 1, nome: 'João da Silva', especialidade: 'Ambos', dias_trabalhados_mes: 22, ativo: true },
    { id: 2, nome: 'Carlos Ferreira (1ª Fiada)', especialidade: 'Primeira Fiada', dias_trabalhados_mes: 22, ativo: true },
    { id: 3, nome: 'Antônio Oliveira (Alvenaria)', especialidade: 'Levantamento', dias_trabalhados_mes: 22, ativo: true },
  ],
  medicoes: {},
  alturasPorParede: {},
};

export function loadLocalState() {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        configuracoes: { ...DEFAULT_STATE.configuracoes, ...(parsed.configuracoes || {}) },
        pedreiros: Array.isArray(parsed.pedreiros) ? parsed.pedreiros : DEFAULT_STATE.pedreiros,
        medicoes: parsed.medicoes || {},
        alturasPorParede: parsed.alturasPorParede || {},
      };
    }
  } catch {
    // ignore
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

export function saveLocalState(state) {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Aviso ao salvar no navegador:', e);
  }
}

/**
 * Motor de cálculo de áreas e valores financeiros (idêntico ao backend Node/PostgreSQL)
 * Garante funcionamento 100% autônomo no GitHub Pages (github.io) em qualquer dispositivo!
 */
export function calcularAreasEValoresClient(item, config) {
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

const isGitHubPages =
  typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');

export async function fetchAppState() {
  if (!isGitHubPages) {
    try {
      const res = await fetch(`${API_BASE}/estado`);
      if (res.ok) {
        const data = await res.json();
        saveLocalState(data);
        return { online: true, mode: 'servidor', ...data };
      }
    } catch {
      // Continua para o banco autónomo do navegador (GitHub Pages / Offline)
    }
  }

  const local = loadLocalState();
  return { online: true, mode: 'github-pages', ...local };
}

export async function updateConfiguracoes(novasConfig) {
  if (!isGitHubPages) {
    try {
      const res = await fetch(`${API_BASE}/configuracoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(novasConfig),
      });
      if (res.ok) {
        const data = await res.json();
        const st = loadLocalState();
        st.configuracoes = data.configuracoes;
        st.medicoes = data.medicoes;
        saveLocalState(st);
        return data;
      }
    } catch {
      // Fallback autónomo
    }
  }

  const state = loadLocalState();
  state.configuracoes = {
    ...state.configuracoes,
    ...novasConfig,
  };
  for (const guid of Object.keys(state.medicoes)) {
    const m = state.medicoes[guid];
    const calc = calcularAreasEValoresClient(m, state.configuracoes);
    state.medicoes[guid] = { ...m, ...calc };
  }
  saveLocalState(state);
  return {
    message: 'Configurações salvas!',
    configuracoes: state.configuracoes,
    medicoes: state.medicoes,
  };
}

export async function createPedreiro(payload) {
  if (!isGitHubPages) {
    try {
      const res = await fetch(`${API_BASE}/pedreiros`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        const st = loadLocalState();
        st.pedreiros = data.pedreiros;
        saveLocalState(st);
        return data;
      }
    } catch {
      // Fallback autónomo
    }
  }

  const state = loadLocalState();
  const nextId =
    state.pedreiros.reduce((max, p) => Math.max(max, Number(p.id) || 0), 0) + 1;
  const novoPedreiro = {
    id: nextId,
    nome: String(payload.nome).trim(),
    especialidade: payload.especialidade || 'Ambos',
    dias_trabalhados_mes: Number(payload.dias_trabalhados_mes) || 22,
    ativo: true,
    created_at: new Date().toISOString(),
  };
  state.pedreiros.push(novoPedreiro);
  saveLocalState(state);
  return {
    pedreiro: novoPedreiro,
    pedreiros: state.pedreiros,
  };
}

export async function updatePedreiro(id, payload) {
  if (!isGitHubPages) {
    try {
      const res = await fetch(`${API_BASE}/pedreiros/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        const st = loadLocalState();
        st.pedreiros = data.pedreiros;
        saveLocalState(st);
        return data;
      }
    } catch {
      // Fallback autónomo
    }
  }

  const state = loadLocalState();
  const idx = state.pedreiros.findIndex((p) => Number(p.id) === Number(id));
  if (idx !== -1) {
    state.pedreiros[idx] = { ...state.pedreiros[idx], ...payload, id: Number(id) };
    saveLocalState(state);
  }
  return { pedreiros: state.pedreiros };
}

export async function removePedreiro(id) {
  if (!isGitHubPages) {
    try {
      const res = await fetch(`${API_BASE}/pedreiros/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const data = await res.json();
        const st = loadLocalState();
        st.pedreiros = data.pedreiros;
        saveLocalState(st);
        return data;
      }
    } catch {
      // Fallback autónomo
    }
  }

  const state = loadLocalState();
  state.pedreiros = state.pedreiros.filter((p) => Number(p.id) !== Number(id));
  saveLocalState(state);
  return { pedreiros: state.pedreiros };
}

export async function saveMedicaoParedes(payload) {
  if (!isGitHubPages) {
    try {
      const res = await fetch(`${API_BASE}/medicao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        const st = loadLocalState();
        st.medicoes = data.medicoes;
        st.alturasPorParede = data.alturasPorParede;
        saveLocalState(st);
        return data;
      }
    } catch {
      // Fallback autónomo
    }
  }

  const state = loadLocalState();
  const config = state.configuracoes;
  const {
    items = [],
    aplicarAlturaEmTodosOsTipos = false,
    andaresParaReplicar = null,
  } = payload;

  const listaItems = Array.isArray(items) ? items : [payload];
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

      const calculado = calcularAreasEValoresClient(merged, config);
      state.medicoes[guid] = {
        ...merged,
        ...calculado,
      };
    }
  }

  saveLocalState(state);
  return {
    message: 'Medição salva!',
    medicoes: state.medicoes,
    alturasPorParede: state.alturasPorParede,
  };
}

/**
 * Exporta todos os dados de medição, pedreiros e configurações para arquivo .JSON
 * (Permite transferir/fazer backup entre Celular, Tablet e Notebook a qualquer momento)
 */
export function exportMeasurementBackup() {
  const state = loadLocalState();
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `medicao-new-life-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Importa um arquivo .JSON de medição e atualiza o estado
 */
export async function importMeasurementBackup(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const state = {
    configuracoes: { ...DEFAULT_STATE.configuracoes, ...(parsed.configuracoes || {}) },
    pedreiros: Array.isArray(parsed.pedreiros) ? parsed.pedreiros : DEFAULT_STATE.pedreiros,
    medicoes: parsed.medicoes || {},
    alturasPorParede: parsed.alturasPorParede || {},
  };
  saveLocalState(state);
  if (!isGitHubPages) {
    try {
      await updateConfiguracoes(state.configuracoes);
    } catch {
      // ignore
    }
  }
  return state;
}
