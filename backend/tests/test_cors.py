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
