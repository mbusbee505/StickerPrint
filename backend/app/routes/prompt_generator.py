from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel
from datetime import datetime
from pathlib import Path
import re
import hashlib
import shutil
from openai import AsyncOpenAI
from typing import Optional

from ..database import get_db, AppConfig, GeneratedPromptFile, PromptsFile, PromptQueue

router = APIRouter(prefix="/api/prompt-generator", tags=["prompt-generator"])

# Ensure generated prompts directory exists
GENERATED_PROMPTS_DIR = Path(__file__).parent.parent.parent.parent / "data" / "generated_prompts"
GENERATED_PROMPTS_DIR.mkdir(parents=True, exist_ok=True)


async def _process_next_prompt_queue_item(db):
    """Helper function to process the next item in the prompt queue"""
    from ..routes.events import broadcast_event

    print("[PROMPT_QUEUE] Checking for items to process...")

    # Check if there's already a PromptsFile being processed
    existing_processing = await db.execute(
        select(PromptsFile).where(PromptsFile.status == 'processing').limit(1)
    )
    if existing_processing.first():
        print("[PROMPT_QUEUE] A PromptsFile is already being processed, skipping")
        return False

    # Get the next pending item from the queue
    result = await db.execute(
        select(PromptQueue)
        .where(PromptQueue.status == 'pending')
        .order_by(PromptQueue.queued_at.asc())
        .limit(1)
    )
    queue_item = result.scalar_one_or_none()

    if not queue_item:
        print("[PROMPT_QUEUE] No pending items in queue")
        return False

    print(f"[PROMPT_QUEUE] Processing queue item ID: {queue_item.id}")

    # Get the generated file
    gen_file_result = await db.execute(
        select(GeneratedPromptFile).where(GeneratedPromptFile.id == queue_item.generated_file_id)
    )
    generated_file = gen_file_result.scalar_one_or_none()

    if not generated_file:
        # Clean up orphaned queue item
        await db.delete(queue_item)
        await db.commit()
        await broadcast_event("prompt_queue_updated", {"action": "removed", "queue_id": queue_item.id})
        return False

    source_path = Path(generated_file.path)
    if not source_path.exists():
        # Clean up orphaned queue item
        await db.delete(queue_item)
        await db.commit()
        await broadcast_event("prompt_queue_updated", {"action": "removed", "queue_id": queue_item.id})
        return False

    # Read file content for hash calculation
    with open(source_path, 'rb') as f:
        content = f.read()

    sha256 = hashlib.sha256(content).hexdigest()

    # Copy file to prompts directory
    prompts_dir = Path(__file__).parent.parent.parent.parent / "data" / "prompts"
    prompts_dir.mkdir(parents=True, exist_ok=True)

    timestamp = int(datetime.utcnow().timestamp())
    dest_path = prompts_dir / f"{timestamp}_{generated_file.filename}"

    shutil.copy2(source_path, dest_path)

    # Create PromptsFile entry
    prompts_file = PromptsFile(
        filename=generated_file.filename,
        sha256=sha256,
        uploaded_at=datetime.utcnow(),
        path=str(dest_path),
        status='pending'
    )

    db.add(prompts_file)
    await db.commit()
    await db.refresh(prompts_file)

    # Update queue item
    queue_item.status = 'completed'
    queue_item.completed_at = datetime.utcnow()
    queue_item.prompts_file_id = prompts_file.id

    await db.commit()

    print(f"[PROMPT_QUEUE] Successfully processed queue item {queue_item.id} -> PromptsFile {prompts_file.id}")

    # Broadcast events
    await broadcast_event("prompt_queue_updated", {
        "action": "completed",
        "queue_id": queue_item.id,
        "prompts_file_id": prompts_file.id
    })
    await broadcast_event("prompts_file_added", {
        "prompts_file_id": prompts_file.id,
        "filename": prompts_file.filename
    })

    print(f"[PROMPT_QUEUE] Broadcasted events for queue completion")

    return True


