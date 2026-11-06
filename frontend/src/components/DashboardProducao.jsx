import React, { useState, useMemo } from 'react';

const MESES = [
  { num: 1, nome: 'Janeiro', curto: 'Jan' },
  { num: 2, nome: 'Fevereiro', curto: 'Fev' },
  { num: 3, nome: 'Março', curto: 'Mar' },
  { num: 4, nome: 'Abril', curto: 'Abr' },
  { num: 5, nome: 'Maio', curto: 'Mai' },
  { num: 6, nome: 'Junho', curto: 'Jun' },
  { num: 7, nome: 'Julho', curto: 'Jul' },
  { num: 8, nome: 'Agosto', curto: 'Ago' },
  { num: 9, nome: 'Setembro', curto: 'Set' },
  { num: 10, nome: 'Outubro', curto: 'Out' },
  { num: 11, nome: 'Novembro', curto: 'Nov' },
  { num: 12, nome: 'Dezembro', curto: 'Dez' },
];

export default function DashboardProducao({
  dwgData,
  medicoesMap,
  pedreiros,
  configuracoes,
  onAddPedreiro,
  onUpdatePedreiro,
  onRemovePedreiro,
  onSaveConfiguracoes,
  onIrParaAndar,
}) {
  const hoje = new Date();
  const [anoSelecionado, setAnoSelecionado] = useState(hoje.getFullYear());
  const [mesSelecionado, setMesSelecionado] = useState(hoje.getMonth() + 1);
  const [anosDisponiveis, setAnosDisponiveis] = useState([
    2024, 2025, 2026, 2027, 2028, 2029, 2030,
  ]);
  const [modoGrafico, setModoGrafico] = useState('fisico'); // 'fisico' (m² e m) | 'financeiro' (R$)
  const [modoMediaDia, setModoMediaDia] = useState('dias_mes'); // 'dias_mes' | 'dias_apontados'

  // Formulário rápido de novo pedreiro
  const [novoNome, setNovoNome] = useState('');
  const [novaEspecialidade, setNovaEspecialidade] = useState('Ambos');
  const [novosDiasMes, setNovosDiasMes] = useState(22);

  // Modal/painel de regras de cálculo (preços e vãos de porta)
  const [mostrarConfig, setMostrarConfig] = useState(false);
  const [formConfig, setFormConfig] = useState(configuracoes);

  const precoLev = Number(configuracoes?.preco_m2_levantamento) || 16.0;
  const precoFiada = Number(configuracoes?.preco_m_primeira_fiada) || 10.0;

  const adicionarProximoAno = () => {
    const maxAno = Math.max(...anosDisponiveis);
    const novoAno = maxAno + 1;
    setAnosDisponiveis((prev) => [...prev, novoAno]);
    setAnoSelecionado(novoAno);
  };

  // Calcula dados de todos os 12 meses do ano selecionado + produção por pedreiro no mês selecionado
  const estatisticas = useMemo(() => {
    const porMes = {};
    for (let m = 1; m <= 12; m++) {
      porMes[m] = {
        mes: m,
        levantamentoM2: 0,
        levantamentoRs: 0,
        fiadaM: 0,
        fiadaRs: 0,
        totalRs: 0,
        paredesFinalizadas: 0,
        paredesReparo: 0,
      };
    }

    const porPedreiroNoMes = {};
    for (const p of pedreiros || []) {
      porPedreiroNoMes[p.id] = {
        ...p,
        fiadaM: 0,
        fiadaRs: 0,
        fiadaParedes: 0,
        levantamentoM2: 0,
        levantamentoRs: 0,
        levantamentoParedes: 0,
        reparosCount: 0,
        totalRs: 0,
        diasComApontamento: new Set(),
      };
    }

    let acumuladoObraM2 = 0;
    let acumuladoObraFiadaM = 0;
    let totalParedesFinalizadasObra = 0;
    let totalParedesReparoObra = 0;

    const listaMedicoes = Object.values(medicoesMap || {});

    for (const item of listaMedicoes) {
      const compM = Number(item.comprimento_m) || 0;
      const areaM2 = Number(item.area_liquida_m2) || 0;
      const valFiada = Number(item.fiada_valor_rs) || +(compM * precoFiada).toFixed(2);
      const valLev = Number(item.levantamento_valor_rs) || +(areaM2 * precoLev).toFixed(2);

      if (item.fiada_status === 'Finalizada') {
        acumuladoObraFiadaM += compM;
      }
      if (item.status === 'Finalizada') {
        acumuladoObraM2 += areaM2;
        totalParedesFinalizadasObra += 1;
      } else if (item.status === 'Reparo' || item.fiada_status === 'Reparo') {
        totalParedesReparoObra += 1;
      }

      // 1) Verifica data da Primeira Fiada
      if (item.fiada_status === 'Finalizada' && item.fiada_data) {
        const [y, m] = String(item.fiada_data).split('-').map(Number);
        if (y === Number(anoSelecionado) && porMes[m]) {
          porMes[m].fiadaM += compM;
          porMes[m].fiadaRs += valFiada;
          porMes[m].totalRs += valFiada;
        }
        if (y === Number(anoSelecionado) && m === Number(mesSelecionado)) {
          const pId = Number(item.fiada_pedreiro_id);
          if (porPedreiroNoMes[pId]) {
            porPedreiroNoMes[pId].fiadaM += compM;
            porPedreiroNoMes[pId].fiadaRs += valFiada;
            porPedreiroNoMes[pId].fiadaParedes += 1;
            porPedreiroNoMes[pId].totalRs += valFiada;
            porPedreiroNoMes[pId].diasComApontamento.add(item.fiada_data);
          }
        }
      }

      // 2) Verifica data do Levantamento de Alvenaria
      if (item.status === 'Finalizada' && item.levantamento_data) {
        const [y, m] = String(item.levantamento_data).split('-').map(Number);
        if (y === Number(anoSelecionado) && porMes[m]) {
          porMes[m].levantamentoM2 += areaM2;
          porMes[m].levantamentoRs += valLev;
          porMes[m].totalRs += valLev;
          porMes[m].paredesFinalizadas += 1;
        }
        if (y === Number(anoSelecionado) && m === Number(mesSelecionado)) {
          const pId = Number(item.levantamento_pedreiro_id);
          if (porPedreiroNoMes[pId]) {
            porPedreiroNoMes[pId].levantamentoM2 += areaM2;
            porPedreiroNoMes[pId].levantamentoRs += valLev;
            porPedreiroNoMes[pId].levantamentoParedes += 1;
            porPedreiroNoMes[pId].totalRs += valLev;
            porPedreiroNoMes[pId].diasComApontamento.add(item.levantamento_data);
          }
        }
      }

      if (item.status === 'Reparo') {
        const pId = Number(item.levantamento_pedreiro_id);
        if (porPedreiroNoMes[pId]) {
          porPedreiroNoMes[pId].reparosCount += 1;
        }
      }
    }

    const dadosMesAtual = porMes[mesSelecionado] || {
      levantamentoM2: 0,
      levantamentoRs: 0,
      fiadaM: 0,
      fiadaRs: 0,
      totalRs: 0,
    };

    const maxGraficoVal = Math.max(
      10,
      ...Object.values(porMes).map((d) =>
        modoGrafico === 'financeiro'
          ? d.totalRs
          : Math.max(d.levantamentoM2, d.fiadaM)
      )
    );

    return {
      porMes,
      dadosMesAtual,
      maxGraficoVal,
      pedreirosStats: Object.values(porPedreiroNoMes),
      acumuladoObraM2,
      acumuladoObraFiadaM,
      totalParedesFinalizadasObra,
      totalParedesReparoObra,
    };
  }, [medicoesMap, pedreiros, anoSelecionado, mesSelecionado, modoGrafico, precoLev, precoFiada]);

  const totalParedes14Tipos = (dwgData?.totalPedaçosParedePorTipo || 137) * 14;
  const pctGeralObra = Math.min(
    100,
    Math.round((estatisticas.totalParedesFinalizadasObra / totalParedes14Tipos) * 100)
  );

  const handleSubmitPedreiro = async (e) => {
    e.preventDefault();
    if (!novoNome.trim()) return;
    await onAddPedreiro({
      nome: novoNome.trim(),
      especialidade: novaEspecialidade,
      dias_trabalhados_mes: Number(novosDiasMes) || 22,
    });
    setNovoNome('');
  };

  const handleSalvarConfig = async (e) => {
    e.preventDefault();
    await onSaveConfiguracoes(formConfig);
    setMostrarConfig(false);
  };

  const nomeMesAtual = MESES.find((m) => m.num === Number(mesSelecionado))?.nome || '';

  return (
    <div className="dashboard-container">
      {/* Barra de Filtro de Ano (incluindo próximos anos) e Mês + Botão Regras */}
      <div className="dashboard-Controls-bar">
        <div className="year-month-selectors">
          <div className="selector-group">
            <span className="selector-label">📅 Ano:</span>
            <div className="year-pills">
              {anosDisponiveis.map((ano) => (
                <button
                  key={ano}
                  type="button"
                  className={`year-pill-btn ${Number(anoSelecionado) === ano ? 'active' : ''}`}
                  onClick={() => setAnoSelecionado(ano)}
                >
                  {ano}
                </button>
              ))}
              <button
                type="button"
                className="year-pill-btn add-year"
                onClick={adicionarProximoAno}
                title="Adicionar próximo ano para planejamento/medição futura"
              >
                + Próximo Ano
              </button>
            </div>
          </div>

          <div className="selector-group">
            <span className="selector-label">🗓️ Mês de Referência:</span>
            <select
              className="month-select"
              value={mesSelecionado}
              onChange={(e) => setMesSelecionado(Number(e.target.value))}
            >
              {MESES.map((m) => (
                <option key={m.num} value={m.num}>
                  {m.nome} / {anoSelecionado}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          className="btn-config-rules"
          onClick={() => {
            setFormConfig(configuracoes);
            setMostrarConfig(!mostrarConfig);
          }}
        >
          ⚙️ Regras de Medição, Vãos e Preços (R$ {precoLev}/m² • R$ {precoFiada}/m)
        </button>
      </div>

      {/* Painel expansível de Regras de Cálculo (Preços, Altura Padrão e Vãos de Porta) */}
      {mostrarConfig && (
        <form className="config-panel-card" onSubmit={handleSalvarConfig}>
          <div className="config-header">
            <h3>⚙️ Parâmetros de Cálculo de Medição e Desconto de Vãos</h3>
            <button
              type="button"
              className="btn-close-text"
              onClick={() => setMostrarConfig(false)}
            >
              Fechar ✕
            </button>
          </div>

          <div className="config-grid">
            <div className="form-group">
              <label>Preço Levantamento Alvenaria (R$ / m²)</label>
              <input
                type="number"
                step="0.50"
                value={formConfig.preco_m2_levantamento}
                onChange={(e) =>
                  setFormConfig({ ...formConfig, preco_m2_levantamento: Number(e.target.value) })
                }
              />
            </div>

            <div className="form-group">
              <label>Preço 1ª Fiada / Marcação (R$ / metro linear)</label>
              <input
                type="number"
                step="0.50"
                value={formConfig.preco_m_primeira_fiada}
                onChange={(e) =>
                  setFormConfig({ ...formConfig, preco_m_primeira_fiada: Number(e.target.value) })
                }
              />
            </div>

            <div className="form-group">
              <label>Altura Padrão da Parede na Laje (m)</label>
              <input
                type="number"
                step="0.01"
                value={formConfig.altura_padrao_m}
                onChange={(e) =>
                  setFormConfig({ ...formConfig, altura_padrao_m: Number(e.target.value) })
                }
              />
            </div>

            <div className="form-group">
              <label>Descontar Vãos de Portas / Janelas?</label>
              <select
                value={formConfig.descontar_vaos ? 'sim' : 'nao'}
                onChange={(e) =>
                  setFormConfig({ ...formConfig, descontar_vaos: e.target.value === 'sim' })
                }
              >
                <option value="nao">Não descontar vãos (Padrão atual)</option>
                <option value="sim">Sim, ativar regra de desconto de vãos</option>
              </select>
            </div>

            {formConfig.descontar_vaos && (
              <>
                <div className="form-group">
                  <label>Só descontar vãos acima de (m²):</label>
                  <input
                    type="number"
                    step="0.10"
                    value={formConfig.limite_vao_m2}
                    onChange={(e) =>
                      setFormConfig({ ...formConfig, limite_vao_m2: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Modo de desconto quando ultrapassar o limite:</label>
                  <select
                    value={formConfig.regra_vao}
                    onChange={(e) =>
                      setFormConfig({ ...formConfig, regra_vao: e.target.value })
                    }
                  >
                    <option value="excedente">
                      Descontar apenas o que exceder {formConfig.limite_vao_m2} m²
                    </option>
                    <option value="integral">
                      Descontar a área total do vão se for maior que {formConfig.limite_vao_m2} m²
                    </option>
                  </select>
                </div>
              </>
            )}
          </div>

          <div className="config-actions">
            <button type="submit" className="btn-primary-save">
              💾 Salvar Regras e Recalcular Medições
            </button>
          </div>
        </form>
      )}

      {/* 4 Cards Principais do Mês Selecionado */}
      <div className="summary-kpi-grid">
        <div className="summary-card lev">
          <span className="summary-tag">Levantamento ({nomeMesAtual}/{anoSelecionado})</span>
          <div className="summary-main-val">
            {estatisticas.dadosMesAtual.levantamentoM2.toFixed(2)} <small>m²</small>
          </div>
          <div className="summary-sub-val">
            R$ {estatisticas.dadosMesAtual.levantamentoRs.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            <span> (a R$ {precoLev.toFixed(2)}/m²)</span>
          </div>
        </div>

        <div className="summary-card fiada">
          <span className="summary-tag">1ª Fiada ({nomeMesAtual}/{anoSelecionado})</span>
          <div className="summary-main-val">
            {estatisticas.dadosMesAtual.fiadaM.toFixed(2)} <small>m lineares</small>
          </div>
          <div className="summary-sub-val">
            R$ {estatisticas.dadosMesAtual.fiadaRs.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            <span> (a R$ {precoFiada.toFixed(2)}/m)</span>
          </div>
        </div>

        <div className="summary-card total-rs">
          <span className="summary-tag">Total Medido em {nomeMesAtual}/{anoSelecionado}</span>
          <div className="summary-main-val">
            R$ {estatisticas.dadosMesAtual.totalRs.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <div className="summary-sub-val">
            Soma de 1ª Fiada + Levantamento no mês
          </div>
        </div>

        <div className="summary-card obra-geral">
          <span className="summary-tag">Avanço Geral (14 Andares Tipos)</span>
          <div className="summary-main-val">
            {pctGeralObra}% <small>({estatisticas.totalParedesFinalizadasObra}/{totalParedes14Tipos} paredes)</small>
          </div>
          <div className="summary-sub-val">
            Acumulado: {estatisticas.acumuladoObraM2.toFixed(1)} m² •{' '}
            {estatisticas.totalParedesReparoObra > 0 ? (
              <strong className="text-reparo">
                ⚠ {estatisticas.totalParedesReparoObra} em Reparo
              </strong>
            ) : (
              '0 em reparo'
            )}
          </div>
        </div>
      </div>

      {/* Gráfico Comparativo Mensal (Janeiro a Dezembro do Ano Selecionado) */}
      <section className="chart-section-card">
        <div className="section-title-row">
          <div>
            <h2>📊 Produção Mensal Comparativa — Ano {anoSelecionado}</h2>
            <p className="section-subtitle">
              Clique em qualquer mês no gráfico abaixo para inspecionar a produção detalhada daquele mês
            </p>
          </div>
          <div className="chart-mode-pills">
            <button
              type="button"
              className={modoGrafico === 'fisico' ? 'active' : ''}
              onClick={() => setModoGrafico('fisico')}
            >
              Produção Física (m² e m linear)
            </button>
            <button
              type="button"
              className={modoGrafico === 'financeiro' ? 'active' : ''}
              onClick={() => setModoGrafico('financeiro')}
            >
              Financeiro (R$)
            </button>
          </div>
        </div>

        <div className="months-bar-chart">
          {MESES.map((m) => {
            const d = estatisticas.porMes[m.num];
            const isSelected = Number(mesSelecionado) === m.num;

            const val1 =
              modoGrafico === 'financeiro' ? d.levantamentoRs : d.levantamentoM2;
            const val2 = modoGrafico === 'financeiro' ? d.fiadaRs : d.fiadaM;

            const h1 = Math.min(100, Math.round((val1 / estatisticas.maxGraficoVal) * 100));
            const h2 = Math.min(100, Math.round((val2 / estatisticas.maxGraficoVal) * 100));

            return (
              <div
                key={m.num}
                className={`month-col ${isSelected ? 'selected-month' : ''}`}
                onClick={() => setMesSelecionado(m.num)}
              >
                <div className="month-bars-wrap">
                  <div className="bar-pair">
                    <div
                      className="bar-item bar-lev"
                      style={{ height: `${Math.max(4, h1)}%` }}
                      title={`Levantamento ${m.nome}: ${d.levantamentoM2.toFixed(1)} m² (R$ ${d.levantamentoRs.toFixed(2)})`}
                    >
                      {val1 > 0 && (
                        <span className="bar-top-val">
                          {modoGrafico === 'financeiro'
                            ? `R$${Math.round(val1)}`
                            : `${Math.round(val1)}m²`}
                        </span>
                      )}
                    </div>
                    <div
                      className="bar-item bar-fiada"
                      style={{ height: `${Math.max(4, h2)}%` }}
                      title={`1ª Fiada ${m.nome}: ${d.fiadaM.toFixed(1)} m (R$ ${d.fiadaRs.toFixed(2)})`}
                    >
                      {val2 > 0 && (
                        <span className="bar-top-val">
                          {modoGrafico === 'financeiro'
                            ? `R$${Math.round(val2)}`
                            : `${Math.round(val2)}m`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <span className="month-label">{m.curto}</span>
              </div>
            );
          })}
        </div>

        <div className="chart-legend-row">
          <span className="c-legend">
            <i className="dot-lev" /> Levantamento de Alvenaria (m² — R$ {precoLev.toFixed(2)}/m²)
          </span>
          <span className="c-legend">
            <i className="dot-fiada" /> Primeira Fiada / Marcação (m linear — R$ {precoFiada.toFixed(2)}/m)
          </span>
        </div>
      </section>

      {/* Seção de Produção dos Pedreiros no Mês + Média Diária + Cadastro Rápido */}
      <section className="pedreiros-section-card">
        <div className="section-title-row">
          <div>
            <h2>👷 Produção dos Pedreiros em {nomeMesAtual}/{anoSelecionado} & Média por Dia</h2>
            <p className="section-subtitle">
              Acompanhe quanto cada pedreiro produziu de <strong>1ª Fiada (R$ {precoFiada}/m)</strong> e{' '}
              <strong>Levantamento (R$ {precoLev}/m²)</strong> no mês e sua média diária
            </p>
          </div>

          <div className="chart-mode-pills">
            <button
              type="button"
              className={modoMediaDia === 'dias_mes' ? 'active' : ''}
              onClick={() => setModoMediaDia('dias_mes')}
            >
              Média por Dias Úteis do Mês
            </button>
            <button
              type="button"
              className={modoMediaDia === 'dias_apontados' ? 'active' : ''}
              onClick={() => setModoMediaDia('dias_apontados')}
            >
              Média por Dias Lançados
            </button>
          </div>
        </div>

        {/* Barra de Cadastro Rápido de Novo Pedreiro */}
        <form className="add-pedreiro-bar" onSubmit={handleSubmitPedreiro}>
          <input
            type="text"
            placeholder="Nome do novo pedreiro (ex: José Santos)..."
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            className="input-pedreiro-nome"
          />
          <select
            value={novaEspecialidade}
            onChange={(e) => setNovaEspecialidade(e.target.value)}
            className="select-pedreiro-esp"
          >
            <option value="Ambos">Faz 1ª Fiada + Levantamento</option>
            <option value="Levantamento">Apenas Levantamento (R$ {precoLev}/m²)</option>
            <option value="Primeira Fiada">Apenas 1ª Fiada (R$ {precoFiada}/m)</option>
          </select>
          <div className="dias-input-wrap">
            <label>Dias no mês:</label>
            <input
              type="number"
              min="1"
              max="31"
              value={novosDiasMes}
              onChange={(e) => setNovosDiasMes(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-add-pedreiro">
            + Adicionar Pedreiro
          </button>
        </form>

        {/* Tabela Responsiva de Produção dos Pedreiros */}
        <div className="table-responsive-wrap">
          <table className="pedreiros-table">
            <thead>
              <tr>
                <th>Pedreiro</th>
                <th>Função</th>
                <th>Dias no Mês</th>
                <th>1ª Fiada no Mês (R$ {precoFiada}/m)</th>
                <th>Levantamento no Mês (R$ {precoLev}/m²)</th>
                <th>Média por Dia (1ª Fiada / Alvenaria)</th>
                <th>Total a Receber ({nomeMesAtual})</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {estatisticas.pedreirosStats.map((p) => {
                const diasBase =
                  modoMediaDia === 'dias_apontados'
                    ? Math.max(1, p.diasComApontamento.size)
                    : Math.max(1, Number(p.dias_trabalhados_mes) || 22);

                const mediaFiadaDia = p.fiadaM / diasBase;
                const mediaLevDia = p.levantamentoM2 / diasBase;
                const mediaRsDia = p.totalRs / diasBase;

                return (
                  <tr key={p.id}>
                    <td>
                      <strong className="pedreiro-name-cell">{p.nome}</strong>
                      {p.reparosCount > 0 && (
                        <span className="badge-reparo-inline">
                          ⚠ {p.reparosCount} reparo(s)
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="esp-tag">{p.especialidade}</span>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        className="dias-inline-input"
                        value={p.dias_trabalhados_mes || 22}
                        onChange={(e) =>
                          onUpdatePedreiro(p.id, {
                            dias_trabalhados_mes: Number(e.target.value) || 22,
                          })
                        }
                        title="Alterar dias trabalhados no mês para cálculo da média diária"
                      />
                      <small className="dias-hint">
                        ({p.diasComApontamento.size} d. lançados)
                      </small>
                    </td>
                    <td>
                      <div className="prod-cell">
                        <strong>{p.fiadaM.toFixed(2)} m</strong>
                        <span>
                          R$ {p.fiadaRs.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({p.fiadaParedes} par.)
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="prod-cell">
                        <strong>{p.levantamentoM2.toFixed(2)} m²</strong>
                        <span>
                          R$ {p.levantamentoRs.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({p.levantamentoParedes} par.)
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="prod-cell media-dia">
                        <strong>
                          {mediaLevDia.toFixed(2)} m²/dia • {mediaFiadaDia.toFixed(2)} m/dia
                        </strong>
                        <span>
                          Média R$ {mediaRsDia.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / dia
                        </span>
                      </div>
                    </td>
                    <td>
                      <strong className="total-rs-cell">
                        R$ {p.totalRs.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </strong>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-del-pedreiro"
                        onClick={() => onRemovePedreiro(p.id)}
                        title="Remover pedreiro"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="cta-ir-3d-row">
          <span>
            Quer lançar novas medições de paredes ou 1ª fiada nos 14 andares tipos?
          </span>
          <button
            type="button"
            className="btn-go-3d"
            onClick={() => onIrParaAndar(1)}
          >
            📐 Abrir Planta DWG de Medição (TIPO 01 a 14) →
          </button>
        </div>
      </section>
    </div>
  );
}
