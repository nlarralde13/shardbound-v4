from uuid import uuid4

from flask import g


def assign_request_id() -> None:
    """Attach a per-request correlation id to Flask's global context."""
    g.request_id = uuid4().hex
