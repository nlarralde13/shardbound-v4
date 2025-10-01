# Shardbound Prototype Login Flow

## Authentication Overview

The Flask application uses the `auth` blueprint for both the HTML login page and
JSON APIs consumed by `static/js/play.js` and `static/js/login.js`.

1. Visitors request [`GET /login`](app/templates/login.html) to load the login
   interface.
2. The login form calls [`POST /api/login`](app/auth/routes.py) with a JSON body
   containing `username` and `password`.
3. On success the server refreshes the session, issues a secure cookie, and
   returns the authenticated user payload. The frontend then navigates to
   `/play`.
4. Subsequent SPA calls hit [`GET /api/me`](app/auth/routes.py) to retrieve the
   authenticated profile and optional `player` snapshot. Unauthenticated users
   receive `{ "authenticated": false }` and are redirected to `/login` by the
   client.
5. Logout is handled via [`POST /api/logout`](app/auth/routes.py), which clears
   both the Flask session and any `flask_login` state.

All JSON responses include `credentials: 'include'` and therefore rely on cookie
sessions instead of bearer tokens. The `auth/service.py` module centralises
session management, user serialization, and the optional rate-limit hook.

## Running Tests

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest -q
```

See [`openapi.yaml`](openapi.yaml) for the minimal contract covering the three
authentication endpoints.
