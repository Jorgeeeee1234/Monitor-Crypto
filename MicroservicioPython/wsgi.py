from __future__ import annotations
import os
from app import app

if __name__ == "__main__":
    import uvicorn
    port_str = os.getenv("PORT", "5002")
    try:
        port = int(port_str)
    except ValueError:
        port = 5002
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)