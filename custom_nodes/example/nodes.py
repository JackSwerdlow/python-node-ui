"""Register custom functions as custom nodes."""

from custom_nodes.example.functions import count_words
from nodecore import register

register(count_words)
