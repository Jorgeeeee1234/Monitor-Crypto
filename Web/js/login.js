// Script de manejo de inicio de sesión para Monitor Crypto
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  if (!loginForm) return;

  // Define la URL base del API Gateway.  Si el proyecto se aloja en un
  // dominio diferente, ajusta la ruta aquí.  Por defecto se asume
  // http://localhost:5000 porque el docker-compose expone el gateway en
  // ese puerto.
  const API_BASE = 'http://localhost:5000';
  const LOGIN_ENDPOINT = `${API_BASE}/node/api/users/login`;

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    if (!email || !password) {
      alert('Por favor introduce correo electrónico y contraseña');
      return;
    }
    try {
      const response = await fetch(LOGIN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (response.ok) {
        // Guarda el token y los datos del usuario en localStorage
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        // Redirige al panel principal (tanto para clientes como administradores)
        window.location.href = 'principal.html';
      } else {
        alert(data.message || 'Credenciales incorrectas');
      }
    } catch (err) {
      console.error('Error iniciando sesión:', err);
      alert('No se pudo conectar con el servidor');
    }
  });
});