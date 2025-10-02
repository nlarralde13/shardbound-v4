from alembic import op
import sqlalchemy as sa
from datetime import datetime

# revision identifiers, used by Alembic.
revision = '20251001_add_characters'
down_revision = None  # or set to your last migration id
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "characters",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=100)),
        sa.Column("class_name", sa.String(length=20), nullable=False),
        sa.Column("level", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("xp", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("power", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "name", name="uq_character_user_name")
    )

    op.create_table(
        "character_flags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("character_id", sa.Integer(), sa.ForeignKey("characters.id", ondelete="CASCADE"), nullable=False),
        sa.Column("flag_name", sa.String(length=50), nullable=False),
        sa.Column("value", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("character_id", "flag_name", name="uq_character_flag")
    )


def downgrade():
    op.drop_table("character_flags")
    op.drop_table("characters")
