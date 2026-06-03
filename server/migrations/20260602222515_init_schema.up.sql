-- Atualiza a tabela de usuários existente
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- Atualiza a tabela de vagas existente (o ID e status já existem, e x, y, z estão no JSON, mas vamos adicionar parking_lot)
ALTER TABLE spots
ADD COLUMN IF NOT EXISTS parking_lot VARCHAR(50) DEFAULT 'Main';

-- Tabela do histórico de ocupação das vagas (para o modelo preditivo)
CREATE TABLE IF NOT EXISTS user_occupancy_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    spot_id TEXT NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
    occupied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_occupancy_user ON user_occupancy_history(user_id);
