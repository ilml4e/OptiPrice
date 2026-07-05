from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Dict, Any, List

import numpy as np
import sympy as sp
from sympy.parsing.sympy_parser import (
    parse_expr,
    standard_transformations,
    implicit_multiplication_application,
)

P = sp.symbols("p", real=True)
Q = sp.symbols("q", real=True)

TRANSFORMATIONS = standard_transformations + (implicit_multiplication_application,)

SAFE_LOCALS = {
    "p": P, "q": Q, "sin": sp.sin, "cos": sp.cos,
    "exp": sp.exp, "log": sp.log, "sqrt": sp.sqrt,
}

@dataclass
class OptimizationInputs:
    usual_price: float
    usual_quantity: float
    promo_price: float
    promo_quantity: float
    fixed_cost: float
    unit_cost: float
    max_capacity: Optional[float] = None
    chart_points: int = 250
    # NUEVO: Aceptamos el historial de precios desde el frontend
    price_history: Optional[List[Dict[str, float]]] = None


class OptimizationError(ValueError):
    pass

def parse_symbolic_expression(expr: str, variable_name: str) -> sp.Expr:
    if not expr or not expr.strip():
        raise OptimizationError(f"La expresión para {variable_name} no puede estar vacía.")
    try:
        expression = parse_expr(expr, local_dict=SAFE_LOCALS, transformations=TRANSFORMATIONS, evaluate=True)
    except Exception as exc:
        raise OptimizationError(f"No se pudo interpretar la expresión '{expr}'.") from exc

    allowed = {variable_name}
    invalid_symbols = [str(symbol) for symbol in expression.free_symbols if str(symbol) not in allowed]
    if invalid_symbols:
        raise OptimizationError(f"La expresión '{expr}' usa variables no permitidas: {', '.join(invalid_symbols)}.")
    return sp.simplify(expression)

def real_float_solutions(raw_solutions: List[Any]) -> List[float]:
    real_values: List[float] = []
    for solution in raw_solutions:
        value = sp.N(solution)
        if value.is_real:
            try:
                real_values.append(float(value))
            except Exception:
                continue
    return sorted(set(real_values))

def build_natural_upper_bound(demand_expr: sp.Expr, usual_price: float) -> float:
    roots = real_float_solutions(sp.solve(sp.Eq(demand_expr, 0), P))
    positive_roots = [root for root in roots if root > 0]
    if positive_roots:
        return max(positive_roots)
    fallback_upper = max(usual_price * 3, usual_price + 1.0)
    return float(fallback_upper)

def numeric_feasible_interval(demand_expr: sp.Expr, price_max: float, max_capacity: Optional[float], chart_points: int) -> tuple[float, float]:
    demand_fn = sp.lambdify(P, demand_expr, "numpy")
    points = max(400, chart_points * 4)
    prices = np.linspace(0.0, price_max, points)
    quantities = np.array(demand_fn(prices), dtype=float)

    mask = np.isfinite(quantities) & (quantities >= -1e-7)
    if max_capacity is not None:
        mask &= quantities <= (max_capacity + 1e-7)

    feasible_prices = prices[mask]
    if feasible_prices.size == 0:
        raise OptimizationError("No existe un intervalo factible con las restricciones dadas.")
    return float(feasible_prices.min()), float(feasible_prices.max())

def evaluate_feasibility(quantity: float, max_capacity: Optional[float]) -> bool:
    if not np.isfinite(quantity) or quantity < -1e-6:
        return False
    if max_capacity is not None and quantity > max_capacity + 1e-6:
        return False
    return True


def _interpret_elasticity(elasticity: Optional[float]) -> str:
    if elasticity is None:
        return ""
    abs_e = abs(elasticity)
    if abs_e > 1:
        return (
            f"La demanda es elástica (|ε| = {abs_e:.2f} > 1). "
            "Los consumidores responden fuertemente a cambios de precio. "
            "Una reducción de precio podría aumentar los ingresos totales."
        )
    elif abs_e < 1:
        return (
            f"La demanda es inelástica (|ε| = {abs_e:.2f} < 1). "
            "Los consumidores responden débilmente a cambios de precio. "
            "Un aumento de precio podría aumentar los ingresos totales."
        )
    else:
        return (
            "La demanda tiene elasticidad unitaria (|ε| = 1.00). "
            "Los ingresos totales se mantienen estables ante cambios de precio."
        )

