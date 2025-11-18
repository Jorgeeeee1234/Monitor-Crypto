const express = require("express");
const History = require("../data/History");
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");
const { validateObjectId } = require("../utils/validators");
const { HttpError } = require("../utils/httpErrors");
const router = express.Router();

// Autenticación requerida en todas las rutas
router.use(auth);

/**
 * GET /api/history
 * Devuelve el historial de precios del usuario autenticado.
 */
router.get("/", async (req, res, next) => {
  try {
    const history = await History.find({ userId: req.user.id }).sort({ checkedAt: -1 });
    res.json(history);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/history
 * Registra un nuevo precio en el historial del usuario.
 * Body: { symbol: string, price: number }
 */
router.post("/", async (req, res, next) => {
  try {
    const { symbol, price } = req.body;
    if (!symbol || typeof price !== "number") {
      throw new HttpError(400, "Se requieren 'symbol' y 'price'");
    }
    const record = new History({
      userId: req.user.id,
      symbol,
      price,
    });
    await record.save();
    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/history/user/:id
 * Devuelve el historial de un usuario específico. Sólo accesible para administradores.
 */
router.get("/user/:id", admin, async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id);
    const history = await History.find({ userId: id }).sort({ checkedAt: -1 });
    res.json(history);
  } catch (err) {
    next(err);
  }
});

module.exports = router;