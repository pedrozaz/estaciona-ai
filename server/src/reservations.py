import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional
from pydantic import UUID4
from .state import ParkingState
from .db import Database

class ReservationManager:
    def __init__(self, parking_state: ParkingState, db: Database):
        self.state = parking_state
        self.db = db
        self.active_reservations: Dict[UUID4, dict] = {}
        
    async def create_reservation(self, spot_id: str, user_id: str, plate: str) -> Optional[dict]:
        async with self.state._get_lock(spot_id):
            current_status = self.state._spots.get(spot_id, "free")

            if current_status != "free":
                return None

            res_id = uuid.uuid4()
            expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)

            self.state._spots[spot_id] = "reserved"
            
            reservation = {
                "reservation_id": res_id,
                "spot_id": spot_id,
                "user_id": user_id,
                "plate": plate,
                "expires_at": expires_at
            }

            self.active_reservations[res_id] = reservation

            await self.db.ensure_user_exists(user_id, plate)
            await self.db.save_reservation(res_id, user_id, spot_id, expires_at)
            
            # Schedule cleanup task
            asyncio.create_task(self._schedule_expiration(res_id, spot_id))

            return reservation

    async def cancel_reservation(self, reservation_id: UUID4) -> bool:
        reservation = self.active_reservations.get(reservation_id)
        if not reservation:
            return False

        spot_id = reservation["spot_id"]
        async with self.state._get_lock(spot_id):
            # Grants that only if the state is still "reserved"
            if self.state._spots.get(spot_id) == "reserved":
                self.state._spots[spot_id] = "free"
                await self.db.update_reservation_status(reservation_id, "cancelled")
            
            self.active_reservations.pop(reservation_id, None)
            return True

    async def _schedule_expiration(self, res_id: UUID4, spot_id: str):
        await asyncio.sleep(30 * 60) # 30 minutes

        async with self.state._get_lock(spot_id):
            if res_id in self.active_reservations:
                if self.state._spots.get(spot_id) == "reserved":
                    self.state._spots[spot_id] = "free"
                    await self.db.update_reservation_status(res_id, "expired")              
            
                self.active_reservations.pop(res_id, None)

        
        
            
    