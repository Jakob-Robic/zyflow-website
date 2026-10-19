#!/usr/bin/env python3
"""Build 1200×630 Open Graph JPGs for each tour.

Center-crops the best existing tour photo to 1200:630 and resizes with
Lanczos. Wider gallery frames are preferred when the cover is too small to
downscale. Upscales, when the source requires them, are stepped and lightly
sharpened rather than stretched in one jump.
"""

from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1] / "assets" / "images" / "tours"
OUT = Path(__file__).resolve().parents[1] / "assets" / "images" / "og" / "tours"
TARGET = (1200, 630)
ASPECT = TARGET[0] / TARGET[1]

# mali-vrh/gallery/01.jpg and ravenska-kocna/gallery/02.jpg are the same
# 1920×471 Jezersko banner, with a large wordmark. They are not used.


def center_crop(image):
    width, height = image.size
    if width / height > ASPECT:
        cropped_w = int(round(height * ASPECT))
        left = (width - cropped_w) // 2
        return image.crop((left, 0, left + cropped_w, height))
    cropped_h = int(round(width / ASPECT))
    top = (height - cropped_h) // 2
    return image.crop((0, top, width, top + cropped_h))


def to_og(image):
    cropped = center_crop(image.convert("RGB"))
    scale = TARGET[0] / cropped.size[0]
    out = cropped
    if scale > 1.01:
        # Step the resize so a small cover is not jumped straight to 1200px.
        width, _height = out.size
        while width * 1.4 < TARGET[0] - 1:
            width = int(round(width * 1.4))
            height = max(1, int(round(width / ASPECT)))
            out = out.resize((width, height), Image.Resampling.LANCZOS)
        out = out.resize(TARGET, Image.Resampling.LANCZOS)
        out = out.filter(ImageFilter.UnsharpMask(radius=1.0, percent=55, threshold=3))
    else:
        out = out.resize(TARGET, Image.Resampling.LANCZOS)
    return out, scale, cropped.size


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    slugs = sorted(path.name for path in ROOT.iterdir() if path.is_dir())
    for slug in slugs:
        rel = f"{slug}/cover.jpg"
        if not (ROOT / rel).exists():
            rel = f"{slug}/cover.webp"
        source = ROOT / rel
        with Image.open(source) as image:
            source_size = image.size
            rendered, scale, cropped = to_og(image)
        dest = OUT / f"{slug}.jpg"
        rendered.save(dest, "JPEG", quality=86, optimize=True, progressive=True)
        print(
            f"{slug:28} {source_size[0]:4}x{source_size[1]:<4} "
            f"crop {cropped[0]}x{cropped[1]} scale {scale:.2f}x  {rel}"
        )


if __name__ == "__main__":
    main()
