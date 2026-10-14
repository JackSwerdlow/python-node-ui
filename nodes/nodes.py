"""Registers the built-in functions as nodes."""

from nodecore import register
from nodes.functions import split_text, text

register(text, split_text)
