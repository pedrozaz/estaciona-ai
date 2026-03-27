import asyncio
from typing import Dict
from .models import SpotUpdateEdge

class ParkingState:
    def __init__(self):
        # spot_id -> "free" | "occupied" | "reserved"
        self._spots: Dict[str, str] = {}
        # spot_id -> asyncio.Lock
        self._locks: Dict[str, asyncio.Lock] = {}
        # spot_id -> {"status": str, "count": int}
        self._frame_buffer: Dict[str, dict] = {}

    def _get_lock(self, spot_id: str) -> asyncio.Lock:
        if spot_id not in self._locks:
            self._locks[spot_id] = asyncio.Lock()
        return self._locks[spot_id]

    async def process_spot_update(self, update: SpotUpdateEdge) -> bool:
        """
        Process a spot update from an edge device.
        @return: True if the state changed, False otherwise
        """
        if upate.confidence < 0.7:
            return False
        
        async with self._get_lock(update.spot_id):
            current_status = self._spots.get(update.spot_id, "free")

            # Protection: camera sees free spot, but system knows it is reserved
            if current_status == 'reserved' and update.status == 'free':
                self._frame_buffer.pop(update.spot_id, None)
                return False

            if current_status == update.status:
                self._frame_buffer(update.spot_id, None)
                return False

            buffer = self._frame_buffer.get(update.spot_id, {"status": update.status, "count": 0})

            if buffer['status'] == update.status:
                buffer['count'] += 1
            else:
                buffer = {'status': update.status, 'count': 1}

            self._frame_buffer[update.spot_id] = buffer

            if buffer['count'] >= 3:
                self._spots[update.spot_id] = update.status
                self._frame_buffer.pop(update.spot_id, None)
                return True

            return False
        
        
        