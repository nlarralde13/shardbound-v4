#!/usr/bin/env python3
"""
db_query.py — small DB helpers + CLI for Users and Players.

Usage (from repo root, venv active):
  python db_query.py users:list
  python db_query.py users:get --id 1
  python db_query.py users:get --username alice
  python db_query.py users:create --username alice --password secret --email a@b.com
  python db_query.py users:create --guided
  python db_query.py users:set-password --username alice --password newer

  python db_query.py players:list
  python db_query.py players:get --user-id 1
  python db_query.py players:upsert --user-id 1 --class-id warrior --gender female --display-name Aria --onboarding-stage intro_0
  python db_query.py players:delete --user-id 1

Add --table to see pretty tables instead of plain text.
"""

from __future__ import annotations
from typing import Optional, Dict, Any, Iterable, List
from datetime import date
from contextlib import contextmanager
import argparse
import sys
from getpass import getpass

from sqlalchemy import func

# Package-aware imports
from app import create_app
from app.models import db, User, Player


# ----------------------------------------------------------------------
# App context
# ----------------------------------------------------------------------
_app = None
def _get_app():
    global _app
    if _app is None:
        _app = create_app()
    return _app

@contextmanager
def appctx():
    with _get_app().app_context():
        yield


# ----------------------------------------------------------------------
# Pretty tables (optional)
# ----------------------------------------------------------------------
def _stringify(value):
    if value is None:
        return "—"
    return str(value)

def _rows_to_table(headers: Iterable[str], rows: Iterable[Iterable[Any]]) -> str:
    headers = list(headers)
    rows = [list(map(_stringify, r)) for r in rows]
    lens = [len(h) for h in headers]
    for r in rows:
        for i, cell in enumerate(r):
            if i >= len(lens):
                lens.append(len(cell))
            else:
                lens[i] = max(lens[i], len(cell))

    def fmt_row(cols):
        return "│ " + " │ ".join(_stringify(c).ljust(lens[i]) for i, c in enumerate(cols)) + " │"

    top = "┌" + "┬".join("─" * (l + 2) for l in lens) + "┐"
    mid = "├" + "┼".join("─" * (l + 2) for l in lens) + "┤"
    bot = "└" + "┴".join("─" * (l + 2) for l in lens) + "┘"

    out = [top, fmt_row(headers), mid]
    for r in rows:
        out.append(fmt_row(r))
    out.append(bot)
    return "\n".join(out)

def _print_table_dicts(title: str, rows: List[Dict[str, Any]], cols: List[str], use_table: bool) -> None:
    print(f"\n{title}")
    if not rows:
        print("(no results)")
        return
    if not use_table:
        # Plain text
        for row in rows:
            line = "  " + " ".join(f"{k}={_stringify(row.get(k))}" for k in cols)
            print(line)
        return
    # Pretty
    print(_rows_to_table(cols, [[row.get(c) for c in cols] for row in rows]))


# ----------------------------------------------------------------------
# User helpers
# ----------------------------------------------------------------------
def user_to_dict(user: Optional[User]) -> Optional[Dict[str, Any]]:
    if not user:
        return None
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "birthday": user.birthday.isoformat() if user.birthday else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }

def get_user_by_id(user_id: int) -> Optional[User]:
    return User.query.get(user_id)

def get_user_by_username(username: str) -> Optional[User]:
    if not username:
        return None
    return User.query.filter(func.lower(User.username) == username.lower()).first()

def get_user_by_email(email: str) -> Optional[User]:
    if not email:
        return None
    return User.query.filter(func.lower(User.email) == email.lower()).first()

def create_user(
    *,
    username: str,
    password: str,
    email: Optional[str] = None,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    birthday: Optional[date] = None,
) -> User:
    u = User(
        username=username.strip(),
        email=(email or None),
        first_name=(first_name or None),
        last_name=(last_name or None),
        password_hash=User.hash_password(password),
        birthday=birthday,
    )
    db.session.add(u)
    db.session.commit()
    return u

def set_user_password(user: User, new_password: str) -> None:
    user.password_hash = User.hash_password(new_password)
    db.session.commit()

def check_credentials(username: str, password: str) -> Optional[User]:
    user = get_user_by_username(username)
    if not user:
        return None
    return user if user.check_password(password) else None


