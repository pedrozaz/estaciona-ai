import sqlite3


def init_db(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS fallback_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_text TEXT NOT NULL,
            synced INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.commit()
    conn.close()


def init_metrics_db(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            edge_id TEXT NOT NULL,
            spot_id TEXT NOT NULL,
            status TEXT NOT NULL,
            detection_ts TEXT NOT NULL,
            edge_sent_ts TEXT NOT NULL,
            gateway_received_ts TEXT NOT NULL,
            gateway_forwarded_ts TEXT,
            cloud_ack INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.commit()
    conn.close()


def save_event(db_path, message_text):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO fallback_events (message_text) VALUES (?)",
        (message_text,),
    )
    conn.commit()
    conn.close()


def get_unsynced_events(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, message_text FROM fallback_events WHERE synced = 0 ORDER BY id ASC"
    )
    events = cursor.fetchall()
    conn.close()
    return events


def mark_events_as_synced(db_path, event_ids):
    if not event_ids:
        return
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    placeholder = ",".join("?" for _ in event_ids)
    cursor.execute(
        f"UPDATE fallback_events SET synced = 1 WHERE id IN ({placeholder})",
        tuple(event_ids),
    )
    conn.commit()
    conn.close()


def save_metric(
    db_path,
    edge_id,
    spot_id,
    status,
    detection_ts,
    edge_sent_ts,
    gateway_received_ts,
):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO metrics (
        edge_id, spot_id, status, detection_ts, edge_sent_ts, gateway_received_ts
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            edge_id,
            spot_id,
            status,
            detection_ts,
            edge_sent_ts,
            gateway_received_ts,
        ),
    )
    conn.commit()
    conn.close()


def update_metric_forwarded(db_path, spot_id, gateway_forwarded_ts):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE metrics
        SET gateway_forwarded_ts = ?, cloud_ack = 1
        WHERE spot_id = ? AND cloud_ack = 0
        """,
        (gateway_forwarded_ts, spot_id),
    )
    conn.commit()
    conn.close()


def is_authorized(headers, expected_key):
    auth = headers.get("Authorization") or headers.get("authorization")
    if not auth:
        return False
    parts = auth.split(" ")
    if len(parts) != 2 or parts[0] != "Bearer":
        return False
    return parts[1] == expected_key
