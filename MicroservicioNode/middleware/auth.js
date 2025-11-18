const jwt = require("jsonwebtoken");
const { HttpError } = require("../utils/httpErrors");

/**
 * Middleware de autenticación. Verifica la presencia de un token JWT en la cabecera
 * Authorization (formato "Bearer <token>") y adjunta el payload decodificado en `req.user`.
 * Si el token no existe o es inválido, lanza un error HttpError para ser procesado por
 * el manejador de errores global.
 */
module.exports = function authMiddleware(req, _res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    return next(new HttpError(401, "Token no proporcionado"));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "");
    req.user = decoded;
    next();
  } catch (err) {
    return next(new HttpError(403, "Token inválido o expirado"));
  }
};