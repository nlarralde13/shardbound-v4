import json
import logging
import os
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, Dict

LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

_DEFAULT_LOG_FILE = LOG_DIR / "gameplay.log"
_LEVEL = os.getenv("GAME_LOG_LEVEL", "INFO").upper()
_LEVEL_MAP = {
    "CRITICAL": logging.CRITICAL,
    "ERROR": logging.ERROR,
    "WARNING": logging.WARNING,
    "WARN": logging.WARNING,
    "INFO": logging.INFO,
    "DEBUG": logging.DEBUG,
    "NOTSET": logging.NOTSET,
}


def _parse_level(value: str) -> int:
    return _LEVEL_MAP.get(value.upper(), logging.INFO)


class JsonFormatter(logging.Formatter):
    """Formatter that renders log records as structured JSON lines."""

    def format(self, record: logging.LogRecord) -> str:  # type: ignore[override]
        ts = getattr(record, "event_ts", None)
        if not ts:
            ts = datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(timespec="milliseconds")
        if isinstance(ts, datetime):
            ts = ts.astimezone(timezone.utc).isoformat(timespec="milliseconds")
        if isinstance(ts, str):
            if ts.endswith("+00:00"):
                ts = f"{ts[:-6]}Z"
            elif not ts.endswith("Z") and "+" not in ts:
                ts = f"{ts}Z"

        payload = getattr(record, "payload", {})
        if not isinstance(payload, dict):
            payload = {"value": payload}

        record_dict: Dict[str, Any] = {
            "ts": ts,
            "level": record.levelname,
            "logger": record.name,
            "event": getattr(record, "event", record.getMessage()),
            "session_id": getattr(record, "session_id", None),
            "request_id": getattr(record, "request_id", None),
            "player_id": getattr(record, "player_id", None),
            "payload": payload,
        }
        return json.dumps(record_dict, ensure_ascii=False)


def get_logger(name: str) -> logging.Logger:
    """Return a rotating JSON logger for gameplay events."""
    logger = logging.getLogger(name)
    if getattr(logger, "_configured", False):
        return logger

    logger.setLevel(_parse_level(_LEVEL))
    handler = RotatingFileHandler(
        _DEFAULT_LOG_FILE,
        maxBytes=10_000_000,
        backupCount=5,
        encoding="utf-8",
    )
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
    logger.propagate = False
    logger._configured = True  # type: ignore[attr-defined]
    return logger