# NUEVO: Recibe m y b directamente para respetar la regresión lineal si fue utilizada
def _analyze_sensitivity(inputs: OptimizationInputs, m: float, b: float) -> List[Dict[str, Any]]:
    scenarios: List[Dict[str, Any]] = []

    # --- Sensibilidad del costo unitario ---
    for variation in [-10, -5, 5, 10]:
        new_unit_cost = max(inputs.unit_cost * (1 + variation / 100), 0)
        try:
            opt_price = (new_unit_cost * m - b) / (2 * m)
            opt_qty = m * opt_price + b

            if inputs.max_capacity is not None and opt_qty > inputs.max_capacity:
                opt_qty = inputs.max_capacity
                opt_price = (opt_qty - b) / m
            if opt_qty < 0:
                opt_qty = 0
                opt_price = -b / m

            opt_profit = opt_price * opt_qty - inputs.fixed_cost - new_unit_cost * opt_qty

            scenarios.append({
                "parametro": "Costo unitario",
                "variacion": f"{variation:+.0f}%",
                "valor": round(new_unit_cost, 2),
                "precio_optimo": round(float(opt_price), 4),
                "ganancia_maxima": round(float(opt_profit), 4),
                "cantidad_optima": round(float(opt_qty), 4),
            })
        except Exception:
            scenarios.append({
                "parametro": "Costo unitario",
                "variacion": f"{variation:+.0f}%",
                "valor": round(new_unit_cost, 2),
                "precio_optimo": None,
                "ganancia_maxima": None,
                "cantidad_optima": None,
            })

    # --- Sensibilidad de capacidad (si aplica) ---
    if inputs.max_capacity is not None:
        for variation in [-10, -5, 5, 10, 20]:
            new_capacity = max(inputs.max_capacity * (1 + variation / 100), 1)
            try:
                opt_price_unc = (inputs.unit_cost * m - b) / (2 * m)
                opt_qty_unc = m * opt_price_unc + b

                if opt_qty_unc > new_capacity:
                    opt_qty = new_capacity
                    opt_price = (opt_qty - b) / m
                else:
                    opt_qty = opt_qty_unc
                    opt_price = opt_price_unc

                if opt_qty < 0:
                    opt_qty = 0
                    opt_price = -b / m

                opt_profit = opt_price * opt_qty - inputs.fixed_cost - inputs.unit_cost * opt_qty

                scenarios.append({
                    "parametro": "Capacidad máxima",
                    "variacion": f"{variation:+.0f}%",
                    "valor": round(new_capacity, 0),
                    "precio_optimo": round(float(opt_price), 4),
                    "ganancia_maxima": round(float(opt_profit), 4),
                    "cantidad_optima": round(float(opt_qty), 4),
                })
            except Exception:
                scenarios.append({
                    "parametro": "Capacidad máxima",
                    "variacion": f"{variation:+.0f}%",
                    "valor": round(new_capacity, 0),
                    "precio_optimo": None,
                    "ganancia_maxima": None,
                    "cantidad_optima": None,
                })

    return scenarios


