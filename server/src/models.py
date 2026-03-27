from datetime import datetime
from typing import Literal, List

from pydantic import BaseModel, Field, UUID4


# ----------------------------------------------
# Edge -> Server
# ----------------------------------------------

class SpotUpdateEdge(BaseModel):
    type: Literal["SPOT_UPDATE"] = "SPOT_UPDATE"
    spot_id: str
    status: Literal["free", "occupied"]
    camera_id: str
    confidence: float = Field(ge=0.0, le=1.0)
    timestamp: datetime

class CarDetectedEdge(BaseModel):
    type: Literal["CAR_DETECTED"] = "CAR_DETECTED"
    plate: str
    camera_id: str
    timestamp: datetime


# ----------------------------------------------
# App -> Server
# ----------------------------------------------

class ReserveSpotApp(BaseModel):
    type: Literal["RESERVE_SPOT"] = "RESERVE_SPOT"
    spot_id: str
    user_id: str
    plate: str

class CancelReservationApp(BaseModel):
    type: Literal["CANCEL_RESERVATION"] = "CANCEL_RESERVATION"
    reservation_id: UUID4


# ----------------------------------------------
# Server -> App
# ----------------------------------------------

class SpotUpdateServer(BaseModel):
    type: Literal["SPOT_UPDATE"] = "SPOT_UPDATE"
    spot_id: str
    status: Literal["free", "occupied", "reserved"]

class NavigationStartServer(BaseModel):
    type: Literal["NAVIGATION_START"] = "NAVIGATION_START"
    spot_id: str
    route = List[str]

class ReservationConfirmedServer(BaseModel):
    type: Literal["RESERVATION_CONFIRMED"] = "RESERVATION_CONFIRMED"
    reservation_id: UUID4
    spot_id: str
    expires_at: datetime

class ReservationExpiredServer(BaseModel):
    type: Literal["RESERVATION_EXPIRED"] = "RESERVATION_EXPIRED"
    spot_id: str

class ReservationRejectedServer(BaseModel):
    type: Literal["RESERVATION_REJECTED"] = "RESERVATION_REJECTED"
    spot_id: str
    reason: Literal["already_taken", "invalid_spot"]

class RouteUpdateServer(BaseModel):
    type: Literal["ROUTE_UPDATE"] = "ROUTE_UPDATE"
    spot_id: str
    route: List[str]