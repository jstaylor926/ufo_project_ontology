"""Local runner scripts for each V2 transform.

Each ``run_*.py`` module:
  1. Adds the repo paths to ``sys.path`` (so ``transforms.api`` resolves to
     the local stub and ``v2_bronze`` / ``v2_parity`` resolve to the real
     V2 modules in ``DataTransformationRepository/``).
  2. Builds a UTC-session SparkSession.
  3. Reads the input CSV(s) as an all-string DataFrame (matching the Bronze
     contract).
  4. Calls the module's ``_transform`` directly and writes parquet to the
     path registered in ``Practice_Run/config.py``.
"""
