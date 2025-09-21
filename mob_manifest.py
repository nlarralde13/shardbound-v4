# mobs_manifest.py
from __future__ import annotations
from pathlib import Path
import json, time
from typing import Dict, Any, List, Tuple
from flask import Blueprint, current_app, jsonify, request

mobs_bp = Blueprint("mobs", __name__)

def _safe_read_json(p: Path) -> Dict[str, Any]:
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        return {"_error": f"Failed to read {p.name}: {e}"}

def _titleize(s: str) -> str:
    return s.replace("_", " ").replace("-", " ").strip().title()

def _scan_mobs(mobs_dir: Path) -> Tuple[List[Dict[str, Any]], List[str]]:
    entries: List[Dict[str, Any]] = []
    errors: List[str] = []
    for file in sorted(mobs_dir.rglob("*.json")):
        rel = file.relative_to(mobs_dir).as_posix()  # e.g., goblins/goblin_thug.json
        family = file.parent.relative_to(mobs_dir).parts[0] if len(file.parent.relative_to(mobs_dir).parts) else ""
        data = _safe_read_json(file)

        if "_error" in data:
            errors.append(data["_error"])
            continue

        # Infer basics
        _id = data.get("id") or file.stem
        name = data.get("name") or _titleize(_id)
        class_archetype = data.get("classArchetype") or data.get("archetype") or ""
        level_range = data.get("levelRange") or [1, 1]
        tags = data.get("tags") or []

        entries.append({
            "id": _id,
            "name": name,
            "family": data.get("family") or family or "",
            "path": rel,
            "classArchetype": class_archetype,
            "tags": tags,
            "levelRange": level_range,
        })
    # sort by family then name
    entries.sort(key=lambda e: (e.get("family",""), e.get("name","")))
    return entries, errors

def build_manifest(root_path: Path, out_path: Path|None = None, pretty: bool=False) -> Dict[str, Any]:
    mobs_dir = root_path / "static" / "catalog" / "mobs"
    out_path = out_path or (root_path / "static" / "catalog" / "mob_manifest.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    mobs, errors = _scan_mobs(mobs_dir)
    manifest = {
        "version": "0.1",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "basePath": "/static/catalog/mobs/",
        "count": len(mobs),
        "mobs": mobs,
        "errors": errors,  # non-fatal read issues (if any)
    }
    out_path.write_text(
        json.dumps(manifest, indent=2 if pretty else None, ensure_ascii=False),
        encoding="utf-8"
    )
    return manifest

# -------- API --------

@mobs_bp.get("/api/mobs/manifest")
def api_get_manifest():
    """Return mob manifest. Rebuild if missing or ?rebuild=1."""
    root = Path(current_app.root_path)
    out_file = root / "static" / "catalog" / "mob_manifest.json"
    rebuild = request.args.get("rebuild", "0") in ("1", "true", "yes")

    if rebuild or not out_file.exists():
        manifest = build_manifest(root, out_file, pretty=True)
        resp = jsonify(manifest)
    else:
        try:
            manifest = json.loads(out_file.read_text(encoding="utf-8"))
            resp = jsonify(manifest)
        except Exception:
            manifest = build_manifest(root, out_file, pretty=True)
            resp = jsonify(manifest)

    # no-store so your page always sees latest (still fast)
    resp.headers["Cache-Control"] = "no-store"
    return resp

# Optional POST to force rebuild (useful from admin tools)
@mobs_bp.post("/api/mobs/rebuild")
def api_rebuild_manifest():
    root = Path(current_app.root_path)
    manifest = build_manifest(root, pretty=True)
    resp = jsonify({"ok": True, "count": manifest.get("count", 0)})
    resp.headers["Cache-Control"] = "no-store"
    return resp

# -------- CLI --------

def register_cli(app):
    import click

    @app.cli.group("mobs")
    def mobs_group():
        """Mobs utilities."""
        pass

    @mobs_group.command("build-manifest")
    @click.option("--out", "out_path", default="", help="Output path (default: static/catalog/mob_manifest.json)")
    @click.option("--pretty/--no-pretty", default=True, help="Pretty-print JSON.")
    def build_manifest_cmd(out_path: str, pretty: bool):
        """Scan /static/catalog/mobs and (re)build the mob manifest."""
        root = Path(app.root_path)
        out = Path(out_path) if out_path else None
        manifest = build_manifest(root, out, pretty=pretty)
        click.echo(f"Built manifest with {manifest.get('count',0)} mobs.")
