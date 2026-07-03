from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from math_engine import OptimizationError, OptimizationInputs, optimize_price

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"

app = FastAPI(
    title="OptiPrice API",
    description="API para optimizar precios usando cálculo diferencial.",
    version="1.0.0",
)

# CORS abierto para facilitar el desarrollo local
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class OptimizeRequest(BaseModel):
    usual_price: float = Field(..., gt=0, examples=[50])
    usual_quantity: float = Field(..., gt=0, examples=[200])
    promo_price: float = Field(..., gt=0, examples=[35])
    promo_quantity: float = Field(..., gt=0, examples=[500])
    fixed_cost: float = Field(..., examples=[1500])
    unit_cost: float = Field(..., ge=0, examples=[12])
    max_capacity: Optional[float] = Field(default=None, examples=[700])
    chart_points: int = Field(default=250, ge=50, le=1000)


@app.post("/api/optimize")
def optimize_endpoint(payload: OptimizeRequest):
    """
    Endpoint principal.
    Recibe datos de negocio simples y devuelve:
    - precio óptimo
    - ganancia máxima
    - cantidad óptima
    - derivadas
    - explicación matemática
    - datos para la gráfica
    """
    try:
        result = optimize_price(
            OptimizationInputs(
                usual_price=payload.usual_price,
                usual_quantity=payload.usual_quantity,
                promo_price=payload.promo_price,
                promo_quantity=payload.promo_quantity,
                fixed_cost=payload.fixed_cost,
                unit_cost=payload.unit_cost,
                max_capacity=payload.max_capacity,
                chart_points=payload.chart_points,
            )
        )
        return result
    except OptimizationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Ocurrió un error interno al procesar la optimización.",
        ) from exc


# Sirve frontend como archivos estáticos
if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR), name="assets")


@app.get("/")
def home():
    index_file = FRONTEND_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "Frontend no encontrado. Verifica la carpeta frontend/."}
