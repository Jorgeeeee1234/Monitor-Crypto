const API_GATEWAY_BASE = 'http://localhost:5000';
const NODE_API_BASE = `${API_GATEWAY_BASE}/node/api`;
const NODE_ADMIN_API = `${API_GATEWAY_BASE}/node/api/admin`;
const PY_ADMIN_API = `${API_GATEWAY_BASE}/python/api/admin`;

const navConfig = [
  ['btn-mongo', 'mongo'],
  ['btn-postgres', 'postgres'],
  ['btn-tables', 'tables'],
  ['btn-users', 'users'],
  ['btn-history', 'history'],
  ['btn-favorites-admin', 'favorites'],
  ['btn-functionalities', 'functionalities'],
];

const adminState = {
  mongoCollections: [],
  postgresTables: [],
  selectedMongo: null,
  selectedPostgres: null,
  users: [],
  selectedHistoryUser: null,
  selectedFavoritesUser: null,
  metrics: {
    favorites: {
      total: null,
      avgPerUser: null,
      topSymbol: null,
      topList: [],
      loaded: false,
    },
    health: {
      latency: {
        mongo: null,
        postgres: null,
      },
      errors: [],
    },
  },
};

let authToken = null;

function ensureAdmin() {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (!token || user.rol !== 'admin') {
    alert('No autorizado. Inicia sesion con una cuenta de administrador.');
    window.location.href = 'login.html';
    return null;
  }
  authToken = token;
  return token;
}

function authHeaders() {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

async function fetchJson(url, options = {}) {
  const { skipAuth = false, headers = {}, ...rest } = options;
  const finalHeaders = {
    Accept: 'application/json',
    ...(skipAuth ? {} : authHeaders()),
    ...headers,
  };
  const response = await fetch(url, {
    ...rest,
    headers: finalHeaders,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error || data?.detail || data?.message || 'Solicitud no satisfactoria';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}

function showSection(id) {
  document.querySelectorAll('.admin-section').forEach((section) => {
    section.classList.toggle('active', section.id === id);
  });
  document.querySelectorAll('.admin-nav[data-target]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-target') === id);
  });
}

