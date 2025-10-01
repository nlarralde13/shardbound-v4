# migrations/env.py
from __future__ import with_statement

import logging
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool
from flask import current_app

# This Alembic Config object provides access to the .ini file values.
config = context.config

# Interpret the config file for Python logging.
fileConfig(config.config_file_name)
logger = logging.getLogger('alembic.env')

# --- Get DB URL from Flask config ------------------------------------------
# When running `flask db upgrade` / `flask db migrate`, Flask-Migrate sets up
# an app context so current_app is available here.
def get_url():
    uri = current_app.config.get("SQLALCHEMY_DATABASE_URI")
    if not uri:
        raise RuntimeError("SQLALCHEMY_DATABASE_URI is not set on the Flask app")
    return uri

# --- Target metadata (VERY IMPORTANT) ---------------------------------------
# We want the metadata from YOUR SQLAlchemy instance.
# Flask-Migrate also sets `current_app.extensions['migrate'].db.metadata`,
# but importing from models is more explicit and resilient.
try:
    from app import db
    target_metadata = db.metadata
except Exception as ex:
    logger.error("Failed to import db.metadata from models.py: %s", ex)
    # fallback to Flask-Migrate extension if present
    target_metadata = getattr(
        current_app.extensions.get('migrate'), 'db', None
    )
    target_metadata = getattr(target_metadata, 'metadata', None)

# Optional: autogenerate tuning (keep simple for now)
def include_object(object, name, type_, reflected, compare_to):
    # Example: skip Alembic’s own version table if you’ve customized the name
    # if name == 'alembic_version':
    #     return False
    return True

# SQLite: enable batch mode so ALTER TABLE works
render_as_batch = False
try:
    render_as_batch = get_url().startswith("sqlite:")
except Exception:
    pass

# --- Offline mode -----------------------------------------------------------
def run_migrations_offline():
    """Run migrations in 'offline' mode."""
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,          # detect type changes
        include_object=include_object,
        render_as_batch=render_as_batch,
    )

    with context.begin_transaction():
        context.run_migrations()

# --- Online mode ------------------------------------------------------------
def run_migrations_online():
    """Run migrations in 'online' mode."""
    configuration = config.get_section(config.config_ini_section)
    configuration["sqlalchemy.url"] = get_url()

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            include_object=include_object,
            render_as_batch=render_as_batch,
        )

        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
