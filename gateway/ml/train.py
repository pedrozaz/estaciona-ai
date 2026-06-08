# ==============================================================================
# Copyright (C) 2026 Guilherme Pedroza
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
# ==============================================================================
#

from json import load
import os
import pandas as pd
import numpy as np
from sqlalchemy import create_engine
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "../../.env.local"))


def get_db_engine():
    db_url = os.environ.get("DATABASE_URL")
    if db_url and db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)
    return create_engine(db_url)


def load_and_preprocess_data():
    print("[1/4] Conectando ao banco e extraindo dados de ocupação...")
    engine = get_db_engine()

    query = """
        SELECT 
            h.id, h.spot_id, h.occupied_at, h.released_at,
            u.pcd_status, u.date_of_birth
        FROM user_occupancy_history h
        JOIN users u ON h.user_id = u.id
        WHERE h.released_at IS NOT NULL
    """

    df = pd.read_sql(query, engine)

    print("[2/4] Realizando Feature Engineering...")
    df["occupied_at"] = pd.to_datetime(df["occupied_at"])
    df["released_at"] = pd.to_datetime(df["released_at"])
    df["duration_mins"] = (
        df["released_at"] - df["occupied_at"]
    ).dt.total_seconds() / 60.0

    df["hour_of_day"] = df["occupied_at"].dt.hour
    df["day_of_week"] = df["occupied_at"].dt.dayofweek
    df["is_weekend"] = df["day_of_week"] >= 5

    df["birth_year"] = pd.to_datetime(df["date_of_birth"]).dt.year
    df["is_elderly"] = df["birth_year"] <= 1966

    print(f"Base processada com {len(df)} registros válidos.")
    return df


if __name__ == "__main__":
    df = load_and_preprocess_data()
    print(df[["spot_id", "duration_mins", "hour_of_day", "is_weekend"]].head())