function setLoadingMessage(container, message) {
  container.innerHTML = `<p class="admin-empty">${message}</p>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCellValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function formatNumber(value, decimals = 2) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function resetFavoritesList() {
  const container = document.getElementById('favoritesList');
  if (!container) return;
  container.innerHTML = '<li class="favorites-empty">Selecciona un usuario para ver sus favoritos.</li>';
}

function setTextContent(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setFavoritesKpisLoading() {
  ['kpiFavoritesTotal', 'kpiFavoritesAvg', 'kpiFavoritesTop'].forEach((id) => setTextContent(id, 'Cargando...'));
}

function updateFavoritesKpis(data) {
  const total = Number(data?.totalFavorites);
  const avg = Number(data?.avgFavoritesPerUser);
  const topList = Array.isArray(data?.topFavorites) ? data.topFavorites : [];
  const topEntry = topList.length > 0 ? topList[0] : null;
  const labelParts = [];
  if (topEntry?.symbol) labelParts.push(String(topEntry.symbol).toUpperCase());
  if (topEntry?.name && !labelParts.includes(String(topEntry.name))) labelParts.push(topEntry.name);
  const topLabelBase = labelParts.length > 0 ? labelParts.join(' · ') : 'Sin datos';
  const topCount = topEntry && Number.isFinite(Number(topEntry.count)) ? Number(topEntry.count) : 0;
  const topLabel = topEntry ? `${topLabelBase} (${formatNumber(topCount, 0)})` : '-';
  adminState.metrics.favorites = {
    total: Number.isFinite(total) ? total : null,
    avgPerUser: Number.isFinite(avg) ? avg : null,
    topSymbol: topEntry || null,
    topList,
    loaded: true,
  };
  setTextContent('kpiFavoritesTotal', Number.isFinite(total) ? formatNumber(total, 0) : '-');
  setTextContent('kpiFavoritesAvg', Number.isFinite(avg) ? formatNumber(avg, 2) : '-');
  setTextContent('kpiFavoritesTop', topLabel);
}

function handleFavoritesKpisError() {
  adminState.metrics.favorites = {
    total: null,
    avgPerUser: null,
    topSymbol: null,
    topList: [],
    loaded: false,
  };
  ['kpiFavoritesTotal', 'kpiFavoritesAvg', 'kpiFavoritesTop'].forEach((id) => setTextContent(id, '-'));
  applyFavoritesFallbackMetrics();
}

function applyFavoritesFallbackMetrics() {
  if (adminState.metrics.favorites.loaded) return;
  const favoritesCollection = adminState.mongoCollections.find((col) => col?.name === 'favorites');
  if (favoritesCollection && Number.isFinite(Number(favoritesCollection.documentCount))) {
    const total = Number(favoritesCollection.documentCount);
    const usersCount = adminState.users.length;
    adminState.metrics.favorites.total = total;
    adminState.metrics.favorites.avgPerUser = usersCount > 0 ? total / usersCount : null;
    adminState.metrics.favorites.topList = [];
    setTextContent('kpiFavoritesTotal', formatNumber(total, 0));
    setTextContent(
      'kpiFavoritesAvg',
      usersCount > 0 ? formatNumber(total / usersCount, 2) : '-'
    );
  }
  if (!adminState.metrics.favorites.topSymbol) {
    adminState.metrics.favorites.topList = [];
    setTextContent('kpiFavoritesTop', '-');
  }
}

function recordHealthError(message) {
  const errors = adminState.metrics.health.errors;
  const entry = `${new Date().toLocaleTimeString()} · ${message}`;
  errors.unshift(entry);
  if (errors.length > 3) errors.length = 3;
  updateHealthKpis();
}

function updateHealthKpis() {
  const latency = adminState.metrics.health.latency;
  const latencyParts = [];
  if (Number.isFinite(latency.mongo)) latencyParts.push(`Mongo ${Math.round(latency.mongo)} ms`);
  if (Number.isFinite(latency.postgres)) latencyParts.push(`Postgres ${Math.round(latency.postgres)} ms`);
  setTextContent('kpiLatencyAvg', latencyParts.length > 0 ? latencyParts.join(' · ') : 'Sin datos');

  const collectionsCount = adminState.mongoCollections.length + adminState.postgresTables.length;
  setTextContent('kpiCollectionsQueried', collectionsCount > 0 ? formatNumber(collectionsCount, 0) : '-');

  const errors = adminState.metrics.health.errors;
  setTextContent('kpiRecentErrors', errors.length > 0 ? errors[0] : 'Sin incidencias');
}

async function ensureFavoritesMetricsLoaded() {
  if (adminState.metrics.favorites.loaded) return;
  await loadFavoritesMetrics();
  applyFavoritesFallbackMetrics();
}

let jsPdfLoader = null;
function ensureJsPdf() {
  if (window.jspdf?.jsPDF) {
    return Promise.resolve(window.jspdf.jsPDF);
  }
  if (!jsPdfLoader) {
    jsPdfLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
      script.onload = () => {
        if (window.jspdf?.jsPDF) {
          resolve(window.jspdf.jsPDF);
        } else {
          reject(new Error('jsPDF no disponible tras la carga.'));
        }
      };
      script.onerror = () => reject(new Error('No se pudo cargar jsPDF desde la CDN.'));
      document.head.appendChild(script);
    });
  }
  return jsPdfLoader;
}

function drawSectionTitle(doc, text, y) {
  doc.setFontSize(14);
  doc.setTextColor(29, 78, 216);
  doc.text(text, 14, y);
  doc.setTextColor(15, 23, 42);
  return y + 8;
}

function openPrintWindow(title, contentHtml, existingWindow = null) {
  const reportWindow = existingWindow || window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
  if (!reportWindow) {
    alert('No se pudo abrir la ventana de impresión. Habilita las ventanas emergentes para generar el PDF.');
    return;
  }
  const styles = `
    :root { color-scheme: light; }
    body {
      font-family: 'Segoe UI', Tahoma, sans-serif;
      margin: 0;
      padding: 32px;
      background: #f1f5f9;
      color: #0f172a;
    }
    .report-container {
      max-width: 860px;
      margin: 0 auto;
      background: #ffffff;
      padding: 32px;
      border-radius: 18px;
      box-shadow: 0 24px 48px rgba(15, 23, 42, 0.14);
    }
    .report-header h1 {
      margin: 0 0 0.35rem;
      font-size: 1.75rem;
    }
    .report-header p {
      margin: 0;
      color: #64748b;
      font-size: 0.95rem;
    }
    section {
      margin-top: 1.75rem;
    }
    section h2 {
      margin: 0 0 0.75rem;
      font-size: 1.2rem;
      color: #1d4ed8;
    }
    .report-metrics {
      list-style: none;
      margin: 0;
      padding: 0;
      border: 1px solid rgba(148, 163, 184, 0.3);
      border-radius: 14px;
      overflow: hidden;
    }
    .report-metrics li {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.75rem 1rem;
      background: rgba(248, 250, 252, 0.75);
      border-bottom: 1px solid rgba(148, 163, 184, 0.2);
    }
    .report-metrics li:last-child {
      border-bottom: none;
    }
    .report-label {
      font-weight: 600;
      color: #475569;
    }
    .report-value {
      font-weight: 700;
      color: #1d4ed8;
    }
    .report-note {
      margin-top: 0.85rem;
      font-size: 0.9rem;
      color: #64748b;
    }
    .report-list {
      margin: 0.6rem 0 0;
      padding-left: 1.2rem;
      color: #0f172a;
    }
    .report-list li {
      margin-bottom: 0.4rem;
    }
    .report-strong {
      font-weight: 700;
      color: #0f172a;
    }
    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }
      .report-container {
        box-shadow: none;
        border-radius: 0;
      }
    }
  `;
  const documentHtml = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(title)}</title>
      <style>${styles}</style>
    </head>
    <body>
      <div class="report-container">
        ${contentHtml}
      </div>
    </body>
    </html>
  `;
  reportWindow.document.open();
  reportWindow.document.write(documentHtml);
  reportWindow.document.close();
  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    try {
      reportWindow.focus();
      reportWindow.print();
    } catch (_error) {
      // Ignorar errores de impresión, el usuario puede cerrar la ventana manualmente
    }
  };
  reportWindow.addEventListener('load', triggerPrint, { once: true });
  setTimeout(triggerPrint, 400);
}

