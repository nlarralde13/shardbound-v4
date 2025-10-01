from flask import Blueprint, render_template

main_bp = Blueprint("main", __name__)

@main_bp.get("/")
def index():
    # Replace with your actual landing page template if desired
    return render_template("index.html") if "index.html" else ("OK", 200)

@main_bp.get("/docs")
def docs():
    # Wire to your docs template or static page
    return render_template("docs.html") if "docs.html" else ("Docs coming soon", 200)

@main_bp.get("/logs")
def logs():
    # If you already have a logs page/template, point to it here
    return render_template("logs.html") if "logs.html" else ("Logs UI coming soon", 200)
