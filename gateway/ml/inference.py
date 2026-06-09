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

import os
import pickle
import pandas as pd
import numpy as np
import torch
import torch.nn as nn
from datetime import datetime, timedelta, timezone
from sqlalchemy import create_engine
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "../../.env"))


class TemporalAttentionForecast(nn.Module):
    def __init__(self, seq_len=168, pred_len=24, d_model=32):
        super().__init__()
        self.seq_len = seq_len
        self.pred_len = pred_len
        self.feature_proj = nn.Linear(1, d_model)
        self.attention = nn.MultiheadAttention(
            embed_dim=d_model, num_heads=4, batch_first=True
        )
        self.fc = nn.Sequential(
            nn.Linear(d_model * seq_len, 128), nn.ReLU(), nn.Linear(128, pred_len)
        )

    def forward(self, x):
        x = self.feature_proj(x)
        attn_out, _ = self.attention(x, x, x)
        flat = attn_out.reshape(attn_out.size(0), -1)
        return self.fc(flat)


def get_db_engine():
    db_url = os.environ.get("DATABASE_URL")
    if db_url and db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)
    return create_engine(db_url)


class PredictiveEngine:
    def __init__(self):
        models_dir = os.path.join(os.path.dirname(__file__), "models")

        lgb_path = os.path.join(models_dir, "duration_model.pkl")
        with open(lgb_path, "rb") as f:
            self.duration_model = pickle.load(f)

        pt_path = os.path.join(models_dir, "occupancy_transformer.pt")
        checkpoint = torch.load(pt_path, weights_only=True)
        self.max_val = checkpoint["max_val"]

        self.transformer = TemporalAttentionForecast()
        self.transformer.load_state_dict(checkpoint["model_state_dict"])
        self.transformer.eval()

        self.engine = get_db_engine()

    def get_last_168_hours(self):
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(hours=168)

        query = f"""
            SELECT occupied_at, released_at
            FROM user_occupancy_history
            WHERE released_at > '{start_time.isoformat()}'
        """
        df = pd.read_sql(query, self.engine)

        hours = pd.date_range(
            start=pd.Timestamp(start_time).floor("h"), periods=168, freq="h", tz="UTC"
        )
        occupancy_counts = []

        if not df.empty:
            df["occupied_at"] = pd.to_datetime(df["occupied_at"], utc=True)
            df["released_at"] = pd.to_datetime(df["released_at"], utc=True)
            for h in hours:
                count = ((df["occupied_at"] <= h) & (df["released_at"] > h)).sum()
                occupancy_counts.append(int(count))
        else:
            occupancy_counts = [0] * 168

        return occupancy_counts

    def predict_trends(self):
        now = datetime.now(timezone.utc)
        hour = now.hour
        day_of_week = now.weekday()
        is_weekend = int(day_of_week >= 5)

        X_df = pd.DataFrame(
            [
                {
                    "hour_of_day": hour,
                    "day_of_week": day_of_week,
                    "is_weekend": is_weekend,
                    "pcd_status": 0,
                    "is_elderly": 0,
                }
            ]
        )

        avg_duration = float(self.duration_model.predict(X_df)[0])

        history_counts = self.get_last_168_hours()
        data_norm = np.array(history_counts, dtype=np.float32) / self.max_val
        tensor_in = torch.tensor(data_norm).unsqueeze(0).unsqueeze(-1)

        with torch.no_grad():
            preds_norm = self.transformer(tensor_in).squeeze().numpy()

        preds_real = (preds_norm * self.max_val).clip(min=0).astype(int).tolist()

        forecast_array = []
        for i, val in enumerate(preds_real):
            forecast_time = (now + timedelta(hours=i + 1)).replace(
                minute=0, second=0, microsecond=0
            )
            forecast_array.append(
                {"timestamp": forecast_time.isoformat(), "occupancy": val}
            )

        payload = {
            "type": "TREND_PREDICTION",
            "timestamp": now.isoformat(),
            "avg_stay_duration_mins": round(avg_duration, 1),
            "next_24h_occupancy": forecast_array,
            "max_capacity": 40,
        }

        return payload


if __name__ == "__main__":
    print("Estaciona AI - Inteligência Preditiva")
    print("Copyright (C) 2026 Guilherme Pedroza")
    print("This program comes with ABSOLUTELY NO WARRANTY; for details see LICENSE.")
    print("This is free software, and you are welcome to redistribute it under")
    print("certain conditions; see the GNU Affero General Public License v3.\n")

    engine = PredictiveEngine()
    print("Iniciando inferência para as próximas 24h...")
    import json

    print(json.dumps(engine.predict_trends(), indent=2))
