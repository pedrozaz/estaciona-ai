import pytest
import asyncio
import uuid
from unittest.mock import patch, AsyncMock
from src.state import ParkingState
from src.reservations import ReservationManager


@pytest.fixture
def manager():
    state = ParkingState()
    return ReservationManager(state)


@pytest.fixture
def sample_user():
    return str(uuid.uuid4())


async def _cancel_pending_tasks():
    pending = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
    for t in pending:
        t.cancel()
    await asyncio.gather(*pending, return_exceptions=True)


@pytest.mark.asyncio
async def test_create_reservation_and_prevent_double_booking(manager, sample_user):
    spot_id = "A-10"

    with patch.object(ReservationManager, "_schedule_expiration", new_callable=AsyncMock):
        # Primeira reserva deve funcionar
        res1 = await manager.create_reservation(spot_id, sample_user, "ABC1234")
        assert res1 is not None
        assert res1["spot_id"] == spot_id
        assert manager.state._spots[spot_id] == "reserved"

        # Segunda reserva no mesmo spot deve falhar
        user2 = str(uuid.uuid4())
        res2 = await manager.create_reservation(spot_id, user2, "1234ABC")
        assert res2 is None

        await _cancel_pending_tasks()


@pytest.mark.asyncio
async def test_concurrent_reservation_prevention(manager):
    spot_id = "C-01"
    user1 = str(uuid.uuid4())
    user2 = str(uuid.uuid4())

    # Mocking _schedule_expiration prevents the expiration task from freeing
    # the spot between the two concurrent create_reservation calls, keeping
    # the test focused on the lock-based concurrency control.
    with patch.object(ReservationManager, "_schedule_expiration", new_callable=AsyncMock):
        res1, res2 = await asyncio.gather(
            manager.create_reservation(spot_id, user1, "AAA0001"),
            manager.create_reservation(spot_id, user2, "BBB0002"),
        )

        # Exatamente uma deve ter sucesso e o spot permanecer "reserved"
        assert sum(1 for r in (res1, res2) if r is not None) == 1
        assert manager.state._spots[spot_id] == "reserved"

        await _cancel_pending_tasks()


@pytest.mark.asyncio
async def test_cancel_reservation(manager, sample_user):
    spot_id = "B-05"

    with patch.object(ReservationManager, "_schedule_expiration", new_callable=AsyncMock):
        res = await manager.create_reservation(spot_id, sample_user, "ABC1234")

        # Cancelamento válido
        success = await manager.cancel_reservation(res["reservation_id"])
        assert success is True
        assert manager.state._spots[spot_id] == "free"
        assert res["reservation_id"] not in manager.active_reservations

        # Cancelamento de ID inexistente
        fake_id = uuid.uuid4()
        fail = await manager.cancel_reservation(fake_id)
        assert fail is False

        await _cancel_pending_tasks()


@pytest.mark.asyncio
async def test_reservation_expiration(manager, sample_user):
    spot_id = "D-03"

    with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        res = await manager.create_reservation(spot_id, sample_user, "EXP1234")
        assert res is not None
        assert manager.state._spots[spot_id] == "reserved"

        # Aguarda a conclusão da tarefa de expiração (sleep mockado retorna imediatamente)
        pending = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
        await asyncio.gather(*pending, return_exceptions=True)

        mock_sleep.assert_called_once_with(30 * 60)
        assert manager.state._spots[spot_id] == "free"
        assert res["reservation_id"] not in manager.active_reservations
