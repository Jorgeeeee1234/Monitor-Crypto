# Monitor Crypto – Microservicio Node

Este microservicio implementa la logica de gestion para la aplicacion **Monitor Crypto**.  
Expone una API REST que administra usuarios, alertas de precio, favoritos, historial de consultas, notas de dashboard y calendario. Tambien delega peticiones hacia el microservicio Python cuando se requieren datos de mercado o analisis.

## Caracteristicas principales

- **Usuarios**: registro, login (JWT), perfil, listado completo (solo administradores), cambio de rol y eliminacion.
- **Alertas**: crear, listar y eliminar alertas de precio por usuario.
- **Favoritos**: mantener la lista de criptomonedas favoritas asociadas a cada cuenta.
- **Historial**: guardar las consultas de precio realizadas por cada usuario y revisarlas posteriormente.
- **Dashboard/Calendario**: tomar notas y recordatorios vinculados al usuario autenticado.
- **Analisis**: endpoints que actuan como proxy hacia el microservicio Python para precios, detalle de monedas y sincronizaciones.
- **Documentacion**: Swagger UI disponible en `/docs` y especificacion OpenAPI descargable en `/openapi.json`.

## Instalacion y ejecucion

1. Copia el archivo de variables:
   ```bash
   cd MicroservicioNode
   cp .env.example .env
   ```
2. Instala dependencias y arranca el servidor:
   ```bash
   npm install
   npm run dev
   ```
3. El servicio queda disponible en `http://localhost:4001`.

### Uso con Docker

Dentro de la raiz del proyecto (`Monitor Crypto`) puedes lanzar `docker compose up --build` para levantar MongoDB y este microservicio junto al resto de componentes. No es necesario ejecutar comandos adicionales dentro de esta carpeta.

## Estructura del proyecto

```
MicroservicioNode/
├── .env.example            # Variables de entorno de ejemplo
├── Dockerfile              # Imagen del microservicio
├── README.md               # Este documento
├── package.json / package-lock.json
├── main.js                 # Punto de entrada Express
├── config/
│   └── db.js               # Conexion a MongoDB
├── data/                   # Modelos Mongoose (User, Alert, Favorite, History, Note, CalendarNote)
├── docs/
│   └── openapi.json        # Especificacion OpenAPI 3.0
├── middleware/             # auth.js, admin.js, manejadores de errores
├── routes/                 # Definicion de endpoints REST
├── services/               # ensureDefaultUsers y logica auxiliar
├── utils/                  # HttpError, validadores, helpers
└── scripts/                # seed.js y utilidades opcionales
```

## Endpoints destacados

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/health` | Comprobar estado del servicio |
| POST | `/api/users/register` | Registrar un nuevo usuario |
| POST | `/api/users/login` | Autenticacion mediante JWT |
| GET | `/api/users/profile` | Recuperar el perfil del usuario autenticado |
| GET | `/api/users` | Listar usuarios (solo administradores) |
| PATCH | `/api/users/:id/role` | Cambiar el rol de un usuario |
| POST | `/api/alerts` | Crear una alerta de precio |
| GET | `/api/alerts` | Listar alertas del usuario |
| POST | `/api/favorites` | Agregar moneda a favoritos |
| GET | `/api/favorites` | Listar favoritos |
| POST | `/api/history` | Guardar un registro en el historial |
| GET | `/api/history` | Consultar el historial propio |
| GET | `/api/analysis/prices` | Obtener precios (via microservicio Python) |
| GET | `/api/analysis/coin/:id` | Obtener detalle de moneda (via Python) |
| GET | `/api/analysis/:symbol` | Analisis simplificado (via Python) |
| GET | `/openapi.json` | Descargar la especificacion OpenAPI 3.0 |

Consulta `docs/openapi.json` o `http://localhost:4001/openapi.json` para una descripcion completa de todos los endpoints, parametros y esquemas.
