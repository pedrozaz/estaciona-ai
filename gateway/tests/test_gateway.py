import sqlite3
import os
import json
import asyncio
from unittest.mock import AsyncMock, patch
from gateway import (
    init_db,
    init_metrics_db,
    save_event,
    get_unsynced_events,
    mark_events_as_synced,
    save_metric,
    update_metric_forwarded,
    is_authorized,
    handler,
    sync_loop,
    main,
)


def test_init_db(tmp_path):
    db_path = str(tmp_path / "test_fallback.db")
    init_db(db_path)
    assert os.path.exists(db_path)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='fallback_events'"
    )
    assert cursor.fetchone() is not None
    conn.close()


def test_init_metrics_db(tmp_path):
    db_path = str(tmp_path / "test_metrics.db")
    init_metrics_db(db_path)
    assert os.path.exists(db_path)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='metrics'"
    )
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
        db_path,
        "cam_01",
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

    update_metric_forwarded(db_path, "A-01", "2026-06-05T12:00:03Z")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT gateway_forwarded_ts, cloud_ack FROM metrics WHERE spot_id='A-01'"
    )
    row = cursor.fetchone()
    assert row == ("2026-06-05T12:00:03Z", 1)
    conn.close()


def test_is_authorized():
    expected_key = "secret_key"
    assert is_authorized({"Authorization": "Bearer secret_key"}, expected_key) is True
    assert is_authorized({"authorization": "Bearer secret_key"}, expected_key) is True
    assert is_authorized({"Authorization": "secret_key"}, expected_key) is False
    assert is_authorized({"Authorization": "Bearer wrong_key"}, expected_key) is False
    assert is_authorized({}, expected_key) is False


def test_handler_auth_success(tmp_path):
    async def run():
        db_path = str(tmp_path / "fallback.db")
        metrics_path = str(tmp_path / "metrics.db")
        init_db(db_path)
        init_metrics_db(metrics_path)

        mock_ws = AsyncMock()
        mock_ws.extra_headers = {"Authorization": "Bearer secret_key"}
        mock_ws.recv.side_effect = [
            json.dumps(
                {
                    "type": "SPOT_UDPATE",
                    "spot_id": "A-01",
                    "status": "occupied",
                    "timestamp": "2026-06-05T12:00:00Z",
                    "edge_sent_ts": "2026-06-05T12:00:01Z",
                }
            ),
            Exception("Closed"),
        ]

        sync_event = asyncio.Event()
        await handler(mock_ws, db_path, metrics_path, "secret_key", sync_event)

        events = get_unsynced_events(db_path)
        assert len(events) == 1
        payload = json.loads(events[0][1])
        assert "gateway_received_at" in payload
        assert sync_event.is_set()

    asyncio.run(run())


def test_handler_auth_fail(tmp_path):
    async def run():
        db_path = str(tmp_path / "fallback.db")
        metrics_path = str(tmp_path / "metrics.db")
        init_db(db_path)
        init_metrics_db(metrics_path)

        mock_ws = AsyncMock()
        mock_ws.extra_headers = {"Authorization": "Bearer wrong_key"}
        sync_event = asyncio.Event()

        await handler(mock_ws, db_path, metrics_path, "secret_key", sync_event)

        mock_ws.close.assert_called_once()
        assert len(get_unsynced_events(db_path)) == 0

    asyncio.run(run())


def test_sync_loop_sends_to_cloud(tmp_path):
    async def run():
        db_path = str(tmp_path / "fallback.db")
        metrics_path = str(tmp_path / "metrics.db")
        init_db(db_path)
        init_metrics_db(metrics_path)

        save_metric(
            metrics_path,
            "cam_01",
            "A-01",
            "occupied",
            "2026-06-05T12:00:00Z",
            "2026-06-05T12:00:01Z",
            "2026-06-05T12:00:02Z",
        )

        payload = {
            "type": "SPOT_UPDATE",
            "spot_id": "A-01",
            "status": "occupied",
            "timestamp": "2026-06-05T12:00:00Z",
            "edge_sent_ts": "2026-06-05T12:00:01Z",
        }
        save_event(db_path, json.dumps(payload))

        mock_cloud_ws = AsyncMock()
        with patch("websockets.connect", new_callable=AsyncMock) as mock_connect:
            mock_connect.return_value = mock_cloud_ws

            sync_event = asyncio.Event()
            task = asyncio.create_task(
                sync_loop(
                    db_path,
                    metrics_path,
                    "wss://cloud/ws",
                    "secret_key",
                    sync_event,
                )
            )
            await asyncio.sleep(0.05)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

            assert mock_cloud_ws.send.called
            sent_str = mock_cloud_ws.send.call_args[0][0]
            sent_payload = json.loads(sent_str)
            assert "gateway_forwarded_at" in sent_payload

            assert len(get_unsynced_events(db_path)) == 0

            conn = sqlite3.connect(metrics_path)
            cursor = conn.cursor()
            cursor.execute(
                "SELECT gateway_forwarded_ts, cloud_ack FROM metrics WHERE spot_id='A-01'"
            )
            row = cursor.fetchone()
            assert row[0] is not None
            assert row[1] == 1
            conn.close()

    asyncio.run(run())


def test_main_startup():
    async def run():
        with (
            patch("websockets.serve") as mock_serve,
            patch("asyncio.Future", new_callable=AsyncMock) as mock_future,
            patch("gateway.init_db") as mock_init_db,
            patch("gateway.init_metrics_db") as mock_init_metrics,
            patch("gateway.sync_loop", new_callable=AsyncMock) as mock_sync_loop,
        ):
            mock_future.return_value = AsyncMock()
            mock_serve.return_value.__aenter__ = AsyncMock()
            mock_serve.return_value.__aexit__ = AsyncMock()

            task = asyncio.create_task(main())
            await asyncio.sleep(0.01)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

            assert mock_init_db.called
            assert mock_init_metrics.called
            assert mock_serve.called
            assert mock_sync_loop.called

    asyncio.run(run())