class GeneratePromptsRequest(BaseModel):
    user_input: str
    prompt_count: int = 100


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

    # Replace {USER_INPUT} and {PROMPT_COUNT} in template
    prompt = template.replace('{USER_INPUT}', request.user_input)
    prompt = prompt.replace('{PROMPT_COUNT}', str(request.prompt_count))

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

        # Validate we got at least 50% of requested prompts
        min_expected = max(1, request.prompt_count // 2)
        if len(prompts) < min_expected:
            raise HTTPException(
                status_code=500,
                detail=f"Generated only {len(prompts)} prompts, expected around {request.prompt_count}"
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


@router.post("/queue/process-next")
async def process_next_in_queue(db: AsyncSession = Depends(get_db)):
    """Process the next pending item in the prompt queue by copying it to PromptsFile"""
    print("[PROMPT_QUEUE] Manual process-next endpoint called")

    result = await _process_next_prompt_queue_item(db)

    if result:
        return {
            "message": "Item processed and added to job queue",
            "processed": True
        }
    else:
        return {
            "message": "No items to process or already processing",
            "processed": False
        }


@router.post("/queue/{file_id}")
async def queue_generated_file(
    file_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Add a generated prompt file to the prompt queue"""
    print(f"[PROMPT_QUEUE] Queue endpoint called for file_id: {file_id}")

    # Get the generated file
    result = await db.execute(
        select(GeneratedPromptFile).where(GeneratedPromptFile.id == file_id)
    )
    generated_file = result.scalar_one_or_none()

    if not generated_file:
        print(f"[PROMPT_QUEUE] ERROR: Generated file {file_id} not found in database")
        raise HTTPException(status_code=404, detail="Generated file not found")

    source_path = Path(generated_file.path)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    # Check if this file is already in the prompt queue
    existing_result = await db.execute(
        select(PromptQueue).where(PromptQueue.generated_file_id == file_id)
    )
    existing_queue_item = existing_result.scalar_one_or_none()

    if existing_queue_item:
        return {
            "id": existing_queue_item.id,
            "filename": generated_file.filename,
            "message": "File already in prompt queue",
            "already_queued": True
        }

    # Add to prompt queue
    queue_item = PromptQueue(
        generated_file_id=file_id,
        status='pending'
    )

    db.add(queue_item)
    await db.commit()
    await db.refresh(queue_item)

    # Broadcast queue update event
    from ..routes.events import broadcast_event
    await broadcast_event("prompt_queue_updated", {
        "action": "added",
        "queue_id": queue_item.id,
        "filename": generated_file.filename
    })

    # Trigger auto-processing of the queue (import here to avoid circular import)
    try:
        print(f"[PROMPT_QUEUE] Item queued, triggering auto-process...")
        processed = await _process_next_prompt_queue_item(db)
        print(f"[PROMPT_QUEUE] Auto-process result: {processed}")
    except Exception as e:
        print(f"[PROMPT_QUEUE] Error auto-processing queue: {e}")
        import traceback
        traceback.print_exc()

    return {
        "id": queue_item.id,
        "filename": generated_file.filename,
        "queued_at": queue_item.queued_at.isoformat(),
        "already_queued": False
    }


@router.get("/queue")
async def list_prompt_queue(db: AsyncSession = Depends(get_db)):
    """List all items in the prompt queue"""
    result = await db.execute(
        select(PromptQueue)
        .join(GeneratedPromptFile)
        .order_by(PromptQueue.queued_at.asc())
    )
    queue_items = result.scalars().all()

    items = []
    for item in queue_items:
        # Fetch the generated file details
        file_result = await db.execute(
            select(GeneratedPromptFile).where(GeneratedPromptFile.id == item.generated_file_id)
        )
        gen_file = file_result.scalar_one_or_none()

        if gen_file:
            items.append({
                "id": item.id,
                "generated_file_id": item.generated_file_id,
                "filename": gen_file.filename,
                "prompt_count": gen_file.prompt_count,
                "user_input": gen_file.user_input,
                "status": item.status,
                "queued_at": item.queued_at.isoformat(),
                "started_at": item.started_at.isoformat() if item.started_at else None,
                "completed_at": item.completed_at.isoformat() if item.completed_at else None
            })

    return items


@router.delete("/queue/{queue_id}")
async def remove_from_prompt_queue(
    queue_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Remove an item from the prompt queue"""
    result = await db.execute(
        select(PromptQueue).where(PromptQueue.id == queue_id)
    )
    queue_item = result.scalar_one_or_none()

    if not queue_item:
        raise HTTPException(status_code=404, detail="Queue item not found")

    if queue_item.status == 'processing':
        raise HTTPException(status_code=400, detail="Cannot remove item that is currently processing")

    await db.delete(queue_item)
    await db.commit()

    # Broadcast event
    from ..routes.events import broadcast_event
    await broadcast_event("prompt_queue_updated", {
        "action": "removed",
        "queue_id": queue_id
    })

    return {"message": "Item removed from queue"}


@router.delete("/files")
async def delete_all_generated_files(db: AsyncSession = Depends(get_db)):
    """Delete all generated prompt files"""
    result = await db.execute(select(GeneratedPromptFile))
    files = result.scalars().all()

    deleted_count = 0
    for file_record in files:
        # Delete physical file
        filepath = Path(file_record.path)
        if filepath.exists():
            filepath.unlink()
            deleted_count += 1

        # Delete database record
        await db.delete(file_record)

    await db.commit()

    return {"message": f"Deleted {deleted_count} generated prompt files"}


@router.delete("/queue")
async def delete_all_prompt_queue(db: AsyncSession = Depends(get_db)):
    """Delete all items from the prompt queue"""
    result = await db.execute(select(PromptQueue))
    queue_items = result.scalars().all()

    deleted_count = len(queue_items)
    for item in queue_items:
        await db.delete(item)

    await db.commit()

    # Broadcast event
    from ..routes.events import broadcast_event
    await broadcast_event("prompt_queue_updated", {"action": "cleared"})

    return {"message": f"Deleted {deleted_count} items from prompt queue"}
