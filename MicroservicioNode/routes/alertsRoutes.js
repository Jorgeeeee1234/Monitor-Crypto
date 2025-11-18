const express = require("express");
const Alert = require("../data/Alert");
const auth = require("../middleware/auth");
const { validateObjectId } = require("../utils/validators");
const { HttpError } = require("../utils/httpErrors");
const router = express.Router();

// Todas las rutas requieren autenticación
router.use(auth);

/**
 * GET /api/alerts
 * Devuelve la lista de alertas del usuario autenticado.
 */
router.get("/", async (req, res, next) => {
  try {
    const alerts = await Alert.find({ userId: req.user.id });
    res.json(alerts);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/alerts
 * Crea una nueva alerta para el usuario autenticado.
 * Body: { symbol: string, targetPrice: number }
 */
router.post("/", async (req, res, next) => {
  try {
    const { symbol, targetPrice } = req.body;
    if (!symbol || typeof targetPrice !== "number") {
      throw new HttpError(400, "Se requieren 'symbol' y 'targetPrice'");
    }
    const alert = new Alert({
      userId: req.user.id,
      symbol,
      targetPrice,
    });
    await alert.save();
    res.status(201).json(alert);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/alerts/:id
 * Elimina una alerta por su ID. Solo el propietario puede borrar su alerta.
 */
router.delete("/:id", async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id);
    const alert = await Alert.findOneAndDelete({ _id: id, userId: req.user.id });
    if (!alert) {
      throw new HttpError(404, "Alerta no encontrada o no autorizada");
    }
    res.json({ message: "Alerta eliminada correctamente" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;