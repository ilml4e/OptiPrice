import pytest
from math_engine import optimize_price, OptimizationInputs, OptimizationError

def test_optimize_price_basic():
    inputs = OptimizationInputs(
        usual_price=50, usual_quantity=200,
        promo_price=35, promo_quantity=500,
        fixed_cost=0, unit_cost=12, max_capacity=None
    )
    result = optimize_price(inputs)
    assert result["optimal"]["price"] > 0
    assert result["optimal"]["max_profit"] > 0
    assert result["optimal"]["elasticity"] < 0 # La elasticidad debe ser negativa

def test_invalid_prices():
    inputs = OptimizationInputs(
        usual_price=-10, usual_quantity=200, promo_price=35, promo_quantity=500,
        fixed_cost=0, unit_cost=12
    )
    with pytest.raises(OptimizationError):
        optimize_price(inputs)

def test_capacity_binding():
    inputs = OptimizationInputs(
        usual_price=50, usual_quantity=200, promo_price=35, promo_quantity=500,
        fixed_cost=0, unit_cost=12, max_capacity=100  # Capacidad muy restrictiva
    )
    result = optimize_price(inputs)
    assert result["optimal"]["capacity_is_binding"] is True