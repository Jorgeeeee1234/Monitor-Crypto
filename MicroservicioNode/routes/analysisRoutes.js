const express = require("express");
const axios = require("axios");
const router = express.Router();

/**
 * Microservicio Python base URL. Debe terminar en '/api'. Se obtiene de las variables de entorno.
 */
function getPythonBase() {
  const base = process.env.PYTHON_SERVICE_URL;
  if (!base) {
    throw new Error("PYTHON_SERVICE_URL no esta definido en las variables de entorno");
  }
  return base.replace(/\/$/, "");
}

/**
 * GET /api/analysis/prices
 * Recupera un listado de criptomonedas con sus precios. El microservicio Python soporta
 * los parametros de consulta 'vs', 'per_page' y 'page'.
 */
router.get("/prices", async (req, res, next) => {
  try {
    const base = getPythonBase();
    const url = `${base}/prices`;
    const { vs, per_page, page } = req.query;
    const response = await axios.get(url, { params: { vs, per_page, page } });
    res.json(response.data);
  } catch (err) {
    console.error("[Analysis] Error al consultar precios:", err.message);
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    next(err);
  }
});

/**
 * GET /api/analysis/coin/:id
 * Obtiene el detalle y la serie historica de una moneda.
 */
router.get("/coin/:id", async (req, res, next) => {
  try {
    const base = getPythonBase();
    const url = `${base}/coin/${encodeURIComponent(req.params.id)}`;
    const { vs, days } = req.query;
    const response = await axios.get(url, { params: { vs, days } });
    res.json(response.data);
  } catch (err) {
    console.error("[Analysis] Error al consultar detalle de la moneda:", err.message);
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    next(err);
  }
});

router.post("/sync", async (req, res, next) => {
  try {
    const base = getPythonBase();
    const url = `${base}/admin/sync`;
    const response = await axios.post(url, req.body || {});
    res.status(response.status).json(response.data);
  } catch (err) {
    console.error("[Analysis] Error al sincronizar mercado:", err.message);
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    next(err);
  }
});

router.post("/sync-series", async (req, res, next) => {
  try {
    const base = getPythonBase();
    const url = `${base}/admin/sync-series`;
    const response = await axios.post(url, req.body || {});
    res.status(response.status).json(response.data);
  } catch (err) {
    console.error("[Analysis] Error al sincronizar historico:", err.message);
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    next(err);
  }
});

/**
 * GET /api/analysis/:symbol
 * Solicita un analisis simplificado de una moneda. Utiliza el endpoint /analysis/{symbol} del microservicio Python.
 */
router.get("/:symbol", async (req, res, next) => {
  try {
    const base = getPythonBase();
    const url = `${base}/analysis/${encodeURIComponent(req.params.symbol)}`;
    const { vs, days } = req.query;
    const response = await axios.get(url, { params: { vs, days } });
    res.json(response.data);
  } catch (err) {
    console.error("[Analysis] Error al obtener analisis:", err.message);
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    next(err);
  }
});

module.exports = router;
