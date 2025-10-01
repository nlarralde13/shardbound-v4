# routes/api_classes.py
# Serves classes from your on-disk catalogs.
#
# GET /api/classes
#   -> [
#        {
#          "id": "warrior",
#          "name": "Warrior",
#          "tagline": "melee • tank",              # from archetype if present
#          "portraits": {
#            "male":   "/static/assets/portraits/warrior/male.png",
#            "female": "/static/assets/portraits/warrior/female.png"
#          },
#          "preview": {
#            "origin": null,                      # placeholder (not in catalogs yet)
#            "startingKit": ["Health Potion×2", "wood×5", "ore×3"],
#            "baseStats": { "HP": 36, "MP": 0, "ATK": 7, "DEF": 6, "MAG": 1, "SPD": 4 }
#          }
#        },
#        ...
#      ]
#
# GET /api/classes/<class_id>
#   -> full catalog JSON for that class (pass-through)

import os
import json
from typing import Dict, Any, List, Optional

from flask import Blueprint, current_app, jsonify, abort

bp = Blueprint("api_classes", __name__)

# You can override this via env var if you move the catalogs
CLASSES_DIR_ENV = "CLASSES_DIR"
DEFAULT_CLASSES_DIR = os.path.join("static", "catalog", "classes")

def _classes_dir() -> str:
    base = os.environ.get(CLASSES_DIR_ENV, DEFAULT_CLASSES_DIR)
    return os.path.join(current_app.root_path, base)

def _read_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def _safe_join(*parts: str) -> str:
    return os.path.normpath(os.path.join(*parts))

def _kit_list(starter: Dict[str, Any]) -> List[str]:
    out: List[str] = []
    for item in starter.get("inventory", []):
        name = item.get("name") or item.get("id") or "item"
        qty = item.get("qty")
        out.append(f"{name}×{qty}" if qty else name)
    return out

def _base_stats(cls: Dict[str, Any]) -> Dict[str, Optional[int]]:
    bs = cls.get("baseStats", {})
    # Map to the UI’s expected label casing
    return {
        "HP":  bs.get("hp"),
        "MP":  bs.get("mp"),
        "ATK": bs.get("atk"),
        "DEF": bs.get("def"),
        "MAG": bs.get("mag"),
        "SPD": bs.get("spd"),
    }

def _portraits_for(class_id: str) -> Dict[str, str]:
    # Adjust these paths if you keep portraits elsewhere
    base = f"/static/assets/portraits/{class_id}"
    return {"male": f"{base}/male.png", "female": f"{base}/female.png"}

def _tagline_from_archetype(cls: Dict[str, Any]) -> Optional[str]:
    arche = cls.get("archetype") or []
    if not arche:
        return None
    # Nice, compact label like "melee • tank"
    return " • ".join(map(str, arche))

@bp.get("/api/classes")
def list_classes():
    cdir = _classes_dir()
    index_path = _safe_join(cdir, "index.json")
    if not os.path.isfile(index_path):
        abort(500, description=f"classes index not found at {index_path}")

    index = _read_json(index_path)
    entries = index.get("classes", [])

    result: List[Dict[str, Any]] = []
    for entry in entries:
        cid = entry.get("id")
        if not cid:
            continue
        class_path = _safe_join(cdir, f"{cid}.json")
        if not os.path.isfile(class_path):
            # Skip missing class files (or log a warning)
            continue

        try:
            catalog = _read_json(class_path)
        except Exception:
            # Corrupt JSON—skip gracefully
            continue

        cls = catalog.get("class", {}) or {}
        starter = catalog.get("starter", {}) or {}

        item = {
            "id": cid,
            "name": cls.get("name") or entry.get("name") or cid.title(),
            "tagline": _tagline_from_archetype(cls),          # optional
            "portraits": _portraits_for(cid),                  # convention-based
            "preview": {
                "origin": None,                                # not in catalogs (placeholder)
                "startingKit": _kit_list(starter),
                "baseStats": _base_stats(cls),
            }
        }
        result.append(item)

    # Keep same ordering as index.json
    return jsonify(result)

@bp.get("/api/classes/<class_id>")
def get_class(class_id: str):
    cdir = _classes_dir()
    path = _safe_join(cdir, f"{class_id}.json")
    if not os.path.isfile(path):
        abort(404, description=f"class '{class_id}' not found")
    try:
        data = _read_json(path)
    except Exception:
        abort(500, description=f"failed to read class '{class_id}'")
    return jsonify(data)
