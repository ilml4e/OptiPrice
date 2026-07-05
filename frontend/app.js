const form = document.getElementById('optimizerForm');
const submitBtn = document.getElementById('submitBtn');
const statusBox = document.getElementById('statusBox');
const fillExampleBtn = document.getElementById('fillExample');
const currencySelect = document.getElementById('currency_select');
const saveScenarioBtn = document.getElementById('saveScenarioBtn');
const exportExcelBtn = document.getElementById('exportExcelBtn');

const resultPrice = document.getElementById('resultPrice');
const resultProfit = document.getElementById('resultProfit');
const resultQuantity = document.getElementById('resultQuantity');
const resultRevenue = document.getElementById('resultRevenue');
const resultCost = document.getElementById('resultCost');
const capacityBadge = document.getElementById('capacityBadge');

const formulaDemand = document.getElementById('formulaDemand');
const formulaVariableCost = document.getElementById('formulaVariableCost');
const formulaRevenue = document.getElementById('formulaRevenue');
const formulaCost = document.getElementById('formulaCost');
const formulaProfit = document.getElementById('formulaProfit');
const formulaFirstDerivative = document.getElementById('formulaFirstDerivative');
const formulaSecondDerivative = document.getElementById('formulaSecondDerivative');
const mathExplanation = document.getElementById('mathExplanation');
const feasibleDomain = document.getElementById('feasibleDomain');
const criticalPointsList = document.getElementById('criticalPointsList');

let lastOptimizationData = null;
let comparisonOptimizationData = null;
let historialDemanda = [];
let historialPreciosGuardado = [];

// ─── Validación en tiempo real ────────────────────────────────

function setupRealTimeValidation() {
  const numericInputs = [
    'usual_price', 'usual_quantity', 'promo_price',
    'promo_quantity', 'unit_cost'
  ];
  numericInputs.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => validateField(id));
    el.addEventListener('blur', () => validateField(id, true));
  });

  // Validación cruzada de precios
  const promoPrice = document.getElementById('promo_price');
  const usualPrice = document.getElementById('usual_price');
  if (promoPrice && usualPrice) {
    promoPrice.addEventListener('input', () => validateCrossPrices());
    usualPrice.addEventListener('input', () => validateCrossPrices());
  }
}

function validateField(id, showAll = false) {
  const el = document.getElementById(id);
  if (!el) return;
  const val = Number(el.value);
  let errorMsg = '';

  if (el.value === '' || isNaN(val)) {
    if (showAll) errorMsg = 'Este campo es obligatorio.';
  } else if (val <= 0) {
    errorMsg = 'Debe ser mayor que cero.';
  }

  const parent = el.closest('div');
  const existingError = parent?.querySelector('.field-error');
  if (existingError) existingError.remove();

  if (errorMsg) {
    el.classList.add('border-red-500/50', 'ring-2', 'ring-red-500/30');
    el.classList.remove('focus:border-emerald-500/50', 'focus:ring-emerald-500/30');
    const err = document.createElement('p');
    err.className = 'field-error mt-1 text-xs text-red-400';
    err.textContent = errorMsg;
    parent?.appendChild(err);
  } else {
    el.classList.remove('border-red-500/50', 'ring-2', 'ring-red-500/30');
    el.classList.add('focus:border-emerald-500/50', 'focus:ring-emerald-500/30');
  }
}

function validateCrossPrices() {
  const promo = document.getElementById('promo_price');
  const usual = document.getElementById('usual_price');
  // Limpiar errores previos
  document.querySelectorAll('.cross-error').forEach(e => e.remove());

  if (promo && usual && promo.value && usual.value) {
    const pVal = Number(promo.value);
    const uVal = Number(usual.value);
    if (pVal >= uVal) {
      const err = document.createElement('p');
      err.className = 'cross-error mt-1 text-xs text-red-400 font-semibold';
      err.textContent = '⚠ El precio de oferta debe ser MENOR que el precio habitual.';
      promo.closest('div')?.appendChild(err);
      promo.classList.add('border-red-500/50', 'ring-2', 'ring-red-500/30');
      usual.classList.add('border-red-500/50', 'ring-2', 'ring-red-500/30');
    } else {
      promo.classList.remove('border-red-500/50', 'ring-2', 'ring-red-500/30');
      usual.classList.remove('border-red-500/50', 'ring-2', 'ring-red-500/30');
    }
  }
}

