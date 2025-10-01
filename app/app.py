# app.py
import os
from datetime import timedelta
from dotenv import load_dotenv

from flask import (
    Flask, request, jsonify, session, redirect, render_template
)
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from flask_migrate import Migrate

# Models
from app.models import db, User, Player

# API blueprints
from .routes.api_classes import bp as classes_bp     # /api/classes, /api/classes/<id>
from .routes.api_characters import bp as chars_bp    # /api/characters

load_dotenv()

# --- Flask setup -------------------------------------------------------------
app = Flask(__name__, static_url_path="/static", static_folder="static", template_folder="templates")

# Secret key & session cookie settings
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-change-me")
app.config["SESSION_COOKIE_NAME"] = "sb_sess"
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = False  # set True when served over HTTPS
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=7)

# --- Database (SQLite by default; swap to DATABASE_URL to change) -----------
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DB_PATH  = os.path.join(BASE_DIR, "shardbound.db")
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)
migrate = Migrate(app, db)

# --- First-run helper (dev convenience) -------------------------------------
with app.app_context():
    db.create_all()  # harmless with Alembic; keeps dev bootstrap easy
    if os.getenv("SEED_ON_STARTUP") == "1":
        seed_user = os.getenv("LOGIN_USER")
        seed_pass = os.getenv("LOGIN_PASS")
        if seed_user and seed_pass and not User.query.filter(func.lower(User.username) == seed_user.lower()).first():
            db.session.add(User(
                username=seed_user,
                email=os.getenv("LOGIN_EMAIL") or None,
                first_name=os.getenv("LOGIN_FIRST") or "Test",
                last_name=os.getenv("LOGIN_LAST") or "User",
                password_hash=User.hash_password(seed_pass),
            ))
            db.session.commit()

# --- Auth utilities ----------------------------------------------------------
def login_required(func):
    """Guard routes: if not logged in, bounce to /login."""
    from functools import wraps
    @wraps(func)
    def wrapper(*args, **kwargs):
        if not session.get("user_id"):
            return redirect("/login")  # standardized (was /login.html previously)
        return func(*args, **kwargs)
    return wrapper

def current_user():
    uid = session.get("user_id")
    return User.query.get(uid) if uid else None

# --- Auth API ----------------------------------------------------------------
@app.post("/api/signup")
def api_signup():
    data     = request.get_json(silent=True) or {}
    username = (data.get("username")   or "").strip()
    password = (data.get("password")   or "").strip()
    email    = (data.get("email")      or "").strip()
    first    = (data.get("first_name") or "").strip()
    last     = (data.get("last_name")  or "").strip()
    # Optional birthday support if you POST "birthday" as YYYY-MM-DD:
    birthday = (data.get("birthday")   or "").strip() or None

    # Basic validations
    errors = {}
    if not username: errors["username"] = "Username is required."
    elif len(username) < 3: errors["username"] = "Username must be at least 3 characters."
    if not password: errors["password"] = "Password is required."
    elif len(password) < 6: errors["password"] = "Password must be at least 6 characters."
    if email and "@" not in email: errors["email"] = "Invalid email address."
    if errors:
        return jsonify({"ok": False, "errors": errors}), 400

    # Case-insensitive conflicts
    if User.query.filter(func.lower(User.username) == username.lower()).first():
        return jsonify({"ok": False, "errors": {"username": "That username is taken."}}), 409
    if email and User.query.filter(func.lower(User.email) == email.lower()).first():
        return jsonify({"ok": False, "errors": {"email": "That email is already in use."}}), 409

    # Create
    user = User(
        username=username,
        email=email or None,
        first_name=first or None,
        last_name=last or None,
        password_hash=User.hash_password(password),
    )
    # store birthday if sent and valid
    if birthday:
        try:
            from datetime import date
            y, m, d = map(int, birthday.split("-"))
            user.birthday = date(y, m, d)
        except Exception:
            pass

    db.session.add(user)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"ok": False, "errors": {"_": "Conflict creating account. Try a different username/email."}}), 409

    return jsonify({"ok": True, "message": "Account created. Please log in."})

@app.post("/api/login")
def api_login():
    data     = request.get_json(silent=True) or {}
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
# (matches your existing flow). :contentReference[oaicite:5]{index=5}

@app.post("/api/logout")
def api_logout():
    session.clear()
    return jsonify({"ok": True})

@app.get("/api/me")
def api_me():
    user = current_user()
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

# --- Pages -------------------------------------------------------------------
@app.get("/play")
@login_required
def play_gate():
    return render_template("play.html")
# (keeps your “protected play” behavior). :contentReference[oaicite:6]{index=6}

@app.get("/")
def root_redirect():
    return redirect("/play" if session.get("user_id") else "/login")
# (keeps your login-or-play redirect). :contentReference[oaicite:7]{index=7}

@app.get("/login")
def login_file():
    return render_template("login.html")
# (serves the login template at /login). :contentReference[oaicite:8]{index=8}

@app.get("/battlebox")
@login_required
def battlebox():
    return render_template("battlebox.html")
# (kept as protected). :contentReference[oaicite:9]{index=9}

# --- API blueprints ----------------------------------------------------------
app.register_blueprint(classes_bp)   # fixes 404 on /api/classes by ensuring registration
app.register_blueprint(chars_bp)     # for POST /api/characters

# --- Main --------------------------------------------------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5001)), debug=True)
