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

# Símbolos principales:
P = sp.symbols("p", real=True)
Q = sp.symbols("q", real=True)

TRANSFORMATIONS = standard_transformations + (implicit_multiplication_application,)

SAFE_LOCALS = {
    "p": P,
    "q": Q,
    "sin": sp.sin,
    "cos": sp.cos,
    "exp": sp.exp,
    "log": sp.log,
    "sqrt": sp.sqrt,
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
    invalid_symbols = [str(s) for s in expression.free_symbols if str(s) not in allowed]
    if invalid_symbols:
        raise OptimizationError(f"La expresión '{expr}' usa variables no permitidas: {', '.join(invalid_symbols)}.")
    return sp.simplify(expression)


def real_float_solutions(raw_solutions: List[Any]) -> List[float]:
    real_values = []
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
    positive_roots = [r for r in roots if r > 0]
    if positive_roots:
        return max(positive_roots)
    return float(max(usual_price * 3, usual_price + 1.0))


def numeric_feasible_interval(
    demand_expr: sp.Expr,
    price_max: float,
    max_capacity: Optional[float],
    chart_points: int,
) -> tuple[float, float]:
    demand_fn = sp.lambdify(P, demand_expr, "numpy")
    points = max(400, chart_points * 4)
    prices = np.linspace(0.0, price_max, points)
    quantities = np.array(demand_fn(prices), dtype=float)
    mask = np.isfinite(quantities) & (quantities >= -1e-7)
    if max_capacity is not None:
        mask &= quantities <= (max_capacity + 1e-7)
    feasible_prices = prices[mask]
    if feasible_prices.size == 0:
        raise OptimizationError(
            "No existe un intervalo factible con las restricciones dadas. "
            "Ajusta la demanda, el rango o la capacidad máxima."
        )
    return float(feasible_prices.min()), float(feasible_prices.max())


def evaluate_feasibility(quantity: float, max_capacity: Optional[float]) -> bool:
    if not np.isfinite(quantity):
        return False
    if quantity < -1e-6:
        return False
    if max_capacity is not None and quantity > max_capacity + 1e-6:
        return False
    return True


def _interpret_elasticity(elasticity: Optional[float]) -> str:
    """Interpreta la elasticidad precio-demanda en lenguaje de negocio."""
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


def _analyze_sensitivity(inputs: OptimizationInputs) -> List[Dict[str, Any]]:
    """
    Analiza sensibilidad del precio óptimo y ganancia ante cambios en parámetros.
    Usa solución analítica para el caso lineal, sin recursión.
    """
    scenarios: List[Dict[str, Any]] = []

    # Demanda lineal: q(p) = m*p + b
    m = (inputs.promo_quantity - inputs.usual_quantity) / (inputs.promo_price - inputs.usual_price)
    b = inputs.usual_quantity - m * inputs.usual_price

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
    """
    Núcleo matemático de OptiPrice.
    """
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

    # --- Construcción de expresiones simbólicas ---
    demand_slope = (inputs.promo_quantity - inputs.usual_quantity) / (inputs.promo_price - inputs.usual_price)
    demand_intercept = inputs.usual_quantity - demand_slope * inputs.usual_price
    demand_expr = sp.simplify(demand_slope * P + demand_intercept)

    variable_cost_expr = sp.simplify(inputs.unit_cost * Q)
    total_cost_q = sp.simplify(inputs.fixed_cost + variable_cost_expr)

    # π(p) = p*q(p) - CT(q(p))
    profit_expr = sp.expand(P * demand_expr - total_cost_q.subs(Q, demand_expr))

    # Derivadas
    first_derivative = sp.diff(profit_expr, P)
    second_derivative = sp.diff(first_derivative, P)

    # Elasticidad: ε = (dq/dp)*(p/q)
    d_demand_dp = sp.diff(demand_expr, P)
    elasticity_expr = sp.simplify(d_demand_dp * P / demand_expr)

    # --- Rango y dominio ---
    natural_upper = build_natural_upper_bound(demand_expr, inputs.usual_price)

    unconstrained_lower, unconstrained_upper = numeric_feasible_interval(
        demand_expr=demand_expr, price_max=natural_upper, max_capacity=None, chart_points=inputs.chart_points,
    )
    feasible_lower, feasible_upper = numeric_feasible_interval(
        demand_expr=demand_expr, price_max=natural_upper,
        max_capacity=inputs.max_capacity, chart_points=inputs.chart_points,
    )

    # --- Funciones numéricas ---
    profit_fn = sp.lambdify(P, profit_expr, "numpy")
    demand_fn = sp.lambdify(P, demand_expr, "numpy")
    second_fn = sp.lambdify(P, second_derivative, "numpy")
    elasticity_fn = sp.lambdify(P, elasticity_expr, "numpy")

    # --- Puntos críticos ---
    raw_critical_points = real_float_solutions(sp.solve(sp.Eq(first_derivative, 0), P))

    def _best_candidate(candidates: List[float], max_cap: Optional[float]) -> Dict[str, Any]:
        best = None
        for c in sorted(set(round(x, 10) for x in candidates)):
            price = float(c)
            quantity = float(demand_fn(price))
            if not evaluate_feasibility(quantity, max_cap):
                continue
            profit = float(profit_fn(price))
            second_val = float(second_fn(price)) if np.isfinite(second_fn(price)) else float("nan")
            current = {"price": price, "quantity": quantity, "profit": profit, "second_value": second_val}
            if best is None or current["profit"] > best["profit"]:
                best = current
        if best is None:
            raise OptimizationError("No se pudo encontrar un candidato óptimo factible.")
        return best

    unconstrained_candidates = [unconstrained_lower, unconstrained_upper] + [
        c for c in raw_critical_points if unconstrained_lower - 1e-7 <= c <= unconstrained_upper + 1e-7
    ]
    constrained_candidates = [feasible_lower, feasible_upper] + [
        c for c in raw_critical_points if feasible_lower - 1e-7 <= c <= feasible_upper + 1e-7
    ]

    unconstrained_best = _best_candidate(unconstrained_candidates, None)
    constrained_best = _best_candidate(constrained_candidates, inputs.max_capacity)

    # --- Binding, segunda derivada ---
    capacity_is_binding = (
        inputs.max_capacity is not None and unconstrained_best["quantity"] > inputs.max_capacity + 1e-6
    )
    second_value = constrained_best["second_value"]
    is_interior_point = feasible_lower + 1e-6 < constrained_best["price"] < feasible_upper - 1e-6
    second_derivative_confirms_max = bool(np.isfinite(second_value) and second_value < 0 and is_interior_point)

    # --- Elasticidad en óptimo ---
    optimal_elasticity = None
    try:
        val = float(elasticity_fn(constrained_best["price"]))
        if np.isfinite(val):
            optimal_elasticity = val
    except Exception:
        pass

    # --- Break-even ---
    raw_break_even = real_float_solutions(sp.solve(sp.Eq(profit_expr, 0), P))
    break_even_prices = [
        round(p, 4) for p in raw_break_even
        if p > 0 and evaluate_feasibility(float(demand_fn(p)), inputs.max_capacity)
    ]

    # --- Margen ---
    total_revenue_opt = constrained_best["price"] * constrained_best["quantity"]
    profit_margin_percent = round(
        (constrained_best["profit"] / total_revenue_opt) * 100, 2
    ) if total_revenue_opt > 0 else 0.0

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

    # --- Sensibilidad ---
    sensitivity_scenarios = _analyze_sensitivity(inputs)

    # --- Datos para gráfica (ganancia, ingresos, costos, break-even) ---
    chart_prices = np.linspace(0.0, natural_upper, inputs.chart_points)
    chart_profits = np.array(profit_fn(chart_prices), dtype=float)
    chart_revenues = np.array(chart_prices * demand_fn(chart_prices), dtype=float)
    chart_costs = np.array(
        inputs.fixed_cost + inputs.unit_cost * demand_fn(chart_prices),
        dtype=float,
    )
    valid = np.isfinite(chart_prices) & np.isfinite(chart_profits)

    return {
        "inputs": {
            "usual_price": inputs.usual_price,
            "usual_quantity": inputs.usual_quantity,
            "promo_price": inputs.promo_price,
            "promo_quantity": inputs.promo_quantity,
            "fixed_cost": inputs.fixed_cost,
            "unit_cost": inputs.unit_cost,
            "max_capacity": inputs.max_capacity,
            "demand_function": str(sp.simplify(demand_expr)),
            "variable_cost_function": str(sp.simplify(variable_cost_expr)),
        },
        "formulas": {
            "demand_deduced": str(sp.simplify(demand_expr)),
            "variable_cost_deduced": str(sp.simplify(variable_cost_expr)),
            "revenue": str(sp.expand(P * demand_expr)),
            "total_cost": str(sp.expand(total_cost_q.subs(Q, demand_expr))),
            "profit": str(sp.expand(profit_expr)),
            "first_derivative": str(sp.expand(first_derivative)),
            "second_derivative": str(sp.expand(second_derivative)),
            "elasticity": str(sp.simplify(elasticity_expr)),
        },
        "critical_points": [
            {
                "price": round(float(p), 4),
                "quantity": round(float(demand_fn(p)), 4),
                "feasible": evaluate_feasibility(float(demand_fn(p)), inputs.max_capacity),
            }
            for p in raw_critical_points
        ],
        "optimal": {
            "price": round(constrained_best["price"], 4),
            "quantity": round(constrained_best["quantity"], 4),
            "max_profit": round(constrained_best["profit"], 4),
            "projected_revenue": round(total_revenue_opt, 4),
            "projected_total_cost": round(total_revenue_opt - constrained_best["profit"], 4),
            "profit_margin_percent": profit_margin_percent,
            "capacity_is_binding": capacity_is_binding,
            "second_derivative_value": round(second_value, 4) if np.isfinite(second_value) else None,
            "second_derivative_confirms_max": second_derivative_confirms_max,
            "mathematical_check": mathematical_check,
            "feasible_domain": {
                "price_min": round(feasible_lower, 4),
                "price_max": round(feasible_upper, 4),
            },
            "elasticity_at_optimum": round(optimal_elasticity, 4) if optimal_elasticity is not None else None,
            "elasticity_interpretation": _interpret_elasticity(optimal_elasticity),
            "break_even_prices": break_even_prices,
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
                "price": round(constrained_best["price"], 4),
                "profit": round(constrained_best["profit"], 4),
            },
            "break_even_points": [
                {"price": p, "profit": 0} for p in break_even_prices
            ],
        },
    }
