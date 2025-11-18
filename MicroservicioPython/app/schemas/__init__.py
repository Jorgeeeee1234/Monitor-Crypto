"""Modelos Pydantic utilizados para serializar y validar las respuestas.

Este paquete expone los modelos ``PriceItem``, ``CoinDetail`` y ``AnalysisResult``
para que se puedan importar fácilmente desde ``app.schemas``.  En particular,
algunos módulos de rutas utilizan ``from ..schemas import PriceItem`` para
referenciar el modelo de respuesta.  Sin este archivo de inicialización,
``app.schemas`` se consideraría un paquete implícito sin atributos y la
importación fallaría.

Cada modelo se define en su propio módulo (``PriceItem.py``, ``CoinDetail.py``
y ``AnalysisResult.py``).  Aquí los volvemos a exportar y declaramos
``__all__`` para documentar la API pública del paquete.
"""

from .PriceItem import PriceItem
from .CoinDetail import CoinDetail
from .AnalysisResult import AnalysisResult

__all__ = ["PriceItem", "CoinDetail", "AnalysisResult"]
