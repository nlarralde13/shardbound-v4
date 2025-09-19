from pathlib import Path

from flask import Flask, render_template, send_file, make_response

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


@app.route("/logs/gameplay.log")
def gameplay_log():
  resp = make_response(send_file("logs/gameplay.log"))
  resp.headers["Cache-Control"] = "no-store, must-revalidate"
  return resp

@app.route("/logs")
def logs_():
    return render_template("logviewer.html")

if __name__ == "__main__":
    # Dev server
    app.run(host="192.168.1.169", port=5000, debug=False)
