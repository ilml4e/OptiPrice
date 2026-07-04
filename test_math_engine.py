"""
Tests unitarios para el motor matemático de OptiPrice.

Ejecutar con: pytest test_math_engine.py -v
"""
from __future__ import annotations

from typing import Any, Dict

import numpy as np
import pytest

from math_engine import (
    OptimizationInputs,
    OptimizationError,
    build_natural_upper_bound,
    evaluate_feasibility,
    numeric_feasible_interval,
    optimize_price,
    parse_symbolic_expression,
    real_float_solutions,
)
from math_engine import P, sp


# ============================================================
# Fixtures
# ============================================================

@pytest.fixture
def example_inputs() -> OptimizationInputs:
    """Ejemplo típico de entrada."""
    return OptimizationInputs(
        usual_price=50,
        usual_quantity=200,
        promo_price=35,
        promo_quantity=500,
        fixed_cost=1500,
        unit_cost=12,
        max_capacity=None,
        chart_points=250,
    )


@pytest.fixture
def example_with_capacity() -> OptimizationInputs:
    """Ejemplo con restricción de capacidad."""
    return OptimizationInputs(
        usual_price=50,
        usual_quantity=200,
        promo_price=35,
        promo_quantity=500,
        fixed_cost=1500,
        unit_cost=12,
        max_capacity=300,
        chart_points=250,
    )


# ============================================================
# Tests de validación de inputs
# ============================================================

class TestValidation:
    def test_precio_cero(self):
        with pytest.raises(OptimizationError, match="mayores que cero"):
            optimize_price(OptimizationInputs(
                usual_price=0, usual_quantity=200,
                promo_price=35, promo_quantity=500,
                fixed_cost=0, unit_cost=12,
            ))

    def test_precio_negativo(self):
        with pytest.raises(OptimizationError, match="mayores que cero"):
            optimize_price(OptimizationInputs(
                usual_price=-10, usual_quantity=200,
                promo_price=35, promo_quantity=500,
                fixed_cost=0, unit_cost=12,
            ))

    def test_cantidad_cero(self):
        with pytest.raises(OptimizationError, match="mayores que cero"):
            optimize_price(OptimizationInputs(
                usual_price=50, usual_quantity=0,
                promo_price=35, promo_quantity=500,
                fixed_cost=0, unit_cost=12,
            ))

    def test_precios_iguales(self):
        with pytest.raises(OptimizationError, match="distintos"):
            optimize_price(OptimizationInputs(
                usual_price=50, usual_quantity=200,
                promo_price=50, promo_quantity=200,
                fixed_cost=0, unit_cost=12,
            ))

    def test_costo_unitario_negativo(self):
        with pytest.raises(OptimizationError, match="negativo"):
            optimize_price(OptimizationInputs(
                usual_price=50, usual_quantity=200,
                promo_price=35, promo_quantity=500,
                fixed_cost=0, unit_cost=-5,
            ))

    def test_capacidad_negativa(self):
        with pytest.raises(OptimizationError, match="mayor que cero"):
            optimize_price(OptimizationInputs(
                usual_price=50, usual_quantity=200,
                promo_price=35, promo_quantity=500,
                fixed_cost=0, unit_cost=12,
                max_capacity=-10,
            ))

    def test_chart_points_muy_bajos(self):
        with pytest.raises(OptimizationError, match="50 puntos"):
            optimize_price(OptimizationInputs(
                usual_price=50, usual_quantity=200,
                promo_price=35, promo_quantity=500,
                fixed_cost=0, unit_cost=12,
                chart_points=10,
            ))


# ============================================================
# Tests de funciones auxiliares
# ============================================================

