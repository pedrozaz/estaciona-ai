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