function checkCrossPriceError() {
  const promo = document.getElementById('promo_price');
  const usual = document.getElementById('usual_price');
  if (promo && usual && promo.value && usual.value) {
    return Number(promo.value) >= Number(usual.value);
  }
  return false;
}


//--- abrir el modal de historial de precios ---

// Funciones para controlar la visibilidad del modal


function agregarCampoPrecio() {
    const contenedor = document.getElementById('contenedor-precios');
    const nuevaFila = document.createElement('div');
    nuevaFila.className = 'flex items-center gap-2 fila-historial';
    
    nuevaFila.innerHTML = `
        <input type="number" step="any" class="precio-input w-full min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30" placeholder="Precio">
        
        <input type="number" step="any" class="cantidad-input w-full min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30" placeholder="Cantidad">
        
        <button type="button" onclick="eliminarFila(this)" class="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-400 transition hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-400" title="Eliminar fila">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
        </button>
    `;
    
    contenedor.appendChild(nuevaFila);
    
    contenedor.scrollTop = contenedor.scrollHeight;
}

// NUEVA FUNCIÓN: Elimina solo la fila donde se hizo clic
function eliminarFila(botonReferencia) {
    const fila = botonReferencia.closest('.fila-historial');
    fila.remove();
    
    // Si el usuario borró la última fila que quedaba, agregamos una limpia
    const contenedor = document.getElementById('contenedor-precios');
    if (contenedor.children.length === 0) {
        agregarCampoPrecio();
    }
}

// NUEVA FUNCIÓN: Borra todo de golpe
function limpiarTodoHistorial() {
    const contenedor = document.getElementById('contenedor-precios');
    contenedor.innerHTML = ''; // Borra el contenido por completo
    agregarCampoPrecio(); // Crea una nueva fila en blanco para empezar
}

function abrirModal() {
    const modal = document.getElementById('modal-historial');
    modal.classList.remove('hidden'); // Quita el ocultamiento
}

function cerrarModal() {
    const modal = document.getElementById('modal-historial');
    modal.classList.add('hidden'); // Vuelve a ocultarlo
}

function guardarYcerrarModal() {
    historialDemanda = []; // Limpiar antes de guardar
    const filas = document.querySelectorAll('.fila-historial');
    
    filas.forEach(fila => {
        const precio = fila.querySelector('.precio-input').value;
        const cantidad = fila.querySelector('.cantidad-input').value;
        
        // Solo guardar si ambos campos tienen información
        if(precio !== "" && cantidad !== "") {
            historialDemanda.push({
                precio: parseFloat(precio),
                cantidad: parseFloat(cantidad)
            });
        }
    });
    
    cerrarModal();
}
// ─── Utilidades ──────────────────────────────────────────────




function getCurrencyConfig() {
  const selectedCurrency = currencySelect?.value || 'CLP';

  if (selectedCurrency === 'CLP') {
    return {
      locale: 'es-CL',
      currency: 'CLP',
      maximumFractionDigits: 0
    };
  }

  return {
    locale: 'es-ES',
    currency: selectedCurrency,
    maximumFractionDigits: 2
  };
}

function getCurrencySymbol() {
  const selectedCurrency = currencySelect?.value || 'CLP';
  const symbolMap = {
    CLP: '$',
    USD: '$',
    EUR: '€',
    MXN: '$'
  };

  return symbolMap[selectedCurrency] || '$';
}

