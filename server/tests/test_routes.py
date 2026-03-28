import uuid
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

@pytest.mark.asyncio
async def test_create_reservation_endpoint():
    spot_id = "A-01"
    payload = {
       "type": "RESERVE_SPOT",
       "spot_id": spot_id,
       "user_id": str(uuid.uuid4()),
       "plate": "ABC-1234" 
    }

    with patch("src.reservations.ReservationManager._schedule_expiration", new_callable=AsyncMock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # Sucesso
            response = await client.post("/reservations", json=payload)
            assert reponse.status_code == 201
            data = response.json()
            assert data["type"] == "RESERVATION_CONFIRMED"
            assert data["spot_id"] == spot_id
            assert "reservation_id" in data
            
            # Conflito
            payload["user_id"] = str(uuid.uuid4())
            response_conflict = await client.post("/reservations", json=payload)
            assert response_conflict.status_code == 409

@pytest.mark.asyncio
async def test_cancel_reservation_endpoint():
    spot_id = "A-02"
    user_id = str(uuid.uuid4())

    with patch("src.reservations.ReservationManager._schedule_expiration", new_callable=AsyncMock):
        # Cria a reserva direto pelo manager para testar a rota DELETE
        manager = get_reservation_manager()
        res = await manager.create_reservation(spot_id, uuid.UUID(user_id), "DEL1234")
        res_id = str(res["reservation_id"])

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # Sucesso
            response = await client.delete(f"/reservations/{res_id}")
            assert response.status_code == 204

            # Falha
            response_fail = await client.delete(f"/reservations/{uuid.uuid4()}")
            assert response.status_code == 404

@pytest.mark.asyncio 
async def test_get_spots_endpoint():
    state = get_parking_state()
    state._spots["A-03"] = "occupied"
    state._spots["A-04"] = "free"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/spots")
        assert response.status_code == 200
        data = response.json()
        assert data["A-03"] == "occupied"
        assert data["A-04"] == "free"  
    
            
    