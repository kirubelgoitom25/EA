import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings

# At most 10 connections per process (5 kept open, 5 more under load). Supabase's session
# pooler (port 5432) refuses clients beyond its "Pool Size", often 15, so this leaves room
# for the old and new instance overlapping during a deploy, and for scripts. Each request
# holds a connection only for a few milliseconds, so 10 serve far more requests than the
# CPU can. Tune with DB_POOL_SIZE / DB_MAX_OVERFLOW, never past the pooler's limit.
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=int(os.getenv("DB_POOL_SIZE", "5")),
    max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "5")),
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
