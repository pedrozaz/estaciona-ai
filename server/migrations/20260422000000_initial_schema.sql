    -- Initial schema for Estaciona AI

    -- 1. Extensions
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    -- 2. Autenticação (Terreno preparado para o futuro)
    CREATE TABLE IF NOT EXISTS dashboard_admins (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- 3. Usuários e Placas
    CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        plate TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- 4. Vagas e Reservas
    CREATE TABLE IF NOT EXISTS spots (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'free',
        x FLOAT NOT NULL,
        y FLOAT NOT NULL,
        z FLOAT DEFAULT 0,
        last_updated TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reservations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        spot_id TEXT NOT NULL REFERENCES spots(id),
        status TEXT NOT NULL DEFAULT 'active',
        expires_at TIMESTAMPTZ NOT NULL,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- 5. Integração Câmera x Dashboard (Terreno preparado para o futuro)
    CREATE TABLE IF NOT EXISTS vision_spot_mappings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        camera_id VARCHAR(50) NOT NULL,
        vision_spot_name VARCHAR(50) NOT NULL,
        dashboard_spot_id TEXT NOT NULL REFERENCES spots(id),
        UNIQUE(camera_id, vision_spot_name)
    );

    -- 6. Indexes para performance
    CREATE INDEX IF NOT EXISTS idx_active_reservations ON reservations (status, expires_at)
    WHERE status = 'active';

    CREATE INDEX IF NOT EXISTS idx_spots_status ON spots (status);
