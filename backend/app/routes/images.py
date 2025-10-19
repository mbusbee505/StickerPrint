from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pathlib import Path

from ..database import get_db, Image, Run
from ..services.zip_generator import ZipGeneratorService

router = APIRouter(prefix="/api", tags=["images"])


@router.get("/images")
async def list_images(
    run_id: int = None,
    page: int = 1,
    page_size: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """List images with optional filtering by run_id"""
    offset = (page - 1) * page_size

    query = select(Image).order_by(Image.created_at.desc())

    if run_id is not None:
        query = query.where(Image.run_id == run_id)

    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    images = result.scalars().all()

    return [
        {
            "id": img.id,
            "run_id": img.run_id,
            "url": f"/api/files/images/{img.id}",
            "prompt_text": img.prompt_text,
            "created_at": img.created_at.isoformat(),
            "width": img.width,
            "height": img.height
        }
        for img in images
    ]


@router.get("/images/{image_id}")
async def get_image_metadata(image_id: int, db: AsyncSession = Depends(get_db)):
    """Get image metadata"""
    result = await db.execute(
        select(Image).where(Image.id == image_id)
    )
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    return {
        "id": image.id,
        "run_id": image.run_id,
        "url": f"/api/files/images/{image.id}",
        "prompt_text": image.prompt_text,
        "created_at": image.created_at.isoformat(),
        "width": image.width,
        "height": image.height
    }


@router.get("/files/images/{image_id}")
async def download_image(image_id: int, db: AsyncSession = Depends(get_db)):
    """Download raw image file"""
    result = await db.execute(
        select(Image).where(Image.id == image_id)
    )
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    image_path = Path(image.path)

    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found")

    return FileResponse(
        path=image_path,
        media_type="image/png",
        filename=image_path.name
    )


@router.delete("/images")
async def delete_all_images(
    x_confirm: str = Header(None, alias="X-Confirm"),
    db: AsyncSession = Depends(get_db)
):
    """Delete all images and invalidate ZIP caches"""
    if x_confirm != "delete-all":
        raise HTTPException(
            status_code=400,
            detail="Must include X-Confirm: delete-all header"
        )

    # Get all images
    result = await db.execute(select(Image))
    images = result.scalars().all()

    # Delete image files
    deleted_count = 0
    for image in images:
        image_path = Path(image.path)
        if image_path.exists():
            image_path.unlink()
            deleted_count += 1

    # Delete image records
    await db.execute(delete(Image))

    # Delete per-run ZIPs
    result = await db.execute(select(Run).where(Run.zip_path.isnot(None)))
    runs = result.scalars().all()

    deleted_zips = 0
    for run in runs:
        zip_path = Path(run.zip_path)
        if zip_path.exists():
            zip_path.unlink()
            deleted_zips += 1

        # Clear ZIP metadata
        run.zip_path = None
        run.zip_size_bytes = None
        run.zip_sha256 = None
        run.zip_built_at = None

    # Invalidate all-runs cache
    zip_service = ZipGeneratorService(db)
    await zip_service.invalidate_all_runs_cache()

    await db.commit()

    return {
        "deleted_images": deleted_count,
        "deleted_run_zips": deleted_zips,
        "cache_invalidated": True
    }
