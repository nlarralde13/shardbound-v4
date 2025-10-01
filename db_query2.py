#!/usr/bin/env python3
"""
db_query.py — Package-aware query helpers + a tiny CLI with pretty tables.

Works with the new package layout:
  app/
    __init__.py        -> create_app()
    models.py          -> db, User, Player

Usage examples (from project root, with your venv active):
  python db_query.py users:list
  python db_query.py users:get --username aria
  python db_query.py users:create --username aria --password hunter2 --email a@b.com
  python db_query.py auth:check --username aria --password hunter2
  python db_query.py players:list
  python db_query.py players:get --user-id 1
  python db_query.py players:upsert --user-id 1 --class-id warrior --gender female --display-name Aria
  python db_query.py players:delete --user-id 1
"""

from __future__ import annotations
from typing import Optional, Dict, Any, Iterable, List
from datetime import date
import argparse
import sys

from sqlalchemy import func

# Package imports (new structure)
from app import create_app, db
from app.models import User, Player


# ------------------------ Pretty table helpers ------------------------ #

def _stringify(value):
    if value is None:
        return "—"
    if isinstance(value, (int, float)):
        return str(value)
    return str(value)

def _rows_to_table(headers: Iterable[str], rows: Iterable[Iterable[Any]]) -> str:
    headers = list(headers)
    rows = [list(map(_stringify, r)) for r in rows]
    lens = [len(h) for h in headers]
    for r in rows:
        for i, cell in enumerate(r):
            if i < len(lens):
                lens[i] = max(lens[i], len(cell))
            else:
                lens.append(len(cell))

    def fmt_row(cols):
        return "│ " + " │ ".join(c.ljust(lens[i]) for i, c in enumerate(cols)) + " │"

    top = "┌" + "┬".join("─" * (l + 2) for l in lens) + "┐"
    mid = "├" + "┼".join("─" * (l + 2) for l in lens) + "┤"
    bot = "└" + "┴".join("─" * (l + 2) for l in lens) + "┘"

    out = [top, fmt_row(headers), mid]
    for r in rows:
        out.append(fmt_row(r))
    out.append(bot)
    return "\n".join(out)


# ----------------------------- Utilities ------------------------------ #

def _commit() -> None:
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise


# ------------------------------- Users -------------------------------- #

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

def username_exists(username: str) -> bool:
    return get_user_by_username(username) is not None

def email_exists(email: str) -> bool:
    if not email:
        return False
    return get_user_by_email(email) is not None

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
    _commit()
    return u

def set_user_password(user: User, new_password: str) -> None:
    user.password_hash = User.hash_password(new_password)
    _commit()

def check_credentials(username: str, password: str) -> Optional[User]:
    user = get_user_by_username(username)
    if not user:
        return None
    return user if user.check_password(password) else None


# ------------------------------ Players ------------------------------- #

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

def get_player_by_id(player_id: int) -> Optional[Player]:
    return Player.query.get(player_id)

def get_player_by_user_id(user_id: int) -> Optional[Player]:
    return Player.query.filter_by(user_id=user_id).first()

def user_has_character(user_id: int) -> bool:
    return get_player_by_user_id(user_id) is not None

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
    _commit()
    return p

def update_player(user_id: int, **fields: Any) -> Optional[Player]:
    p = get_player_by_user_id(user_id)
    if not p:
        return None
    allowed = {"class_id", "gender", "display_name", "onboarding_stage"}
    for k, v in fields.items():
        if k in allowed:
            setattr(p, k, v)
    _commit()
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
    _commit()
    return True


# ------------------------------- CLI --------------------------------- #

def _print_table_dicts(title: str, rows: List[Dict[str, Any]], cols: List[str]) -> None:
    print(f"\n{title}")
    if not rows:
        print("(no results)")
        return
    print(_rows_to_table(cols, [[row.get(c) for c in cols] for row in rows]))

