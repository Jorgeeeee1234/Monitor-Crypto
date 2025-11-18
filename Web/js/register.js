// Script de manejo de registro de usuarios para Monitor Crypto
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registerForm');
  if (!form) return;

  const API_BASE = 'http://localhost:5000';
  const REGISTER_ENDPOINT = `${API_BASE}/node/api/users/register`;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const nombre = document.getElementById('nombre').value.trim();
    const apellido = document.getElementById('apellido').value.trim();
    const dni = document.getElementById('dni').value.trim();
    const telefono = document.getElementById('telefono').value.trim();
    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const rol = document.getElementById('rol').value;
    if (!nombre || !apellido || !dni || !telefono || !username || !email || !password) {
      alert('Completa todos los campos obligatorios');
      return;
    }
    const payload = { nombre, apellido, dni, telefono, username, email, password, rol };
    try {
      const response = await fetch(REGISTER_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (response.ok) {
        alert('Usuario registrado con éxito');
        window.location.href = 'login.html';
      } else {
        alert(data.message || data.error || 'Error en el registro');
      }
    } catch (err) {
      console.error('Error registrando usuario:', err);
      alert('No se pudo conectar con el servidor');
    }
  });
});