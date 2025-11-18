from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Path, Query
from fastapi.encoders import jsonable_encoder
from sqlalchemy import MetaData, Table, inspect, select, func
from sqlalchemy.engine import Engine

from ..db import get_engine, session_scope

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _get_engine() -> Engine:
    try:
        return get_engine()
    except Exception as exc:  # pragma: no cover
        raise HTTPException(
            status_code=500,
            detail="No se pudo inicializar la conexion con PostgreSQL",
        ) from exc


@router.get("/postgres/tables")
def list_postgres_tables(
    include_counts: bool = Query(False, description="Incluir el recuento aproximado de filas por tabla"),
) -> Dict[str, Any]:
    engine = _get_engine()
    inspector = inspect(engine)
    table_names = sorted(inspector.get_table_names())
    tables: List[Dict[str, Any]] = []

    with session_scope() as session:
        metadata = MetaData()
        for name in table_names:
            columns = inspector.get_columns(name)
            row_count = None
            if include_counts:
                table = Table(name, metadata, autoload_with=engine)
                try:
                    row_count = session.execute(select(func.count()).select_from(table)).scalar_one()
                except Exception:
                    row_count = None
            tables.append(
                {
                    "name": name,
                    "columns": [{"name": column["name"], "type": str(column["type"])} for column in columns],
                    "row_count": row_count,
                }
            )
    return {"tables": tables}


@router.get("/postgres/tables/{table_name}")
def get_postgres_table(
    table_name: str = Path(..., description="Nombre de la tabla a consultar"),
    limit: int = Query(20, ge=1, le=100, description="Numero maximo de filas a devolver"),
) -> Dict[str, Any]:
    engine = _get_engine()
    inspector = inspect(engine)
    if table_name not in inspector.get_table_names():
        raise HTTPException(status_code=404, detail="Tabla no encontrada")

    metadata = MetaData()
    try:
        table = Table(table_name, metadata, autoload_with=engine)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="No se pudo cargar la tabla solicitada") from exc

    stmt = select(table).limit(limit)
    with session_scope() as session:
        try:
            result = session.execute(stmt).mappings().all()
        except Exception as exc:  # pragma: no cover
            raise HTTPException(status_code=500, detail="No se pudieron obtener los datos de la tabla") from exc

    rows = [jsonable_encoder(dict(row)) for row in result]
    return {
        "table": table_name,
        "columns": [column.name for column in table.columns],
        "rows": rows,
    }
