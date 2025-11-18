const express = require("express");
const Note = require("../data/Note");
const auth = require("../middleware/auth");
const { validateObjectId } = require("../utils/validators");
const { HttpError } = require("../utils/httpErrors");

const router = express.Router();

router.use(auth);

/**
 * GET /api/dashboard/notes
 * Devuelve todas las notas del usuario autenticado ordenadas por fecha de actualización (desc).
 */
router.get("/notes", async (req, res, next) => {
  try {
    const notes = await Note.find({ userId: req.user.id }).sort({ updatedAt: -1 });
    res.json(notes);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/dashboard/notes
 * Crea una nueva nota. Requiere la propiedad `content`. El título es opcional.
 */
router.post("/notes", async (req, res, next) => {
  try {
    const { title, content } = req.body ?? {};
    if (!content || typeof content !== "string" || !content.trim()) {
      throw new HttpError(400, "El contenido de la nota es obligatorio");
    }
    const note = new Note({
      userId: req.user.id,
      title: title?.trim() || undefined,
      content: content.trim(),
    });
    await note.save();
    res.status(201).json(note);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/dashboard/notes/:id
 * Actualiza una nota existente del usuario.
 */
router.put("/notes/:id", async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id);
    const { title, content } = req.body ?? {};
    if (!content || typeof content !== "string" || !content.trim()) {
      throw new HttpError(400, "El contenido de la nota es obligatorio");
    }
    const updated = await Note.findOneAndUpdate(
      { _id: id, userId: req.user.id },
      {
        title: title?.trim() || undefined,
        content: content.trim(),
      },
      { new: true }
    );
    if (!updated) {
      throw new HttpError(404, "Nota no encontrada o no autorizada");
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/dashboard/notes/:id
 * Elimina una nota del usuario autenticado.
 */
router.delete("/notes/:id", async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id);
    const deleted = await Note.findOneAndDelete({ _id: id, userId: req.user.id });
    if (!deleted) {
      throw new HttpError(404, "Nota no encontrada o no autorizada");
    }
    res.json({ message: "Nota eliminada correctamente" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
