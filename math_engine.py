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
# p = precio
# q = cantidad demandada
P = sp.symbols("p", real=True)
Q = sp.symbols("q", real=True)

# Permite escribir expresiones tipo 2p como 2*p
TRANSFORMATIONS = standard_transformations + (implicit_multiplication_application,)

# Funciones y símbolos seguros permitidos al parsear expresiones
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
    """
    Convierte una cadena del usuario en una expresión simbólica segura.
    - Para demanda solo se permite la variable p
    - Para costo variable solo se permite la variable q
    """
    if not expr or not expr.strip():
        raise OptimizationError(f"La expresión para {variable_name} no puede estar vacía.")

    try:
        expression = parse_expr(
            expr,
            local_dict=SAFE_LOCALS,
            transformations=TRANSFORMATIONS,
            evaluate=True,
        )
    except Exception as exc:
        raise OptimizationError(f"No se pudo interpretar la expresión '{expr}'.") from exc

    allowed = {variable_name}
    invalid_symbols = [str(symbol) for symbol in expression.free_symbols if str(symbol) not in allowed]
    if invalid_symbols:
        raise OptimizationError(
            f"La expresión '{expr}' usa variables no permitidas: {', '.join(invalid_symbols)}."
        )

    return sp.simplify(expression)


def real_float_solutions(raw_solutions: List[Any]) -> List[float]:
    """
    Filtra soluciones reales y las convierte a float.
    """
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
    """
    Estima un límite superior razonable para el precio:
    1. Intenta encontrar donde la demanda se hace cero.
    2. Si no existe un corte positivo, usa un margen razonable basado en el precio habitual.
    """
    roots = real_float_solutions(sp.solve(sp.Eq(demand_expr, 0), P))
    positive_roots = [root for root in roots if root > 0]
    if positive_roots:
        return max(positive_roots)

    fallback_upper = max(usual_price * 3, usual_price + 1.0)
    return float(fallback_upper)


def numeric_feasible_interval(
    demand_expr: sp.Expr,
    price_max: float,
    max_capacity: Optional[float],
    chart_points: int,
) -> tuple[float, float]:
    """
    Construye un intervalo factible numérico en el que:
    - q(p) >= 0
    - q(p) <= capacidad máxima, si existe
    """
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
            "No existe un intervalo factible con las restricciones dadas. Ajusta la demanda, el rango o la capacidad máxima."
        )

    return float(feasible_prices.min()), float(feasible_prices.max())


def evaluate_feasibility(quantity: float, max_capacity: Optional[float]) -> bool:
    """
    Verifica si una cantidad es factible.
    """
    if not np.isfinite(quantity):
        return False
    if quantity < -1e-6:
        return False
    if max_capacity is not None and quantity > max_capacity + 1e-6:
        return False
    return True


