"""
Tuft Studio — Image Processing Pipeline v3

Major improvements:
  1. Pre-quantization bilateral filter — smooth noise/gradients BEFORE
     clustering so K-Means gets clean data and produces coherent regions
  2. Contour-based edge smoothing via Douglas-Peucker polygon simplification —
     gives vector-quality curves instead of pixel staircase
  3. Post-cleanup palette refit — recompute palette colors from actual
     remaining pixels after all cleanup, giving truer/more saturated colors
  4. Multi-pass aggressive cleanup
  5. Spatial-aware quantization option
"""

import base64
import io
import uuid
from typing import Optional

import cv2
import numpy as np
from PIL import Image
from sklearn.cluster import KMeans

from app.models.schemas import (
    ProcessRequest,
    ProcessResponse,
    TuftColor,
    Layer,
    YarnEstimate,
)
from app.processing.yarn_colors import YARN_PALETTE_RGB, YARN_PALETTE_NAMES


# ──────────────────────────────────────────────
# Main pipeline entry point
# ──────────────────────────────────────────────

def process_image(request: ProcessRequest) -> ProcessResponse:
    """Run the full processing pipeline on an uploaded image."""

    # 1. Decode & normalize
    img_rgb = decode_and_normalize(request.image)

    # 2. Limit resolution (preserve original aspect ratio)
    img_rgb = limit_resolution(img_rgb, max_dim=2000)

    # 3. Pre-quantization smoothing
    img_smoothed = pre_quantization_smooth(img_rgb)

    # 4. Quantize colors — two modes
    color_names: list[str] = []

    if request.useYarnPalette:
        # Yarn palette mode: map to real yarn colors, pick top N
        quantized, palette_rgb, labels, color_names = quantize_to_yarn_palette(
            img_smoothed, n_colors=request.paletteSize
        )
    else:
        # Free mode: K-Means finds arbitrary colors
        quantized, palette_rgb, labels = quantize_colors(
            img_smoothed, n_colors=request.paletteSize
        )

    # 5. Multi-pass cleanup
    for _ in range(4):
        labels = cleanup_small_regions(labels, threshold_ratio=request.regionThreshold)

    # 6. Enforce minimum feature thickness
    labels = enforce_min_thickness(
        labels, len(palette_rgb),
        request.minThickness, request.width, request.height, request.unit
    )

    # 7. Contour-based edge smoothing (Douglas-Peucker)
    labels = smooth_edges_contour(labels, len(palette_rgb))

    # 8. Final cleanup
    for _ in range(2):
        labels = cleanup_small_regions(labels, threshold_ratio=request.regionThreshold)

    # 9. Palette refit — only in free mode (yarn mode keeps exact yarn colors)
    if not request.useYarnPalette:
        palette_rgb = refit_palette(img_rgb, labels, len(palette_rgb))

    # Rebuild final image
    h, w = labels.shape
    quantized = palette_rgb[labels.flatten()].reshape(h, w, 3).astype(np.uint8)

    # 10. Generate outline SVG from color boundaries
    outline_svg = generate_outline_svg(labels, len(palette_rgb))

    # Build response
    palette, layers, yarn_estimates = build_output(
        quantized, palette_rgb, labels, request, color_names=color_names
    )

    processed_b64 = encode_image(quantized)

    return ProcessResponse(
        processedImage=processed_b64,
        palette=palette,
        layers=layers,
        yarnEstimates=yarn_estimates,
        outlineSvg=outline_svg,
    )


# ──────────────────────────────────────────────
# Step 1: Decode & Normalize
# ──────────────────────────────────────────────

def decode_and_normalize(image_b64: str) -> np.ndarray:
    """Decode base64 image, strip alpha, normalize orientation."""
    image_data = base64.b64decode(image_b64)
    pil_image = Image.open(io.BytesIO(image_data))

    try:
        from PIL import ImageOps
        pil_image = ImageOps.exif_transpose(pil_image)
    except Exception:
        pass

    pil_image = pil_image.convert("RGB")
    return np.array(pil_image)


# ──────────────────────────────────────────────
# Step 2: Cap resolution
# ──────────────────────────────────────────────

def limit_resolution(img: np.ndarray, max_dim: int = 2000) -> np.ndarray:
    """Downscale if either dimension exceeds max_dim."""
    h, w = img.shape[:2]
    if max(h, w) <= max_dim:
        return img
    scale = max_dim / max(h, w)
    return cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


# ──────────────────────────────────────────────
# Step 3: Pre-quantization smoothing
# ──────────────────────────────────────────────

