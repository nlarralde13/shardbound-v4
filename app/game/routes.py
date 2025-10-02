# app/game/routes.py
from flask import Blueprint, jsonify, render_template, request
from flask_login import current_user, login_required

from app import csrf
from ..models import Character, CharacterFlag, Player, db

game_bp = Blueprint("game", __name__)


@game_bp.get("/play")
@login_required
def play():
    """Render the main gameplay view once the user is authenticated."""

    return render_template("play.html")

def _safe_username(u):
    # don’t assume your User model has `username`
    return getattr(u, "username", None) or getattr(u, "email", None) or getattr(u, "name", None) or f"user:{u.id}"

def _serialize_character(c: Character):
    if not c:
        return None
    return {
        "id": c.id,
        "name": c.name,
        "title": c.title,
        "class": c.class_name,
        "level": c.level,
        "xp": c.xp,
        "power": c.power,
    }

def _flags_dict(character_id: int):
    flags = CharacterFlag.query.filter_by(character_id=character_id).all()
    return {f.flag_name: bool(f.value) for f in flags}

# ---------------------- /api/me ----------------------
# Return JSON; never throw; 401 when not authenticated.
@game_bp.get("/api/me")
def api_me():
    try:
        if not current_user or not getattr(current_user, "is_authenticated", False):
            payload = {
                "authenticated": False,
                "user": None,
                "has_character": False,
                "character": None,
                "flags": {},
            }
            return jsonify(payload), 401

        player = getattr(current_user, "player", None)
        if player is None:
            player = Player.query.filter_by(user_id=current_user.id).first()

        char = Character.query.filter_by(user_id=current_user.id).first()
        has_character = bool(player or char)

        if player and hasattr(player, "as_character_payload"):
            character_payload = player.as_character_payload()
        else:
            character_payload = _serialize_character(char)

        data = {
            "authenticated": True,
            "user": {"id": current_user.id, "username": _safe_username(current_user)},
            "has_character": has_character,
            "character": character_payload,
            "flags": _flags_dict(char.id) if char else {},
        }
        return jsonify(data), 200
    except Exception as e:
        # Log server-side and return JSON instead of an HTML 500 page
        db.session.rollback()
        print("[/api/me] error:", repr(e))
        return jsonify({"error": "internal_error"}), 500

# ---------------------- /api/characters ----------------------
@csrf.exempt
@game_bp.post("/api/characters")
@login_required
def api_create_character():
    try:
        data = request.get_json(silent=True) or {}
        name = (data.get("name") or "").strip()
        class_name = (data.get("class") or "").strip()
        title = (data.get("title") or "").strip()

        if not name or not class_name:
            return jsonify(error="Name and class are required."), 400

        existing = Character.query.filter_by(user_id=current_user.id).first()
        if existing:
            return jsonify(error="Character already exists."), 400

        char = Character(
            user_id=current_user.id,
            name=name, class_name=class_name, title=title,
        )
        db.session.add(char)
        db.session.flush()  # get char.id before creating flags

        db.session.add(CharacterFlag(character_id=char.id, flag_name="completed_intro", value=False))
        db.session.commit()

        return jsonify(ok=True, character=_serialize_character(char)), 201
    except Exception as e:
        db.session.rollback()
        print("[/api/characters] error:", repr(e))
        return jsonify(error="internal_error"), 500

# ---------------------- /api/quests/intro/complete ----------------------
@csrf.exempt
@game_bp.post("/api/quests/intro/complete")
@login_required
def api_complete_intro():
    try:
        char = Character.query.filter_by(user_id=current_user.id).first()
        if not char:
            return jsonify(error="No character found."), 404

        flag = CharacterFlag.query.filter_by(character_id=char.id, flag_name="completed_intro").first()
        if not flag:
            flag = CharacterFlag(character_id=char.id, flag_name="completed_intro", value=True)
            db.session.add(flag)
        else:
            flag.value = True

        db.session.commit()
        return jsonify(ok=True, flag={"completed_intro": True}), 200
    except Exception as e:
        db.session.rollback()
        print("[/api/quests/intro/complete] error:", repr(e))
        return jsonify(error="internal_error"), 500
