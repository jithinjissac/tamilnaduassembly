"""
extract_voter_boxes.py
======================
Extracts individual voter boxes from ECI electoral roll PDF pages using
OpenCV contour detection.

Usage:
    python extract_voter_boxes.py --pdf <path> --output <dir> \
        [--dpi 200] [--start-page 3] [--end-page 0] [--threads 4]

Output files are named:  <outputdir>/<stem>_p<page:04d>_b<box:02d>.png
"""

import argparse
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

try:
    import cv2
    import numpy as np
    from pdf2image import convert_from_path, pdfinfo_from_path
except ImportError as e:
    print(f"ERROR: Missing dependency: {e}", file=sys.stderr)
    print("Run: pip install pdf2image opencv-python-headless Pillow", file=sys.stderr)
    sys.exit(1)


def pdf_page_to_image(pdf_path: str, page_number: int, dpi: int) -> np.ndarray:
    images = convert_from_path(
        pdf_path,
        dpi=dpi,
        first_page=page_number,
        last_page=page_number,
        fmt="png",
    )
    if not images:
        raise RuntimeError(f"Could not render page {page_number}")
    return cv2.cvtColor(np.array(images[0].convert("RGB")), cv2.COLOR_RGB2BGR)


def sort_boxes_reading_order(boxes: list[tuple], row_tolerance_fraction: float = 0.5) -> list[tuple]:
    if not boxes:
        return boxes

    heights = sorted([b[3] for b in boxes])
    median_h = heights[len(heights) // 2]
    row_tol = median_h * row_tolerance_fraction

    rows: list[list[tuple]] = []
    for box in sorted(boxes, key=lambda b: b[1]):
        placed = False
        for row in rows:
            ref_y = row[0][1]
            if abs(box[1] - ref_y) < row_tol:
                row.append(box)
                placed = True
                break
        if not placed:
            rows.append([box])

    sorted_boxes = []
    for row in rows:
        for box in sorted(row, key=lambda b: b[0]):
            sorted_boxes.append(box)

    return sorted_boxes


def find_voter_boxes(img: np.ndarray, min_area_fraction: float = 0.005) -> list[tuple]:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    binary = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        blockSize=15,
        C=4,
    )

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    dilated = cv2.dilate(binary, kernel, iterations=1)

    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    page_area = img.shape[0] * img.shape[1]
    min_area = page_area * min_area_fraction
    max_area = page_area * 0.35

    boxes = []
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        area = w * h
        if area < min_area or area > max_area:
            continue
        aspect = w / max(h, 1)
        if aspect > 3.0 or aspect < 0.2:
            continue
        boxes.append((x, y, w, h))

    return sort_boxes_reading_order(boxes)


def grid_fallback(img: np.ndarray) -> list[tuple]:
    h, w = img.shape[:2]
    scale = w / 1190.0

    left_margin = round(28 * scale)
    col1_end = round(307 * scale)
    col2_start = round(389 * scale)
    col2_end = round(687 * scale)
    col3_start = round(769 * scale)
    col3_end = round(1067 * scale)
    first_row_top = round(204 * scale)
    bottom_margin = round(90 * scale)
    last_row_bot = h - bottom_margin

    cols = [
        (left_margin, col1_end - left_margin),
        (col2_start, col2_end - col2_start),
        (col3_start, col3_end - col3_start),
    ]

    n_rows = 10
    row_h = (last_row_bot - first_row_top) // n_rows

    boxes = []
    for r in range(n_rows):
        y = first_row_top + r * row_h
        for (x, cw) in cols:
            boxes.append((x, y, cw, row_h - 2))

    return boxes


