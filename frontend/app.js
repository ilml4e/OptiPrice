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
    ['Precio óptimo', currency(data.optimal.price)],
    ['Ganancia máxima', currency(data.optimal.max_profit)],
    ['Cantidad óptima', `${number(data.optimal.quantity)} unidades`],
    ['Ingresos totales proyectados', currency(projectedRevenue)],
    ['Costos totales proyectados', currency(projectedCost)]
  ];
}

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
