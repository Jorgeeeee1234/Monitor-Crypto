# Monitor Crypto

Monitor Crypto es una aplicacion web pensada para seguir la evolucion de las criptomonedas en tiempo real.  
Se apoya en una arquitectura de **microservicios** conectados mediante un API Gateway que expone tanto la interfaz HTML5 como la programatica (OpenAPI 3.0). El usuario puede consultar precios, ver detalles de cada moneda, crear alertas, marcar favoritas, revisar historicos y gestionar usuarios con distintos roles.

## Estructura del proyecto

El repositorio se organiza en cuatro carpetas principales:

| Carpeta | Descripcion |
| --- | --- |
| **ApiGateway** | Servicio Node.js que actua como proxy inverso hacia los microservicios y agrega la documentacion OpenAPI. |
| **MicroservicioNode** | Backend Express + MongoDB que gestiona usuarios, alertas, favoritos e historial. |
| **MicroservicioPython** | Microservicio FastAPI + PostgreSQL que consulta datos externos (CoinGecko) para precios, detalles y analisis. |
| **Web** | Frontend estatico (HTML, CSS, JS) que consume la API a traves del Gateway. |

## Antes de poner en marcha el proyecto debes tener en cuenta lo siguiente:
Para usarlo es válido con descargar el zip de Github, descomprimirlo, abrirlo en Visual Studio Code, abres el terminal
y hacer estos 2 comandos: (Ten en cuenta que si descargas el proyecto de github puedes hacerlo con el nombre un poco cambiado, tenlo en cuenta a la hora de escribir los comandos en terminal)

cd Monitor-Crypto-main

docker compose up --build

Después se te abrirá la app, debes tener en cuenta 3 cosas aqui. 
Se pueden hacer cuentas tanto de Administrados como de CLiente desde el Registro para que el usuario pueda probarlo todo con libertad.
Se deben crear varias cuentas tanto de usuarios normales como admin para poder probar bien todas las funcionalidades de la parte administradora, sino algunas de estas partes estarán incompletas.
Es posible que al principio no funcione y muestre el error 429 too many request, esto antes no pasaba pero desde que el proyecto esta publico en github es posible que lo hayan utilizado más personas y de ahi que se saturen más las peticiones de datos externos a CoinGecko.

Si te sucede el 3º caso, te recomiento que pruebes varias veces a lo largo de varios minutos, cierra sesion y vuelve a entrar, y muevete por la app y después vuelve al inicio para actualizar los datos Reales de las Criptomonedas.

## Puesta en marcha rapida con Docker

La forma mas sencilla de probar todos los servicios es mediante Docker Compose.  
Asegurate de tener instalados [Docker](https://docs.docker.com/get-docker/) y [Docker Compose](https://docs.docker.com/compose/install/). Luego, desde la raiz del proyecto ejecuta:

```bash
docker compose up --build
```

Esto iniciara los siguientes contenedores:

- **mongo**: base de datos MongoDB para usuarios, alertas, favoritos e historiales.
- **microservicio-node**: servicio de gestion (Express). Escucha en el puerto `4001` dentro de la red de contenedores.
- **microservicio-python**: servicio de analisis (FastAPI). Escucha en el puerto `5002`.
- **api-gateway**: gateway HTTP que expone las rutas `/node` y `/python`. Disponible en `http://localhost:5000`. La especificacion agregada se encuentra en `http://localhost:5000/openapi.json` y la interfaz Swagger en `http://localhost:5000/docs`.
- **frontend**: servidor Nginx que sirve los archivos estaticos de `Web` en `http://localhost:8080`.

Una vez levantados, accede a `http://localhost:8080/pages/login.html` para iniciar sesion o registrarte. Todas las peticiones a la API se realizan a traves del Gateway.

### Variables de entorno

Cada microservicio incluye un archivo `.env.example` con las variables necesarias. Copia dicho archivo a `.env` en la carpeta correspondiente y ajusta los valores:

- **MicroservicioNode**: define `MONGO_URI`, `JWT_SECRET`, `PYTHON_SERVICE_URL` y los datos del usuario administrador por defecto.
- **MicroservicioPython**: define el puerto (`PORT`), la URL base de CoinGecko (`COINGECKO_API_BASE`), el timeout externo y la cadena `DATABASE_URL` (PostgreSQL).
- **ApiGateway**: establece las URLs de cada servicio (`NODE_SERVICE_URL`, `PYTHON_SERVICE_URL`) y sus especificaciones (`NODE_OPENAPI_URL`, `PYTHON_OPENAPI_URL`).

## Ejecucion manual sin Docker

Si prefieres arrancar cada componente manualmente:

1. **MongoDB**: inicia una instancia local (`docker run -p 27017:27017 mongo:6`) o tu instalacion nativa.
2. **Microservicio Node**  
   ```bash
   cd MicroservicioNode
   cp .env.example .env
   npm install
   npm run dev            # http://localhost:4001
   ```
3. **Microservicio Python**  
   ```bash
   cd MicroservicioPython
   python -m venv venv && source venv/bin/activate  # venv\Scripts\activate
   pip install -r requirements.txt
   cp .env.example .env
   uvicorn app:app --reload --port 5002
   ```
4. **API Gateway**  
   ```bash
   cd ApiGateway
   cp .env.example .env
   npm install
   npm run dev   # http://localhost:5000
   ```
5. **Frontend**: desde `Web` ejecuta `python -m http.server 8080` o abre los HTML directamente en tu navegador.

## Recursos adicionales

- Documentacion del microservicio Node: `MicroservicioNode/README.md` (incluye `/openapi.json` y `/docs`).
- Documentacion del microservicio Python: `MicroservicioPython/README.md` (FastAPI expone `/docs` y `/openapi.json`).
- Guion rapido de despliegue: `README2.txt`.

Con todos los servicios en marcha puedes explorar la API completa desde `http://localhost:5000/docs` y consumir el JSON OpenAPI desde `http://localhost:5000/openapi.json` o directamente desde cada microservicio (`http://localhost:4001/openapi.json`, `http://localhost:5002/openapi.json`).


## Importante, lee la sección: "Antes de poner en marcha el proyecto debes tener en cuenta..."
