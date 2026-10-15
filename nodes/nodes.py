"""Registers the built-in functions as nodes."""

from nodecore import register
from nodes.functions import format_text, read_text, write_text

register(read_text, write_text, format_text)
