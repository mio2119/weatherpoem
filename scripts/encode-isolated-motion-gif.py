"""Encode exact WebView2 probe frames into a short review-only motion clip."""

import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageChops


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: encode-isolated-motion-gif.py FRAMES_DIR OUTPUT_GIF FRAME_MS")

    frames_dir = Path(sys.argv[1]).resolve(strict=True)
    output = Path(sys.argv[2]).resolve()
    frame_ms = int(sys.argv[3])
    if frames_dir.name != "frames" or frames_dir.parent.name != "probe" or frames_dir.parent.parent.name != "temp":
        raise ValueError("frames must come from the isolated probe directory")
    if not frames_dir.parent.parent.parent.name.startswith("WeatherPoem.Performance.Reveal."):
        raise ValueError("frames must be inside an isolated WeatherPoem profile")
    if not re.fullmatch(r"T07_[A-Za-z0-9_-]+_motion\.gif", output.name):
        raise ValueError("output must be a named T07 motion GIF")
    if output.parent.name != "evidence" or output.parent.parent.name != "redesign":
        raise ValueError("output must remain in redesign evidence")
    if output.exists():
        raise FileExistsError("refusing to overwrite motion evidence")
    if not 100 <= frame_ms <= 500:
        raise ValueError("frame interval is outside the review range")

    paths = sorted(frames_dir.glob("frame-*.png"))
    if not 16 <= len(paths) <= 40:
        raise ValueError("expected 16–40 exact WebView2 frames")
    if any(not re.fullmatch(r"frame-\d{3}\.png", path.name) for path in paths):
        raise ValueError("unexpected frame name")
    frames = []
    for path in paths:
        with Image.open(path) as source:
            frames.append(source.convert("RGB"))
    if len({frame.size for frame in frames}) != 1:
        raise ValueError("window size changed during recording")
    changed_pairs = sum(
        ImageChops.difference(before, after).getbbox() is not None
        for before, after in zip(frames, frames[1:])
    )
    if changed_pairs < 4:
        raise ValueError("the captured window did not visibly animate")

    frames[0].save(
        output,
        format="GIF",
        save_all=True,
        append_images=frames[1:],
        duration=frame_ms,
        loop=0,
        disposal=2,
        optimize=False,
    )
    print(json.dumps({
        "frameCount": len(frames),
        "changedAdjacentPairs": changed_pairs,
        "width": frames[0].width,
        "height": frames[0].height,
        "frameIntervalMs": frame_ms,
        "durationMs": len(frames) * frame_ms,
    }))


if __name__ == "__main__":
    main()
