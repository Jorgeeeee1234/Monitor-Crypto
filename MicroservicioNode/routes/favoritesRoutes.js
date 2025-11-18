const express = require("express");
const Favorite = require("../data/Favorite");
const auth = require("../middleware/auth");
const { validateObjectId } = require("../utils/validators");
const { HttpError } = require("../utils/httpErrors");
const router = express.Router();

// Todas las rutas requieren autenticación
router.use(auth);

/**
 * GET /api/favorites
 * Devuelve la lista de monedas favoritas del usuario autenticado.
 */
router.get("/", async (req, res, next) => {
  try {
    const favorites = await Favorite.find({ userId: req.user.id });
    res.json(favorites);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/favorites
 * Añade una nueva moneda a favoritos. El cuerpo debe incluir al menos 'coinId' y 'symbol'.
 */
router.post("/", async (req, res, next) => {
  try {
    const { coinId, symbol, name, current_price, market_cap, price_change_percentage_24h, image } = req.body;
    if (!coinId || !symbol) {
      throw new HttpError(400, "Se requieren 'coinId' y 'symbol'");
    }
    const fav = new Favorite({
      userId: req.user.id,
      coinId,
      symbol,
      name,
      current_price,
      market_cap,
      price_change_percentage_24h,
      image,
    });
    await fav.save();
    res.status(201).json(fav);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/favorites/:id
 * Elimina una moneda favorita. Solo el propietario puede eliminarla.
 */
router.delete("/:id", async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id);
    const fav = await Favorite.findOneAndDelete({ _id: id, userId: req.user.id });
    if (!fav) {
      throw new HttpError(404, "Favorito no encontrado o no autorizado");
    }
    res.json({ message: "Favorito eliminado correctamente" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;