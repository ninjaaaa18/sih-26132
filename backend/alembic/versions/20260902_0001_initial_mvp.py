"""Create the initial SIH MVP database schema.

Revision ID: 20260902_0001
Revises:
"""
from alembic import op

from app.database.base import Base
from app.models import *  # noqa: F401,F403

revision = "20260902_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())
    op.execute(
        """
        CREATE FUNCTION ensure_order_offer_accepted()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM buyer_offers
                WHERE id = NEW.buyer_offer_id AND offer_status = 'accepted'
            ) THEN
                RAISE EXCEPTION 'An order must originate from an accepted buyer offer';
            END IF;
            RETURN NEW;
        END;
        $$;
        """
    )
    op.execute(
        """
        CREATE TRIGGER orders_require_accepted_offer
        BEFORE INSERT OR UPDATE OF buyer_offer_id ON orders
        FOR EACH ROW EXECUTE FUNCTION ensure_order_offer_accepted();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS orders_require_accepted_offer ON orders")
    op.execute("DROP FUNCTION IF EXISTS ensure_order_offer_accepted()")
    Base.metadata.drop_all(bind=op.get_bind())