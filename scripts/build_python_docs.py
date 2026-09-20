#!/usr/bin/env python3
"""NuClear Documentation Builder — Python API & Master Portal.

Generates HTML documentation for the Python scientific worker into docs/api/python,
and generates the unified API portal at docs/api/index.html linking TypeScript and Python.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DOCS_API_DIR = REPO_ROOT / "docs" / "api"
PYTHON_DOCS_DIR = DOCS_API_DIR / "python"
TS_DOCS_DIR = DOCS_API_DIR / "ts"


def generate_portal_index() -> None:
    """Generates the unified HTML portal at docs/api/index.html."""
    DOCS_API_DIR.mkdir(parents=True, exist_ok=True)
    portal_html = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NuClear — Multi-Language API Documentation Portal</title>
  <style>
    :root {
      --bg: #0d1117;
      --card-bg: #161b22;
      --border: #30363d;
      --text: #c9d1d9;
      --heading: #58a6ff;
      --accent: #238636;
      --hover: #1f6feb;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 2rem;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .container {
      max-width: 800px;
      width: 100%;
    }
    header {
      text-align: center;
      margin-bottom: 2.5rem;
    }
    h1 {
      color: var(--heading);
      font-size: 2.2rem;
      margin-bottom: 0.5rem;
    }
    p.subtitle {
      font-size: 1.1rem;
      color: #8b949e;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: transform 0.15s ease, border-color 0.15s ease;
    }
    .card:hover {
      transform: translateY(-2px);
      border-color: var(--heading);
    }
    .card h2 {
      margin-top: 0;
      color: #f0f6fc;
      font-size: 1.3rem;
    }
    .badge {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.2rem 0.5rem;
      border-radius: 12px;
      margin-bottom: 0.8rem;
    }
    .badge-ts { background: #1f4277; color: #58a6ff; }
    .badge-py { background: #3b3318; color: #e3b341; }
    .btn {
      display: inline-block;
      text-align: center;
      background: var(--card-bg);
      border: 1px solid var(--border);
      color: var(--heading);
      text-decoration: none;
      font-weight: 600;
      padding: 0.6rem 1.2rem;
      border-radius: 6px;
      margin-top: 1rem;
      transition: background 0.15s ease;
    }
    .btn:hover {
      background: var(--hover);
      color: #fff;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>NuClear API Portal</h1>
      <p class="subtitle">Clinical-Grade Multimodal Medical Imaging Workstation Documentation</p>
    </header>
    <div class="grid">
      <div class="card">
        <div>
          <span class="badge badge-ts">TypeScript / TSDoc</span>
          <h2>Contracts & Engines API</h2>
          <p>Complete TypeDoc reference for <code>@nuclear/shared-types</code>, physical geometry, clinical view models, and figure layout contracts.</p>
        </div>
        <a class="btn" href="./ts/index.html">Open TypeScript Docs &rarr;</a>
      </div>
      <div class="card">
        <div>
          <span class="badge badge-py">Python / PEP 621</span>
          <h2>Scientific Worker API</h2>
          <p>DICOM parsing, physical coordinate validation in LPS mm, and quantitative SUVbw scaling daemon architecture.</p>
        </div>
        <a class="btn" href="./python/index.html">Open Python Docs &rarr;</a>
      </div>
    </div>
  </div>
</body>
</html>
"""
    (DOCS_API_DIR / "index.html").write_text(portal_html, encoding="utf-8")
    print(f"Generated master API portal at {DOCS_API_DIR / 'index.html'}")


def build_python_docs() -> None:
    """Builds Python documentation using pdoc if available, or generates clean fallback."""
    PYTHON_DOCS_DIR.mkdir(parents=True, exist_ok=True)

    # Check if pdoc is installed
    has_pdoc = False
    try:
        res = subprocess.run(
            [sys.executable, "-m", "pdoc", "--version"],
            capture_output=True,
            text=True,
            check=False,
        )
        has_pdoc = res.returncode == 0
    except Exception:
        has_pdoc = False

    if has_pdoc:
        print("Building Python docs via pdoc...")
        cmd = [
            sys.executable,
            "-m",
            "pdoc",
            "--output-directory",
            str(PYTHON_DOCS_DIR),
            str(REPO_ROOT / "python" / "dicom"),
            str(REPO_ROOT / "python" / "worker"),
        ]
        subprocess.run(cmd, check=True)
        print(f"Generated Python documentation via pdoc at {PYTHON_DOCS_DIR}")
    else:
        print("pdoc not detected in active python environment; generating structured specification page...")
        # Read package docstrings
        dicom_init = (REPO_ROOT / "python" / "dicom" / "__init__.py").read_text(encoding="utf-8")
        worker_init = (REPO_ROOT / "python" / "worker" / "__init__.py").read_text(encoding="utf-8")

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>NuClear — Python Scientific Worker Architecture</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0d1117; color: #c9d1d9; padding: 2rem; max-width: 800px; margin: 0 auto; }}
    h1, h2 {{ color: #58a6ff; }}
    pre {{ background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 1rem; overflow-x: auto; color: #79c0ff; }}
    a {{ color: #58a6ff; text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}
    .back {{ display: inline-block; margin-bottom: 1rem; color: #8b949e; }}
  </style>
</head>
<body>
  <a class="back" href="../index.html">&larr; Back to API Portal</a>
  <h1>NuClear Scientific Worker (Python)</h1>
  <p>Standard: <strong>PEP 621, Google-style docstrings, strict type hints</strong>.</p>
  
  <h2>python.dicom</h2>
  <pre>{dicom_init.strip()}</pre>

  <h2>python.worker</h2>
  <pre>{worker_init.strip()}</pre>

  <h2>Environment & Documentation Generation</h2>
  <p>The worker environment is provisioned in Phase 2 via <code>python/pyproject.toml</code>.</p>
  <p>To compile interactive live docstrings via pdoc:</p>
  <pre>pip install pdoc
python3 scripts/build_python_docs.py</pre>
</body>
</html>
"""
        (PYTHON_DOCS_DIR / "index.html").write_text(html, encoding="utf-8")
        print(f"Generated Python documentation portal at {PYTHON_DOCS_DIR / 'index.html'}")


def main() -> None:
    build_python_docs()
    generate_portal_index()


if __name__ == "__main__":
    main()
