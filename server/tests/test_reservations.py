import pytest
import uuid
import asyncio
from src.state import ParkingState
from src.reservations import ReservationManager

@pytest.fixture
def manager():
    state = ParkingState()
    return ReservationManager(state)

@pytest.fixture
def sample_user():
    return str(uuid.uuid4())

@pytest.mark.asyncio  
async def test_create_reservation_and_prevent_double_booking(manager, sample_user):
    spot_id = "A-10"

    # Primeira reserva deve funcionar
    res1 = await manager.create_reservation(spot_id, sample_user, "ABC1234")
    assert res1 is not None
    assert res1["spot_id"] == spot_id
    assert manager.state._spots[spot_id] == "reserved"

    # Segunda reserva no mesmo spot deve falhar
    user2 = str(uuid.uuid4())
    res2 = await manager.create_reservation(spot_id, user2, "1234ABC")
    assert res2 is None
    
    