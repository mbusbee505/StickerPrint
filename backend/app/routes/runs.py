from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from datetime import datetime
from pathlib import Path
import json

from ..database import get_db, Run, PromptsFile, Image, AppConfig
from ..services.image_generator import ImageGeneratorService
from ..services.zip_generator import ZipGeneratorService

router = APIRouter(prefix="/api/runs", tags=["runs"])


class CreateRunRequest(BaseModel):
    prompts_file_id: int


async def run_image_generation(run_id: int):
    """Background task to generate images for a run"""
    from ..database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        # Get run and prompts file
        result = await db.execute(
            select(Run).where(Run.id == run_id)
        )
        run = result.scalar_one_or_none()

        if not run:
            return

        result = await db.execute(
            select(PromptsFile).where(PromptsFile.id == run.prompts_file_id)
        )
        prompts_file = result.scalar_one_or_none()

        if not prompts_file:
            return

        # Read prompts from file
        with open(prompts_file.path, 'r') as f:
            prompts = [line.strip() for line in f if line.strip()]

        # Get config snapshot
        config = json.loads(run.config_snapshot)
        base_prompt = config.get('base_prompt', '')
        api_key = config.get('api_key', '')

        # Generate images
        generator = ImageGeneratorService(db, run_id)
        try:
            await generator.generate_images(prompts, base_prompt, api_key)

            # Build ZIP after successful generation
            zip_service = ZipGeneratorService(db)
            await zip_service.build_run_zip(run_id)

            # Invalidate all-runs cache
            await zip_service.invalidate_all_runs_cache()

        except Exception as e:
            print(f"Error generating images: {str(e)}")
            await db.execute(
                select(Run).where(Run.id == run_id)
            )
            run.status = "failed"
            run.finished_at = datetime.utcnow()
            await db.commit()


@router.post("")
async def create_run(
    request: CreateRunRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """Create a new image generation run"""
    # Verify prompts file exists
    result = await db.execute(
        select(PromptsFile).where(PromptsFile.id == request.prompts_file_id)
    )
    prompts_file = result.scalar_one_or_none()

    if not prompts_file:
        raise HTTPException(status_code=404, detail="Prompts file not found")

    # Get current config snapshot
    result = await db.execute(
        select(AppConfig).where(AppConfig.key.in_(['base_prompt', 'api_key']))
    )
    config_items = result.scalars().all()

    config_snapshot = {item.key: item.value for item in config_items}

    # Create run
    run = Run(
        status='queued',
        started_at=datetime.utcnow(),
        prompts_file_id=request.prompts_file_id,
        base_prompt_snapshot=config_snapshot.get('base_prompt', ''),
        config_snapshot=json.dumps(config_snapshot)
    )

    db.add(run)
    await db.commit()
    await db.refresh(run)

    # Start background task
    background_tasks.add_task(run_image_generation, run.id)

    return {
        "id": run.id,
        "status": run.status,
        "started_at": run.started_at.isoformat()
    }


@router.get("")
async def list_runs(
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    """List all runs"""
    result = await db.execute(
        select(Run).order_by(Run.started_at.desc()).limit(limit)
    )
    runs = result.scalars().all()

    # Get image counts for each run
    run_list = []
    for run in runs:
        result = await db.execute(
            select(func.count(Image.id)).where(Image.run_id == run.id)
        )
        image_count = result.scalar()

        run_list.append({
            "id": run.id,
            "status": run.status,
            "started_at": run.started_at.isoformat(),
            "finished_at": run.finished_at.isoformat() if run.finished_at else None,
            "prompts_file_id": run.prompts_file_id,
            "image_count": image_count,
            "zip_ready": run.zip_path is not None
        })

    return run_list


@router.get("/{run_id}")
async def get_run(run_id: int, db: AsyncSession = Depends(get_db)):
    """Get details of a specific run"""
    result = await db.execute(
        select(Run).where(Run.id == run_id)
    )
    run = result.scalar_one_or_none()

    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    # Get image count
    result = await db.execute(
        select(func.count(Image.id)).where(Image.run_id == run_id)
    )
    image_count = result.scalar()

    response = {
        "id": run.id,
        "status": run.status,
        "started_at": run.started_at.isoformat(),
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "prompts_file_id": run.prompts_file_id,
        "image_count": image_count,
        "zip_ready": run.zip_path is not None
    }

    if run.zip_path:
        response["zip"] = {
            "path": run.zip_path,
            "size_bytes": run.zip_size_bytes,
            "sha256": run.zip_sha256,
            "built_at": run.zip_built_at.isoformat() if run.zip_built_at else None
        }

    return response