def filter_box_layout(boxes: list[tuple], img_shape: tuple[int, ...]) -> list[tuple]:
    if not boxes:
        return boxes

    img_h, img_w = img_shape[:2]
    heights = sorted([b[3] for b in boxes])
    widths = sorted([b[2] for b in boxes])
    median_h = heights[len(heights) // 2]
    median_w = widths[len(widths) // 2]

    filtered = []
    for x, y, w, h in boxes:
        x_ratio = x / max(img_w, 1)
        y_ratio = y / max(img_h, 1)
        w_ratio = w / max(median_w, 1)
        h_ratio = h / max(median_h, 1)

        # Drop footer/summary/table regions often found on the last page.
        if y_ratio > 0.90:
            continue

        # Real voter cells are fairly consistent in the roll layout.
        if w_ratio < 0.65 or w_ratio > 1.35:
            continue
        if h_ratio < 0.60 or h_ratio > 1.45:
            continue

        # Ignore fragments hugging the far right edge where crop artifacts appear.
        if x_ratio > 0.92:
            continue

        filtered.append((x, y, w, h))

    return filtered


def is_valid_voter_crop(crop: np.ndarray) -> bool:
    gray_crop = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    total_pixels = gray_crop.size
    dark_pixels = int(np.sum(gray_crop < 180))
    dark_ratio = dark_pixels / max(total_pixels, 1)
    very_dark = int(np.sum(gray_crop < 80))
    very_dark_ratio = very_dark / max(total_pixels, 1)

    if dark_ratio < 0.015 or very_dark_ratio < 0.002:
        return False

    # Voter boxes contain a visible table border and text blocks.
    edges = cv2.Canny(gray_crop, 80, 160)
    edge_ratio = float(np.count_nonzero(edges)) / max(edges.size, 1)
    if edge_ratio < 0.01:
        return False

    # Reject crops that are almost entirely white after masking.
    white_ratio = float(np.sum(gray_crop > 245)) / max(total_pixels, 1)
    if white_ratio > 0.985:
        return False

    return True


def upscale_and_sharpen(crop: np.ndarray, scale_factor: float = 4.0, sharpen_strength: float = 2.0) -> np.ndarray:
    """Upscale snippet using bicubic interpolation, then apply sharpening."""
    if scale_factor > 1.0:
        h, w = crop.shape[:2]
        new_w = max(1, int(round(w * scale_factor)))
        new_h = max(1, int(round(h * scale_factor)))
        crop = cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_CUBIC)

    if sharpen_strength > 0:
        # Classic sharpen kernel scaled by requested strength.
        kernel = np.array(
            [
                [0, -1, 0],
                [-1, 5, -1],
                [0, -1, 0],
            ],
            dtype=np.float32,
        )
        identity = np.array(
            [
                [0, 0, 0],
                [0, 1, 0],
                [0, 0, 0],
            ],
            dtype=np.float32,
        )
        blend = identity + (kernel - identity) * float(sharpen_strength)
        crop = cv2.filter2D(crop, ddepth=-1, kernel=blend)

    return crop


def process_page(
    pdf_path: str,
    page_number: int,
    dpi: int,
    output_dir: str,
    png_compression: int = 1,
    mask_photo_box: bool = True,
    upscale_factor: float = 2.0,
    sharpen_strength: float = 1.0,
) -> list[str]:
    try:
        img = pdf_page_to_image(pdf_path, page_number, dpi)
    except Exception as exc:
        print(f"[WARN] Page {page_number}: render failed - {exc}", file=sys.stderr)
        return []

    boxes = filter_box_layout(find_voter_boxes(img), img.shape)

    if len(boxes) < 6:
        print(
            f"[INFO] Page {page_number}: contour detection found {len(boxes)} boxes - continuing without layout fallback",
            file=sys.stderr,
        )

    saved = []
    skipped = 0
    stem = Path(pdf_path).stem[:30]

    if boxes:
        heights = sorted([b[3] for b in boxes])
        median_h = heights[len(heights) // 2]
        min_box_h = median_h * 0.5
    else:
        min_box_h = 0

    for idx, (x, y, w, h) in enumerate(boxes, start=1):
        x1 = max(0, x)
        y1 = max(0, y)
        x2 = min(img.shape[1], x + w)
        y2 = min(img.shape[0], y + h)

        if x2 <= x1 or y2 <= y1:
            skipped += 1
            continue

        actual_h = y2 - y1
        if actual_h < min_box_h:
            skipped += 1
            continue

        crop = img[y1:y2, x1:x2].copy()

        # Burn white rectangle over the photo box region before saving
        if mask_photo_box:
            ch, cw = crop.shape[:2]
            mx1 = int(cw * 0.72)
            my1 = int(ch * 0.215)
            mx2 = int(cw * 0.985)
            my2 = int(ch * 0.97)
            crop[my1:my2, mx1:mx2] = 255

        crop = upscale_and_sharpen(crop, scale_factor=upscale_factor, sharpen_strength=sharpen_strength)

        if not is_valid_voter_crop(crop):
            skipped += 1
            continue

        fname = f"{stem}_p{page_number:04d}_b{idx:02d}.png"
        out_path = os.path.join(output_dir, fname)
        cv2.imwrite(out_path, crop, [cv2.IMWRITE_PNG_COMPRESSION, png_compression])
        saved.append(out_path)

    if skipped > 0:
        print(f"[INFO] Page {page_number}: skipped {skipped} blank/non-voter boxes", flush=True)
    print(f"[INFO] Page {page_number}: saved {len(saved)} boxes", flush=True)
    return saved


def main():
    parser = argparse.ArgumentParser(description="Extract voter boxes from ECI PDF")
    parser.add_argument("--pdf", required=True, help="Path to PDF file")
    parser.add_argument("--output", required=True, help="Output directory for PNG crops")
    parser.add_argument("--dpi", type=int, default=400, help="Render DPI")
    parser.add_argument("--start-page", type=int, default=3, help="First page to process")
    parser.add_argument("--end-page", type=int, default=0, help="Last page to process (0 = all)")
    parser.add_argument("--threads", type=int, default=4, help="Parallel threads")
    parser.add_argument("--png-compression", type=int, default=1, help="PNG compression level 0-9 (lower=faster)")
    parser.add_argument("--mask-photo-box", action="store_true", default=True, help="Paint white over photo box region in each crop")
    parser.add_argument("--no-mask-photo-box", dest="mask_photo_box", action="store_false", help="Disable photo box masking")
    parser.add_argument("--upscale-factor", type=float, default=2.0, help="Upscale factor for each crop using bicubic interpolation")
    parser.add_argument("--sharpen-strength", type=float, default=1.0, help="Sharpen strength after upscaling (0 disables)")
    parser.add_argument("--tesseract-cmd", default="", help="Ignored (legacy compat)")
    args = parser.parse_args()

    if not os.path.isfile(args.pdf):
        print(f"ERROR: PDF not found: {args.pdf}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(args.output, exist_ok=True)

    try:
        info = pdfinfo_from_path(args.pdf)
        total_pages = info["Pages"]
    except Exception:
        total_pages = 999

    start = args.start_page
    end = args.end_page if args.end_page and args.end_page > 0 else total_pages
    end = min(end, total_pages)

    pages = list(range(start, end + 1))
    print(f"[INFO] Processing pages {start}-{end} ({len(pages)} pages) at {args.dpi} DPI", flush=True)

    all_saved: list[str] = []

    mask_photo_box = args.mask_photo_box

    if args.threads > 1 and len(pages) > 1:
        with ThreadPoolExecutor(max_workers=args.threads) as executor:
            futures = {
                executor.submit(
                    process_page,
                    args.pdf,
                    p,
                    args.dpi,
                    args.output,
                    args.png_compression,
                    mask_photo_box,
                    args.upscale_factor,
                    args.sharpen_strength,
                ): p
                for p in pages
            }
            for future in as_completed(futures):
                try:
                    all_saved.extend(future.result())
                except Exception as exc:
                    page = futures[future]
                    print(f"[WARN] Page {page} raised exception: {exc}", file=sys.stderr)
    else:
        for p in pages:
            all_saved.extend(
                process_page(
                    args.pdf,
                    p,
                    args.dpi,
                    args.output,
                    args.png_compression,
                    mask_photo_box,
                    args.upscale_factor,
                    args.sharpen_strength,
                )
            )

    print(f"[INFO] Done. Total boxes saved: {len(all_saved)}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
