const mongoose = require("mongoose");
const { HttpError } = require("./httpErrors");

/**
 * Valida que el parámetro recibido sea un ObjectId válido de MongoDB. Si no lo es,
 * lanza un HttpError con código 400. Devuelve el ID normalizado en caso contrario.
 *
 * @param {string} id Cadena a validar
 * @returns {string} El mismo ID si es válido
 */
function validateObjectId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new HttpError(400, "Identificador no válido");
  }
  return id;
}

module.exports = {
  validateObjectId,
};