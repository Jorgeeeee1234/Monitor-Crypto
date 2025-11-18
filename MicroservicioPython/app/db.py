from __future__ import annotations

from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, scoped_session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    """Base declarativa para todos los modelos ORM."""


_engine = None
_SessionFactory: sessionmaker | None = None


def get_engine():
    """Construye (o reutiliza) la instancia del motor SQLAlchemy."""
    global _engine, _SessionFactory
    if _engine is None:
        settings = get_settings()
        _engine = create_engine(settings.database_url, echo=settings.database_echo, future=True)
        _SessionFactory = sessionmaker(
            bind=_engine,
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
            future=True,
        )
        # Garantiza que todas las tablas declaradas existen antes de usar la base.
        # Importar aqui evita dependencias circulares en tiempo de carga.
        from . import models  # noqa: F401

        Base.metadata.create_all(bind=_engine)
    return _engine


def get_session() -> scoped_session:
    """Devuelve una sesión configurada."""
    global _SessionFactory
    if _SessionFactory is None:
        get_engine()
    assert _SessionFactory is not None  # Para el tipo estático
    return scoped_session(_SessionFactory)


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    """Context manager que abre y cierra una sesión automática."""
    session = get_session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.remove()
