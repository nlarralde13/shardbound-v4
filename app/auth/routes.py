from __future__ import annotations

from datetime import date
from http import HTTPStatus
from typing import Any, Dict

from flask import (
    Blueprint,
    jsonify,
    redirect,
    render_template,
    request,
    url_for,
)
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.models import db, User
from .service import (
    authenticate,
    end_session,
    me_payload,
    serialize_user,
    start_session,
)

try:
    from flask_login import current_user
except Exception:  # pragma: no cover - flask_login optional in some envs
    current_user = None

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
@auth_bp.post("/api/login")
def api_login():
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return _error_response(HTTPStatus.BAD_REQUEST, "Invalid JSON body.")

    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    if not username or not password:
        return _error_response(
            HTTPStatus.BAD_REQUEST,
            "Username and password are required.",
            errors={"username": "Required", "password": "Required"},
        )

    # TODO: hook rate limiting here (e.g. redis-based attempt counter)

    user = authenticate(username, password)
    if not user:
        return _error_response(HTTPStatus.UNAUTHORIZED, "Invalid credentials.")

    start_session(user)
    response = {
        "ok": True,
        "user": serialize_user(user),
        "redirect": url_for("game.play"),
    }
    return jsonify(response)


@auth_bp.post("/api/logout")
def api_logout():
    end_session()
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
