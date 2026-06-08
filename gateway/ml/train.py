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
import lightgbm as lgb
import pickle
from sqlalchemy import create_engine
from dotenv import load_dotenv
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score

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


def train_duration_model(df):
    print("[3/4] Treinando modelo LightGBM para predição de tempo de permanência...")

    features = ["hour_of_day", "day_of_week", "is_weekend", "pcd_status", "is_elderly"]
    X = df[features].astype({"pcd_status": int, "is_elderly": int, "is_weekend": int})
    y = df["duration_mins"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    params = {
        "objective": "regression",
        "metric": "mae",
        "boosting_type": "gbdt",
        "learning_rate": 0.05,
        "num_leaves": 31,
        "verbose": -1,
    }

    train_data = lgb.Dataset(X_train, label=y_train)
    test_data = lgb.Dataset(X_test, label=y_test, reference=train_data)

    model = lgb.train(params, train_data, num_boost_round=100, valid_sets=[test_data])

    preds = model.predict(X_test)
    mae = mean_absolute_error(y_test, preds)
    r2 = r2_score(y_test, preds)

    print(
        f"Modelo LightGBM treinado! Erro médio (MAE): {mae:.2f} minutos | R²: {r2:.2f}"
    )

    models_dir = os.path.join(os.path.dirname(__file__), "models")
    os.makedirs(models_dir, exist_ok=True)
    model_path = os.path.join(models_dir, "duration_model.pkl")

    with open(model_path, "wb") as f:
        pickle.dump(model, f)

    print(f"Pesos salvos em: {model_path}")
    return model


if __name__ == "__main__":
    df = load_and_preprocess_data()
    train_duration_model(df)
    print(df[["spot_id", "duration_mins", "hour_of_day", "is_weekend"]].head())
