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
const resultMargin = document.getElementById('resultMargin');
const resultElasticity = document.getElementById('resultElasticity');
const capacityBadge = document.getElementById('capacityBadge');

const formulaDemand = document.getElementById('formulaDemand');
const formulaVariableCost = document.getElementById('formulaVariableCost');
const formulaRevenue = document.getElementById('formulaRevenue');
const formulaCost = document.getElementById('formulaCost');
const formulaProfit = document.getElementById('formulaProfit');
const formulaFirstDerivative = document.getElementById('formulaFirstDerivative');
const formulaSecondDerivative = document.getElementById('formulaSecondDerivative');
const formulaElasticity = document.getElementById('formulaElasticity');
const mathExplanation = document.getElementById('mathExplanation');
const feasibleDomain = document.getElementById('feasibleDomain');
const criticalPointsList = document.getElementById('criticalPointsList');
const elasticityExplanation = document.getElementById('elasticityExplanation');
const breakEvenInfo = document.getElementById('breakEvenInfo');
const sensitivityBody = document.getElementById('sensitivityBody');

let lastOptimizationData = null;
let comparisonOptimizationData = null;

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

// ─── Utilidades ──────────────────────────────────────────────

function getCurrencyConfig() {
  const selectedCurrency = currencySelect?.value || 'CLP';
  if (selectedCurrency === 'CLP') {
    return { locale: 'es-CL', currency: 'CLP', maximumFractionDigits: 0 };
  }
  return { locale: 'es-ES', currency: selectedCurrency, maximumFractionDigits: 2 };
}

function getCurrencySymbol() {
  const map = { CLP: '$', USD: '$', EUR: '€', MXN: '$' };
  return map[currencySelect?.value] || '$';
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
  if (value == null || isNaN(value)) return '—';
  const config = getCurrencyConfig();
  return new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: config.currency,
    maximumFractionDigits: config.maximumFractionDigits
  }).format(value);
}

function number(value) {
  if (value == null || isNaN(value)) return '—';
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(value);
}

