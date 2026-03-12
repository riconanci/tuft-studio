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
    removeBackground: bool = False
    backgroundColorHex: str = "#ffffff"


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


class PreviewRequest(BaseModel):
    image: str  # base64 encoded
    paletteSize: int = 8
    useYarnPalette: bool = False
    minThickness: float = 5.0
    regionThreshold: float = 0.005


class PreviewResponse(BaseModel):
    previewImage: str  # base64 PNG (low-res)


class AnalyzeRequest(BaseModel):
    image: str  # base64 encoded
    useYarnPalette: bool = False


class AnalyzeResponse(BaseModel):
    suggestedColors: int
    scores: list[float]  # inertia per K value (3..12)