function showStatus(message, type = 'info') {
  statusBox.classList.remove(
    'hidden',
    'border-red-500/40', 'bg-red-500/10', 'text-red-200',
    'border-emerald-500/40', 'bg-emerald-500/10', 'text-emerald-200',
    'border-indigo-500/40', 'bg-indigo-500/10', 'text-indigo-200'
  );

  if (type === 'error') {
    statusBox.classList.add('border-red-500/40', 'bg-red-500/10', 'text-red-200');
  } else if (type === 'success') {
    statusBox.classList.add('border-emerald-500/40', 'bg-emerald-500/10', 'text-emerald-200');
  } else {
    statusBox.classList.add('border-indigo-500/40', 'bg-indigo-500/10', 'text-indigo-200');
  }

  statusBox.textContent = message;
}

function currency(value) {
  const config = getCurrencyConfig();

  return new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: config.currency,
    maximumFractionDigits: config.maximumFractionDigits
  }).format(value);
}

function number(value) {
  return new Intl.NumberFormat('es-ES', {
    maximumFractionDigits: 2
  }).format(value);
}

function fillExample() {
  document.getElementById('usual_price').value = '50';
  document.getElementById('usual_quantity').value = '200';
  document.getElementById('promo_price').value = '35';
  document.getElementById('promo_quantity').value = '500';
  document.getElementById('fixed_cost').value = '0';
  document.getElementById('unit_cost').value = '12';
  document.getElementById('max_capacity').value = '';
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function renderCriticalPoints(points) {
  criticalPointsList.innerHTML = '';

  if (!points.length) {
    criticalPointsList.innerHTML =
      '<li class="text-slate-400">No se detectaron puntos críticos reales dentro del modelo simbólico.</li>';
    return;
  }

  points.forEach((point) => {
    const li = document.createElement('li');
    li.className = 'rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3';
    li.innerHTML = `
      <span class="font-semibold text-slate-100">p = ${number(point.price)}</span>
      <span class="text-slate-400"> · q = ${number(point.quantity)}</span>
      <span class="ml-2 text-xs font-semibold px-2 py-1 rounded-full ${point.feasible ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}">
        ${point.feasible ? 'Factible' : 'No factible'}
      </span>
    `;
    criticalPointsList.appendChild(li);
  });
}

function renderChart(chart, comparisonChart = null) {
  const currencyLabel = getCurrencyConfig().currency;
  const traces = [];

  // Ingresos (Revenue)
  traces.push({
    x: chart.prices, y: chart.revenues,
    mode: 'lines', name: 'Ingresos',
    line: { color: '#0ea5e9', width: 2, dash: 'dot' }, // Sky
    opacity: 0.6,
    hovertemplate: `Precio: %{x}<br>Ingresos: %{y} ${currencyLabel}<extra></extra>`
  });

  // Costos
  traces.push({
    x: chart.prices, y: chart.costs,
    mode: 'lines', name: 'Costos Totales',
    line: { color: '#f43f5e', width: 2, dash: 'dot' }, // Rose
    opacity: 0.6,
    hovertemplate: `Precio: %{x}<br>Costos: %{y} ${currencyLabel}<extra></extra>`
  });

  // Ganancia principal
  traces.push({
    x: chart.prices, y: chart.profits,
    mode: 'lines', name: 'Ganancia π(p)',
    line: { color: '#34d399', width: 4 }, // Emerald
    hovertemplate: `Precio: %{x}<br>Ganancia: %{y} ${currencyLabel}<extra></extra>`
  });

  // Óptimo
  traces.push({
    x: [chart.optimal_point.price], y: [chart.optimal_point.profit],
    mode: 'markers+text', name: 'Óptimo',
    text: ['Óptimo'], textposition: 'top center',
    marker: { color: '#10b981', size: 14, line: { color: '#ecfeff', width: 2 } },
    hovertemplate: `Precio óptimo: %{x}<br>Ganancia máxima: %{y} ${currencyLabel}<extra></extra>`
  });

  const layout = {
    paper_bgcolor: 'rgba(15, 23, 42, 0)',
    plot_bgcolor: 'rgba(15, 23, 42, 0)',
    font: { color: '#cbd5e1' },
    margin: { t: 20, r: 20, b: 60, l: 70 },
    xaxis: { title: 'Precio', gridcolor: 'rgba(148, 163, 184, 0.15)' },
    yaxis: { title: 'Monto', gridcolor: 'rgba(148, 163, 184, 0.15)', rangemode: 'tozero' },
    legend: { orientation: 'h', y: 1.15, x: 0 },
    hovermode: 'x unified' // Mejora UX para comparar series al mismo tiempo
  };

  Plotly.newPlot('profitChart', traces, layout, { responsive: true });
}


function renderResultViews(data) {
  resultPrice.textContent = currency(data.optimal.price);
  resultProfit.textContent = currency(data.optimal.max_profit);
  resultQuantity.textContent = `${number(data.optimal.quantity)} u.`;
  resultRevenue.textContent = currency(data.optimal.projected_revenue);
  resultCost.textContent = currency(data.optimal.projected_total_cost);

  if(resultElasticity) {
      resultElasticity.textContent = number(data.optimal.elasticity);
      resultElasticity.title = Math.abs(data.optimal.elasticity) > 1 ? "Demanda Elástica" : "Demanda Inelástica";
  }
  if(sensDownPrice && sensUpPrice) {
      sensDownPrice.textContent = currency(data.sensitivity.unit_cost_down_10.suggested_price);
      sensUpPrice.textContent = currency(data.sensitivity.unit_cost_up_10.suggested_price);
  }

  formulaDemand.textContent = `q(p) = ${data.formulas.demand_deduced}`;
  formulaVariableCost.textContent = `c(q) = ${data.formulas.variable_cost_deduced}`;
  formulaRevenue.textContent = data.formulas.revenue;
  formulaCost.textContent = data.formulas.total_cost;
  formulaProfit.textContent = data.formulas.profit;
  formulaFirstDerivative.textContent = data.formulas.first_derivative;
  formulaSecondDerivative.textContent = data.formulas.second_derivative;

  mathExplanation.textContent = data.optimal.mathematical_check;
  feasibleDomain.textContent =
    `Dominio factible de análisis: precio entre ${number(data.optimal.feasible_domain.price_min)} y ${number(data.optimal.feasible_domain.price_max)}.`;

  renderCriticalPoints(data.critical_points);
  renderChart(data.chart, comparisonOptimizationData?.chart || null);

  if (data.optimal.capacity_is_binding) {
    capacityBadge.classList.remove('hidden');
    capacityBadge.title = 'El límite de producción está frenando la ganancia máxima';
  } else {
    capacityBadge.classList.add('hidden');
    capacityBadge.title = '';
  }
}


function buildExcelRows(data) {
  const capacityValue = data.inputs.max_capacity == null ? 'Sin límite explícito' : `${number(data.inputs.max_capacity)} unidades`;
  const projectedRevenue = data.optimal.projected_revenue ?? (data.optimal.price * data.optimal.quantity);
  const projectedCost = data.optimal.projected_total_cost ?? ((data.optimal.price * data.optimal.quantity) - data.optimal.max_profit);

  return [
    ['Reporte de Optimización de Precios - OptiPrice'],
    [],
    ['--- DATOS INGRESADOS ---'],
    ['Precio habitual de venta', currency(data.inputs.usual_price)],
    ['Cantidad vendida al precio habitual', `${number(data.inputs.usual_quantity)} unidades`],
    ['Precio en oferta/prueba', currency(data.inputs.promo_price)],
    ['Cantidad vendida al precio de oferta', `${number(data.inputs.promo_quantity)} unidades`],
    ['Costo de producción por unidad', currency(data.inputs.unit_cost)],
    ['Costo fijo total', currency(data.inputs.fixed_cost)],
    ['Capacidad máxima de producción', capacityValue],
    [],
    ['--- RESULTADOS DE LA OPTIMIZACIÓN ---'],
    ['Precio óptimo', currency(data.optimal?.price)],
    ['Ganancia máxima', currency(data.optimal?.max_profit)],
    ['Cantidad óptima', `${number(data.optimal?.quantity)} unidades`],
    ['Ingresos totales proyectados', currency(data.optimal?.projected_revenue)],
    ['Costos totales proyectados', currency(data.optimal?.projected_total_cost)],
    ['Margen de ganancia', data.optimal?.profit_margin_percent != null ? `${number(data.optimal.profit_margin_percent)}%` : 'N/A'],
    ['Elasticidad precio-demanda', data.optimal?.elasticity_at_optimum != null ? number(data.optimal.elasticity_at_optimum) : 'N/A'],
    ['Punto(s) de equilibrio', be],
    ['Demanda deducida', data.formulas?.demand_deduced || 'N/A'],
    ['Ingresos', data.formulas?.revenue || 'N/A'],
    ['Costos', data.formulas?.total_cost || 'N/A'],
    ['Ganancia', data.formulas?.profit || 'N/A'],
    ['Primera derivada', data.formulas?.first_derivative || 'N/A'],
    ['Segunda derivada', data.formulas?.second_derivative || 'N/A'],
    ['Elasticidad', data.formulas?.elasticity || 'N/A'],
    [],
    ['--- ANÁLISIS DE SENSIBILIDAD ---'],
    ['Parámetro', 'Variación', 'Valor', 'Precio óptimo', 'Ganancia máxima', 'Cantidad óptima'],
  ];

  if (data.sensitivity?.scenarios) {
    data.sensitivity.scenarios.forEach(s => {
      rows.push([
        s.parametro,
        s.variacion,
        number(s.valor),
        s.precio_optimo != null ? currency(s.precio_optimo) : 'N/A',
        s.ganancia_maxima != null ? currency(s.ganancia_maxima) : 'N/A',
        s.cantidad_optima != null ? `${number(s.cantidad_optima)} u.` : 'N/A',
      ]);
    });
  }

  return rows;
}

// ─── Acciones ────────────────────────────────────────────────



function saveScenarioForCompare() {
  if (!lastOptimizationData) {
    showStatus('Primero calcula un escenario para poder guardarlo.', 'info');
    return;
  }

  comparisonOptimizationData = cloneData(lastOptimizationData);
  renderResultViews(lastOptimizationData);
  showStatus('Escenario guardado para comparación.', 'success');
}

async function exportDashboardExcel() {
  if (!lastOptimizationData) {
    showStatus('Primero calcula un escenario para exportarlo a Excel.', 'info');
    return;
  }

  const workbookRows = buildExcelRows(lastOptimizationData);
  const worksheet = XLSX.utils.aoa_to_sheet(workbookRows);

  worksheet['!cols'] = [
    { wch: 42 },
    { wch: 24 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'OptiPrice');
  XLSX.writeFile(workbook, 'OptiPrice_Resultados.xlsx');
}

async function handleSubmit(event) {
  event.preventDefault();

  submitBtn.disabled = true;
  submitBtn.textContent = 'Calculando...';
  showStatus('Procesando el modelo matemático...', 'info');

  const payload = {
    usual_price: Number(document.getElementById('usual_price').value),
    usual_quantity: Number(document.getElementById('usual_quantity').value),
    promo_price: Number(document.getElementById('promo_price').value),
    promo_quantity: Number(document.getElementById('promo_quantity').value),
    price_history: historialDemanda,
    fixed_cost: Number(document.getElementById('fixed_cost').value),
    unit_cost: Number(document.getElementById('unit_cost').value),
    max_capacity: document.getElementById('max_capacity').value
      ? Number(document.getElementById('max_capacity').value)
      : null,
    chart_points: 300

  };

  try {
    const response = await fetch('/api/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || 'No se pudo resolver la optimización.');
    }

    lastOptimizationData = data;
    renderResultViews(data);

    showStatus('Optimización completada correctamente.', 'success');
  } catch (error) {
    showStatus(error.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Calcular precio óptimo';
  }
}

form.addEventListener('submit', handleSubmit);
fillExampleBtn.addEventListener('click', fillExample);
saveScenarioBtn.addEventListener('click', saveScenarioForCompare);
exportExcelBtn.addEventListener('click', exportDashboardExcel);
currencySelect.addEventListener('change', () => {
  if (lastOptimizationData) {
    renderResultViews(lastOptimizationData);
  }
});

// Carga un ejemplo al abrir la app
fillExample();
