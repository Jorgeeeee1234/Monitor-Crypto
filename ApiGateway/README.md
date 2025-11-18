# Monitor Crypto – API Gateway

Gateway HTTP que centraliza el acceso del frontend a los microservicios de **Monitor Crypto**.  
Se encarga de aplicar middlewares comunes (compresion, CORS), hacer proxy hacia los servicios disponibles y generar la documentacion OpenAPI agregada.

## Requisitos

- [Node.js >= 18](https://nodejs.org/)
- Los microservicios deben estar en ejecucion (`http://localhost:4001` para Node y `http://localhost:5002` para Python en modo local).

## Instalacion

```bash
cd ApiGateway
cp .env.example .env
npm install
```

## Ejecucion

Modo desarrollo (recarga automatica):

```bash
npm run dev
```

Modo produccion:

```bash
npm start
```

El servicio queda a la escucha en el puerto definido por `PORT` (por defecto `5000`).

## Variables de entorno

El archivo `.env` determina a que microservicios se reenvian las peticiones y donde se obtiene su documentacion OpenAPI. Ejemplo:

```env
# Puerto del Gateway
PORT=5000

# Servicio Node (gestion + MongoDB)
NODE_SERVICE_URL=http://localhost:4001
NODE_OPENAPI_URL=http://localhost:4001/openapi.json

# Servicio Python (analisis + Postgres)
PYTHON_SERVICE_URL=http://localhost:5002
PYTHON_OPENAPI_URL=http://localhost:5002/openapi.json

# Servicios adicionales (opcional)
ANALYTICS_SERVICE_URL=
ANALYTICS_OPENAPI_URL=
```

Dentro de Docker Compose se utilizan las URLs internas (`http://microservicio-node:4001`, etc.); consulta `.env` para ver ambas variantes comentadas.

## Endpoints expuestos

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/health` | Resumen del estado del Gateway y los microservicios configurados |
| GET | `/openapi.json` | Especificacion OpenAPI agregada a partir de los servicios activos |
| GET | `/docs` | Interfaz Swagger UI que consume la especificacion agregada |
| Cualquiera | `/node/*` | Proxy hacia el microservicio Node conservando el path |
| Cualquiera | `/python/*` | Proxy hacia el microservicio Python |

## Uso con Docker

Si utilizas el `docker-compose.yml` de la raiz del proyecto, el Gateway se construye y arranca automaticamente junto con los dos microservicios, MongoDB, PostgreSQL y el frontend. No es necesario ejecutar comandos adicionales dentro de esta carpeta en ese escenario. 
