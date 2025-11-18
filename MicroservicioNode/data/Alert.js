const mongoose = require("mongoose");

/**
 * Esquema de una alerta de precios de criptomonedas.
 * Cada alerta pertenece a un usuario y define el símbolo de la moneda y el precio objetivo.
 */
const alertSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    symbol: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    targetPrice: {
      type: Number,
      required: true,
    },
    triggered: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

module.exports = mongoose.model("Alert", alertSchema);