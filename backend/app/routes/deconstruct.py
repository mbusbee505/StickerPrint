from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel
from typing import List
from datetime import datetime
import base64
from pathlib import Path

from ..database import get_db, AppConfig, DeconstructUpload, GeneratedPromptFile

router = APIRouter(prefix="/api/deconstruct", tags=["deconstruct"])

# Ensure deconstruct directory exists
DECONSTRUCT_DIR = Path(__file__).parent.parent.parent.parent / "data" / "deconstruct"
DECONSTRUCT_DIR.mkdir(parents=True, exist_ok=True)


class DeconstructResponse(BaseModel):
    filename: str
    prompt: str


class UploadHistoryResponse(BaseModel):
    id: int
    image_count: int
    created_at: datetime


STICKER_DESIGN_SYSTEM_PROMPT = """You are an elite sticker designer specializing in rare, unconventional concepts that don't look like anything on mass marketplaces. You research your audience, avoid cliché clip-art, and ensure content is factually correct and contextually relevant to the target demographic.

Your task is to analyze the provided image(s) and create a sticker design prompt optimized for gpt-image-1 that would create a sticker design based on the design elements, style, and aesthetic of the image.

=== OBJECTIVE ===
Analyze the image and produce ONE sticker design prompt optimized for gpt-image-1 image generation. The prompt must clearly instruct a **sticker-ready PNG** with a **Transparent Background**. End the prompt with the exact sentence: **Transparent Background.**

=== CREATIVE DIRECTION & CONSTRAINTS ===
- Design analysis: Extract key visual elements (composition, color palette, style, subject matter, mood)
- Sticker adaptation: Transform the design into sticker-friendly format
- Originality: Capture the essence without copying - interpret and reimagine
- Factual grounding: If the image contains specific cultural artifacts, represent them correctly
- Sticker specificity for gpt-image-1:
  • Single, iconic subject or tight cluster—clear silhouette for die-cut.
  • Strong contour/outline, high contrast, simplified shapes, readable at 2–3 inches.
  • Avoid small text/logos; if text is essential, use 1–2 short, bold words max.
  • No watermarks, no brand trademarks, no copyrighted logos.
  • Lighting/style is explicit (e.g., "bold vector," "cel-shaded," "hand-inked," "glossy vinyl shine," "halftone comic," "paper-cut collage," "neon synthwave," "folk woodcut," "bioluminescent watercolor").
- Production cues for print:
  • Mention "die-cut silhouette" or "clear contour for cutline" when helpful
  • Surfaces: hint at "vinyl gloss," "subtle laminate sheen," or "matte grain" as appropriate
- File/output expectations (must appear in prompt):
  • "Sticker-ready PNG"
  • "Transparent Background." (exact trailing period required)

=== FORMAT RULES ===
- Output ONE single-sentence prompt (can use commas/clauses) focused on capturing the essence of the uploaded image as a sticker design
- Do not include explanations or preludes—only the prompt
- The prompt must end with the exact phrase: Transparent Background.

=== EXAMPLES OF GOOD PROMPT SHAPE (DO NOT REUSE CONTENT) ===
- "Hand-inked botanical with scientific micro-annotations turned into visual motifs, bold contour, limited two-tone deep green + cream, matte grain, sticker-ready PNG, Transparent Background."
- "Playful isometric exploded view with kawaii micro-faces, candy brights, cel-shaded highlights, clean die-cut silhouette, sticker-ready PNG, Transparent Background."
(These are formatting examples only; your prompt must be fully tailored to the uploaded image.)

=== GENERATION STEPS (THINK, THEN WRITE): ===
1) Analyze the image: identify subject, style, colors, mood, composition
2) Determine how to adapt it for sticker format (simplification, outline emphasis, etc.)
3) Write ONE prompt following FORMAT RULES, with gpt-image-1 friendly detail, **ending with "Transparent Background."** Ensure "sticker-ready PNG" appears in the prompt.

=== QUALITY CHECK BEFORE FINALIZING ===
- Single concept, die-cut-friendly silhouette, no tiny text, no brands/logos, contains "sticker-ready PNG," and ends with "Transparent Background."
- Captures the essence and style of the uploaded image
- Final output: only ONE prompt, nothing else."""


