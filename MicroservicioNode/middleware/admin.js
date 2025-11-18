const { HttpError } = require("../utils/httpErrors");

/**
 * Middleware que comprueba si el usuario autenticado posee el rol "admin".
 * Si no es así se lanza un HttpError con código 403.
 */
module.exports = function adminMiddleware(req, _res, next) {
  if (!req.user || req.user.rol !== "admin") {
    return next(new HttpError(403, "Acceso denegado. Solo administradores."));
  }
  next();
};