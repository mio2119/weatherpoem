from __future__ import annotations

import argparse
from pathlib import Path

import pypdfium2 as pdfium


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--scale", type=float, default=2.0)
    args = parser.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)
    pdf = pdfium.PdfDocument(args.pdf)
    for index, page in enumerate(pdf, start=1):
        image = page.render(scale=args.scale).to_pil()
        image.save(args.output / f"page-{index:03d}.png", optimize=True)
    print(f"rendered={len(pdf)}")


if __name__ == "__main__":
    main()
