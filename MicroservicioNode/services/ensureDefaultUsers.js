const bcrypt = require("bcryptjs");
const User = require("../data/User");

/**
 * Crea un usuario administrador por defecto si la colección "users" está vacía.
 * Los datos se obtienen de las variables de entorno DEFAULT_ADMIN_*.
 */
async function ensureDefaultUsers() {
  const count = await User.countDocuments();
  if (count > 0) {
    return;
  }
  const {
    DEFAULT_ADMIN_EMAIL,
    DEFAULT_ADMIN_PASSWORD,
    DEFAULT_ADMIN_DNI,
    DEFAULT_ADMIN_TELEFONO,
    DEFAULT_ADMIN_USERNAME,
    DEFAULT_ADMIN_NOMBRE,
    DEFAULT_ADMIN_APELLIDO,
  } = process.env;
  if (!DEFAULT_ADMIN_EMAIL || !DEFAULT_ADMIN_PASSWORD) {
    console.warn(
      "[Seed] Variables de entorno DEFAULT_ADMIN_EMAIL y DEFAULT_ADMIN_PASSWORD no están definidas. No se creará usuario administrador."
    );
    return;
  }
  const hashed = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 12);
  const admin = new User({
    nombre: DEFAULT_ADMIN_NOMBRE || "Admin",
    apellido: DEFAULT_ADMIN_APELLIDO || "",
    dni: DEFAULT_ADMIN_DNI || "",
    telefono: DEFAULT_ADMIN_TELEFONO || "",
    username: DEFAULT_ADMIN_USERNAME || DEFAULT_ADMIN_EMAIL,
    email: DEFAULT_ADMIN_EMAIL,
    password: hashed,
    rol: "admin",
  });
  await admin.save();
  console.log(`[Seed] Usuario administrador predeterminado creado: ${DEFAULT_ADMIN_EMAIL}`);
}

module.exports = {
  ensureDefaultUsers,
};