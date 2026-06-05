import sqlite3
import json
import datetime
import asyncio
import websockets


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


async def handler(websocket, db_path, metrics_path, expected_key, sync_event):
    if not is_authorized(websocket.extra_headers, expected_key):
        await websocket.close(1008, "Unauthorized")
        return

    try:
        while True:
            message = await websocket.recv()
            payload = json.loads(message)
            now_str = (
                datetime.datetime.now(datetime.UTC)
                .isoformat(timespec="milliseconds")
                .replace("+00:00", "Z")
            )
            payload["gateway_received_at"] = now_str

            save_event(db_path, json.dumps(payload))

            edge_id = payload.get("camera_id") or "unknown"
            spot_id = payload.get("spot_id") or "unknown"
            status = payload.get("status") or "unknown"
            detection_ts = payload.get("timestamp") or ""
            edge_sent_ts = (
                payload.get("edge_sent_at") or payload.get("edge_sent_ts") or ""
            )

            save_metric(
                metrics_path,
                edge_id,
                spot_id,
                status,
                detection_ts,
                edge_sent_ts,
                now_str,
            )

            sync_event.set()
    except Exception:
        pass


async def sync_loop(db_path, metrics_path, cloud_url, api_key, sync_event):
    cloud_conn = None
    headers = {"Authorization": f"Bearer {api_key}"}
    while True:
        try:
            events = get_unsynced_events(db_path)
            if not events:
                await sync_event.wait()
                sync_event.clear()
                continue

            if cloud_conn is None:
                cloud_conn = await websockets.connect(
                    cloud_url, additional_headers=headers, open_timeout=3
                )

            synced_ids = []
            for event_id, message_text in events:
                payload = json.loads(message_text)
                now_str = (
                    datetime.datetime.now(datetime.UTC)
                    .isoformat(timespec="milliseconds")
                    .replace("+00:00", "Z")
                )
                payload["gateway_forwarded_at"] = now_str

                await cloud_conn.send(json.dumps(payload))
                synced_ids.append(event_id)

                spot_id = payload.get("spot_id") or "unknown"
                update_metric_forwarded(metrics_path, spot_id, now_str)

            mark_events_as_synced(db_path, synced_ids)

        except asyncio.CancelledError:
            if cloud_conn:
                await cloud_conn.close()
            raise
        except Exception:
            if cloud_conn:
                try:
                    await cloud_conn.close()
                except Exception:
                    pass
                cloud_conn = None
            await asyncio.sleep(5)
