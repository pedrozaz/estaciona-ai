import asyncpg
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str

    model_config = SettingsConfigDict(env_file="../.env.local", extra=ignore)

settings = Settings()

class Database:
    def __init__(self):
        self.pool = None
    
    async def connect(self):
        self.pool = await asyncpg.create_pool(dsn=settings.database_url)

    async def disconnect(self):
        if self.pool:
            await self.pool.close()

db = Database()