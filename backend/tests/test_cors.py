"""Das Frontend (Port 5173) muss die API aufrufen dürfen, fremde Seiten nicht."""

import pytest

ALLOWED_ORIGIN = "http://127.0.0.1:5173"


@pytest.mark.parametrize("method", ["GET", "POST", "DELETE"])
def test_frontend_origin_is_allowed(client, method):
    # So fragt der Browser vor einer Anfrage nach (Preflight)
    res = client.options(
        "/runs",
        headers={
            "Origin": ALLOWED_ORIGIN,
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == ALLOWED_ORIGIN


def test_foreign_origin_is_not_allowed(client):
    res = client.get("/experiments", headers={"Origin": "http://evil.example"})

    assert "access-control-allow-origin" not in res.headers


@pytest.mark.parametrize("host", ["127.0.0.1:8000", "localhost:8000"])
def test_localhost_host_is_allowed(client, host):
    assert client.get("/experiments", headers={"Host": host}).status_code == 200


def test_foreign_host_is_rejected(client):
    # DNS-Rebinding: Die fremde Seite zeigt auf 127.0.0.1, der Browser schickt aber ihren Namen als Host
    assert client.get("/experiments", headers={"Host": "evil.example"}).status_code == 400
