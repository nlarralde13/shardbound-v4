# Authentication and API Flow

This document outlines how authentication works in the Flask application and how
clients should interact with the JSON APIs that participate in the login and
logout lifecycle.

## High-level flow

1. **Landing** – Visiting `/` checks the current Flask-Login session. Users are
   redirected to `/login` when anonymous or to `/play` when authenticated.
2. **Credentials submission** – The login form (or SPA) sends a JSON POST
   request to `/api/login` with a `username` (or `email`) and `password`.
3. **Session establishment** – On success the server logs the user in with
   `flask_login.login_user`, persists the session cookie, and responds with a
   JSON payload describing the user. Front-ends then transition to `/play`.
4. **Gameplay APIs** – Authenticated clients can interact with endpoints such as
   `/api/characters` or `/api/quests/intro/complete`. These endpoints require an
   active session but are exempt from CSRF so that `fetch`/`axios` requests work
   without hidden form fields.
5. **Session teardown** – Posting to `/api/logout` clears the session, calls
   `flask_login.logout_user`, and returns a `204 No Content` response. Clients
   should redirect the player back to `/login` once complete.

## `/api/login`

* **Method**: `POST`
* **Body**: JSON object containing `username` (or `email`) and `password`.
* **Success (200)**:
  ```json
  {"ok": true, "user": {"id": 123, "username": "arya"}}
  ```
* **Client handling**: Store any relevant metadata and navigate to `/play`.
* **Errors**:
  * `400` with `{"error": "invalid_payload"}` when the request body is missing
    or malformed.
  * `400` with `{"error": "missing_credentials"}` when either field is blank.
  * `401` with `{"error": "invalid_credentials"}` when the user cannot be
    authenticated.

The endpoint normalises the identifier, checks for both username and email, and
compares passwords using `werkzeug.security.check_password_hash` with a bcrypt
fallback for legacy rows.

## `/api/logout`

* **Method**: `POST`
* **Success (204)**: Empty body. The session cookie is cleared and the user is
  logged out via Flask-Login.
* **Client handling**: Once the response is received, navigate back to `/login`
  or present a confirmation screen.

## CSRF behaviour

* CSRF protection is enabled globally through `flask_wtf.CSRFProtect` for all
  HTML form submissions.
* JSON API routes that are designed for XHR access are explicitly exempt:
  `/api/login`, `/api/logout`, `/api/characters`, and `/api/quests/*`.
* Failed CSRF validation for an `/api/*` route returns `403` with
  `{"error": "csrf_failed"}` so that clients can recover gracefully.

## Error handling contract

* All `/api/*` routes benefit from centralised error handling:
  * `werkzeug.exceptions.HTTPException` instances return a JSON body with
    `{"error": "<Name>"}` and the original HTTP status code.
  * Unhandled exceptions are logged with stack traces and return
    `{"error": "internal_error"}` with a `500` status.
* Non-API routes still use Flask's standard error pages.

## Logging

* Every incoming request is logged in `logs/app.log` with the HTTP method and
  path using a `RotatingFileHandler`.
* Exceptions are captured with stack traces to aid debugging.
* The log file rotates at roughly 1 MiB with up to five backups retained.

Developers debugging authentication issues should tail `logs/app.log` while
issuing requests with `curl` or the front-end to observe both request metadata
and stack traces for failures.
