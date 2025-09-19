from pathlib import Path

from flask import Flask, render_template

from server.middleware.request_context import assign_request_id
from server.routes.logs import bp as logs_bp

BASE_DIR = Path(__file__).resolve().parent
(BASE_DIR / "logs").mkdir(parents=True, exist_ok=True)

app = Flask(__name__)
app.register_blueprint(logs_bp)
app.before_request(assign_request_id)


@app.route("/")
@app.route("/index")
def index():
    """Render the base client (upper scene viewer + lower tabbed panel)."""
    return render_template("index.html")


@app.route("/battlebox")
def battlebox():
    return render_template("battlebox.html")


if __name__ == "__main__":
    # Dev server
    app.run(host="192.168.1.169", port=5000, debug=False)
