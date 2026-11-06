import React, { useEffect, useRef, useState } from 'react';
import dwgPlanData from './data/dwgMeasurementPlan.json';
import DashboardProducao from './components/DashboardProducao';
import Predio3DAndares from './components/Predio3DAndares';
import PlantaDwgMedicao from './components/PlantaDwgMedicao';
import {
  fetchAppState,
  updateConfiguracoes,
  createPedreiro,
  updatePedreiro,
  removePedreiro,
  saveMedicaoParedes,
  exportMeasurementBackup,
  importMeasurementBackup,
} from './services/api';

export default function App() {
  const [abaAtiva, setAbaAtiva] = useState('producao'); // 'producao' | 'predio3d' | 'dwg'
  const [andarTipoSelecionado, setAndarTipoSelecionado] = useState(1); // 1 a 14 (TIPO 01 a TIPO 14)

  const [mode, setMode] = useState('servidor');
  const [configuracoes, setConfiguracoes] = useState({
    preco_m2_levantamento: 16.0,
    preco_m_primeira_fiada: 10.0,
    altura_padrao_m: 2.65,
    descontar_vaos: false,
    limite_vao_m2: 2.0,
    regra_vao: 'excedente',
    dias_uteis_padrao: 22,
  });
  const [pedreiros, setPedreiros] = useState([]);
  const [medicoesMap, setMedicoesMap] = useState({});
  const [alturasPorParede, setAlturasPorParede] = useState({});
  const fileInputRef = useRef(null);

  useEffect(() => {
    async function load() {
      const state = await fetchAppState();
      setMode(state.mode || 'servidor');
      if (state.configuracoes) setConfiguracoes(state.configuracoes);
      if (state.pedreiros) setPedreiros(state.pedreiros);
      if (state.medicoes) setMedicoesMap(state.medicoes);
      if (state.alturasPorParede) setAlturasPorParede(state.alturasPorParede);
    }
    load();
  }, []);

  const handleAddPedreiro = async (payload) => {
    const res = await createPedreiro(payload);
    if (res.pedreiros) setPedreiros(res.pedreiros);
    return res;
  };

  const handleUpdatePedreiro = async (id, payload) => {
    const res = await updatePedreiro(id, payload);
    if (res.pedreiros) setPedreiros(res.pedreiros);
  };

  const handleRemovePedreiro = async (id) => {
    const res = await removePedreiro(id);
    if (res.pedreiros) setPedreiros(res.pedreiros);
  };

  const handleSaveConfiguracoes = async (novasConfig) => {
    const res = await updateConfiguracoes(novasConfig);
    if (res.configuracoes) setConfiguracoes(res.configuracoes);
    if (res.medicoes) setMedicoesMap(res.medicoes);
  };

  const handleSaveMedicao = async (payload) => {
    const res = await saveMedicaoParedes(payload);
    if (res.medicoes) setMedicoesMap(res.medicoes);
    if (res.alturasPorParede) setAlturasPorParede(res.alturasPorParede);
    return res;
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const state = await importMeasurementBackup(file);
      setConfiguracoes(state.configuracoes);
      setPedreiros(state.pedreiros);
      setMedicoesMap(state.medicoes);
      setAlturasPorParede(state.alturasPorParede);
    } catch (err) {
      alert('Erro ao importar arquivo JSON: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  const abrirPlantaDoAndar = (numeroTipo) => {
    setAndarTipoSelecionado(Number(numeroTipo) || 1);
    setAbaAtiva('dwg');
  };

  return (
    <div className="app-root">
      {/* Cabeçalho Principal com Navegação por Abas */}
      <header className="main-navbar">
        <div className="navbar-brand">
          <span className="brand-badge">🏗️ NEW LIFE</span>
          <div className="brand-titles">
            <h1>Controle de Medição de Alvenaria</h1>
            <small>14 Andares Tipos (`.DWG`) • Visualização 3D (`.IFC`)</small>
          </div>
        </div>

        {/* Navegação em Abas */}
        <nav className="main-tabs-nav">
          <button
            type="button"
            className={`tab-nav-btn ${abaAtiva === 'producao' ? 'active' : ''}`}
            onClick={() => setAbaAtiva('producao')}
          >
            <span className="tab-icon">📊</span>
            <span>1. Produção & Pedreiros</span>
          </button>

          <button
            type="button"
            className={`tab-nav-btn ${abaAtiva === 'predio3d' ? 'active' : ''}`}
            onClick={() => setAbaAtiva('predio3d')}
          >
            <span className="tab-icon">🏢</span>
            <span>2. Prédio 3D & Andares</span>
          </button>

          <button
            type="button"
            className={`tab-nav-btn ${abaAtiva === 'dwg' ? 'active' : ''}`}
            onClick={() => setAbaAtiva('dwg')}
          >
            <span className="tab-icon">📐</span>
            <span>
              3. Planta DWG (TIPO {String(andarTipoSelecionado).padStart(2, '0')})
            </span>
          </button>
        </nav>

        <div className="navbar-status" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn-toolbar-sm"
            onClick={exportMeasurementBackup}
            title="Baixar arquivo de backup (.json) das medições para abrir em outro dispositivo"
          >
            ⬇️ Exportar Dados
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
          <button
            type="button"
            className="btn-toolbar-sm"
            onClick={() => fileInputRef.current?.click()}
            title="Carregar arquivo (.json) de medições feitas em outro dispositivo"
          >
            ⬆️ Importar
          </button>
          <span className="conn-pill ok">
            <i /> {mode === 'github-pages' ? 'GitHub Pages Ativo' : 'Sincronizado'}
          </span>
        </div>
      </header>

      {/* Conteúdo da Aba Selecionada */}
      <main className="main-tab-body">
        {abaAtiva === 'producao' && (
          <DashboardProducao
            dwgData={dwgPlanData}
            medicoesMap={medicoesMap}
            pedreiros={pedreiros}
            configuracoes={configuracoes}
            onAddPedreiro={handleAddPedreiro}
            onUpdatePedreiro={handleUpdatePedreiro}
            onRemovePedreiro={handleRemovePedreiro}
            onSaveConfiguracoes={handleSaveConfiguracoes}
            onIrParaAndar={abrirPlantaDoAndar}
          />
        )}

        {abaAtiva === 'predio3d' && (
          <Predio3DAndares
            dwgData={dwgPlanData}
            medicoesMap={medicoesMap}
            configuracoes={configuracoes}
            onSelectAndarTipo={abrirPlantaDoAndar}
          />
        )}

        {abaAtiva === 'dwg' && (
          <PlantaDwgMedicao
            andarTipo={andarTipoSelecionado}
            onChangeAndarTipo={setAndarTipoSelecionado}
            dwgData={dwgPlanData}
            medicoesMap={medicoesMap}
            alturasPorParede={alturasPorParede}
            pedreiros={pedreiros}
            configuracoes={configuracoes}
            onSaveMedicao={handleSaveMedicao}
            onAddPedreiro={handleAddPedreiro}
            onVoltar3D={() => setAbaAtiva('predio3d')}
          />
        )}
      </main>
    </div>
  );
}
