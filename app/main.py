"""UltraVid Modular Orchestrator."""
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import APP_TITLE, APP_VERSION, STATIC_DIR
from app.routers import health, feed, search, stream, details, download
from app.services.innertube import aclose, sclose


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    try:
        await aclose()
        sclose()
    except Exception:
        pass


app = FastAPI(
    title=APP_TITLE,
    version=APP_VERSION,
    docs_url="/docs",
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def cache_headers_middleware(request, call_next):
    resp = await call_next(request)
    p = request.url.path
    if p in ("/", "/index.html", "/app.js") or p.startswith("/api/feed"):
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
    elif p.startswith("/api/search"):
        resp.headers["Cache-Control"] = "public, max-age=60"
    return resp


# Register Modular Routers
app.include_router(health.router)
app.include_router(feed.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(stream.router, prefix="/api")
app.include_router(details.router, prefix="/api")
app.include_router(download.router, prefix="/api")

# Mount Static Web Assets
if os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
