# Monitor Crypto · Microservicio Python

Este servicio en Python es responsable de consultar datos de mercado de criptomonedas y ofrecer un análisis simplificado.  
Se ha implementado con [FastAPI](https://fastapi.tiangolo.com/), lo que permite definir de forma declarativa los endpoints y obtener documentación automática.

## Funcionalidades

- **Listado de precios** (`/api/prices`): devuelve un array con información básica de las principales criptomonedas (precio actual, capitalización, volumen, cambio %).  
  Se pueden ajustar el número de elementos por página (`per_page`), la divisa (`vs`) y la página (`page`).
- **Detalle de moneda** (`/api/coin/{id}`): devuelve información detallada de una criptomoneda específica (nombre, descripción, precios, máximos, variación diaria) así como una serie histórica de precios que se utiliza para graficar tendencias.
- **Análisis simplificado** (`/api/analysis/{symbol}`): devuelve un objeto con una tendencia general y un valor promedio ficticio.  Esta ruta es un ejemplo que puedes ampliar con tus propios algoritmos de análisis.
- **Healthcheck** (`/health`): comprueba que el microservicio está vivo y que puede contactar con la API pública de CoinGecko.

Todas las rutas se encuentran agrupadas bajo el prefijo `/api` para integrarse fácilmente con el API Gateway.

## Configuración

El microservicio se configura mediante variables de entorno definidas en `.env.example`.  Antes de arrancar el servicio, copia ese archivo a `.env` y ajusta los valores según tus necesidades:

- `PORT`: puerto en el que se ejecutará FastAPI (por defecto `5002`).
- `COINGECKO_API_BASE`: URL base de la API pública de CoinGecko, usada para descargar datos de mercado.
- `EXTERNAL_TIMEOUT`: tiempo máximo en segundos para esperar la respuesta de CoinGecko.
- `DATABASE_URL`: cadena de conexión SQLAlchemy (por defecto apunta a PostgreSQL, `postgresql://monitor:monitorpass@localhost:5432/monitorcrypto`).  Dentro del entorno Docker usa `postgres` como host.
- `DATABASE_ECHO`: si vale `true`, SQLAlchemy mostrará las consultas en consola (útil para depurar).

## Migraciones de base de datos

El proyecto incluye un entorno de [Alembic](https://alembic.sqlalchemy.org/) para gestionar la evolución del esquema sobre PostgreSQL. Asegúrate de tener la base de datos accesible según el valor de `DATABASE_URL` y ejecuta:

```bash
alembic upgrade head          # aplica todas las migraciones pendientes
alembic downgrade -1          # revierte la última migración (opcional)
alembic revision -m "mensaje" # crea una nueva migración (si agregas más modelos)
```

Puedes lanzar Alembic desde el directorio `MicroservicioPython`; toma la configuración de `alembic.ini` y el metadata de `app.db.Base`.

## Ejecución local

Para lanzar el microservicio de forma independiente:

1. Asegúrate de tener Python 3.10 o superior instalado.  
2. Crea y activa un entorno virtual (opcional pero recomendado):

   ```bash
   cd MicroservicioPython
   python -m venv venv
   source venv/bin/activate  # en Windows: venv\Scripts\activate
   ```

3. Instala las dependencias:

   ```bash
   pip install -r requirements.txt
   ```

4. Copia el archivo de configuración de ejemplo y edítalo si lo necesitas:

   ```bash
   cp .env.example .env
   ```

5. Ejecuta el servidor en modo de desarrollo con recarga automática:

   ```bash
   uvicorn app:app --reload --port 5002
   ```

La aplicación expondrá su API en `http://localhost:5002`.  Puedes acceder a la documentación interactiva de FastAPI en `http://localhost:5002/docs`.

## Uso con Docker

Si prefieres usar contenedores, puedes arrancar el microservicio Python con su propio `docker-compose.yml` para desarrollo local:

```bash
cd MicroservicioPython
docker compose up --build
```

También puedes levantarlo como parte del ecosistema completo ejecutando `docker compose up --build` desde la raíz del proyecto Monitor Crypto (consulta el `README.md` principal para más información).

## Estructura de la carpeta

```
MicroservicioPython/
├── app/            # Código fuente (modelos, rutas, servicios)
│   ├── __init__.py
│   ├── config.py
│   ├── db.py
│   ├── models/
│   ├── routes/
│   ├── schemas/
│   └── services/
├── docs/           # Documentación adicional (opcional)
├── tests/          # Pruebas unitarias
├── migrations/     # Archivos de Alembic para migraciones de BD
├── alembic.ini     # Configuración de Alembic
├── Dockerfile      # Construcción de la imagen del microservicio
├── docker-compose.yml # Orquestación para desarrollo
├── .env.example    # Variables de entorno de ejemplo
├── requirements.txt
└── wsgi.py         # Punto de entrada para entornos que requieran un módulo específico
```

Consulta los módulos en `app/` para ver la implementación detallada de cada funcionalidad.
