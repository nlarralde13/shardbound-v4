"""add player title column

Revision ID: 3e6dc464a8a1
Revises: ac1e9bc4520b
Create Date: 2025-10-02 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3e6dc464a8a1'
down_revision = 'ac1e9bc4520b'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('players', sa.Column('title', sa.String(length=64), nullable=True))


def downgrade():
    op.drop_column('players', 'title')
