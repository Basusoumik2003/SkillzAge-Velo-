"""
Standalone Markdown conversion helper for adminService.

Deliberately has zero dependency on Backend/app (that FastAPI service isn't
runnable in this repo — missing modules). This script only needs the
`markitdown` pip package and stdlib.

Usage:
    python markitdown_convert.py <path-to-file>

Prints the converted Markdown to stdout on success (exit code 0).
Prints nothing and exits non-zero if conversion fails for any reason,
so the calling Node code can fall back to a simpler extractor.
"""
import sys


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: markitdown_convert.py <path>", file=sys.stderr)
        return 2

    source_path = sys.argv[1]

    try:
        from markitdown import MarkItDown
    except ImportError:
        print("markitdown is not installed (pip install markitdown)", file=sys.stderr)
        return 3

    try:
        converter = MarkItDown(enable_plugins=False)
        result = converter.convert(source_path)
        text = (result.text_content or "").strip()
    except Exception as exc:  # noqa: BLE001 - report and let caller fall back
        print(f"markitdown conversion failed: {exc}", file=sys.stderr)
        return 1

    if not text:
        return 1

    sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
