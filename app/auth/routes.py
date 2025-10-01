from flask import Blueprint, render_template, redirect, url_for, request, session
try:
    from flask_login import logout_user, current_user
except Exception:
    logout_user = None
    current_user = None

auth_bp = Blueprint("auth", __name__, url_prefix="")

# GET /login — render login form
@auth_bp.get("/login")
def login_page():
    # Render your real login template
    return render_template("login.html") if "login.html" else ("Login page", 200)

# POST /logout — sign out and go home
@auth_bp.post("/logout")
def logout():
    # Clear any session keys you set on login
    session.pop("user", None)
    # If using flask_login
    if logout_user and current_user and getattr(current_user, "is_authenticated", False):
        logout_user()
    return redirect(url_for("main.index"))
