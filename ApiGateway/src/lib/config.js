"use strict";

// Puerto por defecto para el API Gateway
const DEFAULT_PORT = 5000;

/**
 * Normaliza una URL eliminando cualquier barra final. Devuelve undefined si
 * la cadena es falsy.
 * @param {string|undefined} value
 * @returns {string|undefined}
 */
const normalizeUrl = (value) => {
  if (!value) {
    return undefined;
  }
  return value.replace(/\/+$/u, "");
};

/**
 * Construye la configuración de un microservicio a partir de las variables
 * de entorno. Si no se define la URL del servicio se devuelve undefined.
 * @param {NodeJS.ProcessEnv} env
 * @param {string} key Prefijo del servicio en mayúsculas (ej.: NODE, PYTHON)
 * @param {object} defaults Valores por defecto para la ruta del servicio
 * @returns {object|undefined}
 */
const buildServiceConfig = (env, key, defaults = {}) => {
  const serviceUrl = normalizeUrl(env[`${key}_SERVICE_URL`]);
  const openapiUrl = env[`${key}_OPENAPI_URL`];
  if (!serviceUrl) {
    return undefined;
  }
  return {
    name: key.toLowerCase(),
    route: defaults.route ?? `/${key.toLowerCase()}`,
    target: serviceUrl,
    openapiUrl: openapiUrl ? openapiUrl.trim() : undefined
  };
};

// Lista de servicios que soporta el Gateway. Puedes añadir más entradas si
// incorporas otros microservicios al ecosistema de Monitor Crypto.
const SERVICES_KEYS = [
  { key: "NODE", route: "/node" },
  { key: "PYTHON", route: "/python" },
  { key: "ANALYTICS", route: "/analytics" }
];

/**
 * Devuelve la configuración global leyendo PORT y las variables por microservicio.
 * Si no se especifica PORT o no es un número válido se usa DEFAULT_PORT.
 * @returns {{ port: number, services: Array<object> }}
 */
const getConfig = () => {
  const port = Number.parseInt(process.env.PORT ?? DEFAULT_PORT, 10);
  const services = SERVICES_KEYS.map((entry) =>
    buildServiceConfig(process.env, entry.key, { route: entry.route })
  ).filter(Boolean);
  return {
    port: Number.isNaN(port) ? DEFAULT_PORT : port,
    services
  };
};

module.exports = {
  getConfig
};
