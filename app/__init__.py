import os
from datetime import timedelta

from flask import Flask

from app.models import db, User

try:
    from flask_login import LoginManager
except Exception:  # pragma: no cover - flask_login optional
    LoginManager = None  # type: ignore[assignment]

login_manager = LoginManager() if "LoginManager" in globals() and LoginManager else None


def create_app(config_overrides: dict | None = None) -> Flask:
    app = Flask(
        __name__,
        static_url_path="/static",
        static_folder="static",
        template_folder="templates",
    )

    default_db = os.getenv("DATABASE_URL") or f"sqlite:///{os.path.join(app.root_path, 'shardbound.db')}"
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

    db.init_app(app)

    if login_manager:
        login_manager.init_app(app)
        login_manager.login_view = "auth.login_page"
        login_manager.session_protection = "strong"

        @login_manager.user_loader
        def load_user(user_id: str):  # pragma: no cover - exercised in integration
            if not user_id:
                return None
            try:
                return User.query.get(int(user_id))
            except (ValueError, TypeError):
                return None

    from .main.routes import main_bp
    from .game.routes import game_bp
    from .auth.routes import auth_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(game_bp)
    app.register_blueprint(auth_bp)

    from .routes.api_classes import bp as classes_bp

    app.register_blueprint(classes_bp)

    return app
