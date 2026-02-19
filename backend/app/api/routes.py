from fastapi import APIRouter, HTTPException
from app.models.schemas import ProcessRequest, ProcessResponse
from app.processing.pipeline import process_image

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
