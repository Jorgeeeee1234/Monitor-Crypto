const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../data/User");
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");
const { validateObjectId } = require("../utils/validators");
const { HttpError } = require("../utils/httpErrors");
const router = express.Router();

/**
 * POST /api/users/register
 * Registra un nuevo usuario. Requiere nombre, apellido, dni, telefono, username, email y password.
 */
router.post("/register", async (req, res, next) => {
  try {
    const { nombre, apellido, dni, telefono, username, email, password, rol } = req.body;
    if (!nombre || !apellido || !dni || !telefono || !username || !email || !password) {
      throw new HttpError(400, "Todos los campos son obligatorios");
    }
    const existing = await User.findOne({ email });
    if (existing) {
      throw new HttpError(400, "El email ya está registrado");
    }
    const hashed = await bcrypt.hash(password, 12);
    const user = new User({
      nombre,
      apellido,
      dni,
      telefono,
      username,
      email,
      password: hashed,
      rol: rol === "admin" ? "admin" : "cliente",
    });
    await user.save();
    res.status(201).json({ message: "Usuario registrado correctamente" });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/users/login
 * Inicia sesión. Devuelve un JWT con los datos del usuario.
 */
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      throw new HttpError(400, "Email y password son obligatorios");
    }
    const user = await User.findOne({ email });
    if (!user) {
      throw new HttpError(404, "Usuario no encontrado");
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new HttpError(400, "Contraseña incorrecta");
    }
    const payload = { id: user._id, email: user.email, rol: user.rol };
    const token = jwt.sign(payload, process.env.JWT_SECRET || "", { expiresIn: "7d" });
    res.json({
      message: "Inicio de sesión exitoso",
      token,
      user: {
        id: user._id,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
        rol: user.rol,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users/profile
 * Devuelve el perfil del usuario autenticado (sin contraseña).
 */
router.get("/profile", auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      throw new HttpError(404, "Usuario no encontrado");
    }
    res.json(user);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/users/profile
 * Actualiza los datos básicos del perfil del usuario autenticado.
 */
router.put("/profile", auth, async (req, res, next) => {
  try {
    const allowedFields = ["nombre", "apellido", "telefono", "username"];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        const value = String(req.body[field]).trim();
        if (!value) {
          throw new HttpError(400, `El campo '${field}' no puede estar vacío`);
        }
        updates[field] = value;
      }
    }
    if (Object.keys(updates).length === 0) {
      throw new HttpError(400, "No se recibieron campos válidos para actualizar");
    }
    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      runValidators: true,
      select: "-password",
    });
    if (!user) {
      throw new HttpError(404, "Usuario no encontrado");
    }
    res.json({ message: "Perfil actualizado correctamente", user });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users
 * Devuelve todos los usuarios (solo admin).
 */
router.get("/", auth, admin, async (_req, res, next) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/users/:id/role
 * Cambia el rol de un usuario. Solo administradores.
 */
router.patch("/:id/role", auth, admin, async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id);
    const { rol } = req.body;
    if (!rol || !["admin", "cliente"].includes(rol)) {
      throw new HttpError(400, "Rol inválido");
    }
    const user = await User.findByIdAndUpdate(id, { rol }, { new: true }).select("-password");
    if (!user) {
      throw new HttpError(404, "Usuario no encontrado");
    }
    res.json({ message: "Rol actualizado", user });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/users/:id
 * Elimina un usuario. Solo administradores.
 */
router.delete("/:id", auth, admin, async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id);
    const user = await User.findByIdAndDelete(id);
    if (!user) {
      throw new HttpError(404, "Usuario no encontrado");
    }
    res.json({ message: "Usuario eliminado" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
