import asyncpg
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
import os
from pydantic import UUID4
from datetime import datetime

class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./test.db"

    model_config = SettingsConfigDict(env_file="../.env.local", extra="ignore")

@lru_cache
def get_settings():
    return Settings()

class Database:
    def __init__(self):
        self.pool = None
    
    async def connect(self):
        self.pool = await asyncpg.create_pool(dsn=get_settings().database_url)

    async def disconnect(self):
        if self.pool:
            await self.pool.close()

    async def init_schema(self):
        schema_path = os.path.join(os.path.dirname(__file__), '..', 'schema.sql')
        with open(schema_path, 'r') as f:
            schema = f.read()

        async with self.pool.acquire() as conn:
            await conn.execute(schema)

    async def ensure_user_exists(self, user_id: str, plate: str):
        query = """
            INSERT INTO users (id, plate)
            VALUES ($1, $2)
            ON CONFLICT (id) DO NOTHING;
        """
        async with self.pool.acquire() as conn:
            await conn.execute(query, user_id, plate)

    async def save_reservation(self, res_id: UUID4, user_id: str, spot_id: str, expires_at: datetime):
        query = """
            INSERT INTO reservations (id, user_id, spot_id, status, expires_at)
            VALUES ($1, $2, $3, 'active', $4);
        """
        async with self.pool.acquire() as conn:
            await conn.execute(query, res_id, user_id, spot_id, expires_at)

    async def update_reservation_status(self, res_id: UUID4, status: str):
        query = """
            UPDATE reservations
            SET status = $1,
                completed_at = CASE WHEN $1 IN ('completed', 'expired') THEN NOW() ELSE completed_at END
            WHERE id = $2;
        """
        async with self.pool.acquire() as conn:
            await conn.execute(query, status, res_id)

db = Database()