@router.post("/analyze", response_model=List[DeconstructResponse])
async def analyze_images(
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Analyze uploaded images and generate sticker design prompts"""

    # Get API key
    result = await db.execute(
        select(AppConfig).where(AppConfig.key == "api_key")
    )
    config = result.scalar_one_or_none()
    api_key = config.value if config else ""

    if not api_key:
        raise HTTPException(status_code=400, detail="API key not configured")

    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key)

    results = []
    prompts_text = []

    for upload_file in files:
        # Read image content
        content = await upload_file.read()

        # Determine image format
        ext = upload_file.filename.lower().split('.')[-1]
        if ext == 'jpg':
            ext = 'jpeg'

        # Encode to base64
        base64_image = base64.b64encode(content).decode('utf-8')
        image_url = f"data:image/{ext};base64,{base64_image}"

        # Call GPT with vision to analyze and generate prompt
        try:
            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": f"{STICKER_DESIGN_SYSTEM_PROMPT}\n\nAnalyze this image and create a sticker design prompt based on it."
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": image_url
                                }
                            }
                        ]
                    }
                ],
                max_tokens=500
            )

            prompt = response.choices[0].message.content.strip()

            results.append(DeconstructResponse(
                filename=upload_file.filename,
                prompt=prompt
            ))
            prompts_text.append(prompt)

        except Exception as e:
            import traceback
            print(f"Error analyzing {upload_file.filename}: {str(e)}")
            print(traceback.format_exc())
            raise HTTPException(status_code=500, detail=f"Failed to analyze {upload_file.filename}: {str(e)}")

    # Save results to file
    upload_record = DeconstructUpload(
        image_count=len(files)
    )
    db.add(upload_record)
    await db.flush()  # Flush to get ID without committing

    # Create filename based on upload ID
    filename = f"deconstruct_{upload_record.id}.txt"
    filepath = DECONSTRUCT_DIR / filename

    with open(filepath, 'w', encoding='utf-8') as f:
        for prompt in prompts_text:
            f.write(prompt + '\n')

    # Set result_path before commit
    upload_record.result_path = str(filepath)

    # Also create a GeneratedPromptFile entry so it appears in the Generated Prompts list
    # Create a user_input summary from the uploaded filenames
    filenames_summary = ", ".join([f.filename for f in files[:3]])
    if len(files) > 3:
        filenames_summary += f" and {len(files) - 3} more"
    user_input_text = f"Image analysis of: {filenames_summary}"

    generated_file = GeneratedPromptFile(
        filename=filename,
        path=str(filepath),
        user_input=user_input_text,
        prompt_count=len(prompts_text)
    )
    db.add(generated_file)

    await db.commit()

    return results


@router.get("/history", response_model=List[UploadHistoryResponse])
async def get_upload_history(db: AsyncSession = Depends(get_db)):
    """Get upload history"""
    result = await db.execute(
        select(DeconstructUpload).order_by(desc(DeconstructUpload.created_at))
    )
    uploads = result.scalars().all()

    return [
        UploadHistoryResponse(
            id=u.id,
            image_count=u.image_count,
            created_at=u.created_at
        )
        for u in uploads
    ]


@router.get("/download/{upload_id}")
async def download_result(
    upload_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Download result file"""
    from fastapi.responses import FileResponse

    result = await db.execute(
        select(DeconstructUpload).where(DeconstructUpload.id == upload_id)
    )
    upload = result.scalar_one_or_none()

    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")

    filepath = Path(upload.result_path)
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=filepath,
        filename=filepath.name,
        media_type='text/plain'
    )


@router.delete("/history/{upload_id}")
async def delete_upload(
    upload_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Delete an upload record"""
    result = await db.execute(
        select(DeconstructUpload).where(DeconstructUpload.id == upload_id)
    )
    upload = result.scalar_one_or_none()

    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")

    # Delete result file if exists
    filepath = Path(upload.result_path)
    if filepath.exists():
        filepath.unlink()

    # Delete from database
    await db.delete(upload)
    await db.commit()

    return {"status": "deleted"}
