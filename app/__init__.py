import os
from flask import Flask
from datetime import timedelta

# If you use flask_login, import and init it here
try:
    from flask_login import LoginManager
    login_manager = LoginManager()
except Exception:  # not installed
    login_manager = None


def create_app():
    app = Flask(__name__, static_url_path="/static", static_folder="static", template_folder="templates")

    # --- Config (tweak as needed) ---
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-change-me")
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=7)

    # --- Login manager (optional but recommended) ---
    if login_manager:
        login_manager.init_app(app)
        login_manager.login_view = "auth.login_page"  # redirect target for @login_required

        # If you use flask_login with a User model, define this:
        @login_manager.user_loader
        def load_user(user_id: str):
            # TODO: return your User object by id
            return None

    # --- Blueprints ---
    from .main.routes import main_bp
    from .game.routes import game_bp
    from .auth.routes import auth_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(game_bp)
    app.register_blueprint(auth_bp)

    # --- Error pages (optional) ---
    @app.errorhandler(404)
    def not_found(e):
        return ("Not Found", 404)

    @app.errorhandler(500)
    def server_error(e):
        # In production you’d render a template
        return ("Server Error", 500)

    return app