def optimize_price(inputs: OptimizationInputs) -> Dict[str, Any]:
    """
    Núcleo matemático de OptiPrice.

    Pasos:
    1. Construir demanda y costos desde datos de negocio
    2. Construir ingresos, costos y ganancia
    3. Derivar una y dos veces
    4. Buscar puntos críticos resolviendo π'(p)=0
    5. Comparar candidatos factibles y extremos del dominio
    6. Si hay restricción de capacidad, respetarla
    """
    if inputs.usual_price <= 0 or inputs.promo_price <= 0:
        raise OptimizationError("Los precios de referencia deben ser mayores que cero.")
    if inputs.usual_quantity <= 0 or inputs.promo_quantity <= 0:
        raise OptimizationError("Las cantidades de referencia deben ser mayores que cero.")
    if np.isclose(inputs.usual_price, inputs.promo_price):
        raise OptimizationError(
            "El precio habitual y el precio de oferta deben ser distintos para estimar la demanda."
        )
    if inputs.unit_cost < 0:
        raise OptimizationError("El costo por unidad no puede ser negativo.")

    if inputs.max_capacity is not None and inputs.max_capacity <= 0:
        raise OptimizationError("La capacidad máxima debe ser mayor que cero.")
    if inputs.chart_points < 50:
        raise OptimizationError("Usa al menos 50 puntos para graficar.")

    # Demanda lineal deducida a partir de dos puntos (precio, cantidad): q(p) = m*p + b
    demand_slope = (inputs.promo_quantity - inputs.usual_quantity) / (inputs.promo_price - inputs.usual_price)
    demand_intercept = inputs.usual_quantity - demand_slope * inputs.usual_price
    demand_expr = sp.simplify(demand_slope * P + demand_intercept)

    # Costo variable lineal: CV(q) = costo_unitario * q
    variable_cost_expr = sp.simplify(inputs.unit_cost * Q)

    # Costo total como función de q: CT(q) = CF + CV(q)
    total_cost_q = sp.simplify(inputs.fixed_cost + variable_cost_expr)

    # Ganancia como función del precio:
    # π(p) = p*q(p) - CT(q(p))
    profit_expr = sp.expand(P * demand_expr - total_cost_q.subs(Q, demand_expr))

    # Primera y segunda derivada
    first_derivative = sp.diff(profit_expr, P)
    second_derivative = sp.diff(first_derivative, P)

    # Rango natural de análisis
    natural_upper = build_natural_upper_bound(demand_expr, inputs.usual_price)

    # Dominio sin restricción de capacidad
    unconstrained_lower, unconstrained_upper = numeric_feasible_interval(
        demand_expr=demand_expr,
        price_max=natural_upper,
        max_capacity=None,
        chart_points=inputs.chart_points,
    )

    # Dominio con restricción de capacidad
    feasible_lower, feasible_upper = numeric_feasible_interval(
        demand_expr=demand_expr,
        price_max=natural_upper,
        max_capacity=inputs.max_capacity,
        chart_points=inputs.chart_points,
    )

    # Funciones numéricas para evaluar rápido
    profit_fn = sp.lambdify(P, profit_expr, "numpy")
    demand_fn = sp.lambdify(P, demand_expr, "numpy")
    second_fn = sp.lambdify(P, second_derivative, "numpy")

    # Resolver π'(p)=0
    raw_critical_points = real_float_solutions(sp.solve(sp.Eq(first_derivative, 0), P))

    # Candidatos sin capacidad
    unconstrained_candidates = [unconstrained_lower, unconstrained_upper]
    unconstrained_candidates += [
        c for c in raw_critical_points if unconstrained_lower - 1e-7 <= c <= unconstrained_upper + 1e-7
    ]

    # Candidatos con capacidad
    constrained_candidates = [feasible_lower, feasible_upper]
    constrained_candidates += [
        c for c in raw_critical_points if feasible_lower - 1e-7 <= c <= feasible_upper + 1e-7
    ]

    def best_candidate(candidates: List[float], max_capacity: Optional[float]) -> Dict[str, Any]:
        """
        Evalúa todos los candidatos factibles y devuelve el de mayor ganancia.
        """
        best: Optional[Dict[str, Any]] = None

        for candidate in sorted(set(round(x, 10) for x in candidates)):
            price = float(candidate)
            quantity = float(demand_fn(price))

            if not evaluate_feasibility(quantity, max_capacity):
                continue

            profit = float(profit_fn(price))
            second_value = float(second_fn(price)) if np.isfinite(second_fn(price)) else float("nan")

            current = {
                "price": price,
                "quantity": quantity,
                "profit": profit,
                "second_value": second_value,
            }

            if best is None or current["profit"] > best["profit"]:
                best = current

        if best is None:
            raise OptimizationError("No se pudo encontrar un candidato óptimo factible.")

        return best

    unconstrained_best = best_candidate(unconstrained_candidates, None)
    constrained_best = best_candidate(constrained_candidates, inputs.max_capacity)

    # Determinar si la capacidad está "pegando" realmente
    capacity_is_binding = False
    if inputs.max_capacity is not None and unconstrained_best["quantity"] > inputs.max_capacity + 1e-6:
        capacity_is_binding = True

    second_value = constrained_best["second_value"]
    is_interior_point = feasible_lower + 1e-6 < constrained_best["price"] < feasible_upper - 1e-6
    second_derivative_confirms_max = bool(np.isfinite(second_value) and second_value < 0 and is_interior_point)

    # Texto explicativo del criterio matemático
    if second_derivative_confirms_max:
        mathematical_check = (
            f"π''(p*) = {second_value:.4f} < 0, por lo tanto el punto crítico corresponde a un máximo local de ganancia."
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
            "El punto óptimo encontrado se valida comparando la ganancia contra los extremos del dominio factible."
        )

    # Datos para la gráfica
    chart_prices = np.linspace(0.0, natural_upper, inputs.chart_points)
    chart_profits = np.array(profit_fn(chart_prices), dtype=float)
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
        },
        "critical_points": [
            {
                "price": round(float(point), 4),
                "quantity": round(float(demand_fn(point)), 4),
                "feasible": evaluate_feasibility(float(demand_fn(point)), inputs.max_capacity),
            }
            for point in raw_critical_points
        ],
        "optimal": {
            "price": round(constrained_best["price"], 4),
            "quantity": round(constrained_best["quantity"], 4),
            "max_profit": round(constrained_best["profit"], 4),
            "projected_revenue": round(constrained_best["price"] * constrained_best["quantity"], 4),
            "projected_total_cost": round(
                constrained_best["price"] * constrained_best["quantity"] - constrained_best["profit"], 4
            ),
            "capacity_is_binding": capacity_is_binding,
            "second_derivative_value": round(second_value, 4) if np.isfinite(second_value) else None,
            "second_derivative_confirms_max": second_derivative_confirms_max,
            "mathematical_check": mathematical_check,
            "feasible_domain": {
                "price_min": round(feasible_lower, 4),
                "price_max": round(feasible_upper, 4),
            },
        },
        "chart": {
            "prices": np.round(chart_prices[valid], 4).tolist(),
            "profits": np.round(chart_profits[valid], 4).tolist(),
            "price_min": 0.0,
            "price_max": round(natural_upper, 4),
            "optimal_point": {
                "price": round(constrained_best["price"], 4),
                "profit": round(constrained_best["profit"], 4),
            },
        },
    }
