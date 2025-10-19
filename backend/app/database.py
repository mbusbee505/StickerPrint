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


class GeneratedPromptFile(Base):
    __tablename__ = "generated_prompt_files"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    path = Column(String, nullable=False)
    user_input = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    prompt_count = Column(Integer, default=100)


class PromptQueue(Base):
    __tablename__ = "prompt_queue"

    id = Column(Integer, primary_key=True, index=True)
    generated_file_id = Column(Integer, ForeignKey("generated_prompt_files.id"), nullable=False)
    status = Column(String, default='pending')  # pending, processing, completed
    queued_at = Column(DateTime, default=datetime.utcnow, index=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    prompts_file_id = Column(Integer, ForeignKey("prompts_files.id"), nullable=True)  # Link to created PromptsFile

    generated_file = relationship("GeneratedPromptFile")


class ResearchSession(Base):
    __tablename__ = "research_sessions"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    status = Column(String, default='active')  # active, completed, failed
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    completed_at = Column(DateTime, nullable=True)
    result_path = Column(String, nullable=True)

    messages = relationship("ResearchMessage", back_populates="session", cascade="all, delete-orphan", order_by="ResearchMessage.created_at")


class ResearchMessage(Base):
    __tablename__ = "research_messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("research_sessions.id"), index=True)
    role = Column(String, nullable=False)  # user, assistant, system
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    session = relationship("ResearchSession", back_populates="messages")


class DeconstructUpload(Base):
    __tablename__ = "deconstruct_uploads"

    id = Column(Integer, primary_key=True, index=True)
    image_count = Column(Integer, nullable=False)
    result_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


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

            # Check if prompt_designer_template exists
            result = await session.execute(
                select(AppConfig).where(AppConfig.key == "prompt_designer_template")
            )
            if not result.scalar_one_or_none():
                default_template = """You are an elite sticker designer specializing in rare, unconventional concepts that don't look like anything on mass marketplaces. You research your audience, avoid cliché clip-art, and ensure content is factually correct and contextually relevant to the target demographic.

=== INPUT (Demographic Research) ===
{USER_INPUT}

=== OBJECTIVE ===
From the demographic research above, produce a list of exactly 100 distinct sticker design prompts tailored to that audience. Each prompt must be optimized for gpt-image-1 image generation and must clearly instruct a **sticker-ready PNG** with a **Transparent Background**. End EVERY prompt with the exact sentence: **Transparent Background.**

=== CREATIVE DIRECTION & CONSTRAINTS ===
- Audience-first: Extract 4–6 key themes (age, subcultures, hobbies, aesthetics, locales, values, inside jokes). Use them to drive concept choices.
- Originality mandate: No generic marketplace tropes. No stocky symbols unless subverted with fresh visual metaphors.
- Factual grounding: If the research names real places, fauna, foods, or cultural artifacts, portray them correctly. No invented facts.
- Sticker specificity for gpt-image-1:
  • Single, iconic subject or tight cluster—clear silhouette for die-cut.
  • Strong contour/outline, high contrast, simplified shapes, readable at 2–3 inches.
  • Avoid small text/logos; if text is essential for the audience, use 1–2 short, bold words max.
  • No watermarks, no brand trademarks, no copyrighted logos.
  • Lighting/style is explicit (e.g., "bold vector," "cel-shaded," "hand-inked," "glossy vinyl shine," "halftone comic," "paper-cut collage," "neon synthwave," "folk woodcut," "bioluminescent watercolor").
- Variety requirements across the 100:
  • Cover at least 6 different style families (e.g., vector flat, inky linework, painterly watercolor, retro halftone, low-poly, paper-cut, cyberpunk glow, kawaii chibi, minimal geometric, botanical scientific).
  • Vary mood across witty, wholesome, darkly whimsical, scientific, aspirational, nostalgic, eco-forward, techy.
  • Include a spread of color strategies: limited two-tone, duotone neon, muted earth, monochrome line art, candy brights.
  • Include 3–4 regionally/culturally grounded designs **only if** present in the research—handle respectfully and accurately.
- Production cues for print:
  • Mention "die-cut silhouette" or "clear contour for cutline" when helpful, but do NOT draw a printed white border unless specified by the audience taste.
  • Surfaces: hint at "vinyl gloss," "subtle laminate sheen," or "matte grain" as appropriate.
- File/output expectations (must appear in each prompt):
  • "Sticker-ready PNG"
  • "Transparent Background." (exact trailing period required)

=== FORMAT RULES ===
- Output as a numbered list 1–100.
- Each item is ONE single-sentence prompt (can use commas/clauses) focused on a single design concept.
- Do not include explanations, preludes, or bullet points—only the 100 prompts.
- Each prompt must end with the exact phrase: Transparent Background.

=== EXAMPLES OF GOOD PROMPT SHAPE (DO NOT REUSE CONTENT) ===
- "Hand-inked botanical of {regional plant} with scientific micro-annotations turned into visual motifs, bold contour, limited two-tone deep green + cream, matte grain, sticker-ready PNG, Transparent Background."
- "Playful isometric {audience hobby object} exploded into labeled modules with kawaii micro-faces, candy brights, cel-shaded highlights, clean die-cut silhouette, sticker-ready PNG, Transparent Background."
(These are formatting examples only; your 100 must be fully tailored to the research.)

=== GENERATION STEPS (THINK, THEN WRITE): ===
1) Parse the research; list 4–6 core audience themes (do this silently, no output).
2) Map each theme to 3–5 visual metaphors; pick the 100 strongest, ensuring style and color diversity (do this silently).
3) Write the 100 prompts following FORMAT RULES, with gpt-image-1 friendly detail, **each ending with "Transparent Background."** Ensure "sticker-ready PNG" appears in each prompt.

=== QUALITY CHECK BEFORE FINALIZING ===
- Every prompt: single concept, die-cut-friendly silhouette, no tiny text, no brands/logos, contains "sticker-ready PNG," and ends with "Transparent Background."
- No duplicates in theme or composition; each is audience-relevant and factually correct.
- Final output: only the 100 numbered prompts."""
                session.add(AppConfig(key="prompt_designer_template", value=default_template))

            await session.commit()


async def get_db():
    """Dependency to get database session"""
    async with AsyncSessionLocal() as session:
        yield session
