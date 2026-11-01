"""Run the full research pipeline: CSV -> clean -> models -> persisted outputs."""
from __future__ import annotations
import sys
from pathlib import Path
from . import engine, outputs


def run(source, progress=lambda m: print(m, flush=True)):
    raw = engine.read_raw(source)
    results, frames = engine.run_all(raw, progress)
    progress("Writing outputs (JSON, CSV, Excel, report)")
    outputs.persist(results, frames)
    progress("Done")
    return results


if __name__ == "__main__":
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else (outputs.UPLOAD_PATH if outputs.UPLOAD_PATH.exists() else outputs.DEFAULT_CSV)
    print("Using", src)
    run(src)
