# app/__init__.py
import os
from datetime import timedelta
from typing import Optional

from flask import Flask

from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy

try:  # flask-login is optional in some environments

    from flask_login import LoginManager
except Exception:  # pragma: no cover
    LoginManager = None  # type: ignore
# ---------------------------------------------------------------------------
# Extension instances (singletons shared across the app)
# ---------------------------------------------------------------------------
db: SQLAlchemy = SQLAlchemy()
migrate: Migrate = Migrate()
login_manager = LoginManager() if LoginManager else None


def create_app(config_overrides: dict | None = None) -> Flask:
    """Application factory used by the web app, CLI, and tests."""

    app = Flask(
        __name__,
        static_folder="static",
        template_folder="templates",
        instance_relative_config=True,  # allows instance/ for local sqlite, secrets, etc.
    )


    os.makedirs(app.instance_path, exist_ok=True)
    default_db = os.getenv("DATABASE_URL") or f"sqlite:///{os.path.join(app.instance_path, 'shardbound.db')}"

    app.config.update(
        SECRET_KEY=os.getenv("SECRET_KEY", "dev-change-me"),
        SQLALCHEMY_DATABASE_URI=default_db,
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        PERMANENT_SESSION_LIFETIME=timedelta(days=7),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
    )


    if config_overrides:
        app.config.update(config_overrides)

    # Ensure instance folder exists for SQLite
    try:
        os.makedirs(app.instance_path, exist_ok=True)
    except OSError:
        pass

    # --- Init extensions -----------------------------------------------------
    db.init_app(app)

    # Import models after the database has been initialized so Alembic can
    # detect metadata from the same SQLAlchemy instance.
    from . import models  # noqa: F401


    if login_manager:
        from .models import User

        login_manager.init_app(app)
        login_manager.login_view = "auth.login"  # change if your route name differs

        @login_manager.user_loader
        def load_user(user_id: str):
            # Local import to avoid circular deps
            from .models import User  # type: ignore
            # If your User PK is UUID/str, adjust cast accordingly
            try:

                return User.query.get(int(user_id))
            except (ValueError, TypeError):
                return None

    migrate.init_app(app, db)

    from .main.routes import main_bp
    from .game.routes import game_bp
    from .auth.routes import auth_bp
    from .routes.api_classes import bp as classes_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(game_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(classes_bp)


    return app


__all__ = ["create_app", "db", "migrate", "login_manager"]
