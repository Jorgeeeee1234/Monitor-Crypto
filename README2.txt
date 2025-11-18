Monitor Crypto – Guia rapida
============================

Esta aplicacion se compone de varios microservicios (Node para la gestion de usuarios, favoritos, historial y analisis; Python para obtener datos de CoinGecko) unificados a traves de un API Gateway, ademas de un frontend estatico servido por Nginx.

Como ejecutar con Docker
------------------------

1. Deten cualquier instancia previa (si existe):
   ```bash
   docker compose down
   ```
2. Inicia todos los servicios con reconstruccion:
   ```bash
   docker compose up --build
   ```
   Esto levantara:
   - `mongo` en el puerto 27017.
   - `microservicio-node` en el puerto 4001 (accesible a traves del Gateway).
   - `microservicio-python` en el puerto 5002 (accesible a traves del Gateway).
   - `api-gateway` en el puerto 5000 (`/docs` para Swagger, `/openapi.json` para la especificacion).
   - `frontend` en el puerto 8080.
3. Abre `http://localhost:8080/pages/login.html` para empezar a usar la aplicacion.

Como ejecutar sin Docker
------------------------

1. MongoDB: asegura una instancia local (`mongodb://localhost:27017/monitorCrypto`) o usa `docker run -p 27017:27017 mongo:6`.
2. Microservicio Node:
   ```bash
   cd MicroservicioNode
   cp .env.example .env
   npm install
   npm run dev
   ```
3. Microservicio Python:
   ```bash
   cd MicroservicioPython
   python -m venv venv && source venv/bin/activate   # en Windows: venv\Scripts\activate
   pip install -r requirements.txt
   cp .env.example .env
   uvicorn app:app --reload --port 5002
   ```
4. API Gateway:
   ```bash
   cd ApiGateway
   cp .env.example .env
   npm install
   npm run dev
   ```
5. Frontend: `cd Web` y ejecuta `python -m http.server 8080` o abre los HTML directamente.

URLs utiles
-----------

- Salud gateway: `http://localhost:5000/health`
- Swagger agregado: `http://localhost:5000/docs`
- OpenAPI JSON: `http://localhost:5000/openapi.json`
- Listado de precios (via gateway): `http://localhost:5000/node/api/analysis/prices`
- Detalle de moneda: `http://localhost:5000/node/api/analysis/coin/{id}`
- Favoritos del usuario (requiere token): `http://localhost:5000/node/api/favorites`
- Historial del usuario (requiere token): `http://localhost:5000/node/api/history`
- Frontend:
  - `http://localhost:8080/pages/login.html`
  - `http://localhost:8080/pages/principal.html`
  - `http://localhost:8080/pages/admin.html` (solo rol `admin`)
