import zipfile
import hashlib
from pathlib import Path
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import Optional

from ..database import Job, Image


class ZipGeneratorService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def compute_sha256(self, filepath: Path) -> str:
        """Compute SHA-256 hash of a file"""
        sha256_hash = hashlib.sha256()
        with open(filepath, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()

    async def build_job_zip(self, job_id: int) -> Optional[Path]:
        """Build ZIP file for a specific job"""
        # Get job and its images
        result = await self.db.execute(
            select(Job).where(Job.id == job_id)
        )
        job = result.scalar_one_or_none()

        if not job or job.status != "succeeded":
            return None

        result = await self.db.execute(
            select(Image).where(Image.job_id == job_id)
        )
        images = result.scalars().all()

        if not images:
            return None

        # Create ZIP directory
        zip_dir = Path(__file__).parent.parent.parent.parent / "data" / "zips"
        zip_dir.mkdir(parents=True, exist_ok=True)

        zip_path = zip_dir / f"{job_id}.zip"

        # Create ZIP file
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for image in images:
                image_path = Path(image.path)
                if image_path.exists():
                    zipf.write(image_path, arcname=image_path.name)

        # Compute hash and size
        sha256 = await self.compute_sha256(zip_path)
        size_bytes = zip_path.stat().st_size

        # Update job record
        await self.db.execute(
            update(Job).where(Job.id == job_id).values(
                zip_path=str(zip_path),
                zip_size_bytes=size_bytes,
                zip_sha256=sha256,
                zip_built_at=datetime.utcnow()
            )
        )
        await self.db.commit()

        return zip_path

    async def build_all_jobs_zip(self) -> Optional[Path]:
        """Build combined ZIP of all images across all jobs"""
        # Get all images
        result = await self.db.execute(
            select(Image).order_by(Image.job_id, Image.created_at)
        )
        images = result.scalars().all()

        if not images:
            return None

        # Create ZIP directory
        zip_dir = Path(__file__).parent.parent.parent.parent / "data" / "zips"
        zip_dir.mkdir(parents=True, exist_ok=True)

        zip_path = zip_dir / "all_jobs.zip"

        # Create ZIP file with job subdirectories
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for image in images:
                image_path = Path(image.path)
                if image_path.exists():
                    # Use job_id as subdirectory
                    arcname = f"job_{image.job_id}/{image_path.name}"
                    zipf.write(image_path, arcname=arcname)

        # Compute hash
        sha256 = await self.compute_sha256(zip_path)

        # Store in app_config
        from ..database import AppConfig

        # Update or insert all_jobs_zip metadata
        await self.db.execute(
            update(AppConfig).where(AppConfig.key == "all_jobs_zip_path").values(value=str(zip_path))
        )
        await self.db.execute(
            update(AppConfig).where(AppConfig.key == "all_jobs_zip_sha256").values(value=sha256)
        )
        await self.db.execute(
            update(AppConfig).where(AppConfig.key == "all_jobs_zip_built_at").values(value=datetime.utcnow().isoformat())
        )
        await self.db.commit()

        return zip_path

    async def invalidate_all_jobs_cache(self):
        """Invalidate the all-jobs ZIP cache"""
        zip_path = Path(__file__).parent.parent.parent.parent / "data" / "zips" / "all_jobs.zip"

        if zip_path.exists():
            zip_path.unlink()

        # Clear metadata from config
        from ..database import AppConfig
        from sqlalchemy import delete

        await self.db.execute(
            delete(AppConfig).where(AppConfig.key.in_([
                "all_jobs_zip_path",
                "all_jobs_zip_sha256",
                "all_jobs_zip_built_at"
            ]))
        )
        await self.db.commit()
