const mongoose = require("mongoose");

/**
 * Esquema de usuario. Contiene datos personales y credenciales de acceso.
 * Las contraseñas se almacenan de forma cifrada (ver servicios/ensureDefaultUsers.js y routes de registro).
 */
const userSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: true,
      trim: true,
    },
    apellido: {
      type: String,
      required: true,
      trim: true,
    },
    dni: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    telefono: {
      type: String,
      required: true,
      trim: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    rol: {
      type: String,
      enum: ["admin", "cliente"],
      default: "cliente",
    },
    fechaRegistro: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

module.exports = mongoose.model("User", userSchema);