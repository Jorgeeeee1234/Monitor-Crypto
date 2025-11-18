// Pagina principal de Monitor Crypto.  Este script gestiona la navegacion entre
// secciones (precios, favoritos, analisis), solicita datos al backend a traves
// del API Gateway y pinta los resultados en pantalla.  Los endpoints se
// consumen a traves del Gateway en el puerto 5000 para facilitar la
// integracion con los microservicios de Node y Python.

document.addEventListener('DOMContentLoaded', () => {
  // Configuracion de las URLs base
  const API_BASE = 'http://localhost:5000';
  const NODE_API = `${API_BASE}/node/api`;
  const ANALYSIS_API = `${NODE_API}/analysis`;
  const FAVORITES_API = `${NODE_API}/favorites`;
  const PROFILE_API = `${NODE_API}/users/profile`;
  const DASHBOARD_API = `${NODE_API}/dashboard`;
  const NOTES_API = `${DASHBOARD_API}/notes`;
  const CALENDAR_API = `${NODE_API}/calendar/notes`;
  // Las alertas aun no se implementan en el frontend
  const ALERTS_API = `${NODE_API}/alerts`;

  const user = JSON.parse(localStorage.getItem('user'));
  if (user) {
    console.log(`Bienvenido ${user.username || user.email}`);
    // Si el usuario es administrador, muestra el enlace al panel de admin
    const adminLink = document.getElementById('btn-admin');
    if (adminLink && user.rol === 'admin') {
      adminLink.style.display = 'inline-block';
      adminLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'admin.html';
      });
    }
  }

  // --- Navegacion ---
  document.getElementById('btn-pnl')?.addEventListener('click', () => showSection('pnl'));
  document.getElementById('btn-profile')?.addEventListener('click', () => showSection('profile'));
  document.getElementById('btn-dashboard')?.addEventListener('click', () => showSection('dashboard'));
  document.getElementById('btn-calendar')?.addEventListener('click', () => showSection('calendar'));
  document.getElementById('btn-home')?.addEventListener('click', () => showSection('home'));
  document.getElementById('btn-favorites')?.addEventListener('click', () => {
    showSection('favorites');
    loadFavorites();
  });
  document.getElementById('btn-analys')?.addEventListener('click', () => showSection('analys'));
  document.getElementById('btn-alerts')?.addEventListener('click', () => showSection('alerts'));
  document.getElementById('analysisBtn')?.addEventListener('click', () => getAnalys());
  document.getElementById('analysisSymbol')?.addEventListener('change', (event) => {
    const value = (event.target.value || '').trim();
    if (value) {
      const coinSelect = document.getElementById('analysisSyncCoin');
      if (coinSelect) {
        const match = allCoins.find((coin) => (coin.symbol || '').toUpperCase() === value);
        if (match) {
          const coinId = String(match.id || match.coingecko_id || '').toLowerCase();
          if (coinId) coinSelect.value = coinId;
        }
      }
      getAnalys();
    } else {
      const summary = document.getElementById('analysisSummary');
      const chartWrapper = document.getElementById('analysisChartWrapper');
      const messageEl = document.getElementById('analysisMessage');
      summary?.classList.add('hidden');
      chartWrapper?.classList.add('hidden');
      if (messageEl) {
        messageEl.textContent = 'Selecciona una criptomoneda de la lista.';
        messageEl.classList.remove('error');
      }
    }
  });
  document.getElementById('analysisDays')?.addEventListener('change', () => {
    const symbolSelect = document.getElementById('analysisSymbol');
    if (symbolSelect && symbolSelect.value.trim()) {
      getAnalys();
    }
  });

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.clear();
      window.location.href = 'login.html';
    });
  }

  // Funcion para alternar secciones visibles y estado del menu
  window.showSection = function (id) {
    document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.target === id);
    });
    if (id === 'pnl') {
      ensurePnLInit();
    } else if (id === 'dashboard') {
      ensureDashboardInit();
    } else if (id === 'profile') {
      ensureProfileInit();
    } else if (id === 'calendar') {
      ensureCalendarInit();
    } else if (id === 'alerts') {
      ensureAlertsInit();
    }
  };

  // =========================
  //   ESTADO Y CARGA PRECIOS
  // =========================
  let allCoins = [];
  let currentPage = 1;
  const coinsPerPage = 10;
  const MAX_PAGE_BUTTONS = 5;

  // Cache en memoria + control de solapes
  let LAST_PRICES = [];
  let LAST_UPDATED_MS = 0;
  let pricesAbort = null;
  let analysisChart = null;
  let profileInitialized = false;
  let profileLoaded = false;
  let profileData = null;
  let pnlInitialized = false;
  let pnlScenarios = [];
  let pnlLastResult = null;
  let dashboardInitialized = false;
  let notesLoaded = false;
  let notesCache = [];
  let tasksState = [];
  let tasksStorageKey = null;
  let timerInterval = null;
  let timerRemainingSeconds = 1500;
  let timerPresetSeconds = 1500;
  let timerRunning = false;
  let calendarInitialized = false;
  const calendarCache = new Map();
  const PNL_STORAGE_KEY = 'pnl_scenarios_v1';
  let calendarCurrentYear = new Date().getFullYear();
  let calendarCurrentMonth = new Date().getMonth();
  let calendarSelectedDate = null;
  const calculatorState = {
    current: '0',
    previous: null,
    operator: null,
    overwrite: false
  };
  let alertsInitialized = false;
  let alertsLoaded = false;
  let alertsState = [];
  let alertsHistory = [];
  let alertStatusTimeoutId = null;
  const ALERTS_STORAGE_KEY = 'price_alerts_v1';
  const ALERTS_HISTORY_LIMIT = 8;
  const ALERT_CONDITIONS = {
    above: {
      label: 'Precio >= valor',
      check: (price, target) => price >= target
    },
    below: {
      label: 'Precio <= valor',
      check: (price, target) => price <= target
    }
  };

  const MONTH_NAMES = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre'
  ];
  const WEEKDAY_NAMES = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  function mapCoinIdsToNames(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const nameById = new Map();
    for (const coin of allCoins) {
      if (!coin) continue;
      const key = String(coin.id || coin.coingecko_id || '').toLowerCase();
      if (!key) continue;
      const label = coin.nombre || coin.name || coin.id || coin.coingecko_id || key.toUpperCase();
      nameById.set(key, label);
    }
    return ids.map((id) => {
      const key = String(id || '').toLowerCase();
      return nameById.get(key) || id;
    });
  }

  const currencyFormatter = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  });
  const numberFormatter = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  function formatUsd(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return '-';
    return currencyFormatter.format(Number(value));
  }

  function formatNumber(value, digits = 2) {
    if (value === null || value === undefined || Number.isNaN(value)) return '-';
    return Number(value).toFixed(digits);
  }

  function formatPercent(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return '-';
    const sign = value > 0 ? '+' : '';
    return `${sign}${Number(value).toFixed(2)}%`;
  }

  function formatDateTime(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('es-ES');
  }

  function summarizeCoinList(coins, limit = 5) {
    if (!Array.isArray(coins) || coins.length === 0) return '';
    const short = coins.slice(0, limit);
    const remainder = coins.length - short.length;
    return remainder > 0 ? `${short.join(', ')} y ${remainder} mas` : short.join(', ');
  }

  function relativeTimeFrom(timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - timestamp;
    if (diff < 0) return 'hace instantes';
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return 'hace instantes';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.floor(hours / 24);
    return `hace ${days} d`;
  }

  function sanitizeText(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function updateStoredUser(partial) {
    try {
      const current = JSON.parse(localStorage.getItem('user') || '{}');
      const next = { ...current, ...partial };
      localStorage.setItem('user', JSON.stringify(next));
    } catch (error) {
      console.warn('No se pudo actualizar el usuario almacenado', error);
    }
  }

  function getNumberValue(id, defaultValue = 0) {
    const el = document.getElementById(id);
    if (!el) return defaultValue;
    const raw = String(el.value || '').replace(',', '.');
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : defaultValue;
  }

  function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value ?? '';
  }

  function setCheckboxValue(id, checked) {
    const el = document.getElementById(id);
    if (!el) return;
    el.checked = Boolean(checked);
  }

  function ensurePnLInit(forceReload = false) {
    if (!pnlInitialized) {
      initPnLModule();
      pnlInitialized = true;
    }
    if (forceReload) {
      populatePnlCoinOptions();
      updatePnlPriceCard();
    } else {
      populatePnlCoinOptions(false);
    }
  }

  function initPnLModule() {
    loadPnLScenarios();
    const coinSelect = document.getElementById('pnlCoinSelect');
    coinSelect?.addEventListener('change', () => {
      updatePnlPriceCard();
    });
    document.getElementById('pnlCalculateBtn')?.addEventListener('click', handlePnlCalculate);
    document.getElementById('pnlSaveScenarioBtn')?.addEventListener('click', handlePnlSaveScenario);
    document.getElementById('pnlDuplicateBtn')?.addEventListener('click', handlePnlDuplicateScenario);
    document.getElementById('pnlClearBtn')?.addEventListener('click', clearPnlForm);
    document.getElementById('pnlExampleBtn')?.addEventListener('click', handlePnlExample);
    document.getElementById('pnlExportBtn')?.addEventListener('click', handlePnlExportCsv);
    document.getElementById('pnlPrintBtn')?.addEventListener('click', () => window.print());
    const derivToggle = document.getElementById('pnlDerivToggle');
    derivToggle?.addEventListener('change', () => toggleDerivativesFields(derivToggle.checked));
    const defaultRoi = document.getElementById('pnlTargetRoiPct');
    if (defaultRoi && !defaultRoi.value) {
      defaultRoi.value = '15';
    }
    toggleDerivativesFields(derivToggle?.checked);
    populatePnlCoinOptions();
    updatePnlPriceCard();
    setPnlStatus('Completa los parámetros y pulsa Calcular.');
  }

  function setPnlStatus(message, isError = false) {
    const status = document.getElementById('pnlStatus');
    if (!status) return;
    status.textContent = message || '';
    status.classList.toggle('error', Boolean(isError));
  }

  function loadPnLScenarios() {
    try {
      pnlScenarios = JSON.parse(localStorage.getItem(PNL_STORAGE_KEY) || '[]');
      if (!Array.isArray(pnlScenarios)) {
        pnlScenarios = [];
      }
    } catch (error) {
      pnlScenarios = [];
    }
  }

  function savePnLScenarios() {
    try {
      localStorage.setItem(PNL_STORAGE_KEY, JSON.stringify(pnlScenarios));
    } catch (error) {
      console.warn('No se pudieron guardar los escenarios PnL', error);
    }
  }

  function populatePnlCoinOptions(forceRefresh = true) {
    const select = document.getElementById('pnlCoinSelect');
    if (!select) return;
    const previous = select.value;
    if (!forceRefresh && previous) {
      updatePnlPriceCard();
      return;
    }
    select.innerHTML = '<option value="">Selecciona una criptomoneda</option>';
    if (!Array.isArray(allCoins) || allCoins.length === 0) {
      select.disabled = true;
      select.innerHTML = '<option value="">Sin datos cargados</option>';
      return;
    }
    const options = allCoins
      .map((coin) => {
        const symbol = (coin.symbol || '').toUpperCase();
        const name = coin.nombre || coin.name || coin.id || symbol;
        return { id: coin.id, label: `${name} (${symbol})` };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));

    const frag = document.createDocumentFragment();
    for (const option of options) {
      const opt = document.createElement('option');
      opt.value = option.id;
      opt.textContent = option.label;
      frag.appendChild(opt);
    }
    select.appendChild(frag);
    select.disabled = false;
    if (previous && options.some((opt) => opt.id === previous)) {
      select.value = previous;
    } else {
      select.value = '';
    }
    updatePnlPriceCard();
  }

  function getSelectedPnlCoin() {
    const select = document.getElementById('pnlCoinSelect');
    if (!select || !select.value) return null;
    return allCoins.find((coin) => coin.id === select.value) || null;
  }

  function updatePnlPriceCard() {
    const priceEl = document.getElementById('pnlPriceValue');
    const updatedEl = document.getElementById('pnlPriceUpdated');
    const coin = getSelectedPnlCoin();
    if (!priceEl || !updatedEl) return;
    if (!coin) {
      priceEl.textContent = '—';
      updatedEl.textContent = 'Selecciona una criptomoneda para ver su precio actual.';
      return;
    }
    const price = Number(coin.current_price ?? coin.price ?? 0);
    priceEl.textContent = Number.isFinite(price) ? formatUsd(price) : '—';
    const updated = coin.last_snapshot_at || coin.last_synced_at || coin.updated_at || coin.fecha || '';
    updatedEl.textContent = updated ? `Última actualización: ${formatDateTime(updated)}` : 'Sin fecha registrada.';
  }

  function handlePnlCalculate() {
    const inputs = gatherPnlInputs();
    if (!inputs.coinId) {
      setPnlStatus('Selecciona una criptomoneda antes de calcular.', true);
      return;
    }
    const coin = getSelectedPnlCoin();
    if (!coin) {
      setPnlStatus('Los datos de la criptomoneda seleccionada no están disponibles.', true);
      return;
    }
    if (inputs.qty <= 0 || inputs.buyPrice <= 0 || inputs.sellPrice <= 0) {
      setPnlStatus('Cantidad, precio de compra y precio de venta deben ser valores positivos.', true);
      return;
    }
    const result = calculatePnl(inputs, coin);
    if (!result) return;
    pnlLastResult = { inputs, results: result, coinId: inputs.coinId, coinSymbol: coin.symbol, timestamp: Date.now() };
    renderPnlResults(result);
    if (result.breakEven === null || Number.isNaN(result.breakEven)) {
      setPnlStatus('Cálculo completado. No se pudo determinar el break-even con las comisiones actuales.', false);
    } else {
      setPnlStatus('Cálculo completado correctamente.');
    }
  }

  function calculatePnl(inputs, coin) {
    const currentPrice = Number(coin.current_price ?? coin.price ?? 0);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      setPnlStatus('No se pudo obtener el precio actual para convertir las comisiones en moneda.', true);
      return null;
    }
    const qty = inputs.qty;
    const buyPrice = inputs.buyPrice;
    const sellPrice = inputs.sellPrice;

    const buyNotional = qty * buyPrice;
    const buyExchangeFee = buyNotional * (inputs.buyExchangePct / 100);
    const buyConversionFee = buyNotional * (inputs.buyConversionPct / 100);
    const buySpreadCost = buyNotional * (inputs.buySpreadPct / 100);
    const buyFixedFee = inputs.buyFixedFee;
    const buyNetworkFee = inputs.buyNetworkCoin * currentPrice;
    const totalEntryCost = buyNotional + buyExchangeFee + buyConversionFee + buySpreadCost + buyFixedFee + buyNetworkFee;

    const grossProceeds = qty * sellPrice;
    const sellExchangeFee = grossProceeds * (inputs.sellExchangePct / 100);
    const sellSlippageFee = grossProceeds * (inputs.sellSlippagePct / 100);
    const sellTaxesFee = grossProceeds * (inputs.sellTaxesPct / 100);
    const sellFixedFee = inputs.sellFixedFee;
    const sellNetworkFee = inputs.sellNetworkCoin * currentPrice;

    let fundingFee = 0;
    let fundingPctTotal = 0;
    if (inputs.derivatives && inputs.fundingRatePct && inputs.fundingPeriods) {
      const ratePerPeriod = inputs.fundingRatePct / 100;
      fundingPctTotal = ratePerPeriod * inputs.fundingPeriods;
      fundingFee = grossProceeds * fundingPctTotal;
    }

    const saleVariablePct = (inputs.sellExchangePct + inputs.sellSlippagePct + inputs.sellTaxesPct) / 100 + fundingPctTotal;
    const saleConstantFees = sellFixedFee + sellNetworkFee;
    const totalSaleFees = sellExchangeFee + sellSlippageFee + sellTaxesFee + sellFixedFee + sellNetworkFee + fundingFee;
    const netProceeds = grossProceeds - totalSaleFees;
    const pnlValue = netProceeds - totalEntryCost;
    const pnlPercent = totalEntryCost > 0 ? (pnlValue / totalEntryCost) * 100 : 0;

    const denom = qty * (1 - saleVariablePct);
    let breakEven = null;
    if (denom > 0) {
      breakEven = (totalEntryCost + saleConstantFees) / denom;
    }

    const targetRoiDecimal = inputs.targetRoiPct > 0 ? inputs.targetRoiPct / 100 : 0;
    let targetPrice = null;
    if (denom > 0) {
      targetPrice = (totalEntryCost * (1 + targetRoiDecimal) + saleConstantFees) / denom;
    }

    return {
      currentPrice,
      buyNotional,
      totalEntryCost,
      grossProceeds,
      totalSaleFees,
      netProceeds,
      pnlValue,
      pnlPercent,
      breakEven,
      targetPrice,
      saleVariablePct,
      saleConstantFees
    };
  }

  function renderPnlResults(result) {
    const setValue = (id, value, formatter = formatUsd) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (value === null || value === undefined || Number.isNaN(value)) {
        el.textContent = '—';
      } else {
        el.textContent = formatter(value);
      }
    };
    setValue('pnlCostEntry', result.totalEntryCost);
    setValue('pnlGrossProceeds', result.grossProceeds);
    setValue('pnlSellFees', result.totalSaleFees);
    setValue('pnlNetProceeds', result.netProceeds);
    setValue('pnlBreakEven', result.breakEven, (val) => formatNumber(val, 4));
    setValue('pnlTargetPrice', result.targetPrice, (val) => formatNumber(val, 4));
    const pnlValueEl = document.getElementById('pnlPnLValue');
    const pnlPercentEl = document.getElementById('pnlPnLPercent');
    const pnlCard = document.querySelector('.pnl-result-card--pnl');
    if (pnlValueEl) pnlValueEl.textContent = formatUsd(result.pnlValue);
    if (pnlPercentEl) pnlPercentEl.textContent = `(${formatPercent(result.pnlPercent)})`;
    if (pnlCard) {
      pnlCard.classList.remove('positive', 'negative');
      if (result.pnlValue > 0) pnlCard.classList.add('positive');
      else if (result.pnlValue < 0) pnlCard.classList.add('negative');
    }
  }

  function handlePnlSaveScenario() {
    if (!pnlLastResult) {
      setPnlStatus('Calcula primero el escenario antes de guardarlo.', true);
      return;
    }
    const scenario = {
      id: Date.now(),
      label: `Escenario ${new Date().toLocaleString('es-ES')}`,
      ...pnlLastResult
    };
    pnlScenarios.push(scenario);
    if (pnlScenarios.length > 20) {
      pnlScenarios = pnlScenarios.slice(-20);
    }
    savePnLScenarios();
    setPnlStatus('Escenario guardado en este navegador.');
  }

  function handlePnlDuplicateScenario() {
    if (!pnlScenarios.length) {
      setPnlStatus('No hay escenarios guardados para duplicar.', true);
      return;
    }
    const last = pnlScenarios[pnlScenarios.length - 1];
    if (!last?.inputs) {
      setPnlStatus('El escenario guardado no es válido.', true);
      return;
    }
    applyPnlScenario(last.inputs);
    setPnlStatus(`Escenario "${last.label}" cargado. Ajusta los valores y vuelve a calcular.`);
  }

  function applyPnlScenario(inputs) {
    setInputValue('pnlQty', inputs.qty);
    setInputValue('pnlBuyPrice', inputs.buyPrice);
    setInputValue('pnlSellPrice', inputs.sellPrice);
    setInputValue('pnlBuyExchangePct', inputs.buyExchangePct);
    setInputValue('pnlBuyConversionPct', inputs.buyConversionPct);
    setInputValue('pnlBuySpreadPct', inputs.buySpreadPct);
    setInputValue('pnlBuyFixedFee', inputs.buyFixedFee);
    setInputValue('pnlBuyNetworkCoin', inputs.buyNetworkCoin);
    setInputValue('pnlSellExchangePct', inputs.sellExchangePct);
    setInputValue('pnlSellSlippagePct', inputs.sellSlippagePct);
    setInputValue('pnlSellTaxesPct', inputs.sellTaxesPct);
    setInputValue('pnlSellFixedFee', inputs.sellFixedFee);
    setInputValue('pnlSellNetworkCoin', inputs.sellNetworkCoin);
    setCheckboxValue('pnlDerivToggle', inputs.derivatives);
    setInputValue('pnlFundingRatePct', inputs.fundingRatePct);
    setInputValue('pnlFundingPeriods', inputs.fundingPeriods);
    setInputValue('pnlTargetRoiPct', inputs.targetRoiPct);
    const coinSelect = document.getElementById('pnlCoinSelect');
    if (coinSelect) {
      coinSelect.value = inputs.coinId || '';
    }
    toggleDerivativesFields(inputs.derivatives);
    updatePnlPriceCard();
  }

  function clearPnlForm() {
    const ids = [
      'pnlQty',
      'pnlBuyPrice',
      'pnlSellPrice',
      'pnlBuyExchangePct',
      'pnlBuyConversionPct',
      'pnlBuySpreadPct',
      'pnlBuyFixedFee',
      'pnlBuyNetworkCoin',
      'pnlSellExchangePct',
      'pnlSellSlippagePct',
      'pnlSellTaxesPct',
      'pnlSellFixedFee',
      'pnlSellNetworkCoin',
      'pnlFundingRatePct',
      'pnlFundingPeriods'
    ];
    ids.forEach((id) => setInputValue(id, ''));
    setInputValue('pnlTargetRoiPct', '15');
    setCheckboxValue('pnlDerivToggle', false);
    const coinSelect = document.getElementById('pnlCoinSelect');
    if (coinSelect) coinSelect.value = '';
    toggleDerivativesFields(false);
    updatePnlPriceCard();
    renderPnlResults({
      totalEntryCost: null,
      grossProceeds: null,
      totalSaleFees: null,
      netProceeds: null,
      pnlValue: null,
      pnlPercent: null,
      breakEven: null,
      targetPrice: null
    });
    pnlLastResult = null;
    setPnlStatus('Formulario reiniciado.');
  }

  function handlePnlExportCsv() {
    if (!pnlLastResult) {
      setPnlStatus('Calcula el escenario antes de exportarlo.', true);
      return;
    }
    const coin = getSelectedPnlCoin();
    const inputs = pnlLastResult.inputs;
    const results = pnlLastResult.results;
    const rows = [
      ['Campo', 'Valor'],
      ['Criptomoneda', coin ? `${coin.nombre || coin.name || coin.id} (${(coin.symbol || '').toUpperCase()})` : inputs.coinId],
      ['Cantidad', inputs.qty],
      ['Precio compra', inputs.buyPrice],
      ['Precio venta', inputs.sellPrice],
      ['Precio actual', results.currentPrice],
      ['Coste total entrada', results.totalEntryCost],
      ['Proceeds brutos', results.grossProceeds],
      ['Comisiones venta', results.totalSaleFees],
      ['Proceeds netos', results.netProceeds],
      ['PnL', results.pnlValue],
      ['PnL %', results.pnlPercent],
      ['Break-even', results.breakEven],
      ['Precio objetivo ROI', results.targetPrice]
    ];
    const csv = rows.map((row) => row.map((col) => `"${String(col ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pnl_scenario_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setPnlStatus('CSV exportado correctamente.');
  }

  function handlePnlExample() {
    let coin = getSelectedPnlCoin();
    if (!coin && Array.isArray(allCoins) && allCoins.length > 0) {
      coin = allCoins[0];
      const coinSelect = document.getElementById('pnlCoinSelect');
      if (coinSelect) {
        coinSelect.value = coin.id || coin.coingecko_id || '';
      }
    }
    if (!coin) {
      setPnlStatus('No hay datos de mercado disponibles para generar un ejemplo.', true);
      return;
    }
    const price = Number(coin.current_price ?? coin.price ?? 100);
    const qty = price > 0 ? 1.25 : 1;
    const buyPrice = price > 0 ? price * 0.98 : 95;
    const sellPrice = price > 0 ? price * 1.12 : 115;
    setInputValue('pnlQty', qty.toFixed(3));
    setInputValue('pnlBuyPrice', buyPrice.toFixed(2));
    setInputValue('pnlSellPrice', sellPrice.toFixed(2));
    setInputValue('pnlBuyExchangePct', '0.10');
    setInputValue('pnlBuyConversionPct', '0.15');
    setInputValue('pnlBuySpreadPct', '0.20');
    setInputValue('pnlBuyFixedFee', '2.50');
    setInputValue('pnlBuyNetworkCoin', '0.0005');
    setInputValue('pnlSellExchangePct', '0.10');
    setInputValue('pnlSellSlippagePct', '0.20');
    setInputValue('pnlSellTaxesPct', '0');
    setInputValue('pnlSellFixedFee', '2.00');
    setInputValue('pnlSellNetworkCoin', '0.0004');
    setCheckboxValue('pnlDerivToggle', false);
    setInputValue('pnlFundingRatePct', '');
    setInputValue('pnlFundingPeriods', '');
    setInputValue('pnlTargetRoiPct', '20');
    toggleDerivativesFields(false);
    updatePnlPriceCard();
    setPnlStatus('Ejemplo cargado. Ajusta los valores o pulsa Calcular para ver el resultado.');
  }

  function gatherPnlInputs() {
    return {
      coinId: document.getElementById('pnlCoinSelect')?.value || '',
      qty: getNumberValue('pnlQty'),
      buyPrice: getNumberValue('pnlBuyPrice'),
      sellPrice: getNumberValue('pnlSellPrice'),
      buyExchangePct: getNumberValue('pnlBuyExchangePct'),
      buyConversionPct: getNumberValue('pnlBuyConversionPct'),
      buySpreadPct: getNumberValue('pnlBuySpreadPct'),
      buyFixedFee: getNumberValue('pnlBuyFixedFee'),
      buyNetworkCoin: getNumberValue('pnlBuyNetworkCoin'),
      sellExchangePct: getNumberValue('pnlSellExchangePct'),
      sellSlippagePct: getNumberValue('pnlSellSlippagePct'),
      sellTaxesPct: getNumberValue('pnlSellTaxesPct'),
      sellFixedFee: getNumberValue('pnlSellFixedFee'),
      sellNetworkCoin: getNumberValue('pnlSellNetworkCoin'),
      derivatives: Boolean(document.getElementById('pnlDerivToggle')?.checked),
      fundingRatePct: getNumberValue('pnlFundingRatePct'),
      fundingPeriods: getNumberValue('pnlFundingPeriods'),
      targetRoiPct: getNumberValue('pnlTargetRoiPct', 0)
    };
  }

  function toggleDerivativesFields(enabled) {
    const container = document.querySelector('.pnl-derivatives .pnl-params');
    if (!container) return;
    container.classList.toggle('disabled', !enabled);
    container.querySelectorAll('input').forEach((input) => {
      input.disabled = !enabled;
    });
  }
  function ensureProfileInit(force = false) {
    if (!profileInitialized) {
      initProfileModule();
      profileInitialized = true;
    }
    if (force) {
      profileLoaded = false;
    }
    if (!profileLoaded) {
      loadProfile();
    }
  }

  function initProfileModule() {
    const form = document.getElementById('profileForm');
    const resetBtn = document.getElementById('profileResetBtn');
    form?.addEventListener('submit', handleProfileSubmit);
    resetBtn?.addEventListener('click', () => {
      if (profileData) {
        fillProfileForm(profileData);
        const status = document.getElementById('profileStatus');
        if (status) {
          status.classList.remove('error');
          status.textContent = 'Cambios descartados.';
        }
      } else {
        loadProfile(true);
      }
    });
  }

  function setProfileFormDisabled(disabled) {
    const form = document.getElementById('profileForm');
    if (!form) return;
    form.querySelectorAll('input, button').forEach((element) => {
      if (disabled) {
        element.setAttribute('disabled', 'disabled');
      } else {
        element.removeAttribute('disabled');
      }
    });
  }

  function setProfileFormBusy(isBusy) {
    const submit = document.getElementById('profileSubmitBtn');
    const reset = document.getElementById('profileResetBtn');
    if (isBusy) {
      submit?.setAttribute('disabled', 'disabled');
      reset?.setAttribute('disabled', 'disabled');
    } else {
      submit?.removeAttribute('disabled');
      reset?.removeAttribute('disabled');
    }
  }

  async function loadProfile() {
    const status = document.getElementById('profileStatus');
    const token = localStorage.getItem('token');
    if (!token) {
      profileData = null;
      profileLoaded = false;
      renderProfileSummary(null);
      fillProfileForm(null);
      setProfileFormDisabled(true);
      if (status) {
        status.classList.add('error');
        status.textContent = 'Inicia sesión para consultar o actualizar tu perfil.';
      }
      return;
    }
    setProfileFormDisabled(false);
    setProfileFormBusy(false);
    if (status) {
      status.classList.remove('error');
      status.textContent = 'Cargando perfil...';
    }
    try {
      const res = await fetch(PROFILE_API, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.detail || data?.message || `Error ${res.status}`);
      }
      profileData = data;
      profileLoaded = true;
      renderProfileSummary(profileData);
      fillProfileForm(profileData);
      if (status) {
        status.classList.remove('error');
        status.textContent = 'Perfil sincronizado.';
      }
    } catch (error) {
      profileData = null;
      profileLoaded = false;
      renderProfileSummary(null);
      fillProfileForm(null);
      setProfileFormDisabled(true);
      if (status) {
        status.classList.add('error');
        status.textContent = error?.message || 'No se pudo cargar el perfil.';
      }
    }
  }

  function renderProfileSummary(data) {
    const fallback = '-';
    const fields = {
      profileName: data?.nombre || fallback,
      profileSurname: data?.apellido || fallback,
      profileUsername: data?.username || fallback,
      profileEmail: data?.email || fallback,
      profilePhone: data?.telefono || fallback,
      profileDni: data?.dni || fallback,
      profileRole: data?.rol || fallback,
      profileRegisteredAt: data?.fechaRegistro ? formatDateTime(data.fechaRegistro) : fallback
    };
    Object.entries(fields).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    });
  }

  function fillProfileForm(data) {
    const nameInput = document.getElementById('profileInputNombre');
    const surnameInput = document.getElementById('profileInputApellido');
    const usernameInput = document.getElementById('profileInputUsername');
    const phoneInput = document.getElementById('profileInputTelefono');
    if (!nameInput || !surnameInput || !usernameInput || !phoneInput) return;
    if (!data) {
      nameInput.value = '';
      surnameInput.value = '';
      usernameInput.value = '';
      phoneInput.value = '';
      return;
    }
    nameInput.value = data.nombre || '';
    surnameInput.value = data.apellido || '';
    usernameInput.value = data.username || '';
    phoneInput.value = data.telefono || '';
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();
    const status = document.getElementById('profileStatus');
    const token = localStorage.getItem('token');
    if (!token) {
      if (status) {
        status.classList.add('error');
        status.textContent = 'Inicia sesión para actualizar tu perfil.';
      }
      return;
    }
    const nameInput = document.getElementById('profileInputNombre');
    const surnameInput = document.getElementById('profileInputApellido');
    const usernameInput = document.getElementById('profileInputUsername');
    const phoneInput = document.getElementById('profileInputTelefono');
    if (!nameInput || !surnameInput || !usernameInput || !phoneInput) return;
    const payload = {
      nombre: nameInput.value.trim(),
      apellido: surnameInput.value.trim(),
      username: usernameInput.value.trim(),
      telefono: phoneInput.value.trim()
    };
    const changes = {};
    Object.entries(payload).forEach(([key, value]) => {
      if (!value) return;
      if (!profileData || profileData[key] !== value) {
        changes[key] = value;
      }
    });
    if (Object.keys(changes).length === 0) {
      if (status) {
        status.classList.remove('error');
        status.textContent = 'No hay cambios para guardar.';
      }
      return;
    }
    setProfileFormBusy(true);
    if (status) {
      status.classList.remove('error');
      status.textContent = 'Guardando cambios...';
    }
    try {
      const res = await fetch(PROFILE_API, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(changes)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.detail || data?.message || `Error ${res.status}`);
      }
      const updated = data?.user || {};
      profileData = profileData ? { ...profileData, ...updated } : updated;
      profileLoaded = true;
      renderProfileSummary(profileData);
      fillProfileForm(profileData);
      updateStoredUser({
        nombre: profileData?.nombre,
        apellido: profileData?.apellido,
        username: profileData?.username,
        telefono: profileData?.telefono
      });
      if (status) {
        status.classList.remove('error');
        status.textContent = data?.message || 'Perfil actualizado.';
      }
    } catch (error) {
      if (status) {
        status.classList.add('error');
        status.textContent = error?.message || 'No se pudo actualizar el perfil.';
      }
    } finally {
      setProfileFormBusy(false);
    }
  }

  function ensureCalendarInit(forceRefetch = false) {
    if (!calendarInitialized) {
      initCalendarModule();
      calendarInitialized = true;
    }
    if (forceRefetch) {
      calendarCache.delete(getCalendarKey());
    }
    loadCalendarMonth(forceRefetch);
  }

  function initCalendarModule() {
    const monthSelect = document.getElementById('calendarMonthSelect');
    if (monthSelect && !monthSelect.dataset.populated) {
      monthSelect.innerHTML = MONTH_NAMES.map((name, index) => `<option value="${index + 1}">${name}</option>`).join('');
      monthSelect.dataset.populated = 'true';
    }
    if (monthSelect) {
      monthSelect.value = String(calendarCurrentMonth + 1);
      monthSelect.addEventListener('change', () => {
        calendarCurrentMonth = Number(monthSelect.value) - 1;
        loadCalendarMonth(true);
      });
    }
    const yearInput = document.getElementById('calendarYearInput');
    if (yearInput) {
      yearInput.value = calendarCurrentYear;
      yearInput.addEventListener('change', () => {
        let year = Number.parseInt(yearInput.value, 10);
        if (!Number.isFinite(year)) year = calendarCurrentYear;
        year = Math.min(Math.max(year, 1970), 2100);
        calendarCurrentYear = year;
        yearInput.value = calendarCurrentYear;
        loadCalendarMonth(true);
      });
    }
    document.getElementById('calendarPrevMonth')?.addEventListener('click', () => changeCalendarMonth(-1));
    document.getElementById('calendarNextMonth')?.addEventListener('click', () => changeCalendarMonth(1));
    document.getElementById('calendarGrid')?.addEventListener('click', handleCalendarGridClick);
    document.getElementById('calendarNoteForm')?.addEventListener('submit', handleCalendarNoteSubmit);
    document.getElementById('calendarNotesList')?.addEventListener('click', handleCalendarNotesListClick);
    ensureSelectedDateInCurrentMonth(true);
  }

  function changeCalendarMonth(delta) {
    calendarCurrentMonth += delta;
    if (calendarCurrentMonth < 0) {
      calendarCurrentMonth = 11;
      calendarCurrentYear -= 1;
    } else if (calendarCurrentMonth > 11) {
      calendarCurrentMonth = 0;
      calendarCurrentYear += 1;
    }
    loadCalendarMonth(true);
  }

  function getCalendarKey(year = calendarCurrentYear, month = calendarCurrentMonth) {
    return `${year}-${String(month + 1).padStart(2, '0')}`;
  }

  function getCalendarKeyForDate(iso) {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  function formatISODate(year, month, day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function ensureSelectedDateInCurrentMonth(setLabel = false) {
    const prefix = getCalendarKey();
    if (!calendarSelectedDate || !calendarSelectedDate.startsWith(prefix)) {
      const today = new Date();
      if (today.getFullYear() === calendarCurrentYear && today.getMonth() === calendarCurrentMonth) {
        calendarSelectedDate = formatISODate(calendarCurrentYear, calendarCurrentMonth + 1, today.getDate());
      } else {
        calendarSelectedDate = formatISODate(calendarCurrentYear, calendarCurrentMonth + 1, 1);
      }
    }
    if (setLabel) {
      const label = document.getElementById('calendarSelectedDateLabel');
      if (label) label.textContent = formatDateForLabel(calendarSelectedDate);
    }
  }

  function setCalendarFormDisabled(disabled) {
    const form = document.getElementById('calendarNoteForm');
    if (!form) return;
    form.querySelectorAll('input, textarea, button').forEach((element) => {
      if (disabled) {
        element.setAttribute('disabled', 'disabled');
      } else {
        element.removeAttribute('disabled');
      }
    });
  }

  function setCalendarFormBusy(isBusy) {
    const submit = document.getElementById('calendarNoteSubmit');
    if (isBusy) {
      submit?.setAttribute('disabled', 'disabled');
    } else {
      submit?.removeAttribute('disabled');
    }
  }

  function setCalendarStatus(message, isError = false) {
    const status = document.getElementById('calendarNoteStatus');
    if (!status) return;
    status.textContent = message || '';
    status.classList.toggle('error', Boolean(isError));
  }

  async function loadCalendarMonth(forceFetch = false) {
    const monthSelect = document.getElementById('calendarMonthSelect');
    const yearInput = document.getElementById('calendarYearInput');
    if (monthSelect) monthSelect.value = String(calendarCurrentMonth + 1);
    if (yearInput) yearInput.value = calendarCurrentYear;

    const key = getCalendarKey();
    if (forceFetch) {
      calendarCache.delete(key);
    }

    const token = localStorage.getItem('token');
    if (!token) {
      setCalendarFormDisabled(true);
      setCalendarStatus('Inicia sesión para guardar notas en el calendario.', true);
      calendarCache.delete(key);
    } else {
      setCalendarFormDisabled(false);
      if (!calendarCache.has(key)) {
        setCalendarStatus('Cargando notas del mes...');
        try {
          const res = await fetch(`${CALENDAR_API}?year=${calendarCurrentYear}&month=${calendarCurrentMonth + 1}`, {
            headers: {
              Authorization: `Bearer ${token}`
            }
          });
          const data = await res.json().catch(() => ([]));
          if (!res.ok) {
            throw new Error(data?.detail || data?.message || `Error ${res.status}`);
          }
          const notes = Array.isArray(data) ? data : [];
          calendarCache.set(key, notes);
          setCalendarStatus(notes.length ? `Notas registradas: ${notes.length}` : 'Sin notas en este mes.');
        } catch (error) {
          calendarCache.set(key, []);
          setCalendarStatus(error?.message || 'No se pudieron cargar las notas del calendario.', true);
        }
      } else if (!forceFetch) {
        const cached = calendarCache.get(key) || [];
        setCalendarStatus(cached.length ? `Notas registradas: ${cached.length}` : 'Sin notas en este mes.');
      }
    }

    ensureSelectedDateInCurrentMonth();
    renderCalendarGrid();
    renderCalendarDayNotes();
  }

  function setCalendarSelectedDate(dateISO, rerenderGrid = true) {
    if (!dateISO) return;
    calendarSelectedDate = dateISO;
    if (rerenderGrid) {
      renderCalendarGrid();
    }
    renderCalendarDayNotes();
  }

  function renderCalendarGrid() {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;

    const firstDay = new Date(calendarCurrentYear, calendarCurrentMonth, 1);
    const startOffset = (firstDay.getDay() + 6) % 7; // Ajuste para que lunes sea el primer día
    const totalDays = new Date(calendarCurrentYear, calendarCurrentMonth + 1, 0).getDate();
    const today = new Date();
    const monthKey = getCalendarKey();
    const notes = calendarCache.get(monthKey) || [];
    const notesByDay = new Map();
    for (const note of notes) {
      const iso = note.dateISO || note.date;
      if (!iso) continue;
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) continue;
      const day = date.getUTCDate();
      notesByDay.set(day, (notesByDay.get(day) || 0) + 1);
    }

    const parts = [];
    for (const w of WEEKDAY_NAMES) {
      parts.push(`<div class="calendar-weekday">${w}</div>`);
    }

    for (let i = 0; i < startOffset; i += 1) {
      parts.push('<div class="calendar-day empty"></div>');
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const dateISO = formatISODate(calendarCurrentYear, calendarCurrentMonth + 1, day);
      const classes = ['calendar-day'];
      const hasNotes = notesByDay.has(day);
      if (hasNotes) classes.push('has-notes');
      if (calendarSelectedDate === dateISO) classes.push('selected');
      if (
        today.getFullYear() === calendarCurrentYear &&
        today.getMonth() === calendarCurrentMonth &&
        today.getDate() === day
      ) {
        classes.push('today');
      }
      const badge = hasNotes ? `<span class="calendar-day__badge">${notesByDay.get(day)}</span>` : '';
      parts.push(
        `<button type="button" class="${classes.join(' ')}" data-date="${dateISO}">
          <span class="day-number">${day}</span>
          ${badge}
        </button>`
      );
    }

    grid.innerHTML = parts.join('');
  }

  function handleCalendarGridClick(event) {
    const dayButton = event.target.closest('.calendar-day');
    if (!dayButton || dayButton.classList.contains('empty')) return;
    const { date } = dayButton.dataset;
    if (!date) return;
    setCalendarSelectedDate(date);
  }

  function getNotesForSelectedDate() {
    if (!calendarSelectedDate) return [];
    const key = getCalendarKey();
    const notes = calendarCache.get(key) || [];
    return notes.filter((note) => {
      const iso = note.dateISO || note.date;
      return iso && iso.startsWith(`${calendarSelectedDate}T`);
    });
  }

  function renderCalendarDayNotes() {
    const label = document.getElementById('calendarSelectedDateLabel');
    const list = document.getElementById('calendarNotesList');
    if (!list) return;
    if (!calendarSelectedDate) {
      if (label) label.textContent = '-';
      list.innerHTML = '<li class="empty">Selecciona un día para ver notas.</li>';
      return;
    }
    if (label) label.textContent = formatDateForLabel(calendarSelectedDate);
    const token = localStorage.getItem('token');
    if (!token) {
      list.innerHTML = '<li class="empty">Inicia sesión para gestionar notas.</li>';
      return;
    }
    const notes = getNotesForSelectedDate();
    if (!notes.length) {
      list.innerHTML = '<li class="empty">Sin notas para este día.</li>';
      return;
    }
    list.innerHTML = notes
      .map((note) => {
        const safeTitle = sanitizeText(note.title || 'Nota');
        const safeContent = sanitizeText(note.content || '').replace(/\r?\n/g, '<br>');
        const createdLabel = note.createdAt ? formatDateTime(note.createdAt) : '';
        return `
        <li data-id="${note.id || note._id}">
          <div class="calendar-note">
            <div class="calendar-note__meta">
              <strong>${safeTitle}</strong>
              <span>${createdLabel}</span>
            </div>
            <p>${safeContent}</p>
            <div class="note-actions">
              <button type="button" data-action="delete">Eliminar</button>
            </div>
          </div>
        </li>
      `;
      })
      .join('');
  }

  async function handleCalendarNoteSubmit(event) {
    event.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) {
      setCalendarStatus('Inicia sesión para guardar notas.', true);
      return;
    }
    if (!calendarSelectedDate) {
      setCalendarStatus('Selecciona un día antes de añadir una nota.', true);
      return;
    }
    const titleInput = document.getElementById('calendarNoteTitle');
    const contentInput = document.getElementById('calendarNoteContent');
    if (!contentInput) return;
    const content = contentInput.value.trim();
    if (!content) {
      setCalendarStatus('Escribe una nota antes de guardar.', true);
      contentInput.focus();
      return;
    }
    const payload = {
      date: `${calendarSelectedDate}T00:00:00.000Z`,
      title: titleInput?.value?.trim() || undefined,
      content
    };
    setCalendarFormBusy(true);
    setCalendarStatus('Guardando nota...');
    try {
      const res = await fetch(CALENDAR_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.detail || data?.message || `Error ${res.status}`);
      }
      addNoteToCache(data);
      contentInput.value = '';
      if (titleInput) titleInput.value = '';
      setCalendarStatus('Nota guardada.');
      renderCalendarGrid();
      renderCalendarDayNotes();
    } catch (error) {
      setCalendarStatus(error?.message || 'No se pudo guardar la nota.', true);
    } finally {
      setCalendarFormBusy(false);
    }
  }

  function handleCalendarNotesListClick(event) {
    const button = event.target.closest('button[data-action="delete"]');
    if (!button) return;
    const listItem = button.closest('li[data-id]');
    if (!listItem) return;
    const { id } = listItem.dataset;
    if (!id) return;
    deleteCalendarNote(id);
  }

  async function deleteCalendarNote(noteId) {
    const token = localStorage.getItem('token');
    if (!token) {
      setCalendarStatus('Inicia sesión para eliminar notas.', true);
      return;
    }
    if (!window.confirm('¿Eliminar esta nota del calendario?')) {
      return;
    }
    setCalendarStatus('Eliminando nota...');
    try {
      const res = await fetch(`${CALENDAR_API}/${noteId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.detail || payload?.message || `Error ${res.status}`);
      }
      removeNoteFromCache(noteId);
      setCalendarStatus('Nota eliminada.');
      renderCalendarGrid();
      renderCalendarDayNotes();
    } catch (error) {
      setCalendarStatus(error?.message || 'No se pudo eliminar la nota.', true);
    }
  }

  function addNoteToCache(note) {
    const key = getCalendarKeyForDate(note?.dateISO || note?.date);
    if (!key) return;
    const existing = calendarCache.get(key) || [];
    existing.unshift(note);
    calendarCache.set(key, existing);
  }

  function removeNoteFromCache(noteId) {
    for (const key of calendarCache.keys()) {
      const notes = calendarCache.get(key) || [];
      const filtered = notes.filter((note) => (note.id || note._id)?.toString() !== noteId);
      if (filtered.length !== notes.length) {
        calendarCache.set(key, filtered);
      }
    }
  }

  function formatDateForLabel(dateISO) {
    if (!dateISO) return '-';
    const [yearStr, monthStr, dayStr] = dateISO.split('-');
    const year = Number.parseInt(yearStr, 10);
    const month = Number.parseInt(monthStr, 10);
    const day = Number.parseInt(dayStr, 10);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return dateISO;
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) return dateISO;
    return date.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  }

  function ensureDashboardInit(forceNotes = false) {
    if (!dashboardInitialized) {
      initDashboard();
      dashboardInitialized = true;
    }
    if (forceNotes) {
      notesLoaded = false;
    }
    loadNotes(forceNotes);
    updateTasksStorageKey();
    loadTasksFromStorage();
    syncTimerPreset(true);
  }

  function initDashboard() {
    const noteForm = document.getElementById('noteForm');
    const noteCancelBtn = document.getElementById('noteCancelEdit');
    const notesList = document.getElementById('notesList');
    if (noteForm) {
      noteForm.addEventListener('submit', handleNoteSubmit);
    }
    if (noteCancelBtn) {
      noteCancelBtn.addEventListener('click', () => resetNoteForm());
    }
    notesList?.addEventListener('click', handleNoteListClick);
    initTasksModule();
    initCalculatorModule();
    initTimerModule();
  }

  function getNoteElements() {
    const form = document.getElementById('noteForm');
    return {
      form,
      title: document.getElementById('noteTitle'),
      content: document.getElementById('noteContent'),
      submit: document.getElementById('noteSubmitBtn'),
      cancel: document.getElementById('noteCancelEdit'),
      status: document.getElementById('notesStatus'),
      list: document.getElementById('notesList')
    };
  }

  async function handleNoteSubmit(event) {
    event.preventDefault();
    const { form, title, content, submit, cancel, status } = getNoteElements();
    if (!form || !content) return;
    const token = localStorage.getItem('token');
    if (!token) {
      status?.classList.add('error');
      if (status) status.textContent = 'Inicia sesión para guardar notas.';
      return;
    }
    const payload = {
      title: title?.value?.trim() || undefined,
      content: content.value.trim()
    };
    if (!payload.content) {
      status?.classList.add('error');
      if (status) status.textContent = 'Escribe algo antes de guardar.';
      content.focus();
      return;
    }
    const editingId = form.dataset.editingId;
    const method = editingId ? 'PUT' : 'POST';
    const endpoint = editingId ? `${NOTES_API}/${editingId}` : NOTES_API;
    submit?.setAttribute('disabled', 'disabled');
    if (status) {
      status.classList.remove('error');
      status.textContent = editingId ? 'Actualizando nota...' : 'Guardando nota...';
    }
    try {
      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.detail || data?.message || `Error ${res.status}`);
      }
      if (editingId) {
        const index = notesCache.findIndex((note) => note._id === editingId);
        if (index >= 0) {
          notesCache[index] = data;
        }
        if (status) status.textContent = 'Nota actualizada.';
      } else {
        notesCache.unshift(data);
        if (status) status.textContent = 'Nota guardada.';
      }
      notesLoaded = true;
      renderNotes();
      resetNoteForm();
    } catch (error) {
      if (status) {
        status.classList.add('error');
        status.textContent = error?.message || 'No se pudo guardar la nota.';
      }
    } finally {
      submit?.removeAttribute('disabled');
    }
  }

  function resetNoteForm() {
    const { form, title, content, submit, cancel, status } = getNoteElements();
    if (form) {
      form.reset();
      delete form.dataset.editingId;
    }
    if (submit) submit.textContent = 'Guardar nota';
    cancel?.classList.add('hidden');
    if (status) {
      status.classList.remove('error');
      status.textContent = '';
    }
    title?.blur();
    content?.blur();
  }

  async function loadNotes(force = false) {
    const { list, status } = getNoteElements();
    if (!list) return;
    if (!force && notesLoaded) {
      renderNotes();
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) {
      notesLoaded = false;
      if (status) {
        status.classList.add('error');
        status.textContent = 'Inicia sesión para ver tus notas.';
      }
      list.innerHTML = '<li class="empty">Inicia sesión para gestionar tus notas.</li>';
      return;
    }
    if (status) {
      status.classList.remove('error');
      status.textContent = 'Cargando notas...';
    }
    try {
      const res = await fetch(NOTES_API, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json().catch(() => ([]));
      if (!res.ok) {
        throw new Error(data?.detail || data?.message || `Error ${res.status}`);
      }
      notesCache = Array.isArray(data) ? data : [];
      notesLoaded = true;
      if (status) {
        status.textContent = notesCache.length ? `Notas sincronizadas (${notesCache.length})` : 'Aún no tienes notas guardadas.';
      }
      renderNotes();
    } catch (error) {
      notesLoaded = false;
      if (status) {
        status.classList.add('error');
        status.textContent = error?.message || 'No se pudieron cargar las notas.';
      }
      renderNotes();
    }
  }

  function renderNotes() {
    const { list } = getNoteElements();
    if (!list) return;
    if (!notesCache.length) {
      list.innerHTML = '<li class="empty">No hay notas guardadas.</li>';
      return;
    }
    list.innerHTML = notesCache
      .map((note) => {
        const safeTitle = sanitizeText(note.title || 'Nota sin título');
        const safeContent = sanitizeText(note.content || '').replace(/\r?\n/g, '<br>');
        const updated = note.updatedAt || note.createdAt;
        const updatedLabel = updated ? formatDateTime(updated) : '';
        return `
        <li class="note-item" data-id="${note._id}">
          <div class="note-header">
            <strong>${safeTitle}</strong>
            <time datetime="${updated || ''}">${updatedLabel}</time>
          </div>
          <p class="note-content">${safeContent || '<em>Sin contenido</em>'}</p>
          <div class="note-actions">
            <button type="button" data-action="edit">Editar</button>
            <button type="button" data-action="delete">Eliminar</button>
          </div>
        </li>
      `;
      })
      .join('');
  }

  function handleNoteListClick(event) {
    const actionButton = event.target.closest('button[data-action]');
    if (!actionButton) return;
    const noteItem = actionButton.closest('.note-item');
    if (!noteItem) return;
    const noteId = noteItem.dataset.id;
    if (!noteId) return;
    if (actionButton.dataset.action === 'edit') {
      const note = notesCache.find((item) => item._id === noteId);
      if (!note) return;
      const { form, title, content, submit, cancel, status } = getNoteElements();
      if (form && content) {
        form.dataset.editingId = noteId;
        if (title) title.value = note.title || '';
        content.value = note.content || '';
        submit.textContent = 'Actualizar nota';
        cancel?.classList.remove('hidden');
        if (status) {
          status.classList.remove('error');
          status.textContent = 'Editando nota existente.';
        }
        content.focus();
      }
    } else if (actionButton.dataset.action === 'delete') {
      deleteNote(noteId);
    }
  }

  async function deleteNote(noteId) {
    const { status } = getNoteElements();
    const token = localStorage.getItem('token');
    if (!token) {
      if (status) {
        status.classList.add('error');
        status.textContent = 'Inicia sesión para eliminar notas.';
      }
      return;
    }
    if (!window.confirm('¿Eliminar esta nota?')) return;
    if (status) {
      status.classList.remove('error');
      status.textContent = 'Eliminando nota...';
    }
    try {
      const res = await fetch(`${NOTES_API}/${noteId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.detail || payload?.message || `Error ${res.status}`);
      }
      notesCache = notesCache.filter((note) => note._id !== noteId);
      renderNotes();
      resetNoteForm();
      if (status) status.textContent = 'Nota eliminada correctamente.';
    } catch (error) {
      if (status) {
        status.classList.add('error');
        status.textContent = error?.message || 'No se pudo eliminar la nota.';
      }
    }
  }

  const TASKS_STORAGE_PREFIX = 'dashboard_tasks';

  function initTasksModule() {
    const form = document.getElementById('taskForm');
    const list = document.getElementById('tasksList');
    const clearBtn = document.getElementById('taskClearCompleted');
    form?.addEventListener('submit', handleTaskSubmit);
    list?.addEventListener('change', handleTaskToggle);
    list?.addEventListener('click', handleTaskClick);
    clearBtn?.addEventListener('click', clearCompletedTasks);
    updateTasksStorageKey();
    loadTasksFromStorage();
  }

  function determineTasksKey() {
    if (user && (user.id || user._id)) {
      return `${TASKS_STORAGE_PREFIX}_${user.id || user._id}`;
    }
    return `${TASKS_STORAGE_PREFIX}_anon`;
  }

  function updateTasksStorageKey() {
    tasksStorageKey = determineTasksKey();
  }

  function loadTasksFromStorage() {
    const list = document.getElementById('tasksList');
    if (!list || !tasksStorageKey) return;
    try {
      const stored = localStorage.getItem(tasksStorageKey);
      tasksState = stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.warn('No se pudieron leer las tareas almacenadas', error);
      tasksState = [];
    }
    renderTasks();
  }

  function saveTasks() {
    if (!tasksStorageKey) return;
    try {
      localStorage.setItem(tasksStorageKey, JSON.stringify(tasksState));
    } catch (error) {
      console.warn('No se pudieron guardar las tareas', error);
    }
  }

  function handleTaskSubmit(event) {
    event.preventDefault();
    const input = document.getElementById('taskInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    tasksState.unshift({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text,
      completed: false
    });
    input.value = '';
    saveTasks();
    renderTasks();
  }

  function handleTaskToggle(event) {
    const checkbox = event.target;
    if (!(checkbox instanceof HTMLInputElement) || checkbox.type !== 'checkbox') return;
    const item = checkbox.closest('li');
    if (!item) return;
    const id = item.dataset.id;
    const task = tasksState.find((t) => t.id === id);
    if (!task) return;
    task.completed = checkbox.checked;
    saveTasks();
    renderTasks();
  }

  function handleTaskClick(event) {
    const btn = event.target.closest('button[data-action="delete"]');
    if (!btn) return;
    const item = btn.closest('li');
    if (!item) return;
    const id = item.dataset.id;
    tasksState = tasksState.filter((task) => task.id !== id);
    saveTasks();
    renderTasks();
  }

  function clearCompletedTasks() {
    const before = tasksState.length;
    tasksState = tasksState.filter((task) => !task.completed);
    if (tasksState.length !== before) {
      saveTasks();
      renderTasks();
    }
  }

  function renderTasks() {
    const list = document.getElementById('tasksList');
    if (!list) return;
    if (!tasksState.length) {
      list.innerHTML = '<li class="empty">No tienes tareas pendientes.</li>';
      return;
    }
    list.innerHTML = tasksState
      .map(
        (task) => `
        <li data-id="${task.id}" class="${task.completed ? 'completed' : ''}">
          <label class="task-label">
            <input type="checkbox" ${task.completed ? 'checked' : ''} />
            <span>${sanitizeText(task.text)}</span>
          </label>
          <button type="button" data-action="delete">Eliminar</button>
        </li>
      `
      )
      .join('');
  }

  function initCalculatorModule() {
    const keys = document.getElementById('calculatorKeys');
    keys?.addEventListener('click', handleCalculatorInput);
    updateCalculatorDisplay();
  }

  function handleCalculatorInput(event) {
    const button = event.target.closest('button');
    if (!button) return;
    const { value } = button.dataset;
    const operator = button.dataset.operator;
    const action = button.dataset.action;
    if (value !== undefined) {
      inputDigit(value);
    } else if (operator) {
      chooseOperator(operator);
    } else if (action) {
      switch (action) {
        case 'clear':
          resetCalculator();
          break;
        case 'sign':
          toggleSign();
          break;
        case 'percent':
          applyPercent();
          break;
        case 'equals':
          evaluateExpression();
          break;
        default:
          break;
      }
    }
    updateCalculatorDisplay();
  }

  function inputDigit(digit) {
    if (calculatorState.overwrite) {
      calculatorState.current = digit === '.' ? '0.' : digit;
      calculatorState.overwrite = false;
      return;
    }
    if (digit === '.') {
      if (!calculatorState.current.includes('.')) {
        calculatorState.current += '.';
      }
      return;
    }
    if (calculatorState.current === '0') {
      calculatorState.current = digit;
    } else {
      calculatorState.current += digit;
    }
  }

  function chooseOperator(operator) {
    if (calculatorState.operator && !calculatorState.overwrite) {
      evaluateExpression();
    }
    calculatorState.previous = calculatorState.current;
    calculatorState.operator = operator;
    calculatorState.overwrite = true;
  }

  function evaluateExpression() {
    if (!calculatorState.operator || calculatorState.previous === null) return;
    const currentValue = Number(calculatorState.current);
    const previousValue = Number(calculatorState.previous);
    const result = performOperation(previousValue, currentValue, calculatorState.operator);
    calculatorState.current = Number.isFinite(result) ? String(result) : 'Error';
    calculatorState.previous = null;
    calculatorState.operator = null;
    calculatorState.overwrite = true;
  }

  function performOperation(a, b, operator) {
    switch (operator) {
      case 'add':
        return a + b;
      case 'subtract':
        return a - b;
      case 'multiply':
        return a * b;
      case 'divide':
        return b === 0 ? NaN : a / b;
      default:
        return b;
    }
  }

  function resetCalculator() {
    calculatorState.current = '0';
    calculatorState.previous = null;
    calculatorState.operator = null;
    calculatorState.overwrite = false;
  }

  function toggleSign() {
    if (calculatorState.current === '0') return;
    if (calculatorState.current.startsWith('-')) {
      calculatorState.current = calculatorState.current.slice(1);
    } else {
      calculatorState.current = `-${calculatorState.current}`;
    }
  }

  function applyPercent() {
    const value = Number(calculatorState.current);
    calculatorState.current = String(value / 100);
  }

  function updateCalculatorDisplay() {
    const display = document.getElementById('calculatorDisplay');
    if (!display) return;
    display.textContent = calculatorState.current;
  }

  function initTimerModule() {
    const startBtn = document.getElementById('timerStart');
    const pauseBtn = document.getElementById('timerPause');
    const resetBtn = document.getElementById('timerReset');
    const minutesInput = document.getElementById('timerMinutes');
    startBtn?.addEventListener('click', startTimer);
    pauseBtn?.addEventListener('click', pauseTimer);
    resetBtn?.addEventListener('click', resetTimer);
    minutesInput?.addEventListener('change', () => syncTimerPreset(!timerRunning));
    syncTimerPreset(true);
    updateTimerDisplay();
  }

  function syncTimerPreset(applyToRemaining = false) {
    const minutesInput = document.getElementById('timerMinutes');
    const value = Number(minutesInput?.value);
    const minutes = Number.isFinite(value) && value > 0 ? Math.min(value, 120) : 25;
    timerPresetSeconds = Math.round(minutes * 60);
    if (applyToRemaining && !timerRunning) {
      timerRemainingSeconds = timerPresetSeconds;
      updateTimerDisplay();
      const status = document.getElementById('timerStatus');
      if (status) status.textContent = '';
    } else if (timerRunning) {
      const status = document.getElementById('timerStatus');
      if (status) {
        status.classList.remove('error');
        status.textContent = 'El nuevo tiempo se aplicará cuando reinicies.';
      }
    }
  }

  function startTimer() {
    if (timerRunning) return;
    syncTimerPreset(false);
    if (timerRemainingSeconds <= 0 || timerRemainingSeconds === timerPresetSeconds) {
      timerRemainingSeconds = timerPresetSeconds;
    }
    if (timerRemainingSeconds <= 0) {
      timerRemainingSeconds = 1500;
    }
    timerRunning = true;
    const status = document.getElementById('timerStatus');
    if (status) {
      status.classList.remove('error');
      status.textContent = 'Temporizador en marcha...';
    }
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      timerRemainingSeconds -= 1;
      updateTimerDisplay();
      if (timerRemainingSeconds <= 0) {
        completeTimer();
      }
    }, 1000);
  }

  function pauseTimer() {
    if (!timerRunning) return;
    timerRunning = false;
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    const status = document.getElementById('timerStatus');
    if (status) status.textContent = 'Temporizador en pausa.';
  }

  function resetTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    timerRunning = false;
    syncTimerPreset(true);
    timerRemainingSeconds = timerPresetSeconds;
    updateTimerDisplay();
    const status = document.getElementById('timerStatus');
    if (status) status.textContent = 'Temporizador reiniciado.';
  }

  function completeTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    timerRunning = false;
    timerRemainingSeconds = 0;
    updateTimerDisplay();
    const status = document.getElementById('timerStatus');
    if (status) {
      status.classList.remove('error');
      status.textContent = '¡Sesión completada! Tómate un descanso.';
    }
  }

  function updateTimerDisplay() {
    const display = document.getElementById('focusTimerDisplay');
    if (!display) return;
    const minutes = Math.floor(Math.max(timerRemainingSeconds, 0) / 60);
    const seconds = Math.max(timerRemainingSeconds, 0) % 60;
    display.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function setupSyncButton(buttonId, statusId, onSuccess, endpoint = '/node/api/analysis/sync', payloadFactory) {
    const btn = document.getElementById(buttonId);
    const statusEl = document.getElementById(statusId);
    if (!btn || !statusEl) return;

    btn.addEventListener('click', async () => {
      const token = localStorage.getItem('token');
      btn.disabled = true;
      statusEl.classList.remove('error');
      const isSeries = endpoint.includes('sync-series');
      statusEl.textContent = isSeries ? 'Sincronizando historico (90 dias)...' : 'Actualizando datos de mercado...';
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        const defaultPayload = isSeries ? { days: 90 } : {};
        let requestPayload = defaultPayload;
        if (typeof payloadFactory === 'function') {
          let produced;
          try {
            produced = payloadFactory();
          } catch (factoryError) {
            statusEl.textContent = factoryError?.message || 'No se pudo preparar la solicitud.';
            statusEl.classList.add('error');
            btn.disabled = false;
            return;
          }
          if (produced === null || produced === false) {
            statusEl.textContent = 'Solicitud cancelada.';
            statusEl.classList.add('error');
            btn.disabled = false;
            return;
          }
          if (produced && typeof produced === 'object' && !Array.isArray(produced)) {
            requestPayload = { ...defaultPayload, ...produced };
          } else {
            requestPayload = produced ?? defaultPayload;
          }
        }
        const res = await fetch(`http://localhost:5000${endpoint}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestPayload)
        });
        const responsePayload = await res.json().catch(() => ({}));
        if (!res.ok) {
          const detail = responsePayload?.detail || responsePayload?.message || `Error ${res.status}`;
          const err = new Error(detail);
          err.status = res.status;
          throw err;
        }
        const processed = Number(responsePayload?.processed ?? 0);
        const vsLabel = (responsePayload?.vs_currency || 'usd').toUpperCase();
        const when = responsePayload?.synced_at ? new Date(responsePayload.synced_at).toLocaleString() : '';
        if (isSeries) {
          const coins = typeof responsePayload?.coins === 'number' ? responsePayload.coins : null;
          const coinIds = Array.isArray(responsePayload?.coin_ids) ? responsePayload.coin_ids : null;
          const coinsPart = coins !== null ? ` en ${coins} monedas` : '';
          const coinNames = mapCoinIdsToNames(coinIds || []);
          const detailList = coinNames.length ? ` [${summarizeCoinList(coinNames)}]` : '';
          statusEl.textContent = `Sincronizados ${processed} puntos historicos${coinsPart} (${vsLabel})${detailList}${when ? ` - ${when}` : ''}`;
        } else {
          statusEl.textContent = `Sincronizadas ${processed} entradas (${vsLabel})${when ? ` - ${when}` : ''}`;
        }
        if (typeof onSuccess === 'function') {
          await onSuccess();
        }
        setTimeout(() => {
          if (!statusEl.classList.contains('error')) {
            statusEl.textContent = '';
          }
        }, 8000);
      } catch (error) {
        statusEl.textContent = error?.message || 'Error al sincronizar datos.';
        statusEl.classList.add('error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function updateAnalysisOptions() {
    const symbolSelect = document.getElementById('analysisSymbol');
    const coinSelect = document.getElementById('analysisSyncCoin');
    if (!symbolSelect && !coinSelect) return;

    const symbolOptions = new Map();
    const coinOptions = new Map();
    for (const coin of allCoins) {
      if (!coin) continue;
      const symbol = (coin.symbol || '').toUpperCase();
      const coinId = String(coin.id || coin.coingecko_id || '').toLowerCase();
      if (!symbol || !coinId) continue;
      const label = `${coin.nombre || coin.name || coinId} (${symbol})`;
      if (!symbolOptions.has(symbol)) {
        symbolOptions.set(symbol, label);
      }
      if (!coinOptions.has(coinId)) {
        coinOptions.set(coinId, label);
      }
    }

    if (symbolSelect) {
      const previousSymbol = symbolSelect.value;
      const symbolEntries = Array.from(symbolOptions.entries()).sort((a, b) =>
        a[1].localeCompare(b[1], 'es', { sensitivity: 'base' })
      );
      const exists = previousSymbol && symbolOptions.has(previousSymbol);
      symbolSelect.innerHTML = '';
      const defaultSymbol = document.createElement('option');
      defaultSymbol.value = '';
      defaultSymbol.textContent = 'Selecciona una criptomoneda';
      symbolSelect.appendChild(defaultSymbol);
      for (const [symbol, label] of symbolEntries) {
        const option = document.createElement('option');
        option.value = symbol;
        option.textContent = label;
        if (exists && symbol === previousSymbol) {
          option.selected = true;
        }
        symbolSelect.appendChild(option);
      }
      if (!exists) {
        symbolSelect.value = '';
        const summary = document.getElementById('analysisSummary');
        const chartWrapper = document.getElementById('analysisChartWrapper');
        const messageEl = document.getElementById('analysisMessage');
        summary?.classList.add('hidden');
        chartWrapper?.classList.add('hidden');
        if (messageEl) {
          messageEl.textContent = 'Selecciona una criptomoneda de la lista.';
          messageEl.classList.remove('error');
        }
      }
    }

    if (coinSelect) {
      const previousCoin = coinSelect.value;
      const coinEntries = Array.from(coinOptions.entries()).sort((a, b) =>
        a[1].localeCompare(b[1], 'es', { sensitivity: 'base' })
      );
      const existsCoin = previousCoin && coinOptions.has(previousCoin);
      coinSelect.innerHTML = '';
      const defaultCoin = document.createElement('option');
      defaultCoin.value = '';
      defaultCoin.textContent = 'Selecciona una criptomoneda';
      coinSelect.appendChild(defaultCoin);
      for (const [coinId, label] of coinEntries) {
        const option = document.createElement('option');
        option.value = coinId;
        option.textContent = label;
        if (existsCoin && coinId === previousCoin) {
          option.selected = true;
        }
        coinSelect.appendChild(option);
      }
      if (!existsCoin) {
        coinSelect.value = '';
      }
    }
  }

  function updateLastUpdateLabel() {
    const status = document.getElementById('lastUpdate');
    if (!status) return;
    if (!LAST_UPDATED_MS) {
      status.textContent = '';
      return;
    }
    status.textContent = `Actualizado ${relativeTimeFrom(LAST_UPDATED_MS)}`;
  }

  // Reutilizable: reintentos con backoff
  async function fetchWithRetry(url, opts = {}, tries = 3, baseDelay = 300) {
    let delay = baseDelay;
    for (let i = 0; i < tries; i++) {
      try {
        const res = await fetch(url, opts);
        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try {
            const payload = await res.json();
            if (payload && typeof payload.detail === 'string') {
              detail = payload.detail;
            }
          } catch (_) {
            // Ignorar errores al parsear detalle
          }
          const error = new Error(detail);
          error.status = res.status;
          throw error;
        }
        return await res.json();
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        if (i === tries - 1) throw e;
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.floor(delay * 1.8 + 80);
      }
    }
  }

  window.loadPrices = async function () {
    const pricesDiv = document.getElementById('prices');
    const status = document.getElementById('lastUpdate');
    if (!pricesDiv) return;

    // Cancela peticion previa si la hay
    if (pricesAbort) pricesAbort.abort();
    pricesAbort = new AbortController();

    // Si no hay datos aun, muestra "Cargando...", si hay, no limpies la UI
    if (LAST_PRICES.length === 0) pricesDiv.textContent = 'Cargando precios...';

    try {
      const data = await fetchWithRetry(`${ANALYSIS_API}/prices`, { signal: pricesAbort.signal }, 3, 300);
      LAST_PRICES = Array.isArray(data) ? data : [];
      const newest = LAST_PRICES.reduce((max, coin) => {
        const ts = coin && coin.last_snapshot_at ? Date.parse(coin.last_snapshot_at) : 0;
        return Number.isNaN(ts) ? max : Math.max(max, ts);
      }, 0);
      LAST_UPDATED_MS = newest || Date.now();

      allCoins = LAST_PRICES;
      renderPrices();
      updateAnalysisOptions();
      populatePnlCoinOptions(false);
      updatePnlPriceCard();
      populateAlertCoinOptions();
      handleAlertCoinChange();
      const alertsEval = evaluateAlerts('prices');
      renderAlertsList();
      renderAlertsSummary();
      if (alertsEval.triggered.length > 0) {
        registerTriggeredAlerts(alertsEval.triggered);
      } else {
        renderAlertsHistory();
      }
      updateLastUpdateLabel();
    } catch (error) {
      console.warn('Error cargando precios:', error.message || error);
      const needsSync = error?.status === 503 || String(error?.message || '').toLowerCase().includes('actualizacion');
      if (needsSync) {
        pricesDiv.textContent = 'No hay datos sincronizados. Pulsa "Actualizar precios" para sincronizar los datos.';
        if (status) status.textContent = 'Requiere sincronizacion manual.';
        return;
      }
      if (LAST_PRICES.length > 0) {
        allCoins = LAST_PRICES;
        renderPrices(); // re-render si hace falta por filtros/paginacion
        updateAnalysisOptions();
        populatePnlCoinOptions(false);
        updatePnlPriceCard();
        populateAlertCoinOptions();
        handleAlertCoinChange();
        const alertsEval = evaluateAlerts('cache');
        renderAlertsList();
        renderAlertsSummary();
        if (alertsEval.triggered.length > 0) {
          registerTriggeredAlerts(alertsEval.triggered);
        } else {
          renderAlertsHistory();
        }
        if (status) status.textContent = 'Mostrando datos en cache (' + formatDateTime(LAST_UPDATED_MS) + ')';
      } else {
        pricesDiv.textContent = 'No se pudieron cargar los precios.';
      }
    }
  };

  function renderPrices() {
    const pricesDiv = document.getElementById('prices');
    const searchInput = document.getElementById('searchInput');
    const filterSelect = document.getElementById('filterSelect');
    const sortSelect = document.getElementById('sortSelect');

    let data = [...allCoins];

    if (searchInput && searchInput.value) {
      const q = searchInput.value.toLowerCase();
      data = data.filter((c) => c.nombre.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q));
    }

    if (filterSelect && filterSelect.value !== 'all') {
      data = data.filter((c) =>
        filterSelect.value === 'positive' ? c.price_change_percentage_24h > 0 : c.price_change_percentage_24h < 0
      );
    }

    if (sortSelect && sortSelect.value !== 'none') {
      switch (sortSelect.value) {
        case 'price-desc':
          data.sort((a, b) => b.current_price - a.current_price);
          break;
        case 'price-asc':
          data.sort((a, b) => a.current_price - b.current_price);
          break;
        case 'change-desc':
          data.sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h);
          break;
        case 'change-asc':
          data.sort((a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h);
          break;
      }
    }

    const start = (currentPage - 1) * coinsPerPage;
    const end = start + coinsPerPage;
    const coinsToShow = data.slice(start, end);

    pricesDiv.innerHTML = coinsToShow
      .map((coin, index) => {
        const accent = index % 5;
        const accentClass = `coin-card--accent-${accent}`;
        const ch24 = (coin.price_change_percentage_24h || 0).toFixed(2);
        const chClass = ch24 >= 0 ? 'positive' : 'negative';
        const icon = coin.image || 'https://cdn-icons-png.flaticon.com/512/825/825464.png';
        return `
        <div class="coin-card ${accentClass}" data-id="${coin.id}" data-symbol="${coin.symbol}" data-name="${coin.nombre}">
          <button class="icon-button btn-fav" type="button" title="Anadir a favoritos">
            <span class="icon" aria-hidden="true">&#9733;</span>
            <span class="sr-only">Guardar en favoritos</span>
          </button>
          <button class="icon-button btn-detail" type="button" title="Ver detalle">
            <span class="icon" aria-hidden="true">&#128269;</span>
            <span class="sr-only">Ver detalle</span>
          </button>
          <button class="icon-button btn-go-home" type="button" title="Ir a Inicio">
            <span class="icon" aria-hidden="true">&#128200;</span>
            <span class="sr-only">Ir a la seccion Inicio</span>
          </button>
          <button class="icon-button btn-go-alerts" type="button" title="Ir a Alertas">
            <span class="icon" aria-hidden="true">&#128276;</span>
            <span class="sr-only">Ir a la seccion Alertas</span>
          </button>
          <img src="${icon}" alt="${coin.nombre}" class="coin-icon" />
          <div class="coin-info">
            <h3>${coin.nombre} <span>(${coin.symbol.toUpperCase()})</span></h3>
            <p class="price">$${(coin.current_price ?? 0).toLocaleString()}</p>
            <p class="change ${chClass}">${ch24 >= 0 ? '+' : '-'} ${ch24}% (24h)</p>
            <div class="coin-meta">
              <span><strong>Cap</strong> $${(coin.market_cap ?? 0).toLocaleString()}</span>
              <span><strong>Vol 24h</strong> $${(coin.total_volume ?? 0).toLocaleString()}</span>
              <span><strong>Rank</strong> #${coin.market_cap_rank ?? '-'}</span>
              <span><strong>ATH</strong> $${(coin.ath ?? 0).toLocaleString()}</span>
            </div>
          </div>
        </div>
      `;
      })
      .join('');

    renderPagination(data.length);
  }

  function renderPagination(total) {
    const paginationDiv = document.getElementById('pagination');
    if (!paginationDiv) return;
    const totalPages = Math.max(1, Math.ceil(total / coinsPerPage));

    if (!paginationDiv.classList.contains('pagination-bar')) {
      paginationDiv.classList.add('pagination-bar');
    }

    if (currentPage > totalPages) {
      currentPage = totalPages;
    }

    paginationDiv.innerHTML = '';

    if (totalPages <= 1) {
      paginationDiv.classList.add('hidden');
      return;
    }
    paginationDiv.classList.remove('hidden');

    const makeButton = (label, page, { disabled = false, ariaLabel = '', type = 'page' } = {}) => {
      const button = document.createElement('button');
      button.textContent = label;
      button.type = 'button';
      button.disabled = disabled;
      if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
      if (type === 'nav') button.classList.add('nav');
      if (page === currentPage && type === 'page') button.classList.add('active');
      button.addEventListener('click', () => {
        if (page === currentPage || page < 1 || page > totalPages) return;
        currentPage = page;
        renderPrices();
      });
      paginationDiv.appendChild(button);
    };

    const makeEllipsis = () => {
      const span = document.createElement('span');
      span.className = 'pagination-ellipsis';
      span.textContent = '...';
      paginationDiv.appendChild(span);
    };

    makeButton('<', currentPage - 1, {
      disabled: currentPage === 1,
      ariaLabel: 'Pagina anterior',
      type: 'nav',
    });

    const half = Math.floor(MAX_PAGE_BUTTONS / 2);
    let start = Math.max(1, currentPage - half);
    let end = start + MAX_PAGE_BUTTONS - 1;
    if (end > totalPages) {
      end = totalPages;
      start = Math.max(1, end - MAX_PAGE_BUTTONS + 1);
    }

    if (start > 1) {
      makeButton('1', 1);
      if (start > 2) {
        makeEllipsis();
      }
    }

    for (let page = start; page <= end; page++) {
      makeButton(String(page), page);
    }

    if (end < totalPages) {
      if (end < totalPages - 1) {
        makeEllipsis();
      }
      makeButton(String(totalPages), totalPages);
    }

    makeButton('>', currentPage + 1, {
      disabled: currentPage === totalPages,
      ariaLabel: 'Pagina siguiente',
      type: 'nav',
    });
  }

  // Filtros
  document.getElementById('searchInput')?.addEventListener('input', () => {
    currentPage = 1;
    renderPrices();
  });
  document.getElementById('filterSelect')?.addEventListener('change', () => {
    currentPage = 1;
    renderPrices();
  });
  document.getElementById('sortSelect')?.addEventListener('change', () => {
    currentPage = 1;
    renderPrices();
  });

  // Auto-actualizacion precios (30 s)
  setupSyncButton('homeSyncBtn', 'homeSyncStatus', async () => {
    await loadPrices();
  });
  setupSyncButton('analysisSyncBtn', 'analysisSyncStatus', async () => {
    await loadPrices();
    const symbolSelect = document.getElementById('analysisSymbol');
    if (symbolSelect && symbolSelect.value.trim()) {
      if (typeof window.getAnalys === 'function') { await window.getAnalys(); }
    }
  });
  setupSyncButton('analysisHistoryBtn', 'analysisSyncStatus', async () => {
    await loadPrices();
    const symbolSelect = document.getElementById('analysisSymbol');
    if (symbolSelect && symbolSelect.value.trim()) {
      if (typeof window.getAnalys === 'function') { await window.getAnalys(); }
    }
  }, '/node/api/analysis/sync-series');
  setupSyncButton('analysisSingleHistoryBtn', 'analysisSyncStatus', async () => {
    await loadPrices();
    const symbolSelect = document.getElementById('analysisSymbol');
    if (symbolSelect && symbolSelect.value.trim()) {
      if (typeof window.getAnalys === 'function') { await window.getAnalys(); }
    }
  }, '/node/api/analysis/sync-series', () => {
    const coinSelect = document.getElementById('analysisSyncCoin');
    const coinId = (coinSelect?.value || '').trim();
    if (!coinId) {
      coinSelect?.focus();
      throw new Error('Selecciona una criptomoneda para sincronizar.');
    }
    return { days: 90, coin_id: coinId };
  });
  ensureAlertsStateLoaded();
  renderAlertsList();
  renderAlertsSummary();
  renderAlertsHistory();
  loadPrices();
  setInterval(loadPrices, 30000);
  setInterval(updateLastUpdateLabel, 60000);

  // Reloj de "ultima actualizacion" en pantalla.  Muestra la diferencia
  // entre la hora actual y la ultima actualizacion en formato mm:ss.  Si no
  // hay datos aun, muestra un guion.
  function formatElapsed() {
    const diffSecs = Math.floor((Date.now() - LAST_UPDATED_MS) / 1000);
    const minutes = Math.floor(diffSecs / 60);
    const seconds = diffSecs % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  setInterval(() => {
    const el = document.getElementById('lastUpdate');
    if (!el) return;
    el.textContent = LAST_UPDATED_MS ? `Actualizado hace ${formatElapsed()}` : '-';
  }, 1000);

  // ==================
  //   Alertas locales
  // ==================
  function ensureAlertsInit(forceReload = false) {
    ensureAlertsStateLoaded();
    const form = document.getElementById('alertForm');
    const list = document.getElementById('alertsList');
    const summary = document.getElementById('alertsSummary');
    if (!form || !list || !summary) return;

    if (!alertsInitialized) {
      alertsInitialized = true;
      form.addEventListener('submit', handleAlertSubmit);
      list.addEventListener('click', handleAlertsListClick);
      document.getElementById('alertCoin')?.addEventListener('change', handleAlertCoinChange);
    }

    if (forceReload) {
      alertsState = loadAlertsFromStorage();
    }

    populateAlertCoinOptions();
    handleAlertCoinChange();
    const result = evaluateAlerts(forceReload ? 'reload' : 'init');
    renderAlertsList();
    renderAlertsSummary();
    if (result.triggered.length > 0) {
      registerTriggeredAlerts(result.triggered);
    } else {
      renderAlertsHistory();
    }
  }

  function loadAlertsFromStorage() {
    try {
      const raw = localStorage.getItem(ALERTS_STORAGE_KEY);
      if (!raw) {
        alertsLoaded = true;
        return [];
      }
      const parsed = JSON.parse(raw);
      alertsLoaded = true;
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeAlert).filter(Boolean);
    } catch (error) {
      alertsLoaded = true;
      console.warn('No se pudieron cargar las alertas almacenadas', error);
      return [];
    }
  }

  function saveAlertsToStorage() {
    try {
      localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alertsState));
    } catch (error) {
      console.warn('No se pudieron guardar las alertas', error);
    }
  }

  function ensureAlertsStateLoaded() {
    if (!alertsLoaded) {
      alertsState = loadAlertsFromStorage();
    }
  }

  function normalizeAlert(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const coinId = String(raw.coinId || '').toLowerCase();
    const symbol = String(raw.symbol || '').toUpperCase();
    const target = Number(raw.target);
    if (!coinId && !symbol) return null;
    if (!Number.isFinite(target) || target <= 0) return null;

    return {
      id: String(raw.id || `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      coinId: coinId || symbol.toLowerCase(),
      symbol: symbol || coinId.toUpperCase(),
      name: String(raw.name || raw.coin || raw.symbol || symbol || coinId).trim(),
      condition: raw.condition === 'below' ? 'below' : 'above',
      target,
      repeat: raw.repeat !== false,
      active: raw.active === false ? false : true,
      createdAt: Number(raw.createdAt) || Date.now(),
      lastPrice: Number.isFinite(Number(raw.lastPrice)) ? Number(raw.lastPrice) : null,
      lastState: raw.lastState === true,
      lastTriggeredAt: Number(raw.lastTriggeredAt) || null,
      triggerCount: Number.isFinite(Number(raw.triggerCount)) ? Number(raw.triggerCount) : 0
    };
  }

  function populateAlertCoinOptions() {
    const select = document.getElementById('alertCoin');
    if (!select) return;
    const previousValue = (select.value || '').toLowerCase();
    const coins = Array.isArray(allCoins) ? allCoins : [];
    if (coins.length === 0) {
      if (!select.dataset.populated) {
        select.innerHTML = '<option value="">Selecciona una criptomoneda</option>';
        select.dataset.populated = 'true';
      }
      return;
    }

    const seen = new Set();
    const options = ['<option value="">Selecciona una criptomoneda</option>'];
    const sorted = [...coins].sort((a, b) => {
      const nameA = (a.nombre || a.name || a.symbol || '').toLowerCase();
      const nameB = (b.nombre || b.name || b.symbol || '').toLowerCase();
      return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
    });

    for (const coin of sorted) {
      const id = String(coin.id || coin.coingecko_id || coin.symbol || '').toLowerCase();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const labelName = coin.nombre || coin.name || coin.id || coin.symbol || id.toUpperCase();
      const symbol = (coin.symbol || id).toUpperCase();
      const optionLabel = `${labelName} (${symbol})`;
      options.push(`<option value="${sanitizeText(id)}">${sanitizeText(optionLabel)}</option>`);
    }

    select.innerHTML = options.join('');
    if (previousValue && seen.has(previousValue)) {
      select.value = previousValue;
    } else {
      select.value = '';
    }
    select.dataset.populated = 'true';
  }

  function handleAlertCoinChange() {
    const select = document.getElementById('alertCoin');
    const valueInput = document.getElementById('alertValue');
    const hintEl = document.getElementById('alertCurrentPrice');
    if (!select) return;
    const coinId = (select.value || '').toLowerCase();
    const coin = findCoinByKey(coinId);
    if (coin) {
      const currentPrice = Number(coin.current_price ?? coin.price ?? coin.last_price ?? null);
      if (hintEl) {
        hintEl.textContent = Number.isFinite(currentPrice)
          ? `Precio actual: ${formatUsd(currentPrice)}`
          : 'Sin datos de precio actual.';
      }
      if (valueInput && !valueInput.value && Number.isFinite(currentPrice) && currentPrice > 0) {
        valueInput.value = currentPrice.toFixed(2);
      }
    } else if (hintEl) {
      hintEl.textContent = 'Selecciona una criptomoneda para ver su precio actual.';
    }
  }

  function handleAlertSubmit(event) {
    event.preventDefault();
    ensureAlertsStateLoaded();
    const coinSelect = document.getElementById('alertCoin');
    const conditionSelect = document.getElementById('alertCondition');
    const valueInput = document.getElementById('alertValue');
    const repeatCheckbox = document.getElementById('alertRepeat');

    if (!coinSelect || !conditionSelect || !valueInput || !repeatCheckbox) return;

    const coinId = (coinSelect.value || '').toLowerCase();
    if (!coinId) {
      setAlertStatus('Selecciona una criptomoneda.', true);
      coinSelect.focus();
      return;
    }

    const condition = conditionSelect.value === 'below' ? 'below' : 'above';
    const target = Number(valueInput.value);
    if (!Number.isFinite(target) || target <= 0) {
      setAlertStatus('Introduce un valor objetivo valido.', true);
      valueInput.focus();
      return;
    }

    const coin = findCoinByKey(coinId);
    if (!coin) {
      setAlertStatus('No hay datos de precio para esa moneda.', true);
      return;
    }

    const symbol = (coin.symbol || coinId).toUpperCase();
    const name = coin.nombre || coin.name || symbol || coinId.toUpperCase();

    const alreadyExists = alertsState.some(
      (alert) =>
        alert.coinId === coinId &&
        alert.condition === condition &&
        Math.abs(alert.target - target) < 1e-8 &&
        alert.repeat === repeatCheckbox.checked
    );
    if (alreadyExists) {
      setAlertStatus('Ya tienes una alerta con esos parametros.', true);
      return;
    }

    const newAlert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      coinId,
      symbol,
      name,
      condition,
      target,
      repeat: repeatCheckbox.checked,
      active: true,
      createdAt: Date.now(),
      lastPrice: Number(coin.current_price ?? coin.price ?? coin.last_price ?? null) || null,
      lastState: null,
      lastTriggeredAt: null,
      triggerCount: 0
    };

    alertsState.unshift(newAlert);
    saveAlertsToStorage();

    const evalResult = evaluateAlerts('create');
    renderAlertsList();
    renderAlertsSummary();
    handleAlertCoinChange();

    if (evalResult.triggered.length > 0) {
      registerTriggeredAlerts(evalResult.triggered);
    } else {
      renderAlertsHistory();
      setAlertStatus(`Alerta creada para ${symbol}.`);
    }

    valueInput.value = '';
    valueInput.focus();
  }

  function handleAlertsListClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const id = button.dataset.id;
    const action = button.dataset.action;
    if (!id || !action) return;

    if (action === 'toggle') {
      toggleAlert(id);
    } else if (action === 'delete') {
      deleteAlert(id);
    }
  }

  function toggleAlert(id) {
    ensureAlertsStateLoaded();
    const alert = alertsState.find((item) => item.id === id);
    if (!alert) return;
    const activating = alert.active === false;
    alert.active = activating;
    if (activating) {
      alert.lastState = false;
    }
    saveAlertsToStorage();

    const evalResult = evaluateAlerts('toggle');
    renderAlertsList();
    renderAlertsSummary();

    if (evalResult.triggered.length > 0) {
      registerTriggeredAlerts(evalResult.triggered);
    } else {
      renderAlertsHistory();
    }
    setAlertStatus(activating ? 'Alerta reactivada.' : 'Alerta pausada.');
  }

  function deleteAlert(id) {
    ensureAlertsStateLoaded();
    const index = alertsState.findIndex((item) => item.id === id);
    if (index === -1) return;
    alertsState.splice(index, 1);
    saveAlertsToStorage();
    renderAlertsList();
    renderAlertsSummary();
    alertsHistory = alertsHistory.filter((entry) => entry.id !== id);
    renderAlertsHistory();
    setAlertStatus('Alerta eliminada.');
  }

  function evaluateAlerts(reason = 'manual') {
    ensureAlertsStateLoaded();
    if (!alertsState.length) {
      return { changed: false, triggered: [] };
    }

    const triggered = [];
    let mutated = false;

    for (const alert of alertsState) {
      const coin = findCoinByKey(alert.coinId || alert.symbol);
      if (!coin) {
        if (alert.lastPrice !== null) {
          alert.lastPrice = null;
          mutated = true;
        }
        if (alert.lastState !== null) {
          alert.lastState = null;
          mutated = true;
        }
        continue;
      }

      const currentPrice = Number(coin.current_price ?? coin.price ?? coin.last_price ?? null);
      if (!Number.isFinite(currentPrice)) {
        if (alert.lastPrice !== null) {
          alert.lastPrice = null;
          mutated = true;
        }
        continue;
      }

      if (alert.lastPrice !== currentPrice) {
        alert.lastPrice = currentPrice;
        mutated = true;
      }

      const evaluator = ALERT_CONDITIONS[alert.condition]?.check;
      const meetsCondition = evaluator ? evaluator(currentPrice, alert.target) : false;
      const wasTriggered = alert.lastState === true;

      if (meetsCondition !== wasTriggered) {
        alert.lastState = meetsCondition;
        mutated = true;
      }

      if (meetsCondition && !wasTriggered && alert.active !== false) {
        const timestamp = Date.now();
        alert.lastTriggeredAt = timestamp;
        alert.triggerCount = (alert.triggerCount || 0) + 1;
        triggered.push({
          id: alert.id,
          symbol: alert.symbol,
          name: alert.name,
          condition: alert.condition,
          target: alert.target,
          price: currentPrice,
          timestamp
        });
        if (!alert.repeat) {
          alert.active = false;
        }
        mutated = true;
      }
    }

    if (mutated) saveAlertsToStorage();

    return { changed: mutated, triggered };
  }

  function renderAlertsSummary() {
    ensureAlertsStateLoaded();
    const summary = document.getElementById('alertsSummary');
    if (!summary) return;
    const total = alertsState.length;
    if (total === 0) {
      summary.textContent = 'Sin alertas configuradas';
      return;
    }
    const active = alertsState.filter((alert) => alert.active !== false).length;
    summary.textContent = `${active} activas de ${total}`;
  }

  function renderAlertsList() {
    ensureAlertsStateLoaded();
    const list = document.getElementById('alertsList');
    const empty = document.getElementById('alertsEmpty');
    if (!list || !empty) return;

    if (!alertsState.length) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }

    empty.classList.add('hidden');

    const sorted = [...alertsState].sort((a, b) => b.createdAt - a.createdAt);
    list.innerHTML = sorted
      .map((alert) => {
        const status = getAlertStatus(alert);
        const conditionLabel = ALERT_CONDITIONS[alert.condition]?.label || alert.condition;
        const targetText = formatUsd(alert.target);
        const lastPriceText = Number.isFinite(alert.lastPrice) ? formatUsd(alert.lastPrice) : 'Sin datos';
        const createdText = relativeTimeFrom(alert.createdAt) || '-';
        const triggeredText = alert.lastTriggeredAt ? relativeTimeFrom(alert.lastTriggeredAt) : 'Pendiente';
        const repeatLabel = alert.repeat ? 'Recurrente' : 'Un solo uso';
        return `
        <li class="alert-item" data-id="${sanitizeText(alert.id)}">
          <div class="alert-item__top">
            <div>
              <div class="alert-item__title">${sanitizeText(alert.name)} <span>(${sanitizeText(alert.symbol)})</span></div>
              <div class="alert-item__status">
                <span class="alert-status ${status.className}">${sanitizeText(status.label)}</span>
                <span>${sanitizeText(repeatLabel)}</span>
              </div>
            </div>
            <div class="alert-item__actions">
              <button type="button" class="alert-action" data-action="toggle" data-id="${sanitizeText(alert.id)}">
                ${alert.active === false ? 'Reanudar' : 'Pausar'}
              </button>
              <button type="button" class="alert-action" data-action="delete" data-id="${sanitizeText(alert.id)}">Eliminar</button>
            </div>
          </div>
          <div class="alert-item__meta">
            <span><strong>Objetivo</strong>${sanitizeText(targetText)}</span>
            <span><strong>Actual</strong>${sanitizeText(lastPriceText)}</span>
            <span><strong>Condicion</strong>${sanitizeText(conditionLabel)}</span>
            <span><strong>Creada</strong>${sanitizeText(createdText)}</span>
            <span><strong>Ultimo disparo</strong>${sanitizeText(triggeredText)}</span>
          </div>
        </li>
      `;
      })
      .join('');
  }

  function getAlertStatus(alert) {
    if (alert.active === false) {
      return { label: 'Pausada', className: 'alert-status--paused' };
    }
    if (alert.lastState === true) {
      return { label: 'Disparada', className: 'alert-status--triggered' };
    }
    return { label: 'Activa', className: 'alert-status--active' };
  }

  function registerTriggeredAlerts(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return;
    alertsHistory = [...entries, ...alertsHistory].slice(0, ALERTS_HISTORY_LIMIT);
    renderAlertsHistory();

    if (entries.length === 1) {
      const entry = entries[0];
      const conditionLabel = ALERT_CONDITIONS[entry.condition]?.label || entry.condition;
      setAlertStatus(`Se disparo la alerta de ${entry.symbol} (${conditionLabel}).`);
    } else {
      setAlertStatus(`Se dispararon ${entries.length} alertas.`);
    }
  }

  function renderAlertsHistory() {
    const panel = document.getElementById('alertsTriggeredPanel');
    const list = document.getElementById('alertsTriggeredList');
    if (!panel || !list) return;

    if (!alertsHistory.length) {
      panel.classList.add('hidden');
      list.innerHTML = '';
      return;
    }

    panel.classList.remove('hidden');
    list.innerHTML = alertsHistory
      .map((entry) => {
        const conditionLabel = ALERT_CONDITIONS[entry.condition]?.label || entry.condition;
        const targetText = formatUsd(entry.target);
        const priceText = formatUsd(entry.price);
        const timeText = relativeTimeFrom(entry.timestamp);
        return `
        <li class="alert-triggered-item">
          <strong>${sanitizeText(entry.name)} (${sanitizeText(entry.symbol)})</strong>
          <span>${sanitizeText(conditionLabel)} ${sanitizeText(targetText)} · Actual ${sanitizeText(priceText)} · ${sanitizeText(timeText)}</span>
        </li>
      `;
      })
      .join('');
  }

  function setAlertStatus(message, isError = false) {
    const statusEl = document.getElementById('alertFormStatus');
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.classList.toggle('error', Boolean(isError));
    if (alertStatusTimeoutId) {
      clearTimeout(alertStatusTimeoutId);
      alertStatusTimeoutId = null;
    }
    if (message && !isError) {
      alertStatusTimeoutId = window.setTimeout(() => {
        statusEl.textContent = '';
        statusEl.classList.remove('error');
        alertStatusTimeoutId = null;
      }, 5000);
    }
  }

  function findCoinByKey(key) {
    const normalized = String(key || '').toLowerCase();
    if (!normalized) return null;
    return (
      allCoins.find((coin) => {
        const id = String(coin.id || coin.coingecko_id || '').toLowerCase();
        if (id && id === normalized) return true;
        const symbol = String(coin.symbol || '').toLowerCase();
        return symbol === normalized;
      }) || null
    );
  }

  setInterval(() => {
    if (alertsHistory.length > 0) {
      renderAlertsHistory();
    }
  }, 60000);

  // ====================
  //   FAVORITOS (POST)
  // ====================
  document.getElementById('prices')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-fav');
    if (!btn) return;
    const card = e.target.closest('.coin-card');
    const token = localStorage.getItem('token');
    if (!token) return alert('Debes iniciar sesion para usar favoritos.');

    // Prepara el payload con los campos aceptados por la API de favoritos
    const priceText = card.querySelector('.price')?.textContent || '';
    const priceValue = Number(priceText.replace(/[$,]/g, '')) || 0;
    const payload = {
      coinId: card.dataset.id,
      symbol: card.dataset.symbol,
      name: card.dataset.name,
      current_price: priceValue
    };

    try {
      const res = await fetch(FAVORITES_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        alert('Anadido a favoritos');
      } else {
        alert(data.error || data.message || 'No se pudo anadir a favoritos');
      }
    } catch (err) {
      console.error(err);
      alert('Error de red al anadir favorito');
    }
  });

  // ===========================
  //   MODAL DETALLE (Inicio)
  // ===========================
  document.getElementById('prices')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-detail');
    if (!btn) return;
    const card = e.target.closest('.coin-card');
    openCoinModal(card.dataset.id, card.dataset.name, card.querySelector('.coin-icon')?.src);
  });

  document.getElementById('prices')?.addEventListener('click', (e) => {
    const goHomeBtn = e.target.closest('.btn-go-home');
    if (goHomeBtn) {
      showSection('analys');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const goAlertsBtn = e.target.closest('.btn-go-alerts');
    if (goAlertsBtn) {
      showSection('alerts');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  // ==============================
  //   MODAL DETALLE (Favoritos)
  // ==============================
  document.getElementById('favList')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-detail');
    if (!btn) return;
    const card = e.target.closest('.coin-card');
    openCoinModal(card.dataset.id, card.dataset.name, card.querySelector('.coin-icon')?.src);
  });

  document.getElementById('favList')?.addEventListener('click', (e) => {
    const goHomeBtn = e.target.closest('.btn-go-home');
    if (goHomeBtn) {
      showSection('analys');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const goAlertsBtn = e.target.closest('.btn-go-alerts');
    if (goAlertsBtn) {
      showSection('alerts');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  // ==========================
  //   MODAL: estado y logica
  // ==========================
  let modalAbort = null; // para cancelar peticiones del modal

  document.getElementById('modalClose')?.addEventListener('click', () => closeModal());
  document.getElementById('crypto-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'crypto-modal') closeModal();
  });

  function closeModal() {
    const modal = document.getElementById('crypto-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.removeAttribute('data-coin-id');
    if (modalAbort) {
      modalAbort.abort();
      modalAbort = null;
    }
  }

  async function openCoinModal(coinId, name, icon) {
    const modal = document.getElementById('crypto-modal');
    if (!modal) return;
    modal.dataset.coinId = coinId;
    document.getElementById('modalIcon').src = icon || '';
    document.getElementById('modalTitle').textContent = name;
    modal.classList.remove('hidden');
    await fillModal(coinId);
  }

  async function fillModal(coinId) {
    try {
      // cancela cualquier peticion anterior del modal
      if (modalAbort) modalAbort.abort();
      modalAbort = new AbortController();

      // anti-cache del navegador/proxy
      const res = await fetch(`${ANALYSIS_API}/coin/${coinId}?_=${Date.now()}`, {
        signal: modalAbort.signal,
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!res.ok) throw new Error('Error detalle');
      const d = await res.json();

      document.getElementById('modalPrice').textContent = `$${(d.current_price ?? 0).toLocaleString()}`;
      document.getElementById('modalCap').textContent = `$${(d.market_cap ?? 0).toLocaleString()}`;
      document.getElementById('modalVol').textContent = `$${(d.total_volume ?? 0).toLocaleString()}`;
      document.getElementById('modalAth').textContent = `$${(d.ath ?? 0).toLocaleString()}`;

      // badges informativos (no son botones)
      setBadge('modal1h', d.price_change_percentage_1h);
      setBadge('modal24h', d.price_change_percentage_24h);
      setBadge('modal7d', d.price_change_percentage_7d);

      const desc = (d.description || '').replace(/<\/?[^>]+(>|$)/g, '');
      document.getElementById('modalDescription').textContent = desc.slice(0, 600) + (desc.length > 600 ? '...' : '');
    } catch (err) {
      if (err.name !== 'AbortError') console.error(err);
    }
  }

  function setBadge(id, val) {
    const el = document.getElementById(id);
    if (!el) return;
    const n = Number(val || 0);
    el.textContent = `${id.replace('modal', '')}: ${isNaN(n) ? '-' : n.toFixed(2) + '%'}`;
    el.classList.remove('positive', 'negative');
    if (!isNaN(n)) el.classList.add(n >= 0 ? 'positive' : 'negative');
  }

  // =================
  //   Analisis
  // =================
  window.getAnalys = async function () {
    const symbolSelect = document.getElementById('analysisSymbol');
    const daysSelect = document.getElementById('analysisDays');
    const summary = document.getElementById('analysisSummary');
    const chartWrapper = document.getElementById('analysisChartWrapper');
    const messageEl = document.getElementById('analysisMessage');
    if (!symbolSelect || !daysSelect || !summary || !chartWrapper || !messageEl) {
      return;
    }

    const symbol = (symbolSelect.value || '').trim().toUpperCase();
    const days = Number(daysSelect.value || 7);
    const vs = 'usd';

    if (!symbol) {
      summary.classList.add('hidden');
      chartWrapper.classList.add('hidden');
      messageEl.textContent = 'Selecciona una criptomoneda de la lista.';
      messageEl.classList.remove('error');
      return;
    }

    messageEl.textContent = 'Cargando analisis...';
    messageEl.classList.remove('error');
    summary.classList.add('hidden');
    chartWrapper.classList.add('hidden');

    try {
      const res = await fetch(`${ANALYSIS_API}/${symbol}?vs=${vs}&days=${days}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(payload?.detail || 'No se pudo obtener el analisis');
        err.status = res.status;
        throw err;
      }
      const data = payload;

      updateAnalysisSummary(data, vs);
      summary.classList.remove('hidden');

      let coinEntry = allCoins.find((item) => (item.symbol || '').toUpperCase() === symbol);
      if (!coinEntry && LAST_PRICES.length === 0) {
        await loadPrices();
        coinEntry = allCoins.find((item) => (item.symbol || '').toUpperCase() === symbol);
      }

      if (!coinEntry) {
        messageEl.textContent = 'No se encontro la moneda seleccionada. Pulsa "Actualizar precios" para sincronizarla.';
        messageEl.classList.add('error');
        return;
      }

      const detailRes = await fetch(`${ANALYSIS_API}/coin/${coinEntry.id}?vs=${vs}&days=${days}`);
      const detailPayload = await detailRes.json().catch(() => ({}));
      if (!detailRes.ok) {
        const err = new Error(detailPayload?.detail || 'No se pudo obtener la serie historica');
        err.status = detailRes.status;
        throw err;
      }
      const detail = detailPayload;
      const series = Array.isArray(detail.prices_series) ? detail.prices_series : [];

      if (series.length === 0) {
        messageEl.textContent = 'No hay serie historica disponible para el periodo seleccionado.';
        messageEl.classList.add('error');
        return;
      }

      const coinLabel = symbolSelect.options?.[symbolSelect.selectedIndex]?.textContent || coinEntry.nombre || symbol;
      renderAnalysisChart(series, coinLabel, symbol, vs.toUpperCase());
      chartWrapper.classList.remove('hidden');
      messageEl.textContent = '';
      messageEl.classList.remove('error');
    } catch (error) {
      console.error('Error en el analisis:', error);
      const needsSync = error?.status === 503 || String(error?.message || '').toLowerCase().includes('sincron');
      if (needsSync) {
        messageEl.textContent = 'Sin datos sincronizados. Pulsa "Actualizar precios" para registrar nuevas cotizaciones.';
      } else {
        messageEl.textContent = error?.message || 'No fue posible completar el analisis.';
      }
      messageEl.classList.add('error');
    }
  };

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function updateAnalysisSummary(data, vs) {
    const updatedAt = data.last_updated ? Date.parse(data.last_updated) : 0;
    setText('analysisPrice', formatUsd(data.last_price));
    setText('analysisAverage', formatUsd(data.average_price));
    setText('analysisMax', formatUsd(data.max_price));
    setText('analysisMin', formatUsd(data.min_price));
    setText('analysisVolatility', data.volatility !== null && data.volatility !== undefined ? formatNumber(data.volatility, 2) : '-');
    setText('analysisChange24h', formatPercent(data.change_24h));
    setText('analysisChange7d', formatPercent(data.change_7d));
    setText(
      'analysisTrend',
      data.trend
        ? `${data.trend.toUpperCase()} ${data.variation_pct !== null && data.variation_pct !== undefined ? '(' + formatPercent(data.variation_pct) + ')' : ''}`.trim()
        : '-'
    );
    const updatedLabel = data.last_updated ? `${formatDateTime(data.last_updated)} (${relativeTimeFrom(updatedAt)})` : '-';
    setText('analysisUpdated', updatedLabel);
  }

  function renderAnalysisChart(series, name, symbol, vsLabel) {
    const canvas = document.getElementById('analysisChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const stride = Math.max(1, Math.floor(series.length / 200));
    const normalizedSeries = series.filter((_, index) => index % stride === 0);
    const labels = normalizedSeries.map((point) => {
      const date = new Date(point[0]);
      return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    });
    const values = normalizedSeries.map((point) => Number(point[1] ?? 0));
    const datasetLabel = `${name} (${symbol}) ${vsLabel}`;

    if (analysisChart) {
      analysisChart.destroy();
    }

    analysisChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: datasetLabel,
            data: values,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.15)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.25,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: {
              maxRotation: 0,
              minRotation: 0
            },
            grid: {
              display: false
            }
          },
          y: {
            beginAtZero: false,
            grid: {
              color: 'rgba(148, 163, 184, 0.2)'
            },
            ticks: {
              callback: (value) => formatUsd(value)
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: (context) => ` ${formatUsd(context.parsed.y)}`
            }
          }
        }
      }
    });
  }


  // =================
  //   Favoritos (UI)
  // =================
  window.loadFavorites = async function () {
    const favDiv = document.getElementById('favList');
    if (!favDiv) return;

    favDiv.textContent = 'Cargando favoritos...';
    const token = localStorage.getItem('token');
    if (!token) {
      favDiv.textContent = 'Debes iniciar sesion para ver favoritos.';
      return;
    }

    try {
      const [favRes, pricesRes] = await Promise.all([
        fetch(FAVORITES_API, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${ANALYSIS_API}/prices`)
      ]);

      const favList = await favRes.json();
      const all = await pricesRes.json();

      if (!favRes.ok) {
        favDiv.textContent = favList?.error || favList?.message || 'Error al cargar favoritos.';
        return;
      }
      if (!Array.isArray(favList) || favList.length === 0) {
        favDiv.textContent = 'No tienes criptomonedas favoritas aun.';
        return;
      }

      const favIdByKey = new Map();
      for (const f of favList) {
        const keyById = (f.coinId || f.id || '').toString();
        const keyBySym = (f.symbol || '').toLowerCase();
        if (keyById) favIdByKey.set(keyById, f._id || f.id || f._id);
        if (keyBySym) favIdByKey.set(keyBySym, f._id || f.id || f._id);
      }

      const isFav = (coin) => favIdByKey.has(coin.id) || favIdByKey.has((coin.symbol || '').toLowerCase());

      const favoritesFull = all.filter(isFav);

      if (favoritesFull.length === 0) {
        favDiv.textContent = 'No se encontraron datos de mercado para tus favoritas.';
        return;
      }

      favDiv.innerHTML = favoritesFull
        .map((coin, index) => {
          const ch24 = (coin.price_change_percentage_24h || 0).toFixed(2);
          const chClass = ch24 >= 0 ? 'positive' : 'negative';
          const icon = coin.image || 'https://cdn-icons-png.flaticon.com/512/825/825464.png';
          const favDocId = favIdByKey.get(coin.id) || favIdByKey.get((coin.symbol || '').toLowerCase()) || '';
          const accent = index % 5;
          const accentClass = `coin-card--accent-${accent}`;
          return `
          <div class="coin-card ${accentClass}" data-id="${coin.id}" data-symbol="${coin.symbol}" data-name="${coin.nombre}">
            <button class="icon-button btn-fav" type="button" title="Guardado en favoritos" disabled>
              <span class="icon" aria-hidden="true">&#9733;</span>
              <span class="sr-only">Guardado en favoritos</span>
            </button>
            <button class="icon-button btn-detail" type="button" title="Ver detalle">
              <span class="icon" aria-hidden="true">&#128269;</span>
              <span class="sr-only">Ver detalle</span>
            </button>
            <button class="icon-button btn-go-home" type="button" title="Ir a Inicio">
              <span class="icon" aria-hidden="true">&#128200;</span>
              <span class="sr-only">Ir a la seccion Inicio</span>
            </button>
            <button class="icon-button btn-go-alerts" type="button" title="Ir a Alertas">
              <span class="icon" aria-hidden="true">&#128276;</span>
              <span class="sr-only">Ir a la seccion Alertas</span>
            </button>
            <button class="icon-button btn-remove remove-fav" type="button" data-id="${favDocId}" title="Eliminar de favoritos">
              <span class="icon" aria-hidden="true">&#10005;</span>
              <span class="sr-only">Eliminar de favoritos</span>
            </button>
            <img src="${icon}" alt="${coin.nombre}" class="coin-icon" />
            <div class="coin-info">
              <h3>${coin.nombre} <span>(${(coin.symbol || '').toUpperCase()})</span></h3>
              <p class="price">$${(coin.current_price ?? 0).toLocaleString()}</p>
              <p class="change ${chClass}">${ch24 >= 0 ? '+' : '-'} ${ch24}% (24h)</p>
              <div class="coin-meta">
                <span><strong>Cap</strong> $${(coin.market_cap ?? 0).toLocaleString()}</span>
                <span><strong>Vol 24h</strong> $${(coin.total_volume ?? 0).toLocaleString()}</span>
                <span><strong>Rank</strong> #${coin.market_cap_rank ?? '-'}</span>
                <span><strong>ATH</strong> $${(coin.ath ?? 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
        `;
        })
        .join('');
    } catch (err) {
      console.error('X Error:', err);
      favDiv.textContent = 'Error de red al cargar favoritos.';
    }
  };

  // Eliminar favorito
  document.getElementById('favList')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.remove-fav');
    if (!btn) return;
    const token = localStorage.getItem('token');
    if (!token) return alert('No autorizado');
    try {
      const res = await fetch(`${FAVORITES_API}/${btn.dataset.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        alert('Favorito eliminado');
        loadFavorites(); // Recargar lista
      } else {
        alert('No se pudo eliminar');
      }
    } catch (err) {
      console.error(err);
    }
  });
});
