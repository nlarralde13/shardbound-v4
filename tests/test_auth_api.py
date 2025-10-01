from __future__ import annotations

from typing import Generator

import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app, db  # type: ignore  # noqa: E402
from app.models import User, Player  # type: ignore  # noqa: E402


@pytest.fixture
def app() -> Generator:
    app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "WTF_CSRF_ENABLED": False,
    })

    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def user_id(app) -> int:
    with app.app_context():
        user = User(
            username="testuser",
            email="test@example.com",
            password_hash=User.hash_password("secret123"),
        )
        db.session.add(user)
        db.session.commit()
        return user.id


def test_api_login_success(client, user_id):
    res = client.post("/api/login", json={"username": "testuser", "password": "secret123"})
    assert res.status_code == 200
    data = res.get_json()
    assert data["ok"] is True
    assert data["user"]["username"] == "testuser"


def test_api_login_bad_body(client):
    res = client.post("/api/login", json={})
    assert res.status_code == 400
    data = res.get_json()
    assert data["ok"] is False


def test_api_login_bad_credentials(client, user_id):
    res = client.post("/api/login", json={"username": "testuser", "password": "wrong"})
    assert res.status_code == 401
    assert res.get_json()["ok"] is False


def test_api_me_requires_auth(client):
    res = client.get("/api/me")
    assert res.status_code == 401
    data = res.get_json()
    assert data["authenticated"] is False
    assert data["user"] is None


def test_api_me_after_login(client, app, user_id):
    login = client.post("/api/login", json={"username": "testuser", "password": "secret123"})
    assert login.status_code == 200

    with app.app_context():
        player = Player(user_id=user_id, class_id="Warrior", gender="male", display_name="Hero", title="the Bold")
        db.session.add(player)
        db.session.commit()

    res = client.get("/api/me")
    data = res.get_json()
    assert data["authenticated"] is True
    assert data["user"]["username"] == "testuser"
    assert data["has_character"] is True
    assert data["character"]["class"] == "Warrior"
    assert data["character"]["name"] == "Hero"


def test_api_logout_clears_session(client, app, user_id):
    client.post("/api/login", json={"username": "testuser", "password": "secret123"})

    res = client.post("/api/logout")
    assert res.status_code in (200, 204)

    me = client.get("/api/me")
    assert me.status_code == 401


def test_create_character_flow(client, app, user_id):
    login = client.post("/api/login", json={"username": "testuser", "password": "secret123"})
    assert login.status_code == 200

    res = client.post(
        "/api/characters",
        json={"name": "Aria", "class": "Mage", "title": "the Unbound"},
    )
    assert res.status_code == 201
    data = res.get_json()
    assert data["ok"] is True
    assert data["character"]["name"] == "Aria"

    me = client.get("/api/me")
    assert me.status_code == 200
    payload = me.get_json()
    assert payload["has_character"] is True
    assert payload["character"]["class"] == "Mage"