function fillExample() {
  document.getElementById('usual_price').value = '50';
  document.getElementById('usual_quantity').value = '200';
  document.getElementById('promo_price').value = '35';
  document.getElementById('promo_quantity').value = '500';
  document.getElementById('fixed_cost').value = '0';
  document.getElementById('unit_cost').value = '12';
  document.getElementById('max_capacity').value = '';
  document.querySelectorAll('.field-error, .cross-error').forEach(e => e.remove());
  document.querySelectorAll('input').forEach(el => {
    el.classList.remove('border-red-500/50', 'ring-2', 'ring-red-500/30');
  });
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

// ─── Renderizado ─────────────────────────────────────────────

function renderCriticalPoints(points) {
  criticalPointsList.innerHTML = '';
  if (!points || !points.length) {
    criticalPointsList.innerHTML = '<li class="text-slate-400">No se detectaron puntos críticos reales.</li>';
    return;
  }
  points.forEach(point => {
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
  const currencySymbol = getCurrencySymbol();

  // Calcular rango del eje X
  let maxPrice = chart.price_max || 0;
  if (chart.prices && chart.prices.length > 0) {
    maxPrice = Math.max(maxPrice, ...chart.prices);
  }
  if (comparisonChart && comparisonChart.price_max) {
    maxPrice = Math.max(maxPrice, comparisonChart.price_max);
  }
  // Añadir un 10% de margen
  maxPrice = maxPrice * 1.1 || 100;

  const traces = [];

  // ── Ganancia ──
  if (chart.profits && chart.prices) {
    traces.push({
      x: chart.prices, y: chart.profits, mode: 'lines',
      name: 'Ganancia π(p)',
      line: { color: '#38bdf8', width: 4 },
      hovertemplate: `Precio: %{x:.2f}<br>Ganancia: %{y:.2f} ${currencyLabel}<extra></extra>`
    });
  }

  // ── Ingresos ──
  if (chart.revenues && chart.prices) {
    traces.push({
      x: chart.prices, y: chart.revenues, mode: 'lines',
      name: 'Ingresos I(p)',
      line: { color: '#a78bfa', width: 3, dash: 'dot' },
      opacity: 0.8,
      hovertemplate: `Precio: %{x:.2f}<br>Ingresos: %{y:.2f} ${currencyLabel}<extra></extra>`
    });
  }

  // ── Costos ──
  if (chart.costs && chart.prices) {
    traces.push({
      x: chart.prices, y: chart.costs, mode: 'lines',
      name: 'Costos C(p)',
      line: { color: '#fb7185', width: 3, dash: 'dot' },
      opacity: 0.8,
      hovertemplate: `Precio: %{x:.2f}<br>Costos: %{y:.2f} ${currencyLabel}<extra></extra>`
    });
  }

  // ── Escenario guardado ──
  if (comparisonChart && comparisonChart.profits) {
    traces.push({
      x: comparisonChart.prices, y: comparisonChart.profits, mode: 'lines',
      name: 'Escenario guardado',
      line: { color: '#94a3b8', width: 3, dash: 'dash' },
      opacity: 0.45,
      hovertemplate: `Precio: %{x:.2f}<br>Ganancia guardada: %{y:.2f} ${currencyLabel}<extra></extra>`
    });
  }

  // ── Break-even points ──
  if (chart.break_even_points && chart.break_even_points.length > 0) {
    traces.push({
      x: chart.break_even_points.map(p => p.price),
      y: chart.break_even_points.map(p => p.profit),
      mode: 'markers',
      name: 'Punto de equilibrio',
      marker: {
        color: '#fbbf24',
        size: 12,
        symbol: 'diamond',
        line: { color: '#1e293b', width: 2 }
      },
      hovertemplate: `Precio equilibrio: %{x:.2f}<extra>Break-even</extra>`
    });
  }

  // ── Óptimo ──
  if (chart.optimal_point) {
    traces.push({
      x: [chart.optimal_point.price],
      y: [chart.optimal_point.profit],
      mode: 'markers+text',
      name: 'Óptimo',
      text: ['Óptimo'],
      textposition: 'top center',
      textfont: { color: '#34d399', size: 14, weight: 'bold' },
      marker: { color: '#34d399', size: 16, line: { color: '#ecfeff', width: 3 } },
      hovertemplate: `Precio óptimo: %{x:.2f}<br>Ganancia máx: %{y:.2f} ${currencyLabel}<extra></extra>`
    });
  }

  // ── Óptimo guardado ──
  if (comparisonChart?.optimal_point) {
    traces.push({
      x: [comparisonChart.optimal_point.price],
      y: [comparisonChart.optimal_point.profit],
      mode: 'markers+text',
      name: 'Óptimo guardado',
      text: ['Guardado'],
      textposition: 'bottom center',
      textfont: { color: '#94a3b8', size: 12 },
      marker: { color: '#94a3b8', size: 12, line: { color: '#cbd5e1', width: 1 } },
      opacity: 0.55,
      hovertemplate: `Guardado: %{x:.2f}<extra></extra>`
    });
  }

  const layout = {
    paper_bgcolor: 'rgba(15, 23, 42, 0)',
    plot_bgcolor: 'rgba(15, 23, 42, 0)',
    font: { color: '#cbd5e1', family: 'Inter, system-ui, sans-serif' },
    margin: { t: 40, r: 30, b: 60, l: 80 },
    xaxis: {
      title: { text: 'Precio' },
      gridcolor: 'rgba(148, 163, 184, 0.15)',
      zerolinecolor: 'rgba(148, 163, 184, 0.15)',
      range: [0, maxPrice],
      dtick: maxPrice / 10
    },
    yaxis: {
      title: { text: 'Valor monetario' },
      gridcolor: 'rgba(148, 163, 184, 0.15)',
      zerolinecolor: 'rgba(148, 163, 184, 0.15)',
      tickprefix: `${currencySymbol} `,
      tickformat: '~s',
      separatethousands: true,
      rangemode: 'tozero'
    },
    legend: {
      orientation: 'h',
      y: 1.12,
      x: 0,
      font: { size: 11 },
      bgcolor: 'rgba(15, 23, 42, 0.8)',
      bordercolor: 'rgba(148, 163, 184, 0.2)',
      borderwidth: 1
    },
    hoverlabel: {
      bgcolor: '#1e293b',
      bordercolor: '#334155',
      font: { color: '#f1f5f9', size: 12 }
    }
  };

  if (comparisonChart) {
    layout.annotations = [{
      x: 0.98, y: 1.08, xref: 'paper', yref: 'paper',
      text: 'Curva gris = escenario guardado',
      showarrow: false, font: { size: 11, color: '#94a3b8' }, align: 'right'
    }];
  }

  Plotly.newPlot('profitChart', traces, layout, {
    responsive: true,
    displayModeBar: false,
    toImageButtonOptions: { format: 'png', scale: 2 }
  });
}

function renderSensitivityTable(scenarios) {
  if (!sensitivityBody || !scenarios || scenarios.length === 0) return;
  document.getElementById('sensitivitySection')?.classList.remove('hidden');

  sensitivityBody.innerHTML = '';
  scenarios.forEach(s => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-800 last:border-0';

    const priceCell = s.precio_optimo != null
      ? `<span class="text-cyan-300 font-medium">${currency(s.precio_optimo)}</span>`
      : '<span class="text-slate-500">—</span>';
    const profitCell = s.ganancia_maxima != null
      ? `<span class="text-emerald-300 font-medium">${currency(s.ganancia_maxima)}</span>`
      : '<span class="text-slate-500">—</span>';
    const qtyCell = s.cantidad_optima != null
      ? `${number(s.cantidad_optima)} u.`
      : '—';

    tr.innerHTML = `
      <td class="px-3 py-2 text-sm text-slate-300">${s.parametro}</td>
      <td class="px-3 py-2 text-sm text-slate-300">${s.variacion}</td>
      <td class="px-3 py-2 text-sm text-slate-300">${number(s.valor)}</td>
      <td class="px-3 py-2 text-sm">${priceCell}</td>
      <td class="px-3 py-2 text-sm">${profitCell}</td>
      <td class="px-3 py-2 text-sm text-slate-300">${qtyCell}</td>
    `;
    sensitivityBody.appendChild(tr);
  });
}

function renderResultViews(data) {
  if (!data || !data.optimal) return;

  // KPIs principales
  resultPrice.textContent = currency(data.optimal.price);
  resultProfit.textContent = currency(data.optimal.max_profit);
  resultQuantity.textContent = data.optimal.quantity != null ? `${number(data.optimal.quantity)} u.` : '—';
  resultRevenue.textContent = currency(data.optimal.projected_revenue);
  resultCost.textContent = currency(data.optimal.projected_total_cost);

    // Sensibilidad rápida: variación ±10% en costo unitario
  const sensDownPrice = document.getElementById('sensDownPrice');
  const sensUpPrice = document.getElementById('sensUpPrice');
  if (sensDownPrice && sensUpPrice && data.sensitivity?.scenarios) {
    const down10 = data.sensitivity.scenarios.find(
      s => s.parametro === 'Costo unitario' && s.variacion === '-10%'
    );
    const up10 = data.sensitivity.scenarios.find(
      s => s.parametro === 'Costo unitario' && s.variacion === '+10%'
    );
    sensDownPrice.textContent = down10?.precio_optimo != null ? currency(down10.precio_optimo) : '—';
    sensUpPrice.textContent = up10?.precio_optimo != null ? currency(up10.precio_optimo) : '—';
  }

  // Nuevos KPIs
  if (resultMargin) {
    resultMargin.textContent = data.optimal.profit_margin_percent != null
      ? `${number(data.optimal.profit_margin_percent)}%`
      : '—';
  }
  if (resultElasticity) {
    resultElasticity.textContent = data.optimal.elasticity_at_optimum != null
      ? `${number(data.optimal.elasticity_at_optimum)}`
      : '—';
  }

  // Fórmulas
  if (formulaDemand) formulaDemand.textContent = `q(p) = ${data.formulas?.demand_deduced || '—'}`;
  if (formulaVariableCost) formulaVariableCost.textContent = `c(q) = ${data.formulas?.variable_cost_deduced || '—'}`;
  if (formulaRevenue) formulaRevenue.textContent = data.formulas?.revenue || '—';
  if (formulaCost) formulaCost.textContent = data.formulas?.total_cost || '—';
  if (formulaProfit) formulaProfit.textContent = data.formulas?.profit || '—';
  if (formulaFirstDerivative) formulaFirstDerivative.textContent = data.formulas?.first_derivative || '—';
  if (formulaSecondDerivative) formulaSecondDerivative.textContent = data.formulas?.second_derivative || '—';
  if (formulaElasticity) formulaElasticity.textContent = data.formulas?.elasticity || '—';

  // Explicaciones
  if (mathExplanation) mathExplanation.textContent = data.optimal.mathematical_check || '—';
  if (feasibleDomain) {
    feasibleDomain.textContent = data.optimal.feasible_domain
      ? `Dominio factible: precio entre ${number(data.optimal.feasible_domain.price_min)} y ${number(data.optimal.feasible_domain.price_max)}.`
      : '—';
  }

  // Elasticidad interpretación
  if (elasticityExplanation && data.optimal.elasticity_interpretation) {
    elasticityExplanation.textContent = data.optimal.elasticity_interpretation;
  }

  // Break-even
  if (breakEvenInfo) {
    if (data.optimal.break_even_prices?.length > 0) {
      const prices = data.optimal.break_even_prices.map(p => currency(p)).join(', ');
      breakEvenInfo.textContent = `Punto(s) de equilibrio: ${prices}`;
    } else {
      breakEvenInfo.textContent = 'No se encontraron puntos de equilibrio positivos en el dominio factible.';
    }
  }

  // Puntos críticos
  renderCriticalPoints(data.critical_points);

  // Gráfico
  renderChart(data.chart, comparisonOptimizationData?.chart || null);

  // Sensibilidad
  if (data.sensitivity?.scenarios) {
    renderSensitivityTable(data.sensitivity.scenarios);
  }

  // Badge de capacidad
  if (data.optimal.capacity_is_binding) {
    capacityBadge.classList.remove('hidden');
    capacityBadge.title = 'El límite de producción está frenando la ganancia máxima';
  } else {
    capacityBadge.classList.add('hidden');
    capacityBadge.title = '';
  }
}

// ─── Exportación a Excel ─────────────────────────────────────

function buildExcelRows(data) {
  if (!data) return [];
  const cap = data.inputs?.max_capacity == null
    ? 'Sin límite explícito'
    : `${number(data.inputs.max_capacity)} unidades`;
  const be = data.optimal?.break_even_prices?.length
    ? data.optimal.break_even_prices.map(p => currency(p)).join(', ')
    : 'No disponible';

  const rows = [
    ['Reporte de Optimización de Precios - OptiPrice'],
    [],
    ['--- DATOS INGRESADOS ---'],
    ['Precio habitual de venta', currency(data.inputs?.usual_price)],
    ['Cantidad vendida al precio habitual', `${number(data.inputs?.usual_quantity)} unidades`],
    ['Precio en oferta/prueba', currency(data.inputs?.promo_price)],
    ['Cantidad vendida al precio de oferta', `${number(data.inputs?.promo_quantity)} unidades`],
    ['Costo de producción por unidad', currency(data.inputs?.unit_cost)],
    ['Costo fijo total', currency(data.inputs?.fixed_cost)],
    ['Capacidad máxima de producción', cap],
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
  const rows = buildExcelRows(lastOptimizationData);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 42 }, { wch: 24 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'OptiPrice');
  XLSX.writeFile(wb, 'OptiPrice_Resultados.xlsx');
}

async function handleSubmit(event) {
  event.preventDefault();

  // Validar todos los campos antes de enviar
  ['usual_price', 'usual_quantity', 'promo_price', 'promo_quantity', 'unit_cost'].forEach(id => {
    validateField(id, true);
  });
  validateCrossPrices();

  // Verificar si hay errores de campo o precio cruzado
  const hasFieldErrors = document.querySelectorAll('.field-error').length > 0;
  const hasCrossError = checkCrossPriceError();
  if (hasFieldErrors || hasCrossError) {
    showStatus(
      hasCrossError
        ? 'El precio de oferta debe ser menor que el precio habitual. Corrige los errores.'
        : 'Corrige los errores del formulario antes de continuar.',
      'error'
    );
    return;
  }

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

    if (!response.ok) {
      let errorMsg = 'No se pudo resolver la optimización.';
      try {
        const errData = await response.json();
        if (errData.detail) errorMsg = errData.detail;
      } catch (e) {}
      throw new Error(errorMsg);
    }

    const data = await response.json();
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

// ─── Event listeners ─────────────────────────────────────────

form.addEventListener('submit', handleSubmit);
fillExampleBtn.addEventListener('click', fillExample);
saveScenarioBtn.addEventListener('click', saveScenarioForCompare);
exportExcelBtn.addEventListener('click', exportDashboardExcel);
currencySelect.addEventListener('change', () => {
  if (lastOptimizationData) renderResultViews(lastOptimizationData);
});

// Inicialización
setupRealTimeValidation();
fillExample();
