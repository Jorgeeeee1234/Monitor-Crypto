const mongoose = require("mongoose");

/**
 * Esquema de historial de precios consultados por los usuarios.
 * Incluye la referencia al usuario, el símbolo consultado, el precio y la fecha.
 */
const historySchema = new mongoose.Schema(
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
    price: {
      type: Number,
      required: true,
    },
    checkedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

module.exports = mongoose.model("History", historySchema);