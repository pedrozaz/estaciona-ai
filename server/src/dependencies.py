from .state import ParkingState
from .reservations import ReservationManager
from .db import db

parking_state = ParkingState()
reservation_manager = ReservationManager(parking_state, db)

def get_parking_state() -> ParkingState:
    return parking_state

def get_reservation_manager() -> ReservationManager:
    return reservation_manager