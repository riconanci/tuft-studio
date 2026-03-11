from fastapi import APIRouter, HTTPException
from app.models.schemas import ProcessRequest, ProcessResponse, PreviewRequest, PreviewResponse, AnalyzeRequest, AnalyzeResponse
from app.processing.pipeline import process_image, preview_image, analyze_colors

router = APIRouter(prefix="/api")


@router.post("/process", response_model=ProcessResponse)
async def process_endpoint(request: ProcessRequest):
    """
    Process an uploaded image into a tuft-ready pattern.
    Runs the full pipeline: quantization → cleanup → thickness → smoothing.
    """
    try:
        result = process_image(request)
        return result
    except ValueError as e:
        print(f"[PROCESS ERROR] {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


@router.post("/preview", response_model=PreviewResponse)
async def preview_endpoint(request: PreviewRequest):
    """Fast low-res preview — quantize only, no cleanup passes."""
    try:
        result = preview_image(request)
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Preview failed: {str(e)}")


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_endpoint(request: AnalyzeRequest):
    """Analyze image to suggest optimal color count."""
    try:
        result = analyze_colors(request)
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
