from flask import Blueprint, render_template
try:
    from flask_login import login_required
except Exception:
    # Fallback no-op decorator if flask_login not installed
    def login_required(fn): 
        return fn

game_bp = Blueprint("game", __name__, url_prefix="")

@game_bp.get("/play")
@login_required  # remove if you want play accessible without auth
def play():
    return render_template("play.html")
