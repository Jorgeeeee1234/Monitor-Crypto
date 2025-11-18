require("dotenv").config();

const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const fs = require("fs");
const path = require("path");

const connectDB = require("./config/db");
const { ensureDefaultUsers } = require("./services/ensureDefaultUsers");
const { errorHandler } = require("./utils/httpErrors");

// Importar rutas
const alertsRoutes = require("./routes/alertsRoutes");
const favoritesRoutes = require("./routes/favoritesRoutes");
const historyRoutes = require("./routes/historyRoutes");
const usersRoutes = require("./routes/usersRoutes");
const analysisRoutes = require("./routes/analysisRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const calendarRoutes = require("./routes/calendarRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();

// Middlewares globales
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Documentación Swagger
const openapiPath = path.join(__dirname, "docs", "openapi.json");
let openapiSpec = {};
try {
  const rawSpec = fs.readFileSync(openapiPath, "utf-8");
  openapiSpec = JSON.parse(rawSpec);
} catch (err) {
  console.warn("[Docs] No se pudo cargar openapi.json", err.message);
}

/**
 * Endpoint para exponer la especificación OpenAPI en formato JSON. Esto permite que el
 * API Gateway (y cualquier cliente externo) agregue automáticamente la documentación
 * del microservicio y cumpla con el requisito de interfaz programática OpenAPI 3.0.
 */
app.get("/openapi.json", (_req, res) => {
  if (!openapiSpec || Object.keys(openapiSpec).length === 0) {
    return res.status(503).json({
      error: "OpenAPINotAvailable",
      message: "La especificación OpenAPI no se encuentra disponible."
    });
  }
  res.json(openapiSpec);
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

// Prefijo de API
app.use("/api/alerts", alertsRoutes);
app.use("/api/favorites", favoritesRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/analysis", analysisRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/admin", adminRoutes);

// Ruta no encontrada
app.use((req, res, next) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

// Manejo centralizado de errores
app.use(errorHandler);

// Arranque del servidor y conexión a la base de datos
async function start() {
  const port = Number.parseInt(process.env.PORT, 10) || 4001;
  try {
    await connectDB();
    await ensureDefaultUsers();
    app.listen(port, () => {
      console.log(`Monitor Crypto Node escuchando en el puerto ${port}`);
    });
  } catch (err) {
    console.error("[Main] Error al iniciar la aplicación", err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { app, start };
