import asyncio
from unittest.mock import patch, AsyncMock
import pytest
import client


def test_connect_ws_cloud_success():
    async def run():
        with patch("websockets.connect", new_callable=AsyncMock) as mock_connect:
            mock_ws = AsyncMock()
            mock_connect.return_value = mock_ws
            ws = await client.connect_ws({"Auth": "Bearer token"})
            assert ws == mock_ws
            mock_connect.assert_called_once_with(
                client.WS_URL,
                additional_headers={"Auth": "Bearer token"},
                open_timeout=3,
            )

    asyncio.run(run())


def test_connect_ws_failure():
    async def run():
        with patch("websockets.connect", new_callable=AsyncMock) as mock_connect:
            mock_connect.side_effect = Exception("Connect fail")
            with pytest.raises(Exception):
                await client.connect_ws({"Auth": "Bearer token"})
            mock_connect.assert_called_once_with(
                client.WS_URL,
                additional_headers={"Auth": "Bearer token"},
                open_timeout=3,
            )

    asyncio.run(run())


def test_safe_send_success():
    async def run():
        mock_ws = AsyncMock()
        ret = await client.safe_send(mock_ws, "payload", {"Auth": "Bearer"})
        assert ret == mock_ws
        mock_ws.send.assert_called_once_with("payload")

    asyncio.run(run())


def test_safe_send_reconnect_success():
    async def run():
        mock_ws1 = AsyncMock()
        mock_ws1.send.side_effect = Exception("Closed")
        mock_ws2 = AsyncMock()
        with patch("client.connect_ws", new_callable=AsyncMock) as mock_connect:
            mock_connect.return_value = mock_ws2
            ret = await client.safe_send(mock_ws1, "payload", {"Auth": "Bearer"})
            assert ret == mock_ws2
            mock_ws2.send.assert_called_once_with("payload")

    asyncio.run(run())


def test_safe_send_reconnect_fail():
    async def run():
        mock_ws = AsyncMock()
        mock_ws.send.side_effect = Exception("Closed")
        with patch("client.connect_ws", new_callable=AsyncMock) as mock_connect:
            mock_connect.side_effect = Exception("Reconnect fail")
            ret = await client.safe_send(mock_ws, "payload", {"Auth": "Bearer"})
            assert ret is None

    asyncio.run(run())
