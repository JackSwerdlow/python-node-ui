"""Plain Python functions."""

import re
from collections import Counter


def count_words(text: str, *, top: int = 5, min_length: int = 4) -> dict[str, int]:
    """The most common words in some text (of at least min_length letters), and how often each appears."""
    words = [w for w in re.findall(r"[a-z']+", text.lower()) if len(w) >= min_length]
    return dict(Counter(words).most_common(top))
