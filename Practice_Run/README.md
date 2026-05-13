# Practice_Run — Local execution of the UFO V2 transforms

This folder lets you run every V2 PySpark transform in
`DataTransformationRepository/v2_bronze/` and `v2_parity/` **on your laptop**,
using the CSV snapshots already in `../Data/`.

The V2 code itself is untouched — these scripts only add a thin local
scaffolding around it:

- a **stub for Foundry's `transforms.api`** (so `@transform`, `Input`,
  `Output` resolve to no-op locals),
- a **central path config** mapping logical dataset names → local CSV paths,
- one **runner script per transform** that loads the input CSV as
  all-strings (matching the Bronze contract), calls the module's bare
  `_transform()` function, and writes parquet to `Practice_Run/output/`.

---

## 1. Folder layout

```
Practice_Run/
├── README.md                              <- you are here
├── requirements.txt                       <- pip install -r requirements.txt
├── config.py                              <- logical name -> local path map
├── run_all.py                             <- run every stage in order
├── transforms/                            <- LOCAL stub of Foundry's namespace
│   ├── __init__.py
│   └── api.py                             <-   @transform / Input / Output
├── runners/
│   ├── _common.py                         <- SparkSession + CSV-as-strings helpers
│   ├── run_bronze_techrequest_index.py
│   ├── run_bronze_dossier_metadata.py
│   ├── run_bronze_messages_metadata.py
│   ├── run_bronze_manufacturing_quality_reference.py
│   ├── run_bronze_linked_dossier.py
│   └── run_parity_ufo_entry.py
└── output/                                <- parquet output (gitignored content)
```

The runners deliberately live next to (not inside) `DataTransformationRepository/`.
The V2 source modules import each other relatively (`from ._bronze_utils import ...`)
and the runners just add the right paths to `sys.path` and import them
normally.

---

## 2. Prerequisites

- **Python 3.10 or 3.11** (`python --version`).
- **Java 11 or Java 17** on `PATH` — required by PySpark. Verify with
  `java -version`. On macOS: `brew install openjdk@17`. On Windows: install
  Temurin 17 from <https://adoptium.net/> and set `JAVA_HOME`.

---

## 3. One-time setup

From the **repo root** (`ufo_project_ontology/`):

```bash
# 1. Create and activate a virtual env (recommended)
python -m venv .venv
# macOS / Linux
source .venv/bin/activate
# Windows (PowerShell)
.venv\Scripts\Activate.ps1

# 2. Install dependencies
pip install -r Practice_Run/requirements.txt
```

That's it — no further configuration is needed if your CSVs are in the
default `Data/` folder. If they aren't, edit `Practice_Run/config.py`
(`DATASETS` dict).

---

## 4. Running the transforms

### Run everything at once

```bash
python Practice_Run/run_all.py
```

This runs the five Bronze transforms then the parity harness. Each stage
prints a row count and the output path.

### Run a single transform

```bash
python Practice_Run/runners/run_bronze_techrequest_index.py
python Practice_Run/runners/run_bronze_dossier_metadata.py
python Practice_Run/runners/run_bronze_messages_metadata.py
python Practice_Run/runners/run_bronze_manufacturing_quality_reference.py
python Practice_Run/runners/run_bronze_linked_dossier.py
python Practice_Run/runners/run_parity_ufo_entry.py
```

### Run a subset via `run_all.py`

```bash
python Practice_Run/run_all.py --skip-parity
python Practice_Run/run_all.py --only bronze.linked_dossier bronze.messages_metadata
```

### Inspect parquet output

```bash
python - <<'PY'
from pyspark.sql import SparkSession
spark = SparkSession.builder.master("local[*]").getOrCreate()
df = spark.read.parquet("Practice_Run/output/bronze_techrequest_index")
df.printSchema()
df.show(5, truncate=False)
PY
```

---

## 5. Dataset map

Every logical dataset name used by the V2 code is mapped to a local CSV in
`Practice_Run/config.py`. The defaults match what is in `../Data/`:

