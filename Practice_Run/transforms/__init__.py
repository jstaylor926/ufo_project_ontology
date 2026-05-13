"""Local stub of the Foundry ``transforms`` namespace.

The real package is published only inside Foundry. The V2 Bronze and parity
modules import ``from transforms.api import Input, Output, transform`` — by
putting this folder on ``sys.path`` ahead of anything else (the runners do
this), those imports resolve to the lightweight ``api`` shim defined below.
"""
