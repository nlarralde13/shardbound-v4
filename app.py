from flask import Flask, render_template

app = Flask(__name__)

@app.route("/")
@app.route("/index")
def index():
    # Render the base client (upper scene viewer + lower tabbed panel)
    return render_template("index.html")

if __name__ == "__main__":
    # Dev server
    app.run(debug=True)
