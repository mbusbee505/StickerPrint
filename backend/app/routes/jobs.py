from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from datetime import datetime
from pathlib import Path
import json

from ..database import get_db, Job, PromptsFile, Image, AppConfig
from ..services.image_generator import ImageGeneratorService
from ..services.zip_generator import ZipGeneratorService

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class CreateJobRequest(BaseModel):
    prompts_file_id: int


async def job_image_generation(job_id: int):
    """Background task to generate images for a job"""
    from ..database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        # Get job and prompts file
        result = await db.execute(
            select(Job).where(Job.id == job_id)
        )
        job = result.scalar_one_or_none()

        if not job:
            return

        result = await db.execute(
            select(PromptsFile).where(PromptsFile.id == job.prompts_file_id)
        )
        prompts_file = result.scalar_one_or_none()

        if not prompts_file:
            return

        # Read prompts from file
        with open(prompts_file.path, 'r') as f:
            prompts = [line.strip() for line in f if line.strip()]

        # Get config snapshot
        config = json.loads(job.config_snapshot)
        base_prompt = config.get('base_prompt', '')
        api_key = config.get('api_key', '')

        # Generate images
        generator = ImageGeneratorService(db, job_id)
        try:
            await generator.generate_images(prompts, base_prompt, api_key)

            # Build ZIP after successful generation
            zip_service = ZipGeneratorService(db)
            await zip_service.build_job_zip(job_id)

            # Invalidate all-jobs cache
            await zip_service.invalidate_all_jobs_cache()

        except Exception as e:
            print(f"Error generating images: {str(e)}")
            await db.execute(
                select(Job).where(Job.id == job_id)
            )
            job.status = "failed"
            job.finished_at = datetime.utcnow()
            await db.commit()


@router.post("")
async def create_job(
    request: CreateJobRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """Create a new image generation job"""
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

    # Create job
    job = Job(
        status='queued',
        started_at=datetime.utcnow(),
        prompts_file_id=request.prompts_file_id,
        base_prompt_snapshot=config_snapshot.get('base_prompt', ''),
        config_snapshot=json.dumps(config_snapshot)
    )

    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Start background task
    background_tasks.add_task(job_image_generation, job.id)

    return {
        "id": job.id,
        "status": job.status,
        "started_at": job.started_at.isoformat()
    }


@router.get("")
async def list_jobs(
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    """List all jobs"""
    result = await db.execute(
        select(Job).order_by(Job.started_at.desc()).limit(limit)
    )
    jobs = result.scalars().all()

    # Get image counts and prompts file info for each job
    job_list = []
    for job in jobs:
        result = await db.execute(
            select(func.count(Image.id)).where(Image.job_id == job.id)
        )
        image_count = result.scalar()

        # Get prompts file info
        prompts_file_result = await db.execute(
            select(PromptsFile).where(PromptsFile.id == job.prompts_file_id)
        )
        prompts_file = prompts_file_result.scalar_one_or_none()

        # Count total prompts in the file
        total_prompts = 0
        prompts_file_name = None
        if prompts_file:
            prompts_file_name = prompts_file.filename
            try:
                with open(prompts_file.path, 'r') as f:
                    total_prompts = len([line.strip() for line in f if line.strip()])
            except:
                total_prompts = 0

        job_list.append({
            "id": job.id,
            "status": job.status,
            "started_at": job.started_at.isoformat(),
            "finished_at": job.finished_at.isoformat() if job.finished_at else None,
            "prompts_file_id": job.prompts_file_id,
            "prompts_file_name": prompts_file_name,
            "total_prompts": total_prompts,
            "image_count": image_count,
            "zip_ready": job.zip_path is not None
        })

    return job_list


@router.get("/{job_id}")
async def get_job(job_id: int, db: AsyncSession = Depends(get_db)):
    """Get details of a specific job"""
    result = await db.execute(
        select(Job).where(Job.id == job_id)
    )
    job = result.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Get image count
    result = await db.execute(
        select(func.count(Image.id)).where(Image.job_id == job_id)
    )
    image_count = result.scalar()

    # Get prompts file info
    prompts_file_result = await db.execute(
        select(PromptsFile).where(PromptsFile.id == job.prompts_file_id)
    )
    prompts_file = prompts_file_result.scalar_one_or_none()

    # Count total prompts in the file
    total_prompts = 0
    prompts_file_name = None
    if prompts_file:
        prompts_file_name = prompts_file.filename
        try:
            with open(prompts_file.path, 'r') as f:
                total_prompts = len([line.strip() for line in f if line.strip()])
        except:
            total_prompts = 0

    response = {
        "id": job.id,
        "status": job.status,
        "started_at": job.started_at.isoformat(),
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        "prompts_file_id": job.prompts_file_id,
        "prompts_file_name": prompts_file_name,
        "total_prompts": total_prompts,
        "image_count": image_count,
        "zip_ready": job.zip_path is not None
    }

    if job.zip_path:
        response["zip"] = {
            "path": job.zip_path,
            "size_bytes": job.zip_size_bytes,
            "sha256": job.zip_sha256,
            "built_at": job.zip_built_at.isoformat() if job.zip_built_at else None
        }

    return response


@router.post("/{job_id}/cancel")
async def cancel_job(job_id: int, db: AsyncSession = Depends(get_db)):
    """Cancel a running or queued job"""
    result = await db.execute(
        select(Job).where(Job.id == job_id)
    )
    job = result.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status not in ['queued', 'running']:
        raise HTTPException(status_code=400, detail="Job is not running or queued")

    # Update job status to canceled
    job.status = 'canceled'
    job.finished_at = datetime.utcnow()
    await db.commit()

    # Broadcast event
    from ..routes.events import broadcast_event
    await broadcast_event("job_updated", {
        "job_id": job.id,
        "status": "canceled",
        "finished_at": job.finished_at.isoformat()
    })

    return {
        "id": job.id,
        "status": job.status,
        "finished_at": job.finished_at.isoformat()
    }
