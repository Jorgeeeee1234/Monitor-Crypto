"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const compression = require("compression");
const http = require("http");
const https = require("https");
const { pipeline } = require("node:stream");
const swaggerUi = require("swagger-ui-express");

const { getConfig } = require("./lib/config");
const { aggregateSpecs } = require("./lib/openapiAggregator");
const { errorHandler } = require("./middleware/errorHandler");

// Lee la configuración a partir de variables de entorno
const config = getConfig();
const app = express();

// Middlewares globales
app.use(compression());
app.use(cors());

/**
 * Endpoint de salud. Devuelve información básica sobre el estado del gateway
 * y los microservicios configurados.
 */
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    gateway: {
      port: config.port,
      services: config.services.map((service) => ({
        name: service.name,
        route: service.route,
        target: service.target,
        hasOpenApi: Boolean(service.openapiUrl)
      }))
    }
  });
});

/**
 * Encargado de reenviar la petición al microservicio correspondiente.
 * Se genera una nueva solicitud HTTP conservando método, cabeceras y cuerpo.
 */
const forwardRequest = (service, req, res, next) => {
  // Construye la ruta relativa eliminando el prefijo del servicio
  const routePattern = new RegExp("^" + service.route);
  const targetPath = req.originalUrl.replace(routePattern, "") || "/";
  const targetUrl = new URL(targetPath, service.target);

  const options = {
    protocol: targetUrl.protocol,
    hostname: targetUrl.hostname,
    port: targetUrl.port,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: targetUrl.host
    }
  };

  const agent = targetUrl.protocol === "https:" ? https : http;
  const proxyRequest = agent.request(options, (proxyResponse) => {
    // Copia cabeceras evitando transfer-encoding duplicado
    const headers = { ...proxyResponse.headers };
    delete headers["transfer-encoding"];

    res.writeHead(
      proxyResponse.statusCode ?? 500,
      proxyResponse.statusMessage ?? "",
      headers
    );

    // Encadena la respuesta del microservicio a la respuesta del cliente
    pipeline(proxyResponse, res, (error) => {
      if (error) {
        next(error);
      }
    });
  });

  // Maneja errores al conectar con el microservicio
  proxyRequest.on("error", (error) => {
    next(error);
  });

  // Envía el cuerpo de la petición original al microservicio
  pipeline(req, proxyRequest, (error) => {
    if (error) {
      proxyRequest.destroy(error);
      next(error);
    }
  });
};

// Registra una ruta para cada microservicio configurado
config.services.forEach((service) => {
  app.use(service.route, (req, res, next) => {
    // Trata las peticiones CORS preflight (OPTIONS)
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    forwardRequest(service, req, res, next);
  });
});

/**
 * Endpoint que genera el OpenAPI agregado. Se basa en las rutas de cada
 * microservicio configurado. Si un microservicio no expone documentación,
 * simplemente se ignora.
 */
app.get("/openapi.json", async (_req, res, next) => {
  try {
    const spec = await aggregateSpecs(config.services);
    res.json(spec);
  } catch (error) {
    next(error);
  }
});

// Servidor Swagger UI que consume el OpenAPI agregado
app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(null, {
    swaggerOptions: {
      url: "/openapi.json",
      docExpansion: "list"
    },
    customSiteTitle: "Monitor Crypto API Gateway"
  })
);

// Manejo de rutas no encontradas
app.use((_req, res) => {
  res.status(404).json({
    error: "NotFound",
    message: "Ruta no encontrada en el Gateway"
  });
});

// Middleware de manejo de errores
app.use(errorHandler);

/**
 * Inicia el servidor en el puerto configurado.
 */
const start = () => {
  app.listen(config.port, () => {
    console.log(
      `API Gateway Monitor Crypto escuchando en el puerto ${config.port}`
    );
  });
};

// Si el archivo se ejecuta directamente, arranca el servidor
if (require.main === module) {
  start();
}

module.exports = {
  app,
  start
};
