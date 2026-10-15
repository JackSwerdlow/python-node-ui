"""Plain Python functions. Nothing here knows about nodes; nodes.py registers them."""

from pathlib import Path


def read_text(path: str) -> str:
    """The text of a file."""
    return Path(path).read_text(encoding="utf-8")


def write_text(path: str, text: str) -> None:
    """Write text to a file, replacing what was there."""
    Path(path).write_text(text, encoding="utf-8")


def format_text(template: str, **values: object) -> str:
    """Fill a template's {name} placeholders, e.g. "Hello {planet}" with planet='Earth'."""
    return template.format(**values)
