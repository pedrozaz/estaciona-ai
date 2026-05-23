-- Initial schema for Estaciona AI

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Types
CREATE TYPE spot_status AS ENUM ('free', 'occupied', 'reserved', 'blocked');
CREATE TYPE reservation_status AS ENUM ('active', 'cancelled', 'expired', 'completed');

-- 3. Tables
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE spots (
    id TEXT PRIMARY KEY,
    status spot_status DEFAULT 'free',
    x FLOAT NOT NULL,
    y FLOAT NOT NULL,
    z FLOAT DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    spot_id TEXT REFERENCES spots(id),
    status reservation_status DEFAULT 'active',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE graph_nodes (
    id TEXT PRIMARY KEY,
    x FLOAT NOT NULL,
    y FLOAT NOT NULL,
    is_spot BOOLEAN DEFAULT FALSE,
    spot_id TEXT REFERENCES spots(id)
);

CREATE TABLE graph_edges (
    from_node TEXT REFERENCES graph_nodes(id),
    to_node TEXT REFERENCES graph_nodes(id),
    cost INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (from_node, to_node)
);

-- 4. Indexes
CREATE INDEX idx_active_reservations ON reservations (status, expires_at) 
WHERE status = 'active';

CREATE INDEX idx_spots_status ON spots (status);

-- 5. Triggers/Functions (Optional but helpful)
-- Update the last_updated timestamp on spot changes
CREATE OR REPLACE FUNCTION update_spot_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_spot_timestamp
BEFORE UPDATE ON spots
FOR EACH ROW
EXECUTE FUNCTION update_spot_timestamp();