function buildFavoritesReportHtml() {
  applyFavoritesFallbackMetrics();
  const generatedAt = new Date().toLocaleString();
  const favorites = adminState.metrics.favorites;
  const totalText = document.getElementById('kpiFavoritesTotal')?.textContent || '-';
  const avgText = document.getElementById('kpiFavoritesAvg')?.textContent || '-';
  const topItems = Array.isArray(favorites.topList) && favorites.topList.length > 0
    ? favorites.topList
    : favorites.topSymbol
    ? [favorites.topSymbol]
    : [];
  const topListHtml = topItems.length > 0
    ? `<ol class="report-list">
        ${topItems
          .map((item) => {
            const parts = [];
            if (item?.symbol) parts.push(String(item.symbol).toUpperCase());
            if (item?.name && !parts.includes(String(item.name))) parts.push(String(item.name));
            const label = parts.length > 0 ? parts.join(' · ') : 'Sin nombre';
            const count = Number.isFinite(Number(item?.count)) ? formatNumber(Number(item.count), 0) : '-';
            return `<li><span class="report-strong">${escapeHtml(label)}</span> — ${escapeHtml(`${count} favoritos`)}</li>`;
          })
          .join('')}
      </ol>`
    : '<p>No hay datos suficientes para calcular el top de criptomonedas.</p>';
  const note = favorites.loaded
    ? ''
    : '<p class="report-note">Datos estimados a partir de las colecciones actuales.</p>';
  return `
    <header class="report-header">
      <h1>Informe de KPIs · Favoritos</h1>
      <p>Generado: ${escapeHtml(generatedAt)}</p>
    </header>
    <section>
      <h2>Resumen rápido</h2>
      <ul class="report-metrics">
        <li><span class="report-label">Favoritos totales</span><span class="report-value">${escapeHtml(totalText)}</span></li>
        <li><span class="report-label">Promedio por usuario</span><span class="report-value">${escapeHtml(avgText)}</span></li>
        <li><span class="report-label">Usuarios registrados</span><span class="report-value">${escapeHtml(formatNumber(adminState.users.length, 0))}</span></li>
      </ul>
      ${note}
    </section>
    <section>
      <h2>Top criptomonedas guardadas</h2>
      ${topListHtml}
    </section>
  `;
}

function buildHealthReportHtml() {
  updateHealthKpis();
  const generatedAt = new Date().toLocaleString();
  const latencyText = document.getElementById('kpiLatencyAvg')?.textContent || 'Sin datos';
  const collectionsText = document.getElementById('kpiCollectionsQueried')?.textContent || '-';
  const errors = adminState.metrics.health.errors;
  const errorListHtml = errors.length > 0
    ? `<ul class="report-list">
        ${errors.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}
      </ul>`
    : '<p>No se registraron incidencias recientes.</p>';
  const services = [
    {
      name: 'MongoDB',
      latency: adminState.metrics.health.latency.mongo,
      collections: adminState.mongoCollections.length,
    },
    {
      name: 'PostgreSQL',
      latency: adminState.metrics.health.latency.postgres,
      collections: adminState.postgresTables.length,
    },
  ];
  const servicesHtml = `
    <ul class="report-metrics">
      ${services
        .map((service) => {
          const latency = Number.isFinite(service.latency)
            ? `${formatNumber(service.latency, 0)} ms`
            : 'Sin datos';
          const resources = formatNumber(service.collections, 0);
          return `<li><span class="report-label">${escapeHtml(service.name)}</span><span class="report-value">${escapeHtml(latency)} · ${resources} recursos</span></li>`;
        })
        .join('')}
    </ul>
  `;

  return `
    <header class="report-header">
      <h1>Informe de Salud de la Plataforma</h1>
      <p>Generado: ${escapeHtml(generatedAt)}</p>
    </header>
    <section>
      <h2>Indicadores clave</h2>
      <ul class="report-metrics">
        <li><span class="report-label">Latencia media APIs</span><span class="report-value">${escapeHtml(latencyText)}</span></li>
        <li><span class="report-label">Colecciones/tablas consultadas</span><span class="report-value">${escapeHtml(collectionsText)}</span></li>
        <li><span class="report-label">Errores recientes</span><span class="report-value">${escapeHtml(errors.length > 0 ? String(errors.length) : '0')}</span></li>
      </ul>
    </section>
    <section>
      <h2>Servicios monitorizados</h2>
      ${servicesHtml}
    </section>
    <section>
      <h2>Incidencias</h2>
      ${errorListHtml}
    </section>
  `;
}

