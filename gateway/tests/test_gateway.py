import sqlite3
import pytest
import os
from gateway import (
    init_db,
    init_metrics_db,
    save_event,
    get_unsynced_events,
    mark_events_as_synced,
    save_metric,
    update_metric_forwarded,
    is_authorized,
)


def test_init_db(tmp_path):
    db_path = str(tmp_path / "test_fallback.db")
    init_db(db_path)
    assert os.path.exists(db_path)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("
    SELECT name FROM sqlite_master WHERE type='table' AND name='fallback_events'")
    assert cursor.fetchone() is not None
    conn.close()


def test_save_and_get_unsynced_events(tmp_path):
    db_path = str(tmp_path / "test_fallback.db")
    init_db(db_path)
    save_event(db_path, "event_data_1")
    save_event(db_path, "event_data_2")
    events = get_unsynced_events(db_path)
    assert len(events) == 2
    assert events[0][1] == "event_data_1"
    assert events[1][1] == "event_data_2"


def test_mark_events_as_synced(tmp_path):
    db_path = str(tmp_path / "test_fallback.db")
    init_db(db_path)
    save_event(db_path, "event_data_1")
    events = get_unsynced_events(db_path)
    event_id = events[0][0]
    mark_events_as_synced(db_path, [event_id])
    remaining = get_unsynced_events(db_path)
    assert len(remaining) == 0


def test_save_and_update_metrics(tmp_path):
    db_path = str(tmp_path / "test_metrics.db")
    init_metrics_db(db_path)
    save_metric(
        "cam-01",
        "A-01",
        "occupied",
        "2026-06-05T12:00:00Z",
        "2026-06-05T12:00:01Z",
        "2026-06-05T12:00:02Z",
    )
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT edge_id, spot_id, status, cloud_ack FROM metrics")
    row = cursor.fetchone()
    assert row == ("cam_01", "A-01", "occupied", 0)
    conn.close()

    update_metric_forwarded(db_path, "cam-01", "2026-06-05T12:00:03Z")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT gateway_forwarded_ts, cloud_ack FROM metrics WHERE spot_id='A-01'")
    row = cursor.fetchone()
    assert row == ("2026-06-05T12:00:03Z", 1)
    conn.close()


def test_is_authorized():
    expected_key = "secret_key"
    assert (
        is_authorized({"Authorization": "Bearer secret_key"}, expected_key)
        is True
    )
    assert (
            is_authorized({"authorization": "Bearer secret_key"}, expected_key)
        is True
    )
    assert (
        is_authorized({"Authorization": "secret_key"}, expected_key) is False
    )
    assert (
            is_authorized({"Authorization": "Bearer wrong_key"}, expected_key) is False
    )
    assert is_authorized({}) is False
