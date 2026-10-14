"""Register custom functions as custom nodes."""

from custom_nodes.example.functions import example_custom_function
from nodecore import register

register(example_custom_function)