| Logical name (matches `_bronze_utils.RIDS` keys)    | Local file (in `Data/`)                  |
|-----------------------------------------------------|------------------------------------------|
| `raw.techrequest_index`                             | `techrequest_index_metadata_v2.csv`      |
| `raw.dossier_metadata`                              | `tr_dossier_metadata_filtered.csv`       |
| `raw.messages_metadata`                             | `tr_messages_metadata.csv`               |
| `raw.manufacturing_quality_reference`               | `tr_manufacturing_quality_reference.csv` |
| `raw.linked_dossier`                                | `tr_linked_dossier.csv`                  |
| `v1.ufo_entry` (parity harness V1 side)             | `tr_v1.csv`                              |

Bronze and parity outputs land under `Practice_Run/output/` as parquet
folders:

| Logical name                                | Output path                                            |
|---------------------------------------------|--------------------------------------------------------|
| `bronze.techrequest_index`                  | `output/bronze_techrequest_index/`                     |
| `bronze.dossier_metadata`                   | `output/bronze_dossier_metadata/`                      |
| `bronze.messages_metadata`                  | `output/bronze_messages_metadata/`                     |
| `bronze.manufacturing_quality_reference`    | `output/bronze_manufacturing_quality_reference/`       |
| `bronze.linked_dossier`                     | `output/bronze_linked_dossier/`                        |
| `parity.ufo_entry_diff`                     | `output/parity_ufo_entry_diff/`                        |
| `parity.ufo_entry_summary`                  | `output/parity_ufo_entry_summary/`                     |

### Adding a new dataset

1. Drop the CSV into `Data/` (or anywhere you like).
2. Add a `"logical.name": Path(...)` entry to `DATASETS` in
   `Practice_Run/config.py`.
3. If it's a new Bronze input, add the same key to
   `DataTransformationRepository/v2_bronze/_bronze_utils.py::RIDS` so the
   Foundry side and local side stay in lockstep.

### Importing the datasets in your own scripts

`config.dataset_path(name)` is the single source of truth — use it instead
of hard-coding paths:

```python
import sys, pathlib
sys.path.insert(0, str(pathlib.Path("Practice_Run").resolve()))

from config import dataset_path
from runners._common import bootstrap_paths, get_local_spark, read_csv_as_strings

bootstrap_paths()
spark = get_local_spark("ad-hoc")

df = read_csv_as_strings(
    spark,
    dataset_path("raw.techrequest_index"),
    column_names=[...],  # or pull from the v2_bronze module's lists
)
df.show(5, truncate=False)
```

---

## 6. How the runners replace Foundry

The V2 modules import:

```python
from transforms.api import Input, Output, transform
```

When run inside Foundry, that resolves to the platform's `transforms`
package. Locally we shadow it with `Practice_Run/transforms/`, which
provides:

- `Input(rid)` — stores its rid and exposes `.dataframe()` / `.bind(df)`.
- `Output(rid)` — stores its rid and writes parquet via `.write_dataframe()`
  to whatever path `.bind(path)` set.
- `transform(...)` — an identity decorator. The runners never call the
  decorated `compute()` functions; they call each module's bare
  `_transform(df)` function directly.

`bootstrap_paths()` (in `runners/_common.py`) prepends
`Practice_Run/` to `sys.path` **before** `DataTransformationRepository/`,
which guarantees the stub wins.

---

## 7. Troubleshooting

- **`ModuleNotFoundError: No module named 'transforms'`** — you ran a runner
  without going through `bootstrap_paths()`. Always invoke the runner
  scripts in this folder; don't execute the `v2_bronze` modules directly.
- **`Java gateway process exited`** — Java isn't installed or `JAVA_HOME`
  isn't set. See section 2.
- **`FileNotFoundError` for a CSV** — either the file isn't in `Data/` or
  the path in `config.py::DATASETS` doesn't match. Update one or the other.
- **Parity harness says `Path does not exist`** — run
  `run_bronze_techrequest_index.py` first; the parity step reads its parquet.
- **Different row counts vs. Foundry** — the parity harness defaults to the
  same `00`-bucket hash sample Foundry uses (~0.4%). Call
  `run_parity_ufo_entry.main(sample=False)` to compare full populations.
