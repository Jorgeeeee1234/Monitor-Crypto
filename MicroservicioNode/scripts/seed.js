#!/usr/bin/env node
const dotenv = require("dotenv");
const connectDB = require("../config/db");
const { ensureDefaultUsers } = require("../services/ensureDefaultUsers");
const Alert = require("../data/Alert");
const Favorite = require("../data/Favorite");
const History = require("../data/History");

// Carga variables de entorno desde .env
dotenv.config();

(async () => {
  try {
    await connectDB();
    console.log("[Seed] Conectado a MongoDB");
    // Limpia colecciones
    await Promise.all([
      Alert.deleteMany({}),
      Favorite.deleteMany({}),
      History.deleteMany({}),
    ]);
    console.log("[Seed] Colecciones limpiadas");
    // Crea usuario administrador por defecto
    await ensureDefaultUsers();
    console.log("[Seed] Proceso de inicialización completado");
    process.exit(0);
  } catch (err) {
    console.error("[Seed] Error durante el seed:", err);
    process.exit(1);
  }
})();