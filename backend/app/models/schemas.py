from pydantic import BaseModel
from typing import Literal


class ProcessRequest(BaseModel):
    image: str  # base64 encoded
    width: float
    height: float
    unit: Literal["in", "cm"] = "in"
    paletteSize: int = 8
    minThickness: float = 5.0  # mm
    regionThreshold: float = 0.005  # 0.5%
    useYarnPalette: bool = False


class TuftColor(BaseModel):
    id: str
    rgb: tuple[int, int, int]
    hex: str
    pixelCount: int
    name: str = ""  # yarn color name when using yarn palette


class Layer(BaseModel):
    colorId: str
    bitmap: str  # base64 PNG


class YarnEstimate(BaseModel):
    colorId: str
    area: float  # square inches
    estimatedYards: float
    percentCoverage: float


class ProcessResponse(BaseModel):
    processedImage: str  # base64 PNG
    palette: list[TuftColor]
    layers: list[Layer]
    yarnEstimates: list[YarnEstimate]
    outlineSvg: str = ""
