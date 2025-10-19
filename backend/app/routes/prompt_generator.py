from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel
from datetime import datetime
from pathlib import Path
import re
from openai import AsyncOpenAI
from typing import Optional

from ..database import get_db, AppConfig, GeneratedPromptFile

router = APIRouter(prefix="/api/prompt-generator", tags=["prompt-generator"])

# Ensure generated prompts directory exists
GENERATED_PROMPTS_DIR = Path(__file__).parent.parent.parent.parent / "data" / "generated_prompts"
GENERATED_PROMPTS_DIR.mkdir(parents=True, exist_ok=True)


class GeneratePromptsRequest(BaseModel):
    user_input: str


class GeneratedPromptFileResponse(BaseModel):
    id: int
    filename: str
    user_input: str
    created_at: datetime
    prompt_count: int
    download_url: str


@router.post("/generate")
async def generate_prompts(
    request: GeneratePromptsRequest,
    db: AsyncSession = Depends(get_db)
):
    """Generate 100 sticker prompts using GPT-5 Thinking Extended"""

    # Get API key and template from config
    result = await db.execute(
        select(AppConfig).where(AppConfig.key.in_(['api_key', 'prompt_designer_template']))
    )
    config_items = result.scalars().all()
    config = {item.key: item.value for item in config_items}

    api_key = config.get('api_key', '')
    template = config.get('prompt_designer_template', '')

    if not api_key:
        raise HTTPException(status_code=400, detail="API key not configured")

    if not template:
        raise HTTPException(status_code=400, detail="Prompt designer template not configured")

    # Replace {USER_INPUT} in template
    prompt = template.replace('{USER_INPUT}', request.user_input)

    try:
        # Step 1: Generate a descriptive filename using GPT-4o
        client = AsyncOpenAI(api_key=api_key)

        filename_prompt = f"""Based on this demographic research, create a short, descriptive filename of 1-4 words that captures the target audience or theme. Use only lowercase letters, numbers, and underscores. No file extension.

Research: {request.user_input[:500]}

Examples:
- "college_gamers"
- "eco_moms"
- "tech_startups"
- "anime_fans"

Filename:"""

        filename_response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "user", "content": filename_prompt}
            ],
            max_tokens=20
        )

        filename_base = filename_response.choices[0].message.content.strip()
        # Clean the filename to ensure it's safe
        filename_base = re.sub(r'[^a-z0-9_]', '', filename_base.lower())
        if not filename_base or len(filename_base) < 2:
            # Fallback to sanitized user input
            sanitized_input = re.sub(r'[^a-zA-Z0-9\s]', '', request.user_input)
            words = sanitized_input.split()[:3]
            filename_base = '_'.join(words).lower()

        filename = f"{filename_base}.txt"

        # Step 2: Generate the 100 prompts using o3-mini
        response = await client.chat.completions.create(
            model="o3-mini",
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        generated_text = response.choices[0].message.content

        # Parse the numbered prompts (1-100)
        lines = generated_text.strip().split('\n')
        prompts = []

        for line in lines:
            # Match lines that start with numbers (e.g., "1.", "1)", "1 -", etc.)
            match = re.match(r'^\s*\d+[\.\)\-\s]+(.+)', line)
            if match:
                prompt_text = match.group(1).strip()
                if prompt_text:
                    prompts.append(prompt_text)

        if len(prompts) < 50:
            raise HTTPException(
                status_code=500,
                detail=f"Generated only {len(prompts)} prompts, expected around 100"
            )

        # Write prompts to file
        filepath = GENERATED_PROMPTS_DIR / filename
        with open(filepath, 'w') as f:
            for prompt_text in prompts:
                f.write(prompt_text + '\n')

        # Save to database
        generated_file = GeneratedPromptFile(
            filename=filename,
            path=str(filepath),
            user_input=request.user_input,
            prompt_count=len(prompts)
        )
        db.add(generated_file)
        await db.commit()
        await db.refresh(generated_file)

        return {
            "id": generated_file.id,
            "filename": filename,
            "prompt_count": len(prompts),
            "download_url": f"/api/prompt-generator/download/{generated_file.id}"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate prompts: {str(e)}")


@router.get("/list")
async def list_generated_files(db: AsyncSession = Depends(get_db)):
    """List all generated prompt files"""
    result = await db.execute(
        select(GeneratedPromptFile).order_by(desc(GeneratedPromptFile.created_at))
    )
    files = result.scalars().all()

    return [
        GeneratedPromptFileResponse(
            id=f.id,
            filename=f.filename,
            user_input=f.user_input,
            created_at=f.created_at,
            prompt_count=f.prompt_count,
            download_url=f"/api/prompt-generator/download/{f.id}"
        )
        for f in files
    ]


@router.get("/download/{file_id}")
async def download_generated_file(
    file_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Download a generated prompt file"""
    from fastapi.responses import FileResponse

    result = await db.execute(
        select(GeneratedPromptFile).where(GeneratedPromptFile.id == file_id)
    )
    file_record = result.scalar_one_or_none()

    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    filepath = Path(file_record.path)
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=filepath,
        filename=file_record.filename,
        media_type='text/plain'
    )
