from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import hashlib
from pathlib import Path
from datetime import datetime

from ..database import get_db, PromptsFile

router = APIRouter(prefix="/api/prompts", tags=["prompts"])


@router.post("/upload")
async def upload_prompts_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Upload a prompts text file"""
    if not file.filename.endswith('.txt'):
        raise HTTPException(status_code=400, detail="Only .txt files are allowed")

    # Read file content
    content = await file.read()

    try:
        content_str = content.decode('utf-8')
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded")

    # Parse prompts
    prompts = [line.strip() for line in content_str.splitlines() if line.strip()]

    if not prompts:
        raise HTTPException(status_code=400, detail="No prompts found in file")

    # Compute SHA-256
    sha256 = hashlib.sha256(content).hexdigest()

    # Save file to disk
    prompts_dir = Path(__file__).parent.parent.parent.parent / "data" / "prompts"
    prompts_dir.mkdir(parents=True, exist_ok=True)

    # Generate unique filename
    timestamp = int(datetime.utcnow().timestamp())
    file_path = prompts_dir / f"{timestamp}_{file.filename}"

    with open(file_path, 'wb') as f:
        f.write(content)

    # Save to database
    prompts_file = PromptsFile(
        filename=file.filename,
        sha256=sha256,
        uploaded_at=datetime.utcnow(),
        path=str(file_path)
    )

    db.add(prompts_file)
    await db.commit()
    await db.refresh(prompts_file)

    return {
        "id": prompts_file.id,
        "filename": prompts_file.filename,
        "lines": len(prompts),
        "uploaded_at": prompts_file.uploaded_at.isoformat()
    }


@router.get("")
async def list_prompts_files(db: AsyncSession = Depends(get_db)):
    """List all uploaded prompts files"""
    result = await db.execute(
        select(PromptsFile).order_by(PromptsFile.uploaded_at.desc())
    )
    prompts_files = result.scalars().all()

    return [
        {
            "id": pf.id,
            "filename": pf.filename,
            "uploaded_at": pf.uploaded_at.isoformat(),
            "sha256": pf.sha256,
            "path": pf.path,
            "status": pf.status
        }
        for pf in prompts_files
    ]