# ----------------------------------------------------------------------
# Player helpers
# ----------------------------------------------------------------------
def player_to_dict(player: Optional[Player]) -> Optional[Dict[str, Any]]:
    if not player:
        return None
    return {
        "id": player.id,
        "user_id": player.user_id,
        "class_id": player.class_id,
        "gender": player.gender,
        "display_name": player.display_name,
        "onboarding_stage": player.onboarding_stage,
        "created_at": player.created_at.isoformat() if player.created_at else None,
    }

def get_player_by_user_id(user_id: int) -> Optional[Player]:
    return Player.query.filter_by(user_id=user_id).first()

def create_player(
    *,
    user_id: int,
    class_id: str,
    gender: str = "male",
    display_name: Optional[str] = None,
    onboarding_stage: Optional[str] = None,
) -> Player:
    p = Player(
        user_id=user_id,
        class_id=class_id,
        gender=gender,
        display_name=display_name or None,
        onboarding_stage=onboarding_stage or None,
    )
    db.session.add(p)
    db.session.commit()
    return p

def update_player(user_id: int, **fields) -> Optional[Player]:
    p = get_player_by_user_id(user_id)
    if not p:
        return None
    allowed = {"class_id", "gender", "display_name", "onboarding_stage"}
    for k, v in fields.items():
        if k in allowed:
            setattr(p, k, v)
    db.session.commit()
    return p

def upsert_player(
    *,
    user_id: int,
    class_id: str,
    gender: str = "male",
    display_name: Optional[str] = None,
    onboarding_stage: Optional[str] = None,
) -> Player:
    p = get_player_by_user_id(user_id)
    if p:
        return update_player(
            user_id,
            class_id=class_id,
            gender=gender,
            display_name=display_name,
            onboarding_stage=onboarding_stage,
        )
    return create_player(
        user_id=user_id,
        class_id=class_id,
        gender=gender,
        display_name=display_name,
        onboarding_stage=onboarding_stage,
    )

def delete_player(user_id: int) -> bool:
    p = get_player_by_user_id(user_id)
    if not p:
        return False
    db.session.delete(p)
    db.session.commit()
    return True


# ----------------------------------------------------------------------
# Guided user creation
# ----------------------------------------------------------------------
def _prompt_guided_user_create():
    print("\n=== Guided User Creation ===")
    while True:
        username = input("Username: ").strip()
        if len(username) >= 3:
            break
        print("  - Must be at least 3 characters.")

    email = input("Email (optional): ").strip() or None
    first = input("First name (optional): ").strip() or None
    last  = input("Last name  (optional): ").strip() or None

    bday = None
    raw_bday = input("Birthday YYYY-MM-DD (optional): ").strip()
    if raw_bday:
        try:
            y, m, d = map(int, raw_bday.split("-"))
            bday = date(y, m, d)
        except Exception:
            print("  - Ignoring invalid birthday format.")

    while True:
        pw1 = getpass("Password: ")
        pw2 = getpass("Confirm password: ")
        if len(pw1) < 6:
            print("  - Password must be at least 6 characters.")
            continue
        if pw1 != pw2:
            print("  - Passwords do not match, try again.")
            continue
        break

    return {
        "username": username,
        "password": pw1,
        "email": email,
        "first_name": first,
        "last_name": last,
        "birthday": bday,
    }


# ----------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="DB query CLI (users & players)")
    parser.add_argument("--table", action="store_true", help="Render output as pretty tables")
    sub = parser.add_subparsers(dest="cmd", required=True)

    # Users
    sub.add_parser("users:list")

    ug = sub.add_parser("users:get")
    ug.add_argument("--id", type=int)
    ug.add_argument("--username")

    uc = sub.add_parser("users:create")
    uc.add_argument("--username")
    uc.add_argument("--password")
    uc.add_argument("--email")
    uc.add_argument("--first-name")
    uc.add_argument("--last-name")
    uc.add_argument("--birthday", help="YYYY-MM-DD")
    uc.add_argument("--guided", action="store_true", help="Run interactive guided creation")

    usp = sub.add_parser("users:set-password")
    usp.add_argument("--username", required=True)
    usp.add_argument("--password", required=True)

    auth = sub.add_parser("auth:check")
    auth.add_argument("--username", required=True)
    auth.add_argument("--password", required=True)

    # Players
    sub.add_parser("players:list")

    pg = sub.add_parser("players:get")
    pg.add_argument("--user-id", type=int, required=True)

    pu = sub.add_parser("players:upsert")
    pu.add_argument("--user-id", type=int, required=True)
    pu.add_argument("--class-id", required=True)
    pu.add_argument("--gender", choices=["male", "female"], default="male")
    pu.add_argument("--display-name")
    pu.add_argument("--onboarding-stage")

    pd = sub.add_parser("players:delete")
    pd.add_argument("--user-id", type=int, required=True)

    return parser


