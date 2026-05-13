"""
Local replacement for ``transforms.api`` (Foundry).

The V2 modules in ``DataTransformationRepository/v2_bronze/`` and
``v2_parity/`` are decorated with ``@transform`` and reference ``Input`` /
``Output`` wrappers. In Foundry, that machinery is provided by the platform.

Locally we only ever call each module's bare ``_transform(df)`` function from
the runner scripts, so this stub doesn't need to do much:

* ``Input(rid)``     — remembers its rid; ``.dataframe()`` is a no-op (the
                       runners pass real DataFrames directly).
* ``Output(rid)``    — remembers its rid; ``.write_dataframe(df)`` writes
                       parquet to the local path registered in
                       ``Practice_Run/config.py``.
* ``@transform(...)``— identity decorator; preserves the function so it can
                       be inspected/called in tests.

Nothing here imports pyspark — keeping this module light means importing the
V2 modules never accidentally pulls Spark in twice.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Callable


class Input:
    """Minimal Input shim. Only stores the rid for inspection.

    The runners call ``module._transform(df)`` directly with a Spark
    DataFrame they've already loaded, so ``dataframe()`` here is only a
    placeholder for the rare path where the decorated ``compute`` function
    is invoked directly.
    """

    def __init__(self, rid: str):
        self.rid: str = rid
        self._df: Any = None

    def bind(self, df: Any) -> "Input":
        """Attach a pre-loaded DataFrame so ``dataframe()`` returns it."""
        self._df = df
        return self

    def dataframe(self) -> Any:
        if self._df is None:
            raise RuntimeError(
                f"Input({self.rid!r}).dataframe() called but nothing was "
                f"bound. Load the CSV and pass it to the module's "
                f"_transform() directly, or call .bind(df) first."
            )
        return self._df


class Output:
    """Minimal Output shim. ``write_dataframe`` writes parquet locally."""

    def __init__(self, rid: str):
        self.rid: str = rid
        self._sink: Path | None = None

    def bind(self, sink_path: Path) -> "Output":
        """Set the local filesystem destination for write_dataframe()."""
        self._sink = Path(sink_path)
        return self

    def write_dataframe(self, df: Any) -> None:
        if self._sink is None:
            raise RuntimeError(
                f"Output({self.rid!r}).write_dataframe() called but no "
                f"sink path was bound. Call .bind(path) first."
            )
        self._sink.parent.mkdir(parents=True, exist_ok=True)
        # ``df`` is a pyspark.sql.DataFrame; write parquet in overwrite mode.
        df.write.mode("overwrite").parquet(str(self._sink))


def transform(*_args: Any, **_kwargs: Any) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Identity decorator. Returns the function unchanged.

    In Foundry the decorator wires up inputs/outputs and registers the
    transform with the runtime. Locally we don't need any of that — the
    runners call ``_transform`` directly.
    """
    def _decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        return fn
    return _decorator
