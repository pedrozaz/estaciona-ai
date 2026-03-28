from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import UUID4
from typing import Dict
from .models import ReserveSpotApp, ReservationConfirmedServer
from .reservations import ReservationManager
from .state import ParkingState
from .dependencies import get_reservation_manager, get_parking_state

router = APIRouter()

@router.post("/reservations", response_model=ReservationConfirmedServer, status_code=status.HTTP_201_CREATED)
async def create_reservation(
    payload: ReserveSpotApp,
    manager: ReservationManager = Depends(get_reservation_manager)
):
    reservation = await manager.create_reservation(payload.spot_id, payload.user_id, payload.plate)
    if not reservation:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Spot already taken or invalid")

    return ReservationConfirmedServer(
        reservation_id=reservation["reservation_id"],
        spot_id=reservation["spot_id"],
        expires_at=reservation["expires_at"]
    )

@router.delete("/reservations/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_reservation(
    reservation_id: UUID4,
    manager: ReservationManager = Depends(get_reservation_manager)
):
    success = await manager.cancel_reservation(reservation_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")

@router.get("/spots", response_model=Dict[str, str])
async def get_spots(state: ParkingState = Depends(get_parking_state)):
    return state._spots

    