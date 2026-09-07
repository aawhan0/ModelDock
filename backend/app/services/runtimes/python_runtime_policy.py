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

UNSAFE_BUILTINS = {
    "open",
    "eval",
    "exec",
    "compile",
    "__import__",
    "input",
    "breakpoint",
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
        if isinstance(node, ast.Name) and node.id in UNSAFE_BUILTINS:
            raise ValueError(f"Python model artifact uses unsafe builtin: {node.id}")

    allowed_top_level = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Expr)
    for node in tree.body:
        if not isinstance(node, allowed_top_level):
            raise ValueError(
                "Python model artifact may only contain function definitions"
            )
        if isinstance(node, ast.Expr):
            if not (
                isinstance(node.value, ast.Constant)
                and isinstance(node.value.value, str)
            ):
                raise ValueError(
                    "Python model artifact may only contain a module docstring at top level"
                )

    model_functions = [
        node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name == "model"
    ]
    if len(model_functions) != 1:
        raise ValueError(
            "Python model artifact must define exactly one function named 'model'"
        )

    return tree
