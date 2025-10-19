from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pathlib import Path

from ..database import get_db, Run
from ..services.zip_generator import ZipGeneratorService

router = APIRouter(prefix="/api", tags=["zips"])


@router.get("/runs/{run_id}/zip")
async def download_run_zip(run_id: int, db: AsyncSession = Depends(get_db)):
    """Download ZIP file for a specific run"""
    result = await db.execute(
        select(Run).where(Run.id == run_id)
    )
    run = result.scalar_one_or_none()

    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    if run.status != "succeeded":
        raise HTTPException(status_code=400, detail="Run not completed")

    # If ZIP doesn't exist, build it
    if not run.zip_path or not Path(run.zip_path).exists():
        zip_service = ZipGeneratorService(db)
        zip_path = await zip_service.build_run_zip(run_id)

        if not zip_path:
            raise HTTPException(status_code=500, detail="Failed to build ZIP")
    else:
        zip_path = Path(run.zip_path)

    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        filename=f"run_{run_id}.zip",
        headers={
            "ETag": run.zip_sha256 if run.zip_sha256 else "",
            "Content-Length": str(run.zip_size_bytes) if run.zip_size_bytes else ""
        }
    )


@router.head("/runs/{run_id}/zip")
async def head_run_zip(run_id: int, db: AsyncSession = Depends(get_db)):
    """Get headers for run ZIP file"""
    result = await db.execute(
        select(Run).where(Run.id == run_id)
    )
    run = result.scalar_one_or_none()

    if not run or not run.zip_path:
        raise HTTPException(status_code=404, detail="ZIP not found")

    return Response(
        headers={
            "Content-Length": str(run.zip_size_bytes) if run.zip_size_bytes else "",
            "ETag": run.zip_sha256 if run.zip_sha256 else ""
        }
    )


@router.get("/zips/latest")
async def download_latest_zip(db: AsyncSession = Depends(get_db)):
    """Download ZIP for the most recent completed run"""
    result = await db.execute(
        select(Run)
        .where(Run.status == "succeeded")
        .order_by(Run.finished_at.desc())
        .limit(1)
    )
    run = result.scalar_one_or_none()

    if not run:
        raise HTTPException(status_code=404, detail="No completed runs found")

    # If ZIP doesn't exist, build it
    if not run.zip_path or not Path(run.zip_path).exists():
        zip_service = ZipGeneratorService(db)
        zip_path = await zip_service.build_run_zip(run.id)

        if not zip_path:
            raise HTTPException(status_code=500, detail="Failed to build ZIP")
    else:
        zip_path = Path(run.zip_path)

    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        filename=f"latest_run_{run.id}.zip",
        headers={
            "ETag": run.zip_sha256 if run.zip_sha256 else ""
        }
    )


@router.get("/zips/all")
async def download_all_zip(db: AsyncSession = Depends(get_db)):
    """Download combined ZIP of all images across all runs"""
    zip_service = ZipGeneratorService(db)

    # Check if cached version exists
    from ..database import AppConfig

    result = await db.execute(
        select(AppConfig).where(AppConfig.key == "all_runs_zip_path")
    )
    config = result.scalar_one_or_none()

    if config and config.value:
        zip_path = Path(config.value)
        if zip_path.exists():
            # Get SHA-256 from config
            result = await db.execute(
                select(AppConfig).where(AppConfig.key == "all_runs_zip_sha256")
            )
            sha_config = result.scalar_one_or_none()

            return FileResponse(
                path=zip_path,
                media_type="application/zip",
                filename="all_runs.zip",
                headers={
                    "ETag": sha_config.value if sha_config else ""
                }
            )

    # Build new all-runs ZIP
    zip_path = await zip_service.build_all_runs_zip()

    if not zip_path:
        raise HTTPException(status_code=404, detail="No images found")

    # Get SHA-256 from config
    result = await db.execute(
        select(AppConfig).where(AppConfig.key == "all_runs_zip_sha256")
    )
    sha_config = result.scalar_one_or_none()

    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        filename="all_runs.zip",
        headers={
            "ETag": sha_config.value if sha_config else ""
        }
    )


@router.head("/zips/all")
async def head_all_zip(db: AsyncSession = Depends(get_db)):
    """Get headers for all-runs ZIP file"""
    from ..database import AppConfig

    result = await db.execute(
        select(AppConfig).where(AppConfig.key == "all_runs_zip_path")
    )
    config = result.scalar_one_or_none()

    if not config or not config.value:
        raise HTTPException(status_code=404, detail="ZIP not built yet")

    zip_path = Path(config.value)
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="ZIP not found")

    # Get SHA-256
    result = await db.execute(
        select(AppConfig).where(AppConfig.key == "all_runs_zip_sha256")
    )
    sha_config = result.scalar_one_or_none()

    return Response(
        headers={
            "Content-Length": str(zip_path.stat().st_size),
            "ETag": sha_config.value if sha_config else ""
        }
    )
