from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from datetime import datetime
import os
from pathlib import Path

# Ensure data directory exists
DATA_DIR = Path(__file__).parent.parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

DATABASE_URL = f"sqlite+aiosqlite:///{DATA_DIR}/app.db"

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

Base = declarative_base()


class PromptsFile(Base):
    __tablename__ = "prompts_files"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    sha256 = Column(String, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    path = Column(String, nullable=False)
    status = Column(String, default='pending')  # pending, processing, completed

    jobs = relationship("Job", back_populates="prompts_file")


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    status = Column(
        String,
        CheckConstraint("status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')"),
        default='queued'
    )
    started_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)
    prompts_file_id = Column(Integer, ForeignKey("prompts_files.id"))
    base_prompt_snapshot = Column(Text)
    config_snapshot = Column(Text)

    # ZIP metadata
    zip_path = Column(String, nullable=True)
    zip_size_bytes = Column(Integer, nullable=True)
    zip_sha256 = Column(String, nullable=True)
    zip_built_at = Column(DateTime, nullable=True)

    prompts_file = relationship("PromptsFile", back_populates="jobs")
    images = relationship("Image", back_populates="job", cascade="all, delete-orphan")


class Image(Base):
    __tablename__ = "images"
    __table_args__ = (
        {"sqlite_autoincrement": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), index=True)
    path = Column(String, nullable=False)
    prompt_text = Column(Text)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    job = relationship("Job", back_populates="images")


class AppConfig(Base):
    __tablename__ = "app_config"

    key = Column(String, primary_key=True, unique=True)
    value = Column(Text)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


async def init_db():
    """Initialize database and create tables"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # Insert default config values if they don't exist
        async with AsyncSessionLocal() as session:
            from sqlalchemy import select

            # Check if base_prompt exists
            result = await session.execute(
                select(AppConfig).where(AppConfig.key == "base_prompt")
            )
            if not result.scalar_one_or_none():
                default_base_prompt = (
                    "flat vector or doodle style with clean lines no shading or photorealism, "
                    "transparent background PNG-ready for cutting, "
                    "isolated composition not touching edges centered within canvas, "
                    "bold outlines for clear cut lines, "
                    "high contrast color palette 2-4 tones, "
                    "cute expressive or aesthetic shape that looks great as a sticker, "
                    "no drop shadows no textures outside the design"
                )
                session.add(AppConfig(key="base_prompt", value=default_base_prompt))

            # Check if api_key exists (empty by default)
            result = await session.execute(
                select(AppConfig).where(AppConfig.key == "api_key")
            )
            if not result.scalar_one_or_none():
                session.add(AppConfig(key="api_key", value=""))

            await session.commit()


async def get_db():
    """Dependency to get database session"""
    async with AsyncSessionLocal() as session:
        yield session
