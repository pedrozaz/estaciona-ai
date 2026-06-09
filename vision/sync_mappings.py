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

import os
import json
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))


def main():
    print("Estaciona AI - Mapeamento de Visão")
    print("Copyright (C) 2026 Guilherme Pedroza")
    print("This program comes with ABSOLUTELY NO WARRANTY; for details see LICENSE.")
    print("This is free software, and you are welcome to redistribute it under")
    print("certain conditions; see the GNU Affero General Public License v3.\\n")

    db_url = os.environ.get("ML_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if db_url and db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)

    engine = create_engine(db_url)

    json_path = os.path.join(os.path.dirname(__file__), "data", "spots.json")
    if not os.path.exists(json_path):
        print(f"Erro: Arquivo {json_path} não encontrado.")
        return

    with open(json_path, "r") as f:
        spots_data = json.load(f)

    CAMERA_ID = "camera_1"

    with engine.begin() as conn:
        print("Limpando mapeamentos antigos de visão...")
        conn.execute(text("DELETE FROM vision_spot_mappings"))

        print(
            f"Sincronizando {len(spots_data)} vagas do JSON local para o PostgreSQL..."
        )

        for spot_name in spots_data.keys():
            conn.execute(
                text("""
                    INSERT INTO vision_spot_mappings (camera_id, vision_spot_name, dashboard_spot_id)
                    VALUES (:cam, :vis_name, :dash_id)
                """),
                {"cam": CAMERA_ID, "vis_name": spot_name, "dash_id": spot_name},
            )

    print("Sucesso! Tabela vision_spot_mappings preenchida com backup relacional.")


if __name__ == "__main__":
    main()
