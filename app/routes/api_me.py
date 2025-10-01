# app/routes/api_me.py
from flask import Blueprint, request, jsonify, session
from sqlalchemy import func
from app.models import db, User, Player

bp = Blueprint("api_me", __name__)

# ---- Helpers ---------------------------------------------------------
def _current_user():
    uid = session.get("user_id")
    return User.query.get(uid) if uid else None

# ---- Auth: Signup ----------------------------------------------------
@bp.post("/api/signup")
def api_signup():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()
    email    = (data.get("email") or "").strip()
    first    = (data.get("first_name") or "").strip()
    last     = (data.get("last_name") or "").strip()
    birthday = (data.get("birthday") or "").strip() or None

    errors = {}
    if not username: errors["username"] = "Username is required."
    elif len(username) < 3: errors["username"] = "At least 3 chars."
    if not password: errors["password"] = "Password is required."
    elif len(password) < 6: errors["password"] = "At least 6 chars."
    if email and "@" not in email: errors["email"] = "Invalid email."
    if errors: return jsonify({"ok": False, "errors": errors}), 400

    # Conflicts (case-insensitive)
    if User.query.filter(func.lower(User.username) == username.lower()).first():
        return jsonify({"ok": False, "errors": {"username": "Taken"}}), 409
    if email and User.query.filter(func.lower(User.email) == email.lower()).first():
        return jsonify({"ok": False, "errors": {"email": "In use"}}), 409

    u = User(
        username=username,
        email=email or None,
        first_name=first or None,
        last_name=last or None,
        password_hash=User.hash_password(password),
    )
    if birthday:
        try:
            y, m, d = map(int, birthday.split("-"))
            from datetime import date
            u.birthday = date(y, m, d)
        except Exception:
            pass

    db.session.add(u)
    db.session.commit()
    return jsonify({"ok": True, "message": "Account created. Please log in."})

# ---- Auth: Login -----------------------------------------------------
@bp.post("/api/login")
def api_login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    user = User.query.filter(func.lower(User.username) == username.lower()).first()
    if not user or not user.check_password(password):
        return jsonify({"ok": False, "error": "Invalid credentials"}), 401

    session.clear()
    session.permanent = True
    session["user_id"] = user.id
    session["username"] = user.username
    return jsonify({"ok": True, "redirect": "/play"})

# ---- Auth: Logout ----------------------------------------------------
@bp.post("/api/logout")
def api_logout():
    session.clear()
    return jsonify({"ok": True})

# ---- Me --------------------------------------------------------------
@bp.get("/api/me")
def api_me():
    user = _current_user()
    if not user:
        return jsonify({"user": None})
    player = Player.query.filter_by(user_id=user.id).first()
    return jsonify({
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "birthday": user.birthday.isoformat() if user.birthday else None,
        },
        "has_character": player is not None,
        "onboarding_stage": player.onboarding_stage if player else None,
    })
