from __future__ import annotations

from datetime import date
from http import HTTPStatus
from typing import Any, Dict

from flask import Blueprint, jsonify, redirect, render_template, request, session, url_for
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from werkzeug.security import check_password_hash

from app import csrf, db
from app.models import User
from .service import (
    end_session,
    me_payload,
    serialize_user,
)

try:
    from flask_login import current_user, login_user, logout_user
except Exception:  # pragma: no cover - flask_login optional in some envs
    current_user = None
    login_user = None
    logout_user = None


def _password_matches(user: User, candidate: str) -> bool:
    """Validate plaintext passwords against stored hashes."""

    try:
        return check_password_hash(user.password_hash, candidate)
    except ValueError:
        # Legacy bcrypt hashes are supported for backwards compatibility.
        return user.check_password(candidate)

auth_bp = Blueprint("auth", __name__, url_prefix="")


# ---------------------------------------------------------------------------
# Page endpoints
# ---------------------------------------------------------------------------
@auth_bp.get("/login")
def login_page():
    if current_user is not None:
        try:
            if current_user.is_authenticated:  # type: ignore[attr-defined]
                return redirect(url_for("game.play"))
        except Exception:
            pass
    return render_template("login.html")


@auth_bp.post("/logout")
def logout():
    end_session()
    return redirect(url_for("auth.login_page"))


# ---------------------------------------------------------------------------
# JSON API endpoints (CSRF exempt because they require credentials cookie)
# ---------------------------------------------------------------------------
@csrf.exempt
@auth_bp.post("/api/login")
def api_login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(ok=False, error="invalid_payload"), HTTPStatus.BAD_REQUEST

    identifier = (data.get("username") or data.get("email") or "").strip()
    password = (data.get("password") or "").strip()

    if not identifier or not password:
        return jsonify(ok=False, error="missing_credentials"), HTTPStatus.BAD_REQUEST

    user = None
    if identifier:
        identifier_lower = identifier.lower()
        user = (
            User.query.filter(
                or_(
                    func.lower(User.username) == identifier_lower,
                    func.lower(User.email) == identifier_lower,
                )
            ).first()
        )

    if not user or not _password_matches(user, password):
        return jsonify(ok=False, error="invalid_credentials"), HTTPStatus.UNAUTHORIZED

    if login_user:
        login_user(user)

    session.permanent = True
    session["user"] = {"id": user.id, "username": user.username}
    session["user_id"] = user.id
    session["username"] = user.username
    session.modified = True

    payload = {"ok": True, "user": {"id": user.id, "username": user.username}}
    return jsonify(payload), HTTPStatus.OK


@csrf.exempt
@auth_bp.post("/api/logout")
def api_logout():
    if logout_user:
        try:
            logout_user()
        except Exception:
            pass
    session.clear()
    return ("", HTTPStatus.NO_CONTENT)


@auth_bp.get("/api/me")
def api_me():
    payload = me_payload()
    status = HTTPStatus.OK if payload.get("authenticated") else HTTPStatus.UNAUTHORIZED
    return jsonify(payload), status


@auth_bp.post("/api/signup")
def api_signup():
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return _error_response(HTTPStatus.BAD_REQUEST, "Invalid JSON body.")

    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()
    email = (data.get("email") or "").strip() or None
    first = (data.get("first_name") or "").strip() or None
    last = (data.get("last_name") or "").strip() or None
    birthday_raw = (data.get("birthday") or "").strip() or None

    errors: Dict[str, str] = {}
    if not username:
        errors["username"] = "Username is required."
    elif len(username) < 3:
        errors["username"] = "Username must be at least 3 characters."

    if not password:
        errors["password"] = "Password is required."
    elif len(password) < 6:
        errors["password"] = "Password must be at least 6 characters."

    if email and "@" not in email:
        errors["email"] = "Invalid email address."

    if errors:
        return jsonify({"ok": False, "errors": errors}), HTTPStatus.BAD_REQUEST

    if User.query.filter(func.lower(User.username) == username.lower()).first():
        return jsonify({"ok": False, "errors": {"username": "Taken"}}), HTTPStatus.CONFLICT
    if email and User.query.filter(func.lower(User.email) == email.lower()).first():
        return jsonify({"ok": False, "errors": {"email": "In use"}}), HTTPStatus.CONFLICT

    user = User(
        username=username,
        email=email,
        first_name=first,
        last_name=last,
        password_hash=User.hash_password(password),
    )
    if birthday_raw:
        try:
            year, month, day = map(int, birthday_raw.split("-"))
            user.birthday = date(year, month, day)
        except Exception:
            pass
    db.session.add(user)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return _error_response(HTTPStatus.CONFLICT, "Account already exists.")

    return jsonify({"ok": True, "message": "Account created. Please log in."}), HTTPStatus.CREATED


def _error_response(status: HTTPStatus, message: str, *, errors: Dict[str, Any] | None = None):
    payload: Dict[str, Any] = {"ok": False, "error": message}
    if errors:
        payload["errors"] = errors
    return jsonify(payload), status
