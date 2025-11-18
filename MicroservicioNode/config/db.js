const mongoose = require("mongoose");

/**
 * Realiza la conexión con MongoDB utilizando la URI definida en las variables de entorno.
 * En caso de error al conectar, se muestra por consola y se detiene la aplicación.
 */
async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("[DB] MONGO_URI no definido en el entorno");
    process.exit(1);
  }
  try {
    await mongoose.connect(uri, {
      // Estas opciones son recomendadas por Mongoose para su correcto funcionamiento
      autoIndex: true,
    });
    console.log("[DB] Conexión exitosa a MongoDB");
  } catch (err) {
    console.error("[DB] Error al conectar a MongoDB", err);
    process.exit(1);
  }
}

module.exports = connectDB;