const express = require("express");
const CalendarNote = require("../data/CalendarNote");
const auth = require("../middleware/auth");
const { validateObjectId } = require("../utils/validators");
const { HttpError } = require("../utils/httpErrors");

const router = express.Router();

router.use(auth);

function parseYearMonth(value, name) {
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num)) {
    throw new HttpError(400, `El parámetro '${name}' debe ser numérico`);
  }
  return num;
}

/**
 * GET /api/calendar/notes?year=2025&month=5
 * Devuelve las notas del mes especificado.
 */
router.get("/notes", async (req, res, next) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) {
      throw new HttpError(400, "Debes proporcionar 'year' y 'month'");
    }
    const yearNum = parseYearMonth(year, "year");
    const monthNum = parseYearMonth(month, "month");
    if (monthNum < 1 || monthNum > 12) {
      throw new HttpError(400, "El mes debe estar entre 1 y 12");
    }

    const from = new Date(Date.UTC(yearNum, monthNum - 1, 1, 0, 0, 0, 0));
    const to = new Date(Date.UTC(yearNum, monthNum, 1, 0, 0, 0, 0));

    const notes = await CalendarNote.find({
      userId: req.user.id,
      date: { $gte: from, $lt: to },
    })
      .sort({ date: 1, createdAt: -1 })
      .lean();

    res.json(
      notes.map((note) => ({
        ...note,
        id: note._id,
        dateISO: note.date?.toISOString(),
      }))
    );
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/calendar/notes
 * Crea una nota para un día concreto.
 */
router.post("/notes", async (req, res, next) => {
  try {
    const { date, title, content } = req.body ?? {};
    const trimmedContent = typeof content === "string" ? content.trim() : "";
    if (!date || !trimmedContent) {
      throw new HttpError(400, "Debes indicar 'date' (ISO) y 'content'");
    }
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) {
      throw new HttpError(400, "El formato de fecha no es válido");
    }
    parsed.setUTCHours(0, 0, 0, 0);

    const note = new CalendarNote({
      userId: req.user.id,
      date: parsed,
      title: title?.trim() || undefined,
      content: trimmedContent,
    });
    await note.save();
    res.status(201).json({
      ...note.toObject(),
      id: note._id,
      dateISO: note.date.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/calendar/notes/:id
 * Actualiza el contenido de una nota.
 */
router.put("/notes/:id", async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id);
    const { title, content } = req.body ?? {};
    const trimmedContent = typeof content === "string" ? content.trim() : "";
    if (!trimmedContent) {
      throw new HttpError(400, "El contenido es obligatorio");
    }
    const updated = await CalendarNote.findOneAndUpdate(
      { _id: id, userId: req.user.id },
      {
        title: title?.trim() || undefined,
        content: trimmedContent,
      },
      { new: true }
    );
    if (!updated) {
      throw new HttpError(404, "Nota no encontrada o no autorizada");
    }
    res.json({
      ...updated.toObject(),
      id: updated._id,
      dateISO: updated.date.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/calendar/notes/:id
 * Borra una nota del calendario.
 */
router.delete("/notes/:id", async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id);
    const deleted = await CalendarNote.findOneAndDelete({ _id: id, userId: req.user.id });
    if (!deleted) {
      throw new HttpError(404, "Nota no encontrada o no autorizada");
    }
    res.json({ message: "Nota eliminada" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
