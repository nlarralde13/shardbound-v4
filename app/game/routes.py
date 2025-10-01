from __future__ import annotations

from http import HTTPStatus

from flask import Blueprint, jsonify, render_template, request
try:
    from flask_login import current_user, login_required
except Exception:
    # Fallback no-op decorator if flask_login not installed
    def login_required(fn):
        return fn
    current_user = None

from app import db
from app.models import Player

game_bp = Blueprint("game", __name__, url_prefix="")

@game_bp.get("/play")
@login_required  # remove if you want play accessible without auth
def play():
    return render_template("play.html")


ALLOWED_CLASSES = {"Warrior", "Mage", "Cleric", "Ranger", "Rogue", "Monk"}


@game_bp.post("/api/characters")
@login_required
def create_character():
    proxy = current_user if current_user is not None else None
    if proxy is None:
        return ("", HTTPStatus.UNAUTHORIZED)

    try:
        user_obj = proxy._get_current_object()  # type: ignore[attr-defined]
    except Exception:
        user_obj = proxy

    user_id = getattr(user_obj, "id", None)
    if user_id is None:
        return ("", HTTPStatus.UNAUTHORIZED)

    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"ok": False, "error": "Invalid JSON body."}), HTTPStatus.BAD_REQUEST

    name = (payload.get("name") or "").strip()
    title = (payload.get("title") or "").strip() or None
    class_name = (payload.get("class") or "").strip()

    errors: dict[str, str] = {}
    if not name:
        errors["name"] = "Name is required."
    elif not (2 <= len(name) <= 24):
        errors["name"] = "Name must be 2-24 characters."

    if title and len(title) > 32:
        errors["title"] = "Title must be 32 characters or fewer."

    if class_name not in ALLOWED_CLASSES:
        errors["class"] = "Choose a valid class."

    if errors:
        return jsonify({"ok": False, "errors": errors}), HTTPStatus.BAD_REQUEST

    existing = Player.query.filter_by(user_id=user_id).first()
    if existing:
        return (
            jsonify({"ok": False, "error": "Character already exists."}),
            HTTPStatus.CONFLICT,
        )

    character = Player(
        user_id=user_id,
        class_id=class_name,
        display_name=name,
        title=title,
        onboarding_stage="intro",
    )
    db.session.add(character)
    db.session.commit()

    return (
        jsonify({"ok": True, "character": character.as_character_payload()}),
        HTTPStatus.CREATED,
    )
