from flask import Blueprint, redirect, render_template, url_for

try:
    from flask_login import current_user
except Exception:  # pragma: no cover - flask_login optional in some envs
    current_user = None

main_bp = Blueprint("main", __name__)

@main_bp.get("/")
def index():
    is_authenticated = False
    if current_user is not None:
        try:
            is_authenticated = bool(current_user.is_authenticated)
        except Exception:
            is_authenticated = False
    return redirect(url_for("game.play") if is_authenticated else url_for("auth.login_page"))

@main_bp.get("/docs")
def docs():
    # Wire to your docs template or static page
    return render_template("docs.html") if "docs.html" else ("Docs coming soon", 200)

@main_bp.get("/logs")
def logs():
    # If you already have a logs page/template, point to it here
    return render_template("logs.html") if "logs.html" else ("Logs UI coming soon", 200)
