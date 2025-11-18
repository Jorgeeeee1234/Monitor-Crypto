"use strict";

/**
 * Middleware de manejo de errores. Construye una respuesta JSON coherente
 * para los errores producidos durante la ejecución del gateway o de la
 * comunicación con los microservicios.
 * Incluye la traza de la pila sólo si NODE_ENV no es "production".
 * @param {Error & { status?: number }} err
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
const errorHandler = (err, _req, res, _next) => {
  const status = err.status ?? 500;
  const payload = {
    error: err.name ?? "Error",
    message: err.message ?? "Error interno en el API Gateway"
  };
  // Incluir stack trace en desarrollo para facilitar la depuración
  if (process.env.NODE_ENV !== "production" && err.stack) {
    payload.stack = err.stack;
  }
  res.status(status).json(payload);
};

module.exports = {
  errorHandler
};
