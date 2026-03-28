import pytest
import uuid 
import asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock

from src.main import app
from src.dependencies import get_reservation_manager, get_parking_state

@pytest.fixture(autouse=True)
async def reset_global_state():
    """Reset global state before each test"""
    state = get_parking_state()
    manager = get_reservation_manager()

    state._spots.clear()
    state._locks.clear()
    manager.active_reservations.clear()

    yield

    pending = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
    for t in pending:
        t.cancel()
    await asyncio.gather(*pending, return_exceptions=True)
    