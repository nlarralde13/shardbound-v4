import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from flask import Blueprint, jsonify, request, g

from server.logging_config import get_logger

bp = Blueprint("logs", __name__)
_logger = get_logger("gameplay")
_SECRET = os.getenv("GAME_LOG_KEY")

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_IP_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
_PII_KEYS = {"email", "e-mail", "ip", "ip_address", "ipaddress"}
_LEVELS = {
    "DEBUG": logging.DEBUG,
    "INFO": logging.INFO,
    "WARNING": logging.WARNING,
    "WARN": logging.WARNING,
    "ERROR": logging.ERROR,
    "CRITICAL": logging.CRITICAL,
}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _parse_ts(value: Optional[str]) -> datetime:
    if not value:
        return _now_utc()
    try:
        cleaned = value.replace("Z", "+00:00")
        return datetime.fromisoformat(cleaned).astimezone(timezone.utc)
    except (ValueError, TypeError):
        return _now_utc()


def _redact(value: Any) -> Any:
    if isinstance(value, dict):
        scrubbed: Dict[str, Any] = {}
        for key, item in value.items():
            if key.lower() in _PII_KEYS:
                scrubbed[key] = "[redacted]"
            else:
                scrubbed[key] = _redact(item)
        return scrubbed
    if isinstance(value, list):
        return [_redact(item) for item in value]
    if isinstance(value, str):
        masked = _EMAIL_RE.sub("[redacted]", value)
        masked = _IP_RE.sub("[redacted]", masked)
        return masked
    return value


def _normalize_payload(payload: Any) -> Dict[str, Any]:
    if isinstance(payload, dict):
        return _redact(payload)
    if payload is None:
        return {}
    return {"value": _redact(payload)}


def _resolve_level(value: Optional[str]) -> int:
    if not value:
        return logging.INFO
    level_name = value.upper()
    return _LEVELS.get(level_name, logging.INFO)


def _prepare_event(session_id: str, event: Dict[str, Any]) -> Optional[Tuple[int, Dict[str, Any]]]:
    name_raw = str(event.get("event", "")).strip()
    if not name_raw:
        return None
    level_no = _resolve_level(event.get("level"))
    payload = _normalize_payload(event.get("payload"))
    player_id = event.get("player_id")
    if player_id is not None:
        player_id = str(player_id)

    record = {
        "event": name_raw,
        "session_id": str(session_id),
        "request_id": getattr(g, "request_id", None),
        "player_id": player_id,
        "payload": payload,
        "event_ts": _parse_ts(event.get("ts")),
    }
    return level_no, record


def _same_origin() -> bool:
    origin = request.headers.get("Origin")
    if not origin:
        return True
    return origin.rstrip("/") == request.host_url.rstrip("/")


@bp.post("/api/logs/batch")
def ingest_batch():
    if not _same_origin():
        return jsonify({"ok": False, "error": "forbidden"}), 403

    if _SECRET:
        provided = request.headers.get("X-Game-Log-Key")
        if provided != _SECRET:
            return jsonify({"ok": False, "error": "forbidden"}), 403

    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id")
    events = data.get("events")

    if not session_id or not isinstance(events, list):
        return jsonify({"ok": False, "error": "invalid_payload"}), 400

    accepted = 0
    for raw_event in events:
        if not isinstance(raw_event, dict):
            continue
        prepared = _prepare_event(str(session_id), raw_event)
        if not prepared:
            continue
        level_no, record = prepared
        _logger.log(level_no, record["event"], extra=record)
        accepted += 1

    return jsonify({"ok": True, "accepted": accepted})
