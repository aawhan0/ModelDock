"""Policy for the intentionally restricted Python model artifact runtime."""

import ast

SAFE_BUILTINS = {
    "ArithmeticError": ArithmeticError,
    "AssertionError": AssertionError,
    "AttributeError": AttributeError,
    "Exception": Exception,
    "IndexError": IndexError,
    "KeyError": KeyError,
    "LookupError": LookupError,
    "NameError": NameError,
    "RuntimeError": RuntimeError,
    "TypeError": TypeError,
    "ValueError": ValueError,
    "abs": abs,
    "all": all,
    "any": any,
    "bool": bool,
    "dict": dict,
    "enumerate": enumerate,
    "float": float,
    "int": int,
    "len": len,
    "list": list,
    "max": max,
    "min": min,
    "range": range,
    "round": round,
    "set": set,
    "sorted": sorted,
    "str": str,
    "sum": sum,
    "tuple": tuple,
    "zip": zip,
}


def validate_source(source: str) -> ast.AST:
    """Reject obvious escape hatches before a model artifact is executed."""
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        raise ValueError(f"Invalid Python model artifact: {exc}") from exc

    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            raise ValueError("Python model artifact imports are not allowed")
        if isinstance(node, ast.Name) and node.id.startswith("__"):
            raise ValueError("Python model artifact dunder names are not allowed")
        if isinstance(node, ast.Attribute) and node.attr.startswith("__"):
            raise ValueError("Python model artifact dunder attributes are not allowed")

    return tree
