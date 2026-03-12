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
from skimage.segmentation import slic

from app.models.schemas import (
    ProcessRequest,
    ProcessResponse,
    PreviewRequest,
    PreviewResponse,
    AnalyzeRequest,
    AnalyzeResponse,
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

    # 2b. Background removal (optional — GrabCut)
    if request.removeBackground:
        img_rgb = remove_background(img_rgb, request.backgroundColorHex)

    # 3. Pre-quantization smoothing
    img_smoothed = pre_quantization_smooth(img_rgb)

    # 3b. SLIC superpixel segmentation (edge-aware spatial grouping)
    segments, seg_colors_lab, seg_sizes = compute_superpixels(img_smoothed)

    # 4. Quantize colors — two modes
    color_names: list[str] = []

    if request.useYarnPalette:
        quantized, palette_rgb, labels, color_names = quantize_to_yarn_palette(
            img_smoothed, n_colors=request.paletteSize,
            segments=segments, seg_colors_lab=seg_colors_lab, seg_sizes=seg_sizes
        )
    else:
        quantized, palette_rgb, labels = quantize_colors(
            img_smoothed, n_colors=request.paletteSize,
            segments=segments, seg_colors_lab=seg_colors_lab, seg_sizes=seg_sizes
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
# Fast Preview (low-res, skip cleanup)
# ──────────────────────────────────────────────

def preview_image(request: PreviewRequest) -> PreviewResponse:
    """Fast low-res preview — quantize + light cleanup, skip thickness/contour."""
    img_rgb = decode_and_normalize(request.image)

    # Aggressive downscale for speed (max 400px)
    img_rgb = limit_resolution(img_rgb, max_dim=400)

    # Light smoothing
    smoothed = cv2.medianBlur(img_rgb, 5)
    smoothed = cv2.bilateralFilter(smoothed, d=7, sigmaColor=60, sigmaSpace=60)

    # Superpixels (fewer segments for speed)
    segments, seg_colors_lab, seg_sizes = compute_superpixels(smoothed, n_segments=400, compactness=15.0)

    # Quantize
    if request.useYarnPalette:
        quantized, palette_rgb, labels, _ = quantize_to_yarn_palette(
            smoothed, n_colors=request.paletteSize,
            segments=segments, seg_colors_lab=seg_colors_lab, seg_sizes=seg_sizes
        )
    else:
        quantized, palette_rgb, labels = quantize_colors(
            smoothed, n_colors=request.paletteSize,
            segments=segments, seg_colors_lab=seg_colors_lab, seg_sizes=seg_sizes
        )

    # Light cleanup (2 passes instead of 4)
    for _ in range(2):
        labels = cleanup_small_regions(labels, threshold_ratio=request.regionThreshold)

    # Rebuild image from cleaned labels
    h, w = labels.shape
    quantized = palette_rgb[labels.flatten()].reshape(h, w, 3).astype(np.uint8)

    return PreviewResponse(previewImage=encode_image(quantized))


# ──────────────────────────────────────────────
# Color Count Analysis (elbow method)
# ──────────────────────────────────────────────

def analyze_colors(request: AnalyzeRequest) -> AnalyzeResponse:
    """Analyze image to suggest optimal color count using elbow method."""
    img_rgb = decode_and_normalize(request.image)

    # Tiny for speed (max 200px)
    img_rgb = limit_resolution(img_rgb, max_dim=200)

    # Light smoothing
    smoothed = cv2.medianBlur(img_rgb, 5)

    # Convert to LAB
    img_lab = cv2.cvtColor(smoothed, cv2.COLOR_RGB2LAB).astype(np.float32)
    pixels_lab = img_lab.reshape(-1, 3)

    # Subsample if needed
    if len(pixels_lab) > 20_000:
        rng = np.random.RandomState(42)
        idx = rng.choice(len(pixels_lab), 20_000, replace=False)
        pixels_lab = pixels_lab[idx]

    # Run K-Means for K=3..12 and record inertia
    k_range = list(range(3, 13))
    inertias = []
    for k in k_range:
        km = KMeans(n_clusters=k, random_state=42, n_init=5, max_iter=200)
        km.fit(pixels_lab)
        inertias.append(float(km.inertia_))

    # Elbow detection: find K where second derivative is largest
    # (i.e. the sharpest bend in the curve)
    suggested = 8  # default
    if len(inertias) >= 3:
        # Normalize inertias to 0-1 for stable comparison
        max_i = max(inertias) if max(inertias) > 0 else 1
        norm = [i / max_i for i in inertias]

        # Second derivative
        best_score = 0
        for i in range(1, len(norm) - 1):
            second_deriv = norm[i - 1] - 2 * norm[i] + norm[i + 1]
            if second_deriv > best_score:
                best_score = second_deriv
                suggested = k_range[i]

    return AnalyzeResponse(suggestedColors=suggested, scores=inertias)


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
# Step 2b: Background Removal (GrabCut)
# ──────────────────────────────────────────────

def remove_background(img_rgb: np.ndarray, bg_color_hex: str = "#ffffff") -> np.ndarray:
    """
    Remove background using OpenCV GrabCut.
    Uses center 80% as probable foreground, edges as probable background.
    Replaces background with solid color.
    """
    h, w = img_rgb.shape[:2]

    # Parse hex to RGB
    bg_hex = bg_color_hex.lstrip("#")
    bg_r = int(bg_hex[0:2], 16)
    bg_g = int(bg_hex[2:4], 16)
    bg_b = int(bg_hex[4:6], 16)

    # Convert RGB to BGR for OpenCV
    img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)

    # Initialize mask
    mask = np.zeros((h, w), np.uint8)

    # Define rectangle: center 80% is probable foreground
    margin_x = int(w * 0.10)
    margin_y = int(h * 0.10)
    rect = (margin_x, margin_y, w - 2 * margin_x, h - 2 * margin_y)

    # GrabCut models
    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)

    # Run GrabCut (5 iterations)
    try:
        cv2.grabCut(img_bgr, mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)
    except Exception:
        # If GrabCut fails, return original
        return img_rgb

    # Create binary mask: foreground = definite fg (1) + probable fg (3)
    fg_mask = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 1, 0).astype(np.uint8)

    # Smooth the mask edges slightly
    fg_mask = cv2.GaussianBlur(fg_mask.astype(np.float32), (5, 5), 0)

    # Composite
    alpha = fg_mask[:, :, np.newaxis]
    bg = np.full_like(img_rgb, [bg_r, bg_g, bg_b], dtype=np.uint8)
    composited = (img_rgb * alpha + bg * (1 - alpha)).astype(np.uint8)

    return composited


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
# Step 3b: SLIC Superpixel Segmentation
# ──────────────────────────────────────────────

