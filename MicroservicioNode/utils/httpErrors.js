/**
 * Clase de error personalizada para enviar códigos de estado HTTP coherentes desde
 * las rutas y middlewares. Al heredar de Error se conserva la traza de pila.
 */
class HttpError extends Error {
  /**
   * @param {number} status Código de estado HTTP que se enviará en la respuesta
   * @param {string} message Mensaje legible para el cliente
   */
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

/**
 * Función de manejo centralizado de errores. Distingue entre errores de validación,
 * errores generados por HttpError y cualquier otro error inesperado. En todos los casos
 * se envía una respuesta JSON con el código y el mensaje correspondiente.
 *
 * @param {Error & { status?: number }} err Objeto de error capturado
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
function errorHandler(err, _req, res, _next) {
  // Errores personalizados
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  // Errores de Mongoose por IDs mal formados
  if (err.name === "CastError") {
    return res.status(400).json({ error: "ID proporcionado no es válido" });
  }
  // Errores de validación de Mongoose
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ error: messages.join("; ") });
  }
  // Otros errores inesperados
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
}

module.exports = {
  HttpError,
  errorHandler,
};