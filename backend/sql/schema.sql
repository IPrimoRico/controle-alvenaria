-- ============================================================================
-- Schema PostgreSQL Completo: Controle de Medição de Alvenaria NEW LIFE
-- 14 Andares Tipos (Planta DWG) + Prédio Completo 3D (IFC)
-- ============================================================================

-- 1. Tabela de Pedreiros
CREATE TABLE IF NOT EXISTS pedreiros (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    apelido VARCHAR(60),
    especialidade VARCHAR(40) DEFAULT 'Ambos'
        CHECK (especialidade IN ('Ambos', 'Levantamento', 'Primeira Fiada')),
    dias_trabalhados_mes INTEGER DEFAULT 22,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabela de Configurações Globais de Medição e Preços Unitários
CREATE TABLE IF NOT EXISTS configuracoes_medicao (
    id INTEGER PRIMARY KEY DEFAULT 1,
    preco_m2_levantamento NUMERIC(10, 2) NOT NULL DEFAULT 16.00,
    preco_m_primeira_fiada NUMERIC(10, 2) NOT NULL DEFAULT 10.00,
    altura_padrao_m NUMERIC(6, 3) NOT NULL DEFAULT 2.650,
    descontar_vaos BOOLEAN NOT NULL DEFAULT FALSE,
    limite_vao_m2 NUMERIC(6, 2) NOT NULL DEFAULT 2.00,
    regra_vao VARCHAR(20) NOT NULL DEFAULT 'excedente'
        CHECK (regra_vao IN ('excedente', 'integral')),
    dias_uteis_padrao INTEGER NOT NULL DEFAULT 22,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabela Principal de Medição por Pedaço de Parede em cada um dos 14 Andares Tipos
CREATE TABLE IF NOT EXISTS paredes_medicao (
    id SERIAL PRIMARY KEY,
    guid VARCHAR(96) UNIQUE NOT NULL,           -- Ex: "TIPO-01::P-008"
    andar_tipo INTEGER NOT NULL                 -- 1 a 14 (TIPO 01 a TIPO 14)
        CHECK (andar_tipo >= 1 AND andar_tipo <= 14),
    pavimento_nome VARCHAR(60) NOT NULL,        -- Ex: "TIPO 01"
    parede_id VARCHAR(24) NOT NULL,             -- Ex: "P-008"
    layer VARCHAR(50) NOT NULL,                 -- Ex: "3 - TIJ-11.5", "4 - TIJ-14", "4 - TIJ-19"
    espessura_cm NUMERIC(5, 2) NOT NULL,        -- 19, 14, 11.5, 9, 10

    -- Geometria e Cuidados de Medição (Altura variável na laje + Canto sem duplicidade + Vãos)
    modo_canto VARCHAR(30) NOT NULL DEFAULT 'padrao_sem_duplicar'
        CHECK (modo_canto IN ('padrao_sem_duplicar', 'face_externa', 'face_interna', 'manual')),
    comprimento_m NUMERIC(8, 3) NOT NULL,       -- Comprimento líquido em metros lineares
    altura_m NUMERIC(8, 3) NOT NULL DEFAULT 2.650,
    area_vao_m2 NUMERIC(8, 3) NOT NULL DEFAULT 0.000,
    descontar_vao_nesta_parede BOOLEAN DEFAULT NULL,
    area_bruta_m2 NUMERIC(10, 3) NOT NULL,
    area_liquida_m2 NUMERIC(10, 3) NOT NULL,

    -- Produção 1: Primeira Fiada (R$ 10,00 / m linear)
    fiada_status VARCHAR(20) NOT NULL DEFAULT 'Pendente'
        CHECK (fiada_status IN ('Pendente', 'Finalizada', 'Reparo')),
    fiada_pedreiro_id INTEGER REFERENCES pedreiros(id) ON DELETE SET NULL,
    fiada_pedreiro_nome VARCHAR(120),
    fiada_data DATE,
    fiada_valor_rs NUMERIC(12, 2) NOT NULL DEFAULT 0.00,

    -- Produção 2: Levantamento de Alvenaria (R$ 16,00 / m²)
    status VARCHAR(20) NOT NULL DEFAULT 'Pendente'
        CHECK (status IN ('Pendente', 'Finalizada', 'Reparo')),
    levantamento_pedreiro_id INTEGER REFERENCES pedreiros(id) ON DELETE SET NULL,
    levantamento_pedreiro_nome VARCHAR(120),
    levantamento_data DATE,
    levantamento_valor_rs NUMERIC(12, 2) NOT NULL DEFAULT 0.00,

    observacao TEXT DEFAULT '',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_medicao_andar ON paredes_medicao(andar_tipo);
CREATE INDEX IF NOT EXISTS idx_medicao_parede ON paredes_medicao(parede_id);
CREATE INDEX IF NOT EXISTS idx_medicao_status ON paredes_medicao(status);
CREATE INDEX IF NOT EXISTS idx_medicao_fiada_data ON paredes_medicao(fiada_data);
CREATE INDEX IF NOT EXISTS idx_medicao_lev_data ON paredes_medicao(levantamento_data);