def compute_superpixels(
    img_rgb: np.ndarray, n_segments: int = 1500, compactness: float = 15.0
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Compute SLIC superpixels — groups nearby pixels with similar colors
    into coherent patches that respect edges.

    Returns:
        segments: 2D array (h, w) of superpixel labels (0..N-1)
        seg_colors_lab: (N, 3) mean LAB color per superpixel
        seg_sizes: (N,) pixel count per superpixel
    """
    # SLIC works in LAB internally, but we pass RGB and let it convert
    segments = slic(
        img_rgb,
        n_segments=n_segments,
        compactness=compactness,
        start_label=0,
        channel_axis=2,
    )

    n_segs = segments.max() + 1

    # Compute mean LAB color per superpixel
    img_lab = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    flat_lab = img_lab.reshape(-1, 3)
    flat_segs = segments.ravel()

    seg_colors_lab = np.zeros((n_segs, 3), dtype=np.float32)
    seg_sizes = np.zeros(n_segs, dtype=np.int64)

    # Accumulate per-segment
    np.add.at(seg_colors_lab, flat_segs, flat_lab)
    np.add.at(seg_sizes, flat_segs, 1)

    # Average
    nonzero = seg_sizes > 0
    seg_colors_lab[nonzero] /= seg_sizes[nonzero, np.newaxis]

    return segments, seg_colors_lab, seg_sizes


# ──────────────────────────────────────────────
# Step 4: Color Quantization (K-Means in LAB)
# ──────────────────────────────────────────────

def quantize_colors(
    img_rgb: np.ndarray, n_colors: int = 8,
    segments: np.ndarray = None, seg_colors_lab: np.ndarray = None,
    seg_sizes: np.ndarray = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Quantize to n_colors using K-Means in LAB color space.
    When superpixels are provided, clusters superpixel averages (weighted by size)
    instead of raw pixels — produces much cleaner, spatially coherent regions.
    """
    h, w = img_rgb.shape[:2]

    if segments is not None and seg_colors_lab is not None and seg_sizes is not None:
        # Cluster superpixel average colors (weighted by area)
        kmeans = KMeans(
            n_clusters=n_colors,
            random_state=42,
            n_init=15,
            max_iter=500,
        )
        # Weight samples by superpixel size for better cluster balance
        sample_weights = seg_sizes.astype(np.float64)
        kmeans.fit(seg_colors_lab, sample_weight=sample_weights)

        # Assign each superpixel to its cluster
        seg_labels = kmeans.predict(seg_colors_lab)

        # Map back to pixel-level labels
        labels = seg_labels[segments]

        # Convert centers to RGB
        centers_lab = kmeans.cluster_centers_.astype(np.uint8)
        centers_rgb = cv2.cvtColor(
            centers_lab.reshape(1, -1, 3), cv2.COLOR_LAB2RGB
        ).reshape(-1, 3)
    else:
        # Fallback: raw pixel clustering (original behavior)
        img_lab = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
        pixels_lab = img_lab.reshape(-1, 3)

        n_pixels = len(pixels_lab)
        max_samples = 150_000
        if n_pixels > max_samples:
            rng = np.random.RandomState(42)
            sample_idx = rng.choice(n_pixels, max_samples, replace=False)
            sample = pixels_lab[sample_idx]
        else:
            sample = pixels_lab

        kmeans = KMeans(
            n_clusters=n_colors,
            random_state=42,
            n_init=15,
            max_iter=500,
        )
        kmeans.fit(sample)
        labels = kmeans.predict(pixels_lab).reshape(h, w)

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
    img_rgb: np.ndarray, n_colors: int = 8,
    segments: np.ndarray = None, seg_colors_lab: np.ndarray = None,
    seg_sizes: np.ndarray = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, list[str]]:
    """
    Map every superpixel (or pixel) to the nearest color in the yarn palette,
    then select the top N most-used yarn colors.
    When superpixels provided, matches on superpixel averages for cleaner regions.
    """
    h, w = img_rgb.shape[:2]

    yarn_rgb_f = YARN_PALETTE_RGB.astype(np.float32)
    yarn_lab = cv2.cvtColor(
        yarn_rgb_f.reshape(1, -1, 3).astype(np.uint8), cv2.COLOR_RGB2LAB
    ).astype(np.float32).reshape(-1, 3)
    n_yarn = len(yarn_lab)

    if segments is not None and seg_colors_lab is not None and seg_sizes is not None:
        n_segs = len(seg_colors_lab)

        # Map each superpixel to nearest yarn color
        batch_size = 5000
        seg_yarn_indices = np.zeros(n_segs, dtype=np.int32)
        for start in range(0, n_segs, batch_size):
            end = min(start + batch_size, n_segs)
            batch = seg_colors_lab[start:end]
            dists = np.linalg.norm(
                batch[:, np.newaxis, :] - yarn_lab[np.newaxis, :, :], axis=2
            )
            seg_yarn_indices[start:end] = dists.argmin(axis=1)

        # Count usage per yarn color (weighted by superpixel area)
        yarn_counts = np.zeros(n_yarn, dtype=np.int64)
        np.add.at(yarn_counts, seg_yarn_indices, seg_sizes)

        # Select top N
        top_n_yarn_idx = np.argsort(yarn_counts)[::-1][:n_colors]
        top_n_yarn_idx = np.sort(top_n_yarn_idx)

        selected_lab = yarn_lab[top_n_yarn_idx]
        selected_rgb = YARN_PALETTE_RGB[top_n_yarn_idx]
        selected_names = [YARN_PALETTE_NAMES[i] for i in top_n_yarn_idx]

        # Remap each superpixel to nearest selected yarn color
        seg_labels = np.zeros(n_segs, dtype=np.int32)
        for start in range(0, n_segs, batch_size):
            end = min(start + batch_size, n_segs)
            batch = seg_colors_lab[start:end]
            dists = np.linalg.norm(
                batch[:, np.newaxis, :] - selected_lab[np.newaxis, :, :], axis=2
            )
            seg_labels[start:end] = dists.argmin(axis=1)

        # Map back to pixel labels
        labels_2d = seg_labels[segments]
        quantized = selected_rgb[labels_2d.ravel()].reshape(h, w, 3).astype(np.uint8)
    else:
        # Fallback: per-pixel matching (original behavior)
        img_lab = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
        pixels_lab = img_lab.reshape(-1, 3)
        n_pixels = len(pixels_lab)
        batch_size = 50_000
        yarn_indices = np.zeros(n_pixels, dtype=np.int32)

        for start in range(0, n_pixels, batch_size):
            end = min(start + batch_size, n_pixels)
            batch = pixels_lab[start:end]
            dists = np.linalg.norm(
                batch[:, np.newaxis, :] - yarn_lab[np.newaxis, :, :], axis=2
            )
            yarn_indices[start:end] = dists.argmin(axis=1)

        yarn_counts = np.bincount(yarn_indices, minlength=n_yarn)
        top_n_yarn_idx = np.argsort(yarn_counts)[::-1][:n_colors]
        top_n_yarn_idx = np.sort(top_n_yarn_idx)

        selected_lab = yarn_lab[top_n_yarn_idx]
        selected_rgb = YARN_PALETTE_RGB[top_n_yarn_idx]
        selected_names = [YARN_PALETTE_NAMES[i] for i in top_n_yarn_idx]

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