class TestAuxFunctions:
    def test_real_float_solutions_empty(self):
        assert real_float_solutions([]) == []

    def test_real_float_solutions_mixed(self):
        solutions = [sp.Integer(3), sp.Float(2.5), sp.I, sp.Float(-1.0)]
        result = real_float_solutions(solutions)
        assert result == [-1.0, 2.5, 3.0]

    def test_evaluate_feasibility_valid(self):
        assert evaluate_feasibility(100, None) is True
        assert evaluate_feasibility(0, None) is True
        assert evaluate_feasibility(50, 100) is True

    def test_evaluate_feasibility_invalid(self):
        assert evaluate_feasibility(-1, None) is False
        assert evaluate_feasibility(float("nan"), None) is False
        assert evaluate_feasibility(float("inf"), None) is False
        assert evaluate_feasibility(150, 100) is False

    def test_build_natural_upper_bound_with_root(self):
        # demanda: q(p) = -10p + 500 → raíz en p=50
        demand = sp.simplify(-10 * P + 500)
        result = build_natural_upper_bound(demand, usual_price=30)
        assert result == 50.0

    def test_build_natural_upper_bound_fallback(self):
        # demanda: q(p) = 100 (constante, sin raíz positiva)
        demand = sp.simplify(100)
        result = build_natural_upper_bound(demand, usual_price=30)
        assert result == 90.0  # 30 * 3

    def test_parse_symbolic_expression_valid(self):
        result = parse_symbolic_expression("2*p + 10", "p")
        assert str(result) == "2*p + 10"

    def test_parse_symbolic_expression_invalid_variable(self):
        with pytest.raises(OptimizationError, match="no permitidas"):
            parse_symbolic_expression("p + x", "p")


# ============================================================
# Tests del core de optimización
# ============================================================

class TestOptimizePrice:
    def test_basic_optimization(self, example_inputs):
        """Verifica que la optimización básica devuelva estructura correcta."""
        result = optimize_price(example_inputs)
        assert isinstance(result, dict)
        assert "optimal" in result
        assert "price" in result["optimal"]
        assert "max_profit" in result["optimal"]
        assert "quantity" in result["optimal"]
        assert "formulas" in result
        assert "chart" in result
        assert "profit_margin_percent" in result["optimal"]
        assert "elasticity_at_optimum" in result["optimal"]
        assert "elasticity_interpretation" in result["optimal"]
        assert "break_even_prices" in result["optimal"]
        assert "sensitivity" in result

    def test_optimal_price_reasonable(self, example_inputs):
        """El precio óptimo debe estar entre los precios de referencia."""
        result = optimize_price(example_inputs)
        price = result["optimal"]["price"]
        # Con estos datos, el óptimo debe estar en ~41.17
        assert 35 < price < 50, f"Precio óptimo {price} fuera de rango esperado"

    def test_optimal_profit_positive(self, example_inputs):
        """La ganancia máxima debe ser positiva."""
        result = optimize_price(example_inputs)
        assert result["optimal"]["max_profit"] > 0

    def test_capacity_binding(self, example_with_capacity):
        """Con capacidad restringida, el óptimo debe respetarla."""
        result = optimize_price(example_with_capacity)
        assert result["optimal"]["quantity"] <= 300 + 1e-6
        assert result["optimal"]["capacity_is_binding"] is True

    def test_capacity_not_binding(self, example_inputs):
        """Sin capacidad, no debe marcar binding."""
        result = optimize_price(example_inputs)
        assert result["optimal"]["capacity_is_binding"] is False

    def test_elasticity_present(self, example_inputs):
        """La elasticidad debe calcularse."""
        result = optimize_price(example_inputs)
        assert result["optimal"]["elasticity_at_optimum"] is not None
        assert abs(result["optimal"]["elasticity_at_optimum"]) > 0

    def test_break_even_prices(self, example_inputs):
        """Debe haber al menos un punto de equilibrio."""
        result = optimize_price(example_inputs)
        assert len(result["optimal"]["break_even_prices"]) >= 1

    def test_chart_with_revenues_and_costs(self, example_inputs):
        """El gráfico debe incluir ingresos y costos."""
        result = optimize_price(example_inputs)
        assert "revenues" in result["chart"]
        assert "costs" in result["chart"]
        assert "break_even_points" in result["chart"]
        assert len(result["chart"]["revenues"]) > 0
        assert len(result["chart"]["costs"]) > 0

    def test_profit_margin(self, example_inputs):
        """El margen de ganancia debe ser un porcentaje razonable."""
        result = optimize_price(example_inputs)
        margin = result["optimal"]["profit_margin_percent"]
        assert 0 < margin < 100

    def test_sensitivity_scenarios(self, example_inputs):
        """Debe haber escenarios de sensibilidad."""
        result = optimize_price(example_inputs)
        assert len(result["sensitivity"]["scenarios"]) > 0

    def test_sensitivity_with_capacity(self, example_with_capacity):
        """Con capacidad, debe haber escenarios de sensibilidad de capacidad."""
        result = optimize_price(example_with_capacity)
        scenarios = result["sensitivity"]["scenarios"]
        capacity_scenarios = [s for s in scenarios if s["parametro"] == "Capacidad máxima"]
        assert len(capacity_scenarios) > 0


