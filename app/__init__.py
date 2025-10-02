# app/__init__.py
from __future__ import annotations

import logging
import os
import secrets
from datetime import timedelta
from http import HTTPStatus
from logging.handlers import RotatingFileHandler

from flask import Flask, current_app, jsonify, redirect, request, session, url_for
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy
from werkzeug.exceptions import HTTPException

try:  # Prefer Flask-WTF when available
    from flask_wtf import CSRFProtect  # type: ignore
    from flask_wtf.csrf import CSRFError  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - lightweight fallback
    class CSRFError(HTTPException):
        code = HTTPStatus.FORBIDDEN
        name = "CSRFError"
        description = "CSRF token missing or invalid."

        def __init__(self, description: str | None = None):
            super().__init__(description or self.description)

    class CSRFProtect:  # type: ignore[misc]
        def __init__(self):
            self._app: Flask | None = None

        def init_app(self, app: Flask) -> None:
            self._app = app

            @app.before_request
            def _csrf_protect():
                return self._protect()

            @app.context_processor
            def _csrf_context():
                return {"csrf_token": self.generate_csrf}

        def exempt(self, view):
            setattr(view, "_csrf_exempt", True)
            return view

        def generate_csrf(self) -> str:
            token = session.get("_csrf_token")
            if not token:
                token = secrets.token_urlsafe(32)
                session["_csrf_token"] = token
                session.modified = True
            return token

        def _protect(self):
            if request.method in {"GET", "HEAD", "OPTIONS", "TRACE"}:
                return None

            endpoint = request.endpoint
            if not endpoint:
                return None

            view = current_app.view_functions.get(endpoint)
            if view and getattr(view, "_csrf_exempt", False):
                return None

            token = None
            if request.is_json:
                token = request.headers.get("X-CSRFToken") or request.headers.get("X-CSRF-Token")

            if token is None:
                token = (
                    request.form.get("csrf_token")
                    or request.headers.get("X-CSRFToken")
                    or request.headers.get("X-CSRF-Token")
                    or request.args.get("csrf_token")
                )

            session_token = session.get("_csrf_token")
            if not token or not session_token or not secrets.compare_digest(str(token), str(session_token)):
                raise CSRFError()

            return None

try:  # flask-login is optional in some environments
    from flask_login import LoginManager
except Exception:  # pragma: no cover
    LoginManager = None  # type: ignore

# ---------------------------------------------------------------------------
# Extension instances (singletons shared across the app)
# ---------------------------------------------------------------------------
db: SQLAlchemy = SQLAlchemy()
migrate: Migrate = Migrate()
csrf: CSRFProtect = CSRFProtect()
login_manager = LoginManager() if LoginManager else None


def _configure_logging(app: Flask) -> None:
    """Attach a rotating file handler and standardise logging output."""

    log_directory = os.path.join(app.root_path, "..", "logs")
    os.makedirs(log_directory, exist_ok=True)
    log_path = os.path.realpath(os.path.join(log_directory, "app.log"))

    handler = RotatingFileHandler(log_path, maxBytes=1_048_576, backupCount=5)
    handler.setLevel(logging.INFO)
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")
    )

    # Avoid duplicating handlers when running tests or the dev server reloads.
    if not any(
        isinstance(existing, RotatingFileHandler)
        and getattr(existing, "baseFilename", None) == handler.baseFilename
        for existing in app.logger.handlers
    ):
        app.logger.addHandler(handler)

    app.logger.setLevel(logging.INFO)


def create_app(config_overrides: dict | None = None) -> Flask:
    """Application factory used by the web app, CLI, and tests."""

    app = Flask(
        __name__,
        static_folder="static",
        template_folder="templates",
        instance_relative_config=True,  # allows instance/ for local sqlite, secrets, etc.
    )

    _configure_logging(app)

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
    csrf.init_app(app)

    # Import models after the database has been initialized so Alembic can
    # detect metadata from the same SQLAlchemy instance.
    from . import models  # noqa: F401

    if login_manager:
        from .models import User

        login_manager.init_app(app)
        login_manager.login_view = "auth.login_page"

        @login_manager.unauthorized_handler
        def _redirect_to_login():
            """Ensure unauthenticated visitors are sent to the login screen."""

            if request.method in {"GET", "HEAD"}:
                next_url = request.url
            else:
                next_url = request.referrer

            params = {"next": next_url} if next_url else {}
            return redirect(url_for("auth.login_page", **params))

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

    @app.before_request
    def _log_request() -> None:
        app.logger.info("%s %s", request.method, request.path)

    @app.errorhandler(HTTPException)
    def _handle_http_exception(error: HTTPException):
        if request.path.startswith("/api/"):
            app.logger.warning(
                "HTTPException while handling %s %s: %s", request.method, request.path, error
            )
            response = jsonify(error=error.name)
            return response, error.code
        return error

    @app.errorhandler(CSRFError)
    def _handle_csrf_error(error: CSRFError):
        if request.path.startswith("/api/"):
            app.logger.warning(
                "CSRF failure on %s %s: %s", request.method, request.path, error.description
            )
            return jsonify(error="csrf_failed"), HTTPStatus.FORBIDDEN
        return error

    @app.errorhandler(Exception)
    def _handle_exception(error: Exception):
        app.logger.exception(
            "Unhandled exception during %s %s", request.method, request.path
        )
        if request.path.startswith("/api/"):
            return jsonify(error="internal_error"), HTTPStatus.INTERNAL_SERVER_ERROR
        raise error

    from .main.routes import main_bp
    from .game.routes import game_bp
    from .auth.routes import auth_bp
    from .routes.api_classes import bp as classes_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(game_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(classes_bp)

    return app


__all__ = ["create_app", "db", "migrate", "csrf", "login_manager"]
