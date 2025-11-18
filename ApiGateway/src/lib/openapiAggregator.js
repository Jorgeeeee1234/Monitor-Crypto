"use strict";

const path = require("path");
const fs = require("fs/promises");

// Especificación base para el Gateway. Partirá de esta estructura y
// añadirá las rutas y componentes de los microservicios disponibles.
const BASE_SPEC = {
  openapi: "3.0.3",
  info: {
    title: "Monitor Crypto API Gateway",
    version: "1.0.0",
    description:
      "Documentación agregada dinámicamente a partir de los microservicios activos."
  },
  servers: [
    {
      url: "/",
      description: "Monitor Crypto API Gateway"
    }
  ],
  paths: {},
  components: {}
};

/**
 * Lee un fichero JSON local y lo parsea. Utiliza rutas relativas al
 * directorio de trabajo de Node.
 * @param {string} relativePath
 * @returns {Promise<object>}
 */
const readLocalSpec = async (relativePath) => {
  const absolutePath = path.resolve(relativePath);
  const raw = await fs.readFile(absolutePath, "utf-8");
  return JSON.parse(raw);
};

/**
 * Recupera la especificación OpenAPI desde una URL remota. Utiliza fetch con
 * timeout para evitar bloqueos. Devuelve el objeto JSON parseado.
 * @param {string} url
 * @returns {Promise<object>}
 */
const fetchRemoteSpec = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);
  if (!response.ok) {
    throw new Error(`Error ${response.status} al recuperar OpenAPI en ${url}`);
  }
  return response.json();
};

/**
 * Combina de forma recursiva las propiedades de `source` dentro de `target`.
 * Evita sobrescribir claves existentes en `target`.
 * @param {object} target
 * @param {object} source
 */
const mergeObjects = (target, source) => {
  if (!source) {
    return;
  }
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) {
      continue;
    }
    if (typeof value === "object" && !Array.isArray(value)) {
      if (!target[key]) {
        target[key] = {};
      }
      mergeObjects(target[key], value);
    } else if (target[key] === undefined) {
      target[key] = value;
    }
  }
};

/**
 * Mezcla las rutas y componentes de una especificación en la especificación
 * base, aplicando un prefijo a cada ruta para evitar colisiones.
 * @param {object} base
 * @param {object} spec
 * @param {string} prefix
 */
const mergeSpecs = (base, spec, prefix) => {
  if (!spec) {
    return;
  }
  const formattedPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  for (const [pathKey, pathValue] of Object.entries(spec.paths ?? {})) {
    const prefixedPath = `${formattedPrefix}${pathKey}`;
    if (!base.paths[prefixedPath]) {
      base.paths[prefixedPath] = pathValue;
    } else {
      base.paths[prefixedPath] = {
        ...base.paths[prefixedPath],
        ...pathValue
      };
    }
  }
  if (spec.components) {
    if (!base.components) {
      base.components = {};
    }
    mergeObjects(base.components, spec.components);
  }
};

/**
 * Carga la especificación OpenAPI de un microservicio. Si la URL empieza por
 * "file:" se asume que es un fichero local; en otro caso se hace una
 * petición HTTP. Si no hay especificación disponible se devuelve undefined.
 * @param {{ name: string, openapiUrl?: string }} service
 * @returns {Promise<object|undefined>}
 */
const loadSpec = async (service) => {
  if (!service.openapiUrl) {
    return undefined;
  }
  try {
    if (service.openapiUrl.startsWith("file:")) {
      return await readLocalSpec(service.openapiUrl.replace("file:", ""));
    }
    return await fetchRemoteSpec(service.openapiUrl);
  } catch (error) {
    console.warn(
      `[openapi] No se pudo cargar la especificación de ${service.name}: ${error.message}`
    );
    return undefined;
  }
};

/**
 * Agrega todas las especificaciones disponibles a una copia profunda de
 * BASE_SPEC. Aplica los prefijos de ruta definidos en la configuración.
 * @param {Array<{ name: string, route: string, openapiUrl?: string }>} services
 * @returns {Promise<object>}
 */
const aggregateSpecs = async (services) => {
  const aggregated = JSON.parse(JSON.stringify(BASE_SPEC));
  for (const service of services) {
    const spec = await loadSpec(service);
    if (!spec) {
      continue;
    }
    mergeSpecs(aggregated, spec, service.route);
  }
  return aggregated;
};

module.exports = {
  aggregateSpecs
};