def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description="DB query CLI (users & players)")
    sub = parser.add_subparsers(dest="cmd", required=True)

    # Users
    sub.add_parser("users:list")
    ug = sub.add_parser("users:get")
    ug.add_argument("--username", required=False)
    ug.add_argument("--id", type=int, required=False)

    uc = sub.add_parser("users:create")
    uc.add_argument("--username", required=True)
    uc.add_argument("--password", required=True)
    uc.add_argument("--email", required=False)
    uc.add_argument("--first-name", required=False)
    uc.add_argument("--last-name", required=False)
    uc.add_argument("--birthday", required=False, help="YYYY-MM-DD")

    ucp = sub.add_parser("users:set-password")
    ucp.add_argument("--username", required=True)
    ucp.add_argument("--password", required=True)

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
    pu.add_argument("--gender", default="male", choices=["male", "female"])
    pu.add_argument("--display-name", required=False)
    pu.add_argument("--onboarding-stage", required=False)

    pd = sub.add_parser("players:delete")
    pd.add_argument("--user-id", type=int, required=True)

    args = parser.parse_args(argv)

    app = create_app()
    with app.app_context():
        if args.cmd == "users:list":
            users = User.query.order_by(User.id.asc()).all()
            _print_table_dicts(
                "Users",
                [user_to_dict(u) for u in users],
                ["id", "username", "email", "first_name", "last_name", "birthday", "created_at"],
            )
            return 0

        if args.cmd == "users:get":
            u = None
            if args.id:
                u = get_user_by_id(args.id)
            elif args.username:
                u = get_user_by_username(args.username)
            _print_table_dicts("User", [user_to_dict(u)] if u else [], ["id", "username", "email", "first_name", "last_name", "birthday", "created_at"])
            return 0

        if args.cmd == "users:create":
            bday = None
            if args.birthday:
                try:
                    y, m, d = map(int, args.birthday.split("-"))
                    bday = date(y, m, d)
                except Exception:
                    print("!! Invalid --birthday; expected YYYY-MM-DD", file=sys.stderr)
                    return 2
            u = create_user(
                username=args.username,
                password=args.password,
                email=args.email,
                first_name=args.first_name,
                last_name=args.last_name,
                birthday=bday,
            )
            _print_table_dicts("Created User", [user_to_dict(u)], ["id", "username", "email", "first_name", "last_name", "birthday", "created_at"])
            return 0

        if args.cmd == "users:set-password":
            u = get_user_by_username(args.username)
            if not u:
                print("!! user not found", file=sys.stderr)
                return 1
            set_user_password(u, args.password)
            _print_table_dicts("Updated Password", [user_to_dict(u)], ["id", "username", "email"])
            return 0

        if args.cmd == "auth:check":
            u = check_credentials(args.username, args.password)
            if not u:
                print("\nLogin: ❌ invalid credentials")
                return 1
            print("\nLogin: ✅ success")
            _print_table_dicts("User", [user_to_dict(u)], ["id", "username", "email"])
            return 0

        if args.cmd == "players:list":
            players = Player.query.order_by(Player.user_id.asc()).all()
            _print_table_dicts(
                "Players",
                [player_to_dict(p) for p in players],
                ["id", "user_id", "class_id", "gender", "display_name", "onboarding_stage", "created_at"],
            )
            return 0

        if args.cmd == "players:get":
            p = get_player_by_user_id(args.user_id)
            _print_table_dicts("Player", [player_to_dict(p)] if p else [], ["id", "user_id", "class_id", "gender", "display_name", "onboarding_stage", "created_at"])
            return 0

        if args.cmd == "players:upsert":
            p = upsert_player(
                user_id=args.user_id,
                class_id=args.class_id,
                gender=args.gender,
                display_name=args.display_name,
                onboarding_stage=args.onboarding_stage,
            )
            _print_table_dicts("Upserted Player", [player_to_dict(p)], ["id", "user_id", "class_id", "gender", "display_name", "onboarding_stage", "created_at"])
            return 0

        if args.cmd == "players:delete":
            ok = delete_player(args.user_id)
            print("\nDeleted:" , "✅" if ok else "⚠️  not found")
            return 0

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