def pre_quantization_smooth(img_rgb: np.ndarray) -> np.ndarray:
    """
    Smooth the image BEFORE quantization to collapse noise, subtle gradients,
    and compression artifacts into flatter regions. This gives K-Means much
    cleaner input and produces more coherent color regions.

    Uses a two-pass approach:
      1. Median filter — kills salt-and-pepper noise and JPEG artifacts
         while preserving hard edges (unlike Gaussian which blurs them)
      2. Bilateral filter — smooths remaining gradients within regions
         while respecting strong color edges

    The result looks slightly "posterized" which is exactly what we want —
    the quantizer will then snap these pre-flattened areas into clean regions.
    """
    # Pass 1: Median filter (strong — 7px kernel)
    # Median is ideal here because it removes noise without creating
    # new intermediate colors at edges like Gaussian does
    smoothed = cv2.medianBlur(img_rgb, 7)

    # Pass 2: Edge-preserving bilateral filter
    # d=9, sigmaColor=75 means "aggressively smooth similar colors
    # but stop at strong edges"
    smoothed = cv2.bilateralFilter(smoothed, d=9, sigmaColor=75, sigmaSpace=75)

    # Pass 3: One more median to clean any bilateral artifacts
    smoothed = cv2.medianBlur(smoothed, 5)

    return smoothed


# ──────────────────────────────────────────────
# Step 4: Color Quantization (K-Means in LAB)
# ──────────────────────────────────────────────

