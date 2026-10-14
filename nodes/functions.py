"""Plain Python functions. Nothing here knows about nodes; nodes.py registers them."""


def text(text: str = "") -> str:
    """A block of text."""
    return text


def split_text(text: str, separator: str = ",") -> list[str]:
    """Split text into a list."""
    return text.split(separator)
