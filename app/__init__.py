# app/__init__.py
import os
from datetime import timedelta
from functools import wraps

from flask import Flask, redirect, render_template, session
from flask_migrate import Migrate

# Your models (single SQLAlchemy instance)
from .models import db, User, Player

# Blueprints (API)
from .routes.api_me import bp as me_bp
from .routes.api_classes import bp as classes_bp
from .routes.api_characters import bp as chars_bp


def login_required(fn):
    """Redirect to /login when there is no authenticated session."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("user_id"):
            return redirect("/login")
        return fn(*args, **kwargs)
    return wrapper


def create_app():
    # Use Flask defaults for locations *inside the package*:
    #   templates -> app/templates
    #   static    -> app/static
    app = Flask(__name__)

    # ----------------------- Configuration -----------------------
    # Secrets / sessions
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-change-me")
    app.config["SESSION_COOKIE_NAME"] = os.getenv("SESSION_COOKIE_NAME", "sb_sess")
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    # NOTE: set to True in production behind HTTPS
    app.config["SESSION_COOKIE_SECURE"] = os.getenv("SESSION_COOKIE_SECURE", "false").lower() == "true"
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=7)

    # Database (SQLite fallback to shardbound.db in project root)
    app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL", "sqlite:///shardbound.db")
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # ----------------------- Extensions --------------------------
    db.init_app(app)
    Migrate(app, db)

    # ----------------------- Blueprints --------------------------
    app.register_blueprint(me_bp)        # /api/me, /api/login, /api/logout (if present in your file)
    app.register_blueprint(classes_bp)   # /api/classes, /api/classes/<id>
    app.register_blueprint(chars_bp)     # /api/characters

    # ----------------------- Pages -------------------------------
    @app.get("/")
    def root_redirect():
        # If logged in, go straight to the game; otherwise show login
        return redirect("/play" if session.get("user_id") else "/login")

    @app.get("/play")
    @login_required
    def play():
        return render_template("play.html")

    @app.get("/login")
    def login_page():
        # Served from app/templates/login.html
        return render_template("login.html")

    # ----------------------- (Optional) Health -------------------
    @app.get("/healthz")
    def healthz():
        return {"ok": True}, 200

    return app
