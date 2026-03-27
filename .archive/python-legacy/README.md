# Python implementation (archived)

This directory holds the **original Python** SVG-to–SF Symbol pipeline (package under `src/`, `pytest` under `tests/`, plus `pyproject.toml` and `requirements.txt`).

It is **reference only**. The maintained stack lives at the repository root:

- **`web/`** — Vite browser UI  
- **`server/`** — Fastify HTTP API and Node.js conversion pipeline  

To experiment with this code locally (unsupported):

```bash
cd .archive/python-legacy
pip install -e ".[web]"
```

Run `pytest` from this directory if dependencies are installed; it is not part of the default project workflow.