# ============================================================
# Tests de integración y casos borde
# ============================================================

class TestEdgeCases:
    def test_high_fixed_cost(self):
        """Costo fijo muy alto puede hacer que no haya ganancia, pero debe funcionar."""
        inputs = OptimizationInputs(
            usual_price=50, usual_quantity=200,
            promo_price=35, promo_quantity=500,
            fixed_cost=50000, unit_cost=12,
        )
        result = optimize_price(inputs)
        # Puede tener ganancia negativa, pero debe ejecutarse sin error
        assert "optimal" in result

    def test_zero_unit_cost(self):
        """Costo unitario cero debe funcionar."""
        inputs = OptimizationInputs(
            usual_price=50, usual_quantity=200,
            promo_price=35, promo_quantity=500,
            fixed_cost=0, unit_cost=0,
        )
        result = optimize_price(inputs)
        assert result["optimal"]["price"] > 0
        assert result["optimal"]["max_profit"] > 0

    def test_very_low_capacity(self):
        """Capacidad muy baja debe respetarse."""
        inputs = OptimizationInputs(
            usual_price=50, usual_quantity=200,
            promo_price=35, promo_quantity=500,
            fixed_cost=0, unit_cost=12,
            max_capacity=50,
        )
        result = optimize_price(inputs)
        assert result["optimal"]["quantity"] <= 50 + 1e-6

    def test_demand_upward_sloping(self):
        """Demanda con pendiente positiva (bien Giffen/Veblen) debe funcionar."""
        inputs = OptimizationInputs(
            usual_price=50, usual_quantity=200,
            promo_price=80, promo_quantity=300,  # más caro = más vendido
            fixed_cost=0, unit_cost=12,
        )
        result = optimize_price(inputs)
        assert "optimal" in result


# ============================================================
# Tests de estructura de respuesta
# ============================================================

class TestResponseStructure:
    def test_all_required_keys_present(self, example_inputs):
        """Verifica que la respuesta tenga todos los campos requeridos."""
        result = optimize_price(example_inputs)
        assert set(result.keys()) == {"inputs", "formulas", "critical_points", "optimal", "sensitivity", "chart"}

    def test_chart_keys(self, example_inputs):
        """Verifica estructura del chart."""
        result = optimize_price(example_inputs)
        chart = result["chart"]
        assert "prices" in chart
        assert "profits" in chart
        assert "revenues" in chart
        assert "costs" in chart
        assert "price_max" in chart
        assert "optimal_point" in chart
        assert "price" in chart["optimal_point"]
        assert "profit" in chart["optimal_point"]

    def test_optimal_keys(self, example_inputs):
        """Verifica estructura del óptimo."""
        result = optimize_price(example_inputs)
        opt = result["optimal"]
        assert "price" in opt
        assert "quantity" in opt
        assert "max_profit" in opt
        assert "projected_revenue" in opt
        assert "projected_total_cost" in opt
        assert "profit_margin_percent" in opt
        assert "capacity_is_binding" in opt
        assert "second_derivative_value" in opt
        assert "second_derivative_confirms_max" in opt
        assert "mathematical_check" in opt
        assert "feasible_domain" in opt
        assert "elasticity_at_optimum" in opt
        assert "elasticity_interpretation" in opt
        assert "break_even_prices" in opt
