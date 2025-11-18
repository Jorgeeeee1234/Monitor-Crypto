const mongoose = require("mongoose");

/**
 * Esquema de un favorito. Permite al usuario almacenar información básica de una moneda
 * para mostrarla en sus listas personales. La información se guarda como referencia
 * (no se actualiza automáticamente al cambiar de precio) para mantener una traza
 * del estado en el momento de añadir el favorito.
 */
const favoriteSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    coinId: {
      type: String,
      required: true,
    },
    symbol: {
      type: String,
      required: true,
      uppercase: true,
    },
    name: {
      type: String,
    },
    current_price: {
      type: Number,
    },
    market_cap: {
      type: Number,
    },
    price_change_percentage_24h: {
      type: Number,
    },
    image: {
      type: String,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

module.exports = mongoose.model("Favorite", favoriteSchema);