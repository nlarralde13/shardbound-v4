# app/__init__.py
import os
from datetime import timedelta
from typing import Optional

from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

# Login is optional—only used if you have flask_login installed and a User model
try:
    from flask_login import LoginManager
except Exception:  # pragma: no cover
    LoginManager = None  # type: ignore

# --- Extensions (singletons) -------------------------------------------------
db = SQLAlchemy()
migrate = Migrate()
login_manager: Optional["LoginManager"] = LoginManager() if LoginManager else None  # type: ignore[name-defined]


def create_app(config_overrides: dict | None = None) -> Flask:
    """
    Application factory.

    This sets up:
      - SQLAlchemy (db)
      - Flask-Migrate (migrate)  <-- enables `flask db ...`
      - Optional flask_login (login_manager)
    It also imports `app.models` so Alembic can detect your tables/columns.
    """
    app = Flask(
        __name__,
        static_folder="static",
        template_folder="templates",
        instance_relative_config=True,  # allows instance/ for local sqlite, secrets, etc.
    )

    # --- Base config (safe defaults; env can override) -----------------------
    app.config.setdefault("SECRET_KEY", os.getenv("SECRET_KEY", "dev-change-me"))
    # Prefer DATABASE_URL if provided, else use a local SQLite under instance/
    default_sqlite = "sqlite:///" + os.path.join(app.instance_path, "app.sqlite")
    app.config.setdefault("SQLALCHEMY_DATABASE_URI", os.getenv("DATABASE_URL", default_sqlite))
    app.config.setdefault("SQLALCHEMY_TRACK_MODIFICATIONS", False)
    app.config.setdefault("PERMANENT_SESSION_LIFETIME", timedelta(days=7))

    # Apply any runtime overrides (e.g., for tests)
    if config_overrides:
        app.config.update(config_overrides)

    # Ensure instance folder exists for SQLite
    try:
        os.makedirs(app.instance_path, exist_ok=True)
    except OSError:
        pass

    # --- Init extensions -----------------------------------------------------
    db.init_app(app)

    # IMPORTANT: import models so Alembic sees metadata for autogenerate
    # (keep this import AFTER db.init_app and BEFORE migrate.init_app)
    from . import models  # noqa: F401

    migrate.init_app(app, db)

    # --- Optional: flask_login wiring ----------------------------------------
    if login_manager:
        login_manager.init_app(app)
        login_manager.login_view = "auth.login"  # change if your route name differs

        @login_manager.user_loader
        def load_user(user_id: str):
            # Local import to avoid circular deps
            from .models import User  # type: ignore
            # If your User PK is UUID/str, adjust cast accordingly
            try:
                return User.query.get(int(user_id))  # type: ignore[arg-type]
            except Exception:
                return User.query.get(user_id)  # type: ignore[misc]

    # --- Blueprints (optional, safe-import) ----------------------------------
    # These are optional. If present in your project, they’ll be registered.
    # If not, no problem—this keeps migrations working either way.
    for import_path, attr in [
        ("app.routes.auth", "auth_bp"),
        ("app.routes.game", "game_bp"),
        ("app.routes.api", "api_bp"),
        ("app.routes.main", "main_bp"),
    ]:
        try:
            mod = __import__(import_path, fromlist=[attr])
            bp = getattr(mod, attr, None)
            if bp is not None:
                app.register_blueprint(bp)
        except Exception:
            # Silently skip if module/blueprint isn’t there yet
            pass

    return app