async function handleExportFavoritesPdf() {
  try {
    const jsPDF = await ensureJsPdf();
    await ensureFavoritesMetricsLoaded();
    const doc = new jsPDF();
    let y = 20;
    const now = new Date().toLocaleString();
    const favorites = adminState.metrics.favorites;
    const totalText = document.getElementById('kpiFavoritesTotal')?.textContent || '-';
    const avgText = document.getElementById('kpiFavoritesAvg')?.textContent || '-';
    const topItems = Array.isArray(favorites.topList) && favorites.topList.length > 0
      ? favorites.topList
      : favorites.topSymbol
      ? [favorites.topSymbol]
      : [];

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Informe de KPIs · Favoritos', 105, y, { align: 'center' });
    y += 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(`Generado: ${now}`, 14, y);
    y += 14;

    y = drawSectionTitle(doc, 'Resumen rápido', y);
    doc.setFontSize(11);
    const pairs = [
      ['Favoritos totales', totalText],
      ['Promedio por usuario', avgText],
      ['Usuarios registrados', formatNumber(adminState.users.length, 0)],
    ];
    pairs.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(`${label}:`, 14, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value), 70, y);
      y += 7;
    });
    if (!favorites.loaded) {
      doc.setFont('helvetica', 'italic');
      doc.text('Datos estimados a partir de las colecciones actuales.', 14, y);
      y += 10;
    } else {
      y += 4;
    }

    y = drawSectionTitle(doc, 'Top criptomonedas guardadas', y);
    doc.setFont('helvetica', 'normal');
    if (topItems.length === 0) {
      doc.text('No hay datos suficientes para calcular el top.', 14, y);
      y += 7;
    } else {
      topItems.forEach((item, index) => {
        const parts = [];
        if (item?.symbol) parts.push(String(item.symbol).toUpperCase());
        if (item?.name && !parts.includes(String(item.name))) parts.push(String(item.name));
        const label = parts.length > 0 ? parts.join(' · ') : 'Sin nombre';
        const count = Number.isFinite(Number(item?.count)) ? formatNumber(Number(item.count), 0) : '-';
        const line = `${index + 1}. ${label} — ${count} favoritos`;
        doc.text(line, 14, y);
        y += 7;
        if (y > 280 && index < topItems.length - 1) {
          doc.addPage();
          y = 20;
        }
      });
    }

    const fileName = `kpi-favoritos-${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(fileName);
  } catch (error) {
    console.error('Error al generar PDF de favoritos:', error);
    alert(`No se pudo generar el PDF: ${error.message}`);
  }
}

function handleExportHealthPdf() {
  ensureJsPdf()
    .then((jsPDF) => {
      updateHealthKpis();
      const doc = new jsPDF();
      let y = 20;
      const now = new Date().toLocaleString();
      const latencyText = document.getElementById('kpiLatencyAvg')?.textContent || 'Sin datos';
      const collectionsText = document.getElementById('kpiCollectionsQueried')?.textContent || '-';
      const errors = adminState.metrics.health.errors;
      const services = [
        {
          name: 'MongoDB',
          latency: adminState.metrics.health.latency.mongo,
          resources: adminState.mongoCollections.length,
        },
        {
          name: 'PostgreSQL',
          latency: adminState.metrics.health.latency.postgres,
          resources: adminState.postgresTables.length,
        },
      ];

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('Informe de Salud de la Plataforma', 105, y, { align: 'center' });
      y += 10;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(`Generado: ${now}`, 14, y);
      y += 14;

      y = drawSectionTitle(doc, 'Indicadores clave', y);
      const healthPairs = [
        ['Latencia media APIs', latencyText],
        ['Colecciones/tablas consultadas', collectionsText],
        ['Errores recientes', errors.length > 0 ? String(errors.length) : '0'],
      ];
      healthPairs.forEach(([label, value]) => {
        doc.setFont('helvetica', 'bold');
        doc.text(`${label}:`, 14, y);
        doc.setFont('helvetica', 'normal');
        doc.text(String(value), 90, y);
        y += 7;
      });
      y += 4;

      y = drawSectionTitle(doc, 'Servicios monitorizados', y);
      services.forEach((service, index) => {
        const latency = Number.isFinite(service.latency)
          ? `${formatNumber(service.latency, 0)} ms`
          : 'Sin datos';
        const resources = formatNumber(service.resources, 0);
        doc.setFont('helvetica', 'bold');
        doc.text(`${service.name}`, 14, y);
        doc.setFont('helvetica', 'normal');
        doc.text(`Latencia: ${latency}`, 70, y);
        doc.text(`Recursos: ${resources}`, 140, y);
        y += 7;
        if (y > 280 && index < services.length - 1) {
          doc.addPage();
          y = 20;
        }
      });
      y += 4;

      y = drawSectionTitle(doc, 'Incidencias recientes', y);
      if (errors.length === 0) {
        doc.text('No se registraron incidencias recientes.', 14, y);
      } else {
        errors.forEach((entry, index) => {
          doc.text(`${index + 1}. ${entry}`, 14, y);
          y += 7;
          if (y > 280 && index < errors.length - 1) {
            doc.addPage();
            y = 20;
          }
        });
      }

      const fileName = `salud-plataforma-${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(fileName);
    })
    .catch((error) => {
      console.error('Error al generar PDF de salud:', error);
      alert(`No se pudo generar el PDF: ${error.message}`);
    });
}

function renderFavoritesSummary(user, favorites, state = 'idle') {
  const summary = document.getElementById('favoritesSummary');
  if (!summary) return;
  if (state === 'loading') {
    summary.innerHTML = '<p class="favorites-card__hint">Cargando favoritos...</p>';
    return;
  }
  if (state === 'error') {
    summary.innerHTML = '<p class="favorites-card__hint">No se pudieron cargar los favoritos.</p>';
    return;
  }
  if (!user) {
    summary.innerHTML = '<p class="favorites-card__hint">Selecciona un usuario para ver sus favoritos.</p>';
    return;
  }
  const fullName = `${user.nombre || ''} ${user.apellido || ''}`.trim()
    || user.username
    || user.email
    || 'Usuario sin nombre';
  const total = Array.isArray(favorites) ? favorites.length : 0;
  summary.innerHTML = `
    <div class="favorites-summary-content">
      <p class="favorites-summary-user">${escapeHtml(fullName)}</p>
      <p class="favorites-summary-count">${escapeHtml(`${total} favoritos guardados`)}</p>
    </div>
  `;
}

function renderHistoryProfile(data) {
  const fallback = '-';
  const fields = {
    historyProfileName: data?.nombre || fallback,
    historyProfileSurname: data?.apellido || fallback,
    historyProfileUsername: data?.username || fallback,
    historyProfileEmail: data?.email || fallback,
    historyProfilePhone: data?.telefono || fallback,
    historyProfileDni: data?.dni || fallback,
    historyProfileRole: data?.rol || fallback,
    historyProfileRegisteredAt: data?.fechaRegistro ? formatDateTime(data.fechaRegistro) : fallback,
  };
  Object.entries(fields).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  });
}

function renderHistoryUserSelect() {
  const select = document.getElementById('historyUserSelect');
  if (!select) return;
  const placeholderOption = '<option value="">Selecciona un usuario</option>';
  if (!Array.isArray(adminState.users) || adminState.users.length === 0) {
    select.innerHTML = placeholderOption;
    select.value = '';
    select.disabled = true;
    adminState.selectedHistoryUser = null;
    renderHistoryProfile(null);
    return;
  }
  const options = adminState.users
    .map((user) => {
      const fullName = `${user.nombre || ''} ${user.apellido || ''}`.trim()
        || user.username
        || user.email
        || 'Sin nombre';
      return `<option value="${escapeHtml(user._id)}">${escapeHtml(fullName)}</option>`;
    })
    .join('');
  select.innerHTML = `${placeholderOption}${options}`;
  select.disabled = false;

  if (adminState.selectedHistoryUser) {
    const match = adminState.users.find((user) => String(user._id) === String(adminState.selectedHistoryUser));
    if (match) {
      select.value = String(adminState.selectedHistoryUser);
      renderHistoryProfile(match);
      return;
    }
    adminState.selectedHistoryUser = null;
  }

  select.value = '';
  renderHistoryProfile(null);
}

