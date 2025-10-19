from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pathlib import Path

from ..database import get_db, Job
from ..services.zip_generator import ZipGeneratorService

router = APIRouter(prefix="/api", tags=["zips"])


@router.get("/jobs/{job_id}/zip")
async def download_job_zip(job_id: int, db: AsyncSession = Depends(get_db)):
    """Download ZIP file for a specific job"""
    result = await db.execute(
        select(Job).where(Job.id == job_id)
    )
    job = result.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status != "succeeded":
        raise HTTPException(status_code=400, detail="Job not completed")

    # If ZIP doesn't exist, build it
    if not job.zip_path or not Path(job.zip_path).exists():
        zip_service = ZipGeneratorService(db)
        zip_path = await zip_service.build_job_zip(job_id)

        if not zip_path:
            raise HTTPException(status_code=500, detail="Failed to build ZIP")
    else:
        zip_path = Path(job.zip_path)

    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        filename=f"job_{job_id}.zip",
        headers={
            "ETag": job.zip_sha256 if job.zip_sha256 else "",
            "Content-Length": str(job.zip_size_bytes) if job.zip_size_bytes else ""
        }
    )


@router.head("/jobs/{job_id}/zip")
async def head_job_zip(job_id: int, db: AsyncSession = Depends(get_db)):
    """Get headers for job ZIP file"""
    result = await db.execute(
        select(Job).where(Job.id == job_id)
    )
    job = result.scalar_one_or_none()

    if not job or not job.zip_path:
        raise HTTPException(status_code=404, detail="ZIP not found")

    return Response(
        headers={
            "Content-Length": str(job.zip_size_bytes) if job.zip_size_bytes else "",
            "ETag": job.zip_sha256 if job.zip_sha256 else ""
        }
    )


@router.get("/zips/latest")
async def download_latest_zip(db: AsyncSession = Depends(get_db)):
    """Download ZIP for the most recent completed job"""
    result = await db.execute(
        select(Job)
        .where(Job.status == "succeeded")
        .order_by(Job.finished_at.desc())
        .limit(1)
    )
    job = result.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=404, detail="No completed jobs found")

    # If ZIP doesn't exist, build it
    if not job.zip_path or not Path(job.zip_path).exists():
        zip_service = ZipGeneratorService(db)
        zip_path = await zip_service.build_job_zip(job.id)

        if not zip_path:
            raise HTTPException(status_code=500, detail="Failed to build ZIP")
    else:
        zip_path = Path(job.zip_path)

    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        filename=f"latest_job_{job.id}.zip",
        headers={
            "ETag": job.zip_sha256 if job.zip_sha256 else ""
        }
    )


@router.get("/zips/all")
async def download_all_zip(db: AsyncSession = Depends(get_db)):
    """Download combined ZIP of all images across all jobs"""
    zip_service = ZipGeneratorService(db)

    # Check if cached version exists
    from ..database import AppConfig

    result = await db.execute(
        select(AppConfig).where(AppConfig.key == "all_jobs_zip_path")
    )
    config = result.scalar_one_or_none()

    if config and config.value:
        zip_path = Path(config.value)
        if zip_path.exists():
            # Get SHA-256 from config
            result = await db.execute(
                select(AppConfig).where(AppConfig.key == "all_jobs_zip_sha256")
            )
            sha_config = result.scalar_one_or_none()

            return FileResponse(
                path=zip_path,
                media_type="application/zip",
                filename="all_jobs.zip",
                headers={
                    "ETag": sha_config.value if sha_config else ""
                }
            )

    # Build new all-jobs ZIP
    zip_path = await zip_service.build_all_jobs_zip()

    if not zip_path:
        raise HTTPException(status_code=404, detail="No images found")

    # Get SHA-256 from config
    result = await db.execute(
        select(AppConfig).where(AppConfig.key == "all_jobs_zip_sha256")
    )
    sha_config = result.scalar_one_or_none()

    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        filename="all_jobs.zip",
        headers={
            "ETag": sha_config.value if sha_config else ""
        }
    )


@router.head("/zips/all")
async def head_all_zip(db: AsyncSession = Depends(get_db)):
    """Get headers for all-jobs ZIP file"""
    from ..database import AppConfig

    result = await db.execute(
        select(AppConfig).where(AppConfig.key == "all_jobs_zip_path")
    )
    config = result.scalar_one_or_none()

    if not config or not config.value:
        raise HTTPException(status_code=404, detail="ZIP not built yet")

    zip_path = Path(config.value)
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="ZIP not found")

    # Get SHA-256
    result = await db.execute(
        select(AppConfig).where(AppConfig.key == "all_jobs_zip_sha256")
    )
    sha_config = result.scalar_one_or_none()

    return Response(
        headers={
            "Content-Length": str(zip_path.stat().st_size),
            "ETag": sha_config.value if sha_config else ""
        }
    )