def main(argv: List[str]) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    use_table = bool(getattr(args, "table", False))

    with appctx():
        # USERS
        if args.cmd == "users:list":
            rows = [user_to_dict(u) for u in User.query.order_by(User.id.asc()).all()]
            _print_table_dicts("Users", rows, ["id","username","email","first_name","last_name","birthday","created_at"], use_table)
            return 0

        if args.cmd == "users:get":
            u = None
            if getattr(args, "id", None):
                u = User.query.get(args.id)
            elif getattr(args, "username", None):
                u = User.query.filter(func.lower(User.username) == args.username.lower()).first()
            rows = [user_to_dict(u)] if u else []
            _print_table_dicts("User", rows, ["id","username","email","first_name","last_name","birthday","created_at"], use_table)
            return 0

        if args.cmd == "users:create":
            if getattr(args, "guided", False):
                payload = _prompt_guided_user_create()
                u = create_user(**payload)
            else:
                bday = None
                if getattr(args, "birthday", None):
                    try:
                        y, m, d = map(int, args.birthday.split("-"))
                        bday = date(y, m, d)
                    except Exception:
                        print("!! invalid --birthday (expected YYYY-MM-DD), ignoring")
                if not args.username or not args.password:
                    print("!! users:create requires --username and --password (or use --guided)")
                    return 2
                u = create_user(
                    username=args.username,
                    password=args.password,
                    email=args.email,
                    first_name=args.first_name,
                    last_name=args.last_name,
                    birthday=bday,
                )
            _print_table_dicts("Created User", [user_to_dict(u)], ["id","username","email","first_name","last_name","birthday","created_at"], use_table)
            return 0

        if args.cmd == "users:set-password":
            u = User.query.filter(func.lower(User.username) == args.username.lower()).first()
            if not u:
                print("No such user.")
                return 1
            set_user_password(u, args.password)
            _print_table_dicts("Updated Password", [user_to_dict(u)], ["id","username","email"], use_table)
            return 0

        if args.cmd == "auth:check":
            u = check_credentials(args.username, args.password)
            ok = bool(u)
            print("\nLogin:", "✅ success" if ok else "❌ invalid credentials")
            if ok:
                _print_table_dicts("User", [user_to_dict(u)], ["id","username","email"], use_table)
            return 0 if ok else 1

        # PLAYERS
        if args.cmd == "players:list":
            rows = [player_to_dict(p) for p in Player.query.order_by(Player.user_id.asc()).all()]
            _print_table_dicts("Players", rows, ["id","user_id","class_id","gender","display_name","onboarding_stage","created_at"], use_table)
            return 0

        if args.cmd == "players:get":
            p = get_player_by_user_id(args.user_id)
            rows = [player_to_dict(p)] if p else []
            _print_table_dicts("Player", rows, ["id","user_id","class_id","gender","display_name","onboarding_stage","created_at"], use_table)
            return 0

        if args.cmd == "players:upsert":
            p = upsert_player(
                user_id=args.user_id,
                class_id=args.class_id,
                gender=args.gender,
                display_name=args.display_name,
                onboarding_stage=args.onboarding_stage,
            )
            _print_table_dicts("Upserted Player", [player_to_dict(p)], ["id","user_id","class_id","gender","display_name","onboarding_stage","created_at"], use_table)
            return 0

        if args.cmd == "players:delete":
            ok = delete_player(args.user_id)
            print("\nDeleted:", "✅" if ok else "⚠️  not found")
            return 0

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