function renderFavoritesUserSelect() {
  const select = document.getElementById('favoritesUserSelect');
  if (!select) return;
  const placeholderOption = '<option value="">Selecciona un usuario</option>';
  if (!Array.isArray(adminState.users) || adminState.users.length === 0) {
    select.innerHTML = placeholderOption;
    select.value = '';
    select.disabled = true;
    adminState.selectedFavoritesUser = null;
    renderFavoritesSummary(null);
    resetFavoritesList();
    return;
  }
  const options = adminState.users
    .map((user) => {
      const fullName = `${user.nombre || ''} ${user.apellido || ''}`.trim()
        || user.username
        || user.email
        || 'Sin nombre';
      return `<option value="${escapeHtml(user._id)}">${escapeHtml(fullName)}</option>`;
    })
    .join('');
  select.innerHTML = `${placeholderOption}${options}`;
  select.disabled = false;

  if (adminState.selectedFavoritesUser) {
    const match = adminState.users.find((user) => String(user._id) === String(adminState.selectedFavoritesUser));
    if (match) {
      select.value = String(adminState.selectedFavoritesUser);
      renderFavoritesSummary(match, null);
      return;
    }
    adminState.selectedFavoritesUser = null;
  }

  select.value = '';
  renderFavoritesSummary(null);
  resetFavoritesList();
}

