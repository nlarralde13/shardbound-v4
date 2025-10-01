# routes/api_characters.py
from flask import Blueprint, request, jsonify, session

from app import db
from app.models import User, Player

bp = Blueprint('api_characters', __name__)

@bp.post('/api/characters')
def create_character():
    uid = session.get('user_id')
    if not uid:
        return ('', 401)
    data = request.get_json(force=True)
    class_id = data.get('class_id')
    gender = data.get('gender','male')

    if not class_id:
        return ('class_id is required', 400)

    existing = Player.query.filter_by(user_id=uid).first()
    if existing:
        return ('character already exists', 409)

    user = User.query.get(uid)
    p = Player(user_id=uid, class_id=class_id, gender=gender,
               display_name=None, onboarding_stage='intro_0')
    db.session.add(p)
    # Optional: mark user.has_character = True if you keep a cache on users
    if hasattr(user, 'has_character'):
        user.has_character = True
        db.session.add(user)
    db.session.commit()
    return jsonify({"ok":True, "player_id": p.id, "onboarding_stage": p.onboarding_stage})
