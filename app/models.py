# models.py
from __future__ import annotations

from datetime import datetime, date
import bcrypt
from app import db
from sqlalchemy import UniqueConstraint, ForeignKey
from sqlalchemy.orm import relationship
try:
    from flask_login import UserMixin
except Exception:  # pragma: no cover - flask_login optional
    class UserMixin:  # type: ignore[dead code]
        pass

class User(UserMixin, db.Model):
    __tablename__ = "users"

    id           = db.Column(db.Integer, primary_key=True)
    username     = db.Column(db.String(40), unique=True, nullable=False, index=True)
    email        = db.Column(db.String(120), unique=True, nullable=True)
    first_name   = db.Column(db.String(80), nullable=True)
    last_name    = db.Column(db.String(80), nullable=True)
    password_hash= db.Column(db.String(128), nullable=False)
    birthday     = db.Column(db.Date, nullable=True)   # ← keep existing field

    created_at   = db.Column(db.DateTime, default=datetime.utcnow)

    # one-to-one Player relationship (optional for now, but useful for character creation)
    player       = db.relationship("Player", back_populates="user", uselist=False)

    characters = db.relationship(
        "Character",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    @staticmethod
    def hash_password(plaintext: str) -> str:
        return bcrypt.hashpw(plaintext.encode(), bcrypt.gensalt()).decode()

    def check_password(self, plaintext: str) -> bool:
        return bcrypt.checkpw(plaintext.encode(), self.password_hash.encode())

    def __repr__(self):
        return f"<User {self.username}>"

class Player(db.Model):
    __tablename__ = "players"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), unique=True, nullable=False)

    class_id = db.Column(db.String(32), nullable=False)
    gender = db.Column(db.String(8), nullable=False, default="male")
    display_name = db.Column(db.String(64))
    title = db.Column(db.String(64))
    onboarding_stage = db.Column(db.String(32))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship("User", back_populates="player")

    def as_character_payload(self) -> dict[str, str | int | None]:
        """Serialize the player model into the character payload shape."""

        return {
            "id": self.id,
            "name": self.display_name,
            "class": self.class_id,
            "title": self.title,
        }

    def __repr__(self):
        return f"<Player user_id={self.user_id} class={self.class_id}>"


class Character(db.Model):
    __tablename__ = "characters"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    name = db.Column(db.String(50), nullable=False)
    title = db.Column(db.String(100))
    class_name = db.Column(db.String(20), nullable=False)  # Warrior, Mage, etc.

    level = db.Column(db.Integer, default=1, nullable=False)
    xp = db.Column(db.Integer, default=0, nullable=False)
    power = db.Column(db.Integer, default=0, nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # relationships
    user = relationship("User", back_populates="characters")
    flags = relationship("CharacterFlag", back_populates="character", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_character_user_name"),
    )


class CharacterFlag(db.Model):
    __tablename__ = "character_flags"

    id = db.Column(db.Integer, primary_key=True)
    character_id = db.Column(db.Integer, ForeignKey("characters.id", ondelete="CASCADE"), nullable=False)

    flag_name = db.Column(db.String(50), nullable=False)
    value = db.Column(db.Boolean, default=False, nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    character = relationship("Character", back_populates="flags")

    __table_args__ = (
        UniqueConstraint("character_id", "flag_name", name="uq_character_flag"),
    )
