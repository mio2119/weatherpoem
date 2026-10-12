from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--columns", type=int, default=2)
    parser.add_argument("--rows", type=int, default=2)
    parser.add_argument("--page-width", type=int, default=612)
    args = parser.parse_args()

    pages = sorted(args.input.glob("page-*.png"))
    args.output.mkdir(parents=True, exist_ok=True)
    per_sheet = args.columns * args.rows
    margin = 18
    label_height = 28

    with Image.open(pages[0]) as first:
        ratio = first.height / first.width
    page_height = round(args.page_width * ratio)
    tile_width = args.page_width + margin * 2
    tile_height = page_height + label_height + margin * 2

    for sheet_index in range(math.ceil(len(pages) / per_sheet)):
        subset = pages[sheet_index * per_sheet : (sheet_index + 1) * per_sheet]
        sheet = Image.new(
            "RGB",
            (tile_width * args.columns, tile_height * args.rows),
            "#D9DDE3",
        )
        draw = ImageDraw.Draw(sheet)
        for tile_index, page_path in enumerate(subset):
            row, column = divmod(tile_index, args.columns)
            x = column * tile_width + margin
            y = row * tile_height + margin + label_height
            with Image.open(page_path) as source:
                page = source.convert("RGB")
                page.thumbnail((args.page_width, page_height), Image.Resampling.LANCZOS)
                sheet.paste(page, (x, y))
            draw.text((x, margin + row * tile_height), page_path.stem, fill="#20242A")
        first_page = sheet_index * per_sheet + 1
        last_page = first_page + len(subset) - 1
        sheet.save(
            args.output / f"sheet-{sheet_index + 1:02d}-pages-{first_page:03d}-{last_page:03d}.png",
            optimize=True,
        )
    print(f"sheets={math.ceil(len(pages) / per_sheet)}")


if __name__ == "__main__":
    main()
