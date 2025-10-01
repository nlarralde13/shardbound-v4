"""Authentication helpers for login/logout/me endpoints."""
from __future__ import annotations

from typing import Any, Dict, Optional

from flask import session
from sqlalchemy import func

from app import db
from app.models import User, Player

try:  # flask_login is optional in some deployments
    from flask_login import current_user as flask_current_user
    from flask_login import login_user as flask_login_user
    from flask_login import logout_user as flask_logout_user
except Exception:  # pragma: no cover - fallback when extension missing
    flask_current_user = None
    flask_login_user = None
    flask_logout_user = None


def _normalize_username(raw: str) -> str:
    return (raw or "").strip()


def authenticate(username: str, password: str) -> Optional[User]:
    """Return the matching user when credentials are valid."""
    uname = _normalize_username(username)
    if not uname or not password:
        return None

    user = (
        User.query.filter(func.lower(User.username) == uname.lower()).first()
        if uname
        else None
    )
    if not user:
        return None
    return user if user.check_password(password) else None


def start_session(user: User) -> None:
    """Log the user in and harden the session."""
    session.clear()
    if flask_login_user:
        flask_login_user(user)
    session.permanent = True
    session["user_id"] = user.id
    session["username"] = user.username
    session.modified = True


def end_session() -> None:
    session.clear()
    if flask_logout_user:
        try:
            flask_logout_user()
        except Exception:
            # When flask-login isn't initialized we simply ignore it.
            pass


def get_authenticated_user() -> Optional[User]:
    if flask_current_user is not None:
        try:
            if flask_current_user.is_authenticated:
                return flask_current_user  # type: ignore[return-value]
        except Exception:
            pass
    uid = session.get("user_id")
    if not uid:
        return None
    return User.query.get(uid)


def serialize_user(user: User) -> Dict[str, Any]:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
    }


def serialize_character(player: Optional[Player]) -> Dict[str, Any] | None:
    if not player:
        return None
    return player.as_character_payload()


def me_payload() -> Dict[str, Any]:
    user = get_authenticated_user()
    if not user:
        return {"authenticated": False, "user": None, "has_character": False, "character": None}

    player = user.player if hasattr(user, "player") else None
    payload: Dict[str, Any] = {
        "authenticated": True,
        "user": serialize_user(user),
        "has_character": bool(player),
        "character": serialize_character(player),
    }
    return payload


def create_user(**kwargs: Any) -> User:
    """Helper used by tests/seed paths to create a user."""
    user = User(**kwargs)
    db.session.add(user)
    db.session.commit()
    return user