function renderTablePreview(container, titleEl, metaEl, title, meta, columns, rows) {
  titleEl.textContent = title;
  metaEl.textContent = meta || '';
  if (!rows || rows.length === 0) {
    container.classList.add('admin-empty');
    container.innerHTML = 'Sin datos disponibles.';
    return;
  }
  container.classList.remove('admin-empty');
  const header = columns.map((col) => `<th>${escapeHtml(col)}</th>`).join('');
  const body = rows
    .map((row) => {
      const cells = columns.map((col) => `<td>${escapeHtml(formatCellValue(row[col]))}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  container.innerHTML = `<div class="admin-preview-scroll"><table class="admin-data-table"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function buildColumnsFromRows(rows) {
  const set = new Set();
  rows.forEach((row) => {
    Object.keys(row || {}).forEach((key) => set.add(key));
  });
  return Array.from(set);
}

async function loadMongoCollections(showStatus = true) {
  const listEl = document.getElementById('mongoCollections');
  if (!listEl) return;
  if (showStatus) setLoadingMessage(listEl, 'Cargando colecciones...');
  const startTime = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  try {
    const data = await fetchJson(`${NODE_ADMIN_API}/mongo/collections`, {
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
    });
    adminState.mongoCollections = Array.isArray(data.collections) ? data.collections : [];
    updateMongoPanel();
    updateHealthKpis();
    renderMongoCollectionList();
  } catch (error) {
    adminState.mongoCollections = [];
    updateMongoPanel();
    recordHealthError(`MongoDB: ${error.message}`);
    setLoadingMessage(listEl, `No se pudieron cargar las colecciones: ${escapeHtml(error.message)}`);
  } finally {
    const endTime = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const duration = Math.max(0, Math.round(endTime - startTime));
    adminState.metrics.health.latency.mongo = duration;
    updateHealthKpis();
    applyFavoritesFallbackMetrics();
  }
}

function renderMongoCollectionList() {
  const listEl = document.getElementById('mongoCollections');
  if (!listEl) return;
  if (adminState.mongoCollections.length === 0) {
    setLoadingMessage(listEl, 'No hay colecciones disponibles.');
    return;
  }
  listEl.innerHTML = adminState.mongoCollections
    .map((collection) => {
      const countLabel = collection.documentCount !== null && collection.documentCount !== undefined
        ? `${collection.documentCount} docs`
        : 'sin datos';
      const activeClass = adminState.selectedMongo === collection.name ? 'active' : '';
      return `
        <button class="admin-table-button ${activeClass}" data-source="mongo" data-name="${escapeHtml(collection.name)}">
          <span>${escapeHtml(collection.name)}</span>
          <small>${escapeHtml(countLabel)}</small>
        </button>`;
    })
    .join('');
}

async function handleMongoSelection(name) {
  const preview = document.getElementById('mongoTablePreview');
  const titleEl = document.getElementById('mongoPreviewTitle');
  const metaEl = document.getElementById('mongoPreviewMeta');
  if (!preview || !titleEl || !metaEl) return;
  adminState.selectedMongo = name;
  renderMongoCollectionList();
  preview.classList.add('admin-empty');
  preview.textContent = 'Cargando datos...';
  try {
    const data = await fetchJson(`${NODE_ADMIN_API}/mongo/collections/${encodeURIComponent(name)}?limit=25`, {
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
    });
    const rows = Array.isArray(data.rows) ? data.rows : [];
    rows.forEach((row) => {
      if (row && typeof row === 'object' && row._id) {
        row._id = String(row._id);
      }
    });
    const columns = buildColumnsFromRows(rows);
    const metaText = data.documentCount !== null && data.documentCount !== undefined
      ? `Mostrando ${rows.length} de ${data.documentCount}`
      : `Mostrando ${rows.length} registros`;
    renderTablePreview(preview, titleEl, metaEl, `Coleccion: ${name}`, metaText, columns, rows);
  } catch (error) {
    preview.classList.add('admin-empty');
    preview.textContent = `No se pudo cargar la coleccion: ${error.message}`;
    metaEl.textContent = '';
  }
}

async function loadPostgresTables(showStatus = true) {
  const listEl = document.getElementById('postgresTables');
  if (!listEl) return;
  if (showStatus) setLoadingMessage(listEl, 'Cargando tablas...');
  const startTime = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  try {
    const data = await fetchJson(`${PY_ADMIN_API}/postgres/tables?include_counts=true`);
    adminState.postgresTables = Array.isArray(data.tables) ? data.tables : [];
    updatePostgresPanel();
    updateHealthKpis();
    renderPostgresTableList();
  } catch (error) {
    adminState.postgresTables = [];
    updatePostgresPanel();
    recordHealthError(`PostgreSQL: ${error.message}`);
    setLoadingMessage(listEl, `No se pudieron cargar las tablas: ${escapeHtml(error.message)}`);
  } finally {
    const endTime = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const duration = Math.max(0, Math.round(endTime - startTime));
    adminState.metrics.health.latency.postgres = duration;
    updateHealthKpis();
  }
}

function renderPostgresTableList() {
  const listEl = document.getElementById('postgresTables');
  if (!listEl) return;
  if (adminState.postgresTables.length === 0) {
    setLoadingMessage(listEl, 'No hay tablas registradas.');
    return;
  }
  listEl.innerHTML = adminState.postgresTables
    .map((table) => {
      const columnCount = Array.isArray(table.columns) ? table.columns.length : 0;
      const rowInfo = table.row_count !== null && table.row_count !== undefined
        ? `${table.row_count} filas`
        : `${columnCount} columnas`;
      const activeClass = adminState.selectedPostgres === table.name ? 'active' : '';
      return `
        <button class="admin-table-button ${activeClass}" data-source="postgres" data-name="${escapeHtml(table.name)}">
          <span>${escapeHtml(table.name)}</span>
          <small>${escapeHtml(rowInfo)}</small>
        </button>`;
    })
    .join('');
}

async function handlePostgresSelection(name) {
  const preview = document.getElementById('postgresTablePreview');
  const titleEl = document.getElementById('postgresPreviewTitle');
  const metaEl = document.getElementById('postgresPreviewMeta');
  if (!preview || !titleEl || !metaEl) return;
  adminState.selectedPostgres = name;
  renderPostgresTableList();
  preview.classList.add('admin-empty');
  preview.textContent = 'Cargando datos...';
  try {
    const data = await fetchJson(`${PY_ADMIN_API}/postgres/tables/${encodeURIComponent(name)}?limit=25`);
    const rows = Array.isArray(data.rows) ? data.rows : [];
    const columns = Array.isArray(data.columns) && data.columns.length > 0
      ? data.columns
      : buildColumnsFromRows(rows);
    const tableInfo = adminState.postgresTables.find((table) => table.name === name);
    const metaText = tableInfo && tableInfo.row_count !== null && tableInfo.row_count !== undefined
      ? `${rows.length} filas mostradas de ${tableInfo.row_count}`
      : `${rows.length} filas mostradas`;
    renderTablePreview(preview, titleEl, metaEl, `Tabla: ${name}`, metaText, columns, rows);
  } catch (error) {
    preview.classList.add('admin-empty');
    preview.textContent = `No se pudo cargar la tabla: ${error.message}`;
    metaEl.textContent = '';
  }
}

async function loadUsers() {
  const usersList = document.getElementById('usersList');
  const historySelect = document.getElementById('historyUserSelect');
  const favoritesSelect = document.getElementById('favoritesUserSelect');
  if (!authToken || !usersList) return;
  usersList.innerHTML = '<li class="admin-empty">Cargando usuarios...</li>';
  if (historySelect) {
    historySelect.innerHTML = '<option value="">Cargando usuarios...</option>';
    historySelect.disabled = true;
  }
  if (favoritesSelect) {
    favoritesSelect.innerHTML = '<option value="">Cargando usuarios...</option>';
    favoritesSelect.disabled = true;
  }
  adminState.users = [];
  try {
    const data = await fetchJson(`${NODE_API_BASE}/users`, {
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
    });
    adminState.users = Array.isArray(data) ? data : [];
    if (!Array.isArray(data) || data.length === 0) {
      usersList.innerHTML = '<li class="admin-empty">No hay usuarios registrados.</li>';
      renderHistoryUserSelect();
      renderFavoritesUserSelect();
      return;
    }
    usersList.innerHTML = data
      .map(
        (u) => `
        <li data-id="${escapeHtml(u._id)}" class="user-item">
          <span>${escapeHtml(`${u.nombre} ${u.apellido}`.trim())}</span>
          <small>${escapeHtml(u.email)} - ${escapeHtml(u.rol)}</small>
        </li>`
      )
      .join('');
    renderHistoryUserSelect();
    renderFavoritesUserSelect();
    applyFavoritesFallbackMetrics();
  } catch (error) {
    adminState.users = [];
    usersList.innerHTML = `<li class="admin-empty">Error al cargar usuarios: ${escapeHtml(error.message)}</li>`;
    renderHistoryUserSelect();
    renderFavoritesUserSelect();
    applyFavoritesFallbackMetrics();
  }
}

async function loadFavoritesMetrics() {
  if (!authToken) return;
  setFavoritesKpisLoading();
  try {
    const data = await fetchJson(`${NODE_ADMIN_API}/favorites/metrics`, {
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
    });
    updateFavoritesKpis(data);
  } catch (error) {
    handleFavoritesKpisError();
    recordHealthError(`KPIs Favoritos: ${error.message}`);
  }
}

async function loadFavs(userId) {
  const container = document.getElementById('favoritesList');
  if (!authToken || !container) return;
  if (!userId) {
    adminState.selectedFavoritesUser = null;
    renderFavoritesSummary(null);
    resetFavoritesList();
    return;
  }
  const selectedUser = adminState.users.find((user) => String(user._id) === String(userId));
  renderFavoritesSummary(selectedUser || null, null, 'loading');
  container.innerHTML = '<li class="favorites-empty">Cargando favoritos...</li>';
  try {
    const data = await fetchJson(`${NODE_ADMIN_API}/favorites/${encodeURIComponent(userId)}`, {
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
    });
    if (!Array.isArray(data) || data.length === 0) {
      renderFavoritesSummary(selectedUser || null, []);
      container.innerHTML = '<li class="favorites-empty">No hay favoritos registrados.</li>';
      return;
    }
    renderFavoritesSummary(selectedUser || null, data);
    container.innerHTML = data
      .map((item) => {
        const symbol = (item.symbol || '').toString().toUpperCase();
        const name = item.name || '';
        const priceText = item.current_price != null ? formatNumber(item.current_price) : '-';
        const changeAvailable = typeof item.price_change_percentage_24h === 'number' && !Number.isNaN(item.price_change_percentage_24h);
        const changeText = changeAvailable ? `${item.price_change_percentage_24h >= 0 ? '+' : ''}${formatNumber(item.price_change_percentage_24h, 2)} %` : null;
        const metaParts = [];
        if (priceText !== '-') metaParts.push(`Precio: ${priceText}`);
        if (changeText) metaParts.push(`Variacion 24h: ${changeText}`);
        return `
          <li>
            <span class="favorite-symbol">${escapeHtml(symbol || '-')}</span>
            <span class="favorite-name">${escapeHtml(name || symbol || '-')}</span>
            ${metaParts.length > 0 ? `<span class="favorite-meta">${escapeHtml(metaParts.join(' | '))}</span>` : ''}
          </li>`;
      })
      .join('');
  } catch (error) {
    renderFavoritesSummary(selectedUser || null, [], 'error');
    container.innerHTML = '<li class="favorites-empty">No hay favoritos disponibles en este momento.</li>';
  }
}

function renderInfraPanels() {
  const mongoStatsEl = document.getElementById('mongoStats');
  const mongoOpsList = document.getElementById('mongoOpsList');
  const pgStatsEl = document.getElementById('pgStats');
  const pgJobsList = document.getElementById('pgJobsList');

  if (mongoStatsEl) {
    mongoStatsEl.innerHTML = `
      <div>
        <dt>Colecciones</dt>
        <dd>Cargando...</dd>
      </div>
      <div>
        <dt>Documentos estimados</dt>
        <dd>-</dd>
      </div>
      <div>
        <dt>Última actualización</dt>
        <dd>-</dd>
      </div>`;
  }

  if (mongoOpsList) {
    mongoOpsList.innerHTML = '<li class="admin-empty">Cargando colecciones...</li>';
  }

  if (pgStatsEl) {
    pgStatsEl.innerHTML = `
      <div>
        <dt>Tablas registradas</dt>
        <dd>Cargando...</dd>
      </div>
      <div>
        <dt>Filas totales (estimadas)</dt>
        <dd>-</dd>
      </div>
      <div>
        <dt>Última actualización</dt>
        <dd>-</dd>
      </div>`;
  }

  if (pgJobsList) {
    pgJobsList.innerHTML = '<li class="admin-empty">Cargando tablas...</li>';
  }

  updateHealthKpis();
}

function initEventDelegates() {
  document.getElementById('mongoCollections')?.addEventListener('click', (event) => {
    const button = event.target.closest('.admin-table-button');
    if (!button) return;
    const name = button.dataset.name;
    if (!name) return;
    handleMongoSelection(name);
  });

  document.getElementById('postgresTables')?.addEventListener('click', (event) => {
    const button = event.target.closest('.admin-table-button');
    if (!button) return;
    const name = button.dataset.name;
    if (!name) return;
    handlePostgresSelection(name);
  });

  document.getElementById('usersList')?.addEventListener('click', (event) => {
    const item = event.target.closest('.user-item');
    if (!item) return;
    const userId = item.getAttribute('data-id');
    if (!userId) return;
    adminState.selectedHistoryUser = userId;
    adminState.selectedFavoritesUser = userId;
    const select = document.getElementById('historyUserSelect');
    if (select) {
      select.value = userId;
    }
    const favoritesSelect = document.getElementById('favoritesUserSelect');
    if (favoritesSelect) {
      favoritesSelect.value = userId;
    }
    const selectedUser = adminState.users.find((user) => String(user._id) === String(userId));
    renderHistoryProfile(selectedUser || null);
    renderFavoritesSummary(selectedUser || null, null, 'loading');
    loadFavs(userId);
    showSection('history');
  });

  document.getElementById('historyUserSelect')?.addEventListener('change', (event) => {
    const userId = event.target.value;
    if (!userId) {
      adminState.selectedHistoryUser = null;
      adminState.selectedFavoritesUser = null;
      renderHistoryProfile(null);
      renderFavoritesSummary(null);
      const favoritesSelect = document.getElementById('favoritesUserSelect');
      if (favoritesSelect) {
        favoritesSelect.value = '';
      }
      resetFavoritesList();
      return;
    }
    adminState.selectedHistoryUser = userId;
    adminState.selectedFavoritesUser = userId;
    const favoritesSelect = document.getElementById('favoritesUserSelect');
    if (favoritesSelect) {
      favoritesSelect.value = userId;
    }
    const selectedUser = adminState.users.find((user) => String(user._id) === String(userId));
    renderHistoryProfile(selectedUser || null);
    renderFavoritesSummary(selectedUser || null, null, 'loading');
    loadFavs(userId);
  });

  document.getElementById('favoritesUserSelect')?.addEventListener('change', (event) => {
    const userId = event.target.value;
    if (!userId) {
      adminState.selectedFavoritesUser = null;
      renderFavoritesSummary(null);
      resetFavoritesList();
      return;
    }
    adminState.selectedFavoritesUser = userId;
    const selectedUser = adminState.users.find((user) => String(user._id) === String(userId));
    renderFavoritesSummary(selectedUser || null, null, 'loading');
    loadFavs(userId);
  });

  document.getElementById('goToFavoritesBtn')?.addEventListener('click', () => {
    showSection('favorites');
    loadFavoritesMetrics();
    const userId = adminState.selectedHistoryUser || adminState.selectedFavoritesUser;
    if (!userId) return;
    const favoritesSelect = document.getElementById('favoritesUserSelect');
    if (favoritesSelect) {
      favoritesSelect.value = userId;
    }
    renderFavoritesSummary(
      adminState.users.find((user) => String(user._id) === String(userId)) || null,
      null,
      'loading'
    );
    loadFavs(userId);
  });
}

async function initialiseAdminPanel() {
  const token = ensureAdmin();
  if (!token) return;

  const logoutBtn = document.getElementById('logoutBtn');
  logoutBtn?.addEventListener('click', () => {
    localStorage.clear();
    window.location.href = 'login.html';
  });

  navConfig.forEach(([btnId, target]) => {
    const btn = document.getElementById(btnId);
    btn?.setAttribute('data-target', target);
    btn?.addEventListener('click', (event) => {
      event.preventDefault();
      showSection(target);
      if (target === 'functionalities') {
        loadFavoritesMetrics();
        updateHealthKpis();
      }
    });
  });

  document.getElementById('exportFavoritesPdfBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    handleExportFavoritesPdf();
  });

  document.getElementById('exportHealthPdfBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    handleExportHealthPdf();
  });

  initEventDelegates();
  renderInfraPanels();
  await Promise.all([loadMongoCollections(), loadPostgresTables(), loadUsers(), loadFavoritesMetrics()]);
  showSection('mongo');
}

window.addEventListener('DOMContentLoaded', initialiseAdminPanel);

function updateMongoPanel() {
  const statsEl = document.getElementById('mongoStats');
  const opsEl = document.getElementById('mongoOpsList');
  if (!statsEl || !opsEl) return;
  const collections = Array.isArray(adminState.mongoCollections) ? adminState.mongoCollections : [];
  const totalDocs = collections.reduce((acc, col) => {
    const count = Number(col.documentCount);
    return Number.isFinite(count) ? acc + count : acc;
  }, 0);
  const updated = new Date().toLocaleString();
  const stats = [
    ['Colecciones', collections.length],
    ['Documentos estimados', totalDocs > 0 ? formatNumber(totalDocs, 0) : '-'],
    ['Última actualización', updated],
  ];
  statsEl.innerHTML = stats
    .map(
      ([label, value]) => `
      <div>
        <dt>${escapeHtml(label)}</dt>
        <dd>${escapeHtml(String(value))}</dd>
      </div>`
    )
    .join('');

  if (collections.length === 0) {
    opsEl.innerHTML = '<li class="admin-empty">Sin colecciones registradas.</li>';
    return;
  }
  const topCollections = collections
    .slice()
    .sort((a, b) => {
      const aCount = Number(a.documentCount) || 0;
      const bCount = Number(b.documentCount) || 0;
      return bCount - aCount;
    })
    .slice(0, 5);
  opsEl.innerHTML = topCollections
    .map((col) => {
      const count = Number(col.documentCount);
      const info = Number.isFinite(count) ? `${formatNumber(count, 0)} documentos` : 'Cantidad desconocida';
      return `<li>${escapeHtml(col.name)} · ${escapeHtml(info)}</li>`;
    })
    .join('');
}

function updatePostgresPanel() {
  const statsEl = document.getElementById('pgStats');
  const jobsEl = document.getElementById('pgJobsList');
  if (!statsEl || !jobsEl) return;
  const tables = Array.isArray(adminState.postgresTables) ? adminState.postgresTables : [];
  const totalRows = tables.reduce((acc, table) => {
    const rows = Number(table.row_count);
    return Number.isFinite(rows) ? acc + rows : acc;
  }, 0);
  const withRowCount = tables.filter((table) => Number.isFinite(Number(table.row_count)));
  const lastUpdated = new Date().toLocaleString();

  const stats = [
    ['Tablas registradas', tables.length],
    ['Filas totales (estimadas)', totalRows > 0 ? formatNumber(totalRows, 0) : '-'],
    ['Última actualización', lastUpdated],
  ];
  statsEl.innerHTML = stats
    .map(
      ([label, value]) => `
      <div>
        <dt>${escapeHtml(label)}</dt>
        <dd>${escapeHtml(String(value))}</dd>
      </div>`
    )
    .join('');

  if (withRowCount.length === 0) {
    jobsEl.innerHTML = '<li class="admin-empty">Sin información de filas en las tablas.</li>';
    return;
  }

  const topTables = withRowCount
    .slice()
    .sort((a, b) => {
      const aRows = Number(a.row_count) || 0;
      const bRows = Number(b.row_count) || 0;
      return bRows - aRows;
    })
    .slice(0, 5);

  jobsEl.innerHTML = topTables
    .map((table) => `<li>${escapeHtml(table.name)} · ${escapeHtml(formatNumber(Number(table.row_count) || 0, 0))} filas</li>`)
    .join('');
}
