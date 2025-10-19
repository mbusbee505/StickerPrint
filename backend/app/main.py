from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .database import init_db
from .routes import prompts, jobs, images, zips, config, events, prompt_generator, research, deconstruct


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup"""
    await init_db()
    yield


app = FastAPI(title="StickerPrint API", version="1.0.0", lifespan=lifespan)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(prompts.router)
app.include_router(jobs.router)
app.include_router(images.router)
app.include_router(zips.router)
app.include_router(config.router)
app.include_router(events.router)
app.include_router(prompt_generator.router)
app.include_router(research.router)
app.include_router(deconstruct.router)


@app.get("/")
async def root():
    return {"message": "StickerPrint API", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
