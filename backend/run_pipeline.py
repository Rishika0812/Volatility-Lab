from app.pipeline import run  # noqa
import sys
from pathlib import Path
from app import outputs
src = Path(sys.argv[1]) if len(sys.argv) > 1 else (outputs.UPLOAD_PATH if outputs.UPLOAD_PATH.exists() else outputs.DEFAULT_CSV)
print("Using", src)
run(src)