def optimize_price(inputs: OptimizationInputs) -> Dict[str, Any]:
    # Validaciones
    if inputs.usual_price <= 0 or inputs.promo_price <= 0:
        raise OptimizationError("Los precios de referencia deben ser mayores que cero.")
    if inputs.usual_quantity <= 0 or inputs.promo_quantity <= 0:
        raise OptimizationError("Las cantidades de referencia deben ser mayores que cero.")
    if np.isclose(inputs.usual_price, inputs.promo_price):
        raise OptimizationError("El precio habitual y el precio de oferta deben ser distintos.")
    if inputs.unit_cost < 0:
        raise OptimizationError("El costo por unidad no puede ser negativo.")
    if inputs.max_capacity is not None and inputs.max_capacity <= 0:
        raise OptimizationError("La capacidad máxima debe ser mayor que cero.")
    if inputs.chart_points < 50:
        raise OptimizationError("Usa al menos 50 puntos para graficar.")

    # --- NUEVO: Selección del método de cálculo (Regresión Lineal vs Tradicional) ---
    if inputs.price_history and len(inputs.price_history) >= 2:
        precios = np.array([item['precio'] for item in inputs.price_history])
        cantidades = np.array([item['cantidad'] for item in inputs.price_history])
        
        m_val, b_val = np.polyfit(precios, cantidades, 1)
        demand_slope = float(m_val)
        demand_intercept = float(b_val)
    else:
        demand_slope = (inputs.promo_quantity - inputs.usual_quantity) / (inputs.promo_price - inputs.usual_price)
        demand_intercept = inputs.usual_quantity - demand_slope * inputs.usual_price

    # Construcción de expresiones simbólicas con el método seleccionado
    demand_expr = sp.simplify(demand_slope * P + demand_intercept)
    
    variable_cost_expr = sp.simplify(inputs.unit_cost * Q)
    total_cost_q = sp.simplify(inputs.fixed_cost + variable_cost_expr)
    
    revenue_expr = sp.expand(P * demand_expr)
    cost_expr_p = sp.expand(total_cost_q.subs(Q, demand_expr))
    profit_expr = sp.expand(revenue_expr - cost_expr_p)

    first_derivative = sp.diff(profit_expr, P)
    second_derivative = sp.diff(first_derivative, P)

    natural_upper = build_natural_upper_bound(demand_expr, inputs.usual_price)
    
    # Dominios factibles
    unconstrained_lower, unconstrained_upper = numeric_feasible_interval(demand_expr, natural_upper, None, inputs.chart_points)
    feasible_lower, feasible_upper = numeric_feasible_interval(demand_expr, natural_upper, inputs.max_capacity, inputs.chart_points)

    profit_fn = sp.lambdify(P, profit_expr, "numpy")
    demand_fn = sp.lambdify(P, demand_expr, "numpy")
    revenue_fn = sp.lambdify(P, revenue_expr, "numpy")
    cost_fn = sp.lambdify(P, cost_expr_p, "numpy")
    second_fn = sp.lambdify(P, second_derivative, "numpy")

    raw_critical_points = real_float_solutions(sp.solve(sp.Eq(first_derivative, 0), P))

    unconstrained_candidates = [unconstrained_lower, unconstrained_upper] + [c for c in raw_critical_points if unconstrained_lower - 1e-7 <= c <= unconstrained_upper + 1e-7]
    constrained_candidates = [feasible_lower, feasible_upper] + [c for c in raw_critical_points if feasible_lower - 1e-7 <= c <= feasible_upper + 1e-7]

    def best_candidate(candidates: List[float], max_capacity: Optional[float]) -> Dict[str, Any]:
        best: Optional[Dict[str, Any]] = None
        for candidate in sorted(set(round(x, 10) for x in candidates)):
            price = float(candidate)
            quantity = float(demand_fn(price))
            if not evaluate_feasibility(quantity, max_capacity):
                continue
            profit = float(profit_fn(price))
            second_value = float(second_fn(price)) if np.isfinite(second_fn(price)) else float("nan")
            current = {"price": price, "quantity": quantity, "profit": profit, "second_value": second_value}
            if best is None or current["profit"] > best["profit"]:
                best = current
        if best is None:
            raise OptimizationError("No se pudo encontrar un candidato óptimo factible.")
        return best

    unconstrained_best = best_candidate(unconstrained_candidates, None)
    constrained_best = best_candidate(constrained_candidates, inputs.max_capacity)

    capacity_is_binding = inputs.max_capacity is not None and unconstrained_best["quantity"] > inputs.max_capacity + 1e-6
    second_value = constrained_best["second_value"]
    
    # Elasticidad: E = (dq/dp) * (p/q)
    opt_p = constrained_best["price"]
    opt_q = constrained_best["quantity"]
    elasticity = float(demand_slope * (opt_p / opt_q)) if opt_q > 0 else 0.0

    # --- Explicación ---
    if second_derivative_confirms_max:
        mathematical_check = (
            f"π''(p*) = {second_value:.4f} < 0, por lo tanto el punto crítico "
            "corresponde a un máximo local de ganancia."
        )
    elif capacity_is_binding:
        mathematical_check = (
            "La capacidad máxima activa la restricción del problema. "
            "El óptimo factible se obtiene en la frontera del dominio permitido, "
            "por lo que además del análisis diferencial se comparan los extremos factibles."
        )
    else:
        mathematical_check = (
            f"π''(p*) = {second_value:.4f}. "
            "El punto óptimo encontrado se valida comparando la ganancia "
            "contra los extremos del dominio factible."
        )

    # --- NUEVO: Pasamos la pendiente e intercepto obtenidos a la sensibilidad ---
    sensitivity_scenarios = _analyze_sensitivity(inputs, demand_slope, demand_intercept)

    # --- Datos para gráfica (ganancia, ingresos, costos, break-even) ---
    chart_prices = np.linspace(0.0, natural_upper, inputs.chart_points)
    chart_profits = np.array(profit_fn(chart_prices), dtype=float)
    chart_revenues = np.array(revenue_fn(chart_prices), dtype=float)
    chart_costs = np.array(cost_fn(chart_prices), dtype=float)
    valid = np.isfinite(chart_prices) & np.isfinite(chart_profits)

    return {
        "inputs": {
            "usual_price": inputs.usual_price,
            "usual_quantity": inputs.usual_quantity,
            "promo_price": inputs.promo_price,
            "promo_quantity": inputs.promo_quantity,
            "fixed_cost": inputs.fixed_cost,
            "unit_cost": inputs.unit_cost,
            "max_capacity": inputs.max_capacity
        },
        "formulas": {
            "demand_deduced": str(sp.simplify(demand_expr)),
            "variable_cost_deduced": str(sp.simplify(variable_cost_expr)),
            "revenue": str(revenue_expr),
            "total_cost": str(cost_expr_p),
            "profit": str(profit_expr),
            "first_derivative": str(first_derivative),
            "second_derivative": str(second_derivative),
        },
        "critical_points": [
            {
                "price": round(float(point), 4),
                "quantity": round(float(demand_fn(point)), 4),
                "feasible": evaluate_feasibility(float(demand_fn(point)), inputs.max_capacity),
            } for point in raw_critical_points
        ],
        "optimal": {
            "price": round(opt_p, 4),
            "quantity": round(opt_q, 4),
            "max_profit": round(constrained_best["profit"], 4),
            "projected_revenue": round(opt_p * opt_q, 4),
            "projected_total_cost": round(opt_p * opt_q - constrained_best["profit"], 4),
            "elasticity": round(elasticity, 4),
            "capacity_is_binding": capacity_is_binding,
            "mathematical_check": f"π''(p*) = {second_value:.4f}. Elasticidad calculada: {elasticity:.4f}.",
            "feasible_domain": {"price_min": round(feasible_lower, 4), "price_max": round(feasible_upper, 4)},
        },
        "sensitivity": {
            "scenarios": sensitivity_scenarios,
        },
        "chart": {
            "prices": np.round(chart_prices[valid], 4).tolist(),
            "profits": np.round(chart_profits[valid], 4).tolist(),
            "revenues": np.round(chart_revenues[valid], 4).tolist(),
            "costs": np.round(chart_costs[valid], 4).tolist(),
            "price_min": 0.0,
            "price_max": round(natural_upper, 4),
            "optimal_point": {
                "price": round(opt_p, 4),
                "profit": round(constrained_best["profit"], 4),
            },
        },
    }