def quantize_colors(
    img_rgb: np.ndarray, n_colors: int = 8
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Quantize to n_colors using K-Means in LAB color space.
    Subsamples for fitting speed, predicts on all pixels.
    """
    h, w = img_rgb.shape[:2]

    # Convert to LAB for perceptually uniform clustering
    img_lab = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    pixels_lab = img_lab.reshape(-1, 3)

    # Subsample for K-Means fitting speed
    n_pixels = len(pixels_lab)
    max_samples = 150_000
    if n_pixels > max_samples:
        rng = np.random.RandomState(42)
        sample_idx = rng.choice(n_pixels, max_samples, replace=False)
        sample = pixels_lab[sample_idx]
    else:
        sample = pixels_lab

    # Full KMeans with many inits for best clusters
    kmeans = KMeans(
        n_clusters=n_colors,
        random_state=42,
        n_init=15,
        max_iter=500,
    )
    kmeans.fit(sample)

    # Predict all pixels
    labels = kmeans.predict(pixels_lab).reshape(h, w)

    # Convert centers to RGB
    centers_lab = kmeans.cluster_centers_.astype(np.uint8)
    centers_rgb = cv2.cvtColor(
        centers_lab.reshape(1, -1, 3), cv2.COLOR_LAB2RGB
    ).reshape(-1, 3)

    quantized = centers_rgb[labels.flatten()].reshape(h, w, 3).astype(np.uint8)

    return quantized, centers_rgb, labels


# ──────────────────────────────────────────────
# Step 4 (alt): Yarn Palette Quantization
# ──────────────────────────────────────────────

def quantize_to_yarn_palette(
    img_rgb: np.ndarray, n_colors: int = 8
) -> tuple[np.ndarray, np.ndarray, np.ndarray, list[str]]:
    """
    Map every pixel to the nearest color in the yarn palette,
    then select the top N most-used yarn colors.

    Returns:
        quantized: RGB image with yarn palette colors
        palette_rgb: array of (n_colors, 3) — selected yarn colors
        labels: 2D label map (0..n_colors-1)
        color_names: list of yarn color names
    """
    h, w = img_rgb.shape[:2]
    pixels = img_rgb.reshape(-1, 3).astype(np.float32)

    # Convert both to LAB for perceptually accurate matching
    img_lab = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    pixels_lab = img_lab.reshape(-1, 3)

    yarn_rgb_f = YARN_PALETTE_RGB.astype(np.float32)
    yarn_lab = cv2.cvtColor(
        yarn_rgb_f.reshape(1, -1, 3).astype(np.uint8), cv2.COLOR_RGB2LAB
    ).astype(np.float32).reshape(-1, 3)

    # Find nearest yarn color for every pixel (in LAB space)
    # Compute pairwise distances in batches to avoid memory blowup
    n_pixels = len(pixels_lab)
    n_yarn = len(yarn_lab)
    batch_size = 50_000
    yarn_indices = np.zeros(n_pixels, dtype=np.int32)

    for start in range(0, n_pixels, batch_size):
        end = min(start + batch_size, n_pixels)
        batch = pixels_lab[start:end]
        # (batch, 1, 3) - (1, n_yarn, 3) → (batch, n_yarn)
        dists = np.linalg.norm(
            batch[:, np.newaxis, :] - yarn_lab[np.newaxis, :, :], axis=2
        )
        yarn_indices[start:end] = dists.argmin(axis=1)

    # Count usage per yarn color
    yarn_counts = np.bincount(yarn_indices, minlength=n_yarn)

    # Select top N most used yarn colors
    top_n_yarn_idx = np.argsort(yarn_counts)[::-1][:n_colors]
    top_n_yarn_idx = np.sort(top_n_yarn_idx)  # sort back for consistency

    # Build mapping: yarn_index → new label (0..n_colors-1)
    # For pixels mapped to non-selected yarn colors, remap to nearest selected
    selected_lab = yarn_lab[top_n_yarn_idx]
    selected_rgb = YARN_PALETTE_RGB[top_n_yarn_idx]
    selected_names = [YARN_PALETTE_NAMES[i] for i in top_n_yarn_idx]

    # Remap all pixels to the selected subset
    labels = np.zeros(n_pixels, dtype=np.int32)
    for start in range(0, n_pixels, batch_size):
        end = min(start + batch_size, n_pixels)
        batch = pixels_lab[start:end]
        dists = np.linalg.norm(
            batch[:, np.newaxis, :] - selected_lab[np.newaxis, :, :], axis=2
        )
        labels[start:end] = dists.argmin(axis=1)

    labels_2d = labels.reshape(h, w)
    quantized = selected_rgb[labels].reshape(h, w, 3).astype(np.uint8)

    return quantized, selected_rgb, labels_2d, selected_names


# ──────────────────────────────────────────────
# Step 5: Connected Component Cleanup
# ──────────────────────────────────────────────

def cleanup_small_regions(
    labels: np.ndarray, threshold_ratio: float = 0.005
) -> np.ndarray:
    """
    Remove small floating regions by merging into adjacent dominant color.
    """
    h, w = labels.shape
    total_pixels = h * w
    min_area = max(int(total_pixels * threshold_ratio), 8)
    result = labels.copy()
    n_colors = int(labels.max()) + 1

    for color_id in range(n_colors):
        mask = (result == color_id).astype(np.uint8)
        num_components, comp_labels, stats, _ = cv2.connectedComponentsWithStats(
            mask, connectivity=8
        )

        for comp_id in range(1, num_components):
            area = stats[comp_id, cv2.CC_STAT_AREA]
            if area < min_area:
                comp_mask = (comp_labels == comp_id).astype(np.uint8)

                # Dilate to sample neighbors
                kernel = np.ones((5, 5), np.uint8)
                dilated = cv2.dilate(comp_mask, kernel, iterations=2)
                border = dilated - comp_mask

                neighbor_labels = result[border.astype(bool)]
                neighbor_labels = neighbor_labels[neighbor_labels != color_id]

                if len(neighbor_labels) > 0:
                    dominant = int(np.bincount(neighbor_labels).argmax())
                    result[comp_labels == comp_id] = dominant

    return result


# ──────────────────────────────────────────────
# Step 6: Minimum Feature Thickness
# ──────────────────────────────────────────────

def enforce_min_thickness(
    labels: np.ndarray,
    n_colors: int,
    min_thickness_mm: float,
    rug_width: float,
    rug_height: float,
    unit: str,
) -> np.ndarray:
    """
    Remove features thinner than min_thickness_mm via erode-dilate.
    Lost thin pixels are reassigned to their dominant neighbor.
    """
    h, w = labels.shape

    if unit == "cm":
        rug_width_mm = rug_width * 10
    else:
        rug_width_mm = rug_width * 25.4

    px_per_mm = w / rug_width_mm
    min_radius = max(int(min_thickness_mm * px_per_mm / 2), 1)

    if min_radius < 2:
        return labels

    result = labels.copy()
    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (min_radius * 2 + 1, min_radius * 2 + 1)
    )

    for color_id in range(n_colors):
        mask = (result == color_id).astype(np.uint8)
        if mask.sum() == 0:
            continue

        eroded = cv2.erode(mask, kernel, iterations=1)
        restored = cv2.dilate(eroded, kernel, iterations=1)
        lost = mask & ~restored

        if lost.any():
            # Batch reassignment using dilation to find neighbors
            lost_dilated = cv2.dilate(lost, np.ones((5, 5), np.uint8), iterations=2)
            border = lost_dilated & ~lost
            neighbor_vals = result[border.astype(bool)]
            neighbor_vals = neighbor_vals[neighbor_vals != color_id]

            if len(neighbor_vals) > 0:
                dominant = int(np.bincount(neighbor_vals).argmax())
                result[lost.astype(bool)] = dominant

    return result


# ──────────────────────────────────────────────
# Step 7: Contour-based edge smoothing
# ──────────────────────────────────────────────

def smooth_edges_contour(labels: np.ndarray, n_colors: int) -> np.ndarray:
    """
    Smooth region boundaries using contour extraction + Douglas-Peucker
    polygon simplification + re-rasterization.

    This is the key quality step. Instead of pushing pixels around with
    morphological ops, we:
      1. Extract the boundary of each color region as contours
      2. Simplify those contours with Douglas-Peucker (removes jaggies,
         keeps overall shape)
      3. Re-draw the simplified polygons filled

    Result: vector-quality smooth curves, perfectly flat color fills.

    Compositing order: largest regions first (background), smallest last
    (foreground detail) so small features paint over large ones.
    """
    h, w = labels.shape

    # Sort colors by area: largest first (they get drawn first = background)
    color_areas = []
    for c in range(n_colors):
        area = int((labels == c).sum())
        color_areas.append((c, area))
    color_areas.sort(key=lambda x: x[1], reverse=True)

    # Canvas starts as the dominant background color
    output = np.full((h, w), color_areas[0][0], dtype=np.int32)

    # Epsilon for Douglas-Peucker: controls smoothing aggressiveness
    # Larger = smoother curves but less detail
    # Scale with image size so behavior is consistent
    base_epsilon = max(h, w) * 0.002  # 0.2% of image size

    for color_id, area in color_areas:
        if area == 0:
            continue

        mask = (labels == color_id).astype(np.uint8)

        # Find contours
        contours, hierarchy = cv2.findContours(
            mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE
        )

        if not contours:
            continue

        # Simplify each contour with Douglas-Peucker
        simplified = []
        for cnt in contours:
            perimeter = cv2.arcLength(cnt, True)
            # Adaptive epsilon: smaller regions get less aggressive smoothing
            epsilon = base_epsilon * min(1.0, perimeter / (max(h, w) * 0.5))
            epsilon = max(epsilon, 1.0)  # minimum smoothing
            approx = cv2.approxPolyDP(cnt, epsilon, True)
            simplified.append(approx)

        # Re-draw simplified polygons
        # Use hierarchy to handle holes correctly (RETR_CCOMP gives 2-level hierarchy)
        canvas = np.zeros((h, w), dtype=np.uint8)

        if hierarchy is not None:
            # Draw outer contours filled, then subtract holes
            for i, cnt in enumerate(simplified):
                if hierarchy[0][i][3] == -1:  # No parent = outer contour
                    cv2.drawContours(canvas, [cnt], 0, 255, cv2.FILLED)
                else:  # Has parent = hole
                    cv2.drawContours(canvas, [cnt], 0, 0, cv2.FILLED)
        else:
            cv2.drawContours(canvas, simplified, -1, 255, cv2.FILLED)

        # Paint this color over the output where the simplified mask says so
        output[canvas > 0] = color_id

    return output


# ──────────────────────────────────────────────
# Step 9: Palette Refit
# ──────────────────────────────────────────────

def refit_palette(
    original_rgb: np.ndarray,
    labels: np.ndarray,
    n_colors: int,
) -> np.ndarray:
    """
    Recompute palette colors from the ORIGINAL (unsmoothed) image pixels
    based on final label assignments.

    Why: K-Means centers were computed on the pre-smoothed image, and then
    cleanup/smoothing moved pixels between regions. The original centers
    are now stale. By averaging the original RGB values of pixels in each
    final region, we get truer, more saturated colors.
    """
    h, w = labels.shape
    original_flat = original_rgb.reshape(-1, 3).astype(np.float64)
    labels_flat = labels.flatten()

    new_palette = np.zeros((n_colors, 3), dtype=np.uint8)

    for c in range(n_colors):
        mask = (labels_flat == c)
        if mask.sum() > 0:
            mean_color = original_flat[mask].mean(axis=0)
            new_palette[c] = np.clip(mean_color, 0, 255).astype(np.uint8)

    return new_palette


# ──────────────────────────────────────────────
# Step 10: Outline SVG Generation
# ──────────────────────────────────────────────

def generate_outline_svg(labels: np.ndarray, n_colors: int) -> str:
    """
    Generate SVG outline paths from color region boundaries.

    For each color region:
      1. Extract contours (with hierarchy for holes)
      2. Simplify with Douglas-Peucker
      3. Convert to SVG path data

    Returns a complete SVG string with all outline paths.
    The SVG viewBox matches the label dimensions so it can be
    overlaid 1:1 on the processed image.
    """
    h, w = labels.shape
    paths: list[str] = []

    # Smoothing epsilon — controls curve smoothness
    base_epsilon = max(h, w) * 0.001  # Slightly less aggressive than fill smoothing

    for color_id in range(n_colors):
        mask = (labels == color_id).astype(np.uint8)
        if mask.sum() == 0:
            continue

        contours, hierarchy = cv2.findContours(
            mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE
        )

        if not contours or hierarchy is None:
            continue

        for i, cnt in enumerate(contours):
            if len(cnt) < 3:
                continue

            # Simplify
            perimeter = cv2.arcLength(cnt, True)
            epsilon = base_epsilon * min(1.0, perimeter / (max(h, w) * 0.5))
            epsilon = max(epsilon, 0.5)
            approx = cv2.approxPolyDP(cnt, epsilon, True)

            if len(approx) < 3:
                continue

            # Convert to SVG path data
            points = approx.reshape(-1, 2)
            d = f"M{points[0][0]},{points[0][1]}"
            for pt in points[1:]:
                d += f" L{pt[0]},{pt[1]}"
            d += " Z"

            paths.append(d)

    if not paths:
        return ""

    # Combine all paths into one <path> element for efficiency
    all_d = " ".join(paths)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {w} {h}" '
        f'width="{w}" height="{h}">'
        f'<path d="{all_d}" '
        f'fill="none" stroke="#000000" stroke-width="1.5" '
        f'stroke-linejoin="round" stroke-linecap="round"/>'
        f'</svg>'
    )

    return svg


# ──────────────────────────────────────────────
# Build output (palette, layers, yarn estimates)
# ──────────────────────────────────────────────

def build_output(
    quantized: np.ndarray,
    palette_rgb: np.ndarray,
    labels: np.ndarray,
    request: ProcessRequest,
    color_names: list[str] | None = None,
) -> tuple[list[TuftColor], list[Layer], list[YarnEstimate]]:
    """Build palette, per-color layers, and yarn estimates."""
    h, w = quantized.shape[:2]
    total_pixels = h * w

    if request.unit == "cm":
        rug_area = (request.width / 2.54) * (request.height / 2.54)
    else:
        rug_area = request.width * request.height

    # Yards of yarn per square inch of rug coverage
    # Based on typical cut pile tufting: ~12mm pile height, ~5mm gauge
    # ~1 lb yarn per sq ft ≈ 250 yds per sq ft ≈ 1.7 yds per sq in
    TUFT_DENSITY = 1.7

    palette: list[TuftColor] = []
    layers: list[Layer] = []
    yarn_estimates: list[YarnEstimate] = []

    for i, rgb in enumerate(palette_rgb):
        color_id = str(uuid.uuid4())[:8]
        r, g, b = int(rgb[0]), int(rgb[1]), int(rgb[2])
        hex_val = f"#{r:02x}{g:02x}{b:02x}"
        name = color_names[i] if color_names and i < len(color_names) else ""

        pixel_count = int((labels == i).sum())

        palette.append(TuftColor(
            id=color_id,
            rgb=(r, g, b),
            hex=hex_val,
            pixelCount=pixel_count,
            name=name,
        ))

        mask_2d = (labels == i).astype(np.uint8) * 255
        layer_b64 = encode_image(cv2.cvtColor(mask_2d, cv2.COLOR_GRAY2RGB))
        layers.append(Layer(colorId=color_id, bitmap=layer_b64))

        coverage = pixel_count / total_pixels if total_pixels > 0 else 0
        area_sq_in = coverage * rug_area
        estimated_yards = area_sq_in * TUFT_DENSITY

        yarn_estimates.append(YarnEstimate(
            colorId=color_id,
            area=round(area_sq_in, 2),
            estimatedYards=round(estimated_yards, 1),
            percentCoverage=round(coverage * 100, 1),
        ))

    return palette, layers, yarn_estimates


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def encode_image(img_rgb: np.ndarray) -> str:
    """Encode numpy RGB image to base64 PNG string."""
    img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
    _, buffer = cv2.imencode(".png", img_bgr)
    return base64.b64encode(buffer).decode("utf-8")
