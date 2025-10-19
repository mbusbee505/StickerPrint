import os
import base64
import time
import random
import hashlib
import asyncio
from pathlib import Path
from datetime import datetime
from openai import AsyncOpenAI, RateLimitError, APIError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import Optional

from ..database import Job, Image, AppConfig


class ImageGeneratorService:
    def __init__(self, db: AsyncSession, job_id: int):
        self.db = db
        self.job_id = job_id
        self.delay = 5.0
        self.max_delay = 120.0
        self.success_streak = 0

    def jitter(self, s: float) -> float:
        """Add +/-10% jitter to delay"""
        return s * random.uniform(0.9, 1.1)

    async def emit_event(self, event_type: str, data: dict):
        """Emit SSE event"""
        from ..routes.events import broadcast_event
        await broadcast_event(event_type, data)

    async def get_config(self, key: str) -> Optional[str]:
        """Get config value from database"""
        result = await self.db.execute(
            select(AppConfig).where(AppConfig.key == key)
        )
        config = result.scalar_one_or_none()
        return config.value if config else None

    async def update_job_status(self, status: str, finished_at: Optional[datetime] = None):
        """Update job status in database"""
        update_data = {"status": status}
        if finished_at:
            update_data["finished_at"] = finished_at

        await self.db.execute(
            update(Job).where(Job.id == self.job_id).values(**update_data)
        )
        await self.db.commit()

        await self.emit_event("job_updated", {
            "job_id": self.job_id,
            "status": status,
            "finished_at": finished_at.isoformat() if finished_at else None
        })

    async def generate_images(self, prompts: list[str], base_prompt: str, api_key: str):
        """Generate images for all prompts"""
        if not api_key:
            await self.update_job_status("failed")
            raise ValueError("API key is required")

        # Update status to running
        await self.update_job_status("running")

        # Initialize OpenAI client
        client = AsyncOpenAI(api_key=api_key)

        # Create output directory for this job
        output_dir = Path(__file__).parent.parent.parent.parent / "data" / "images" / str(self.job_id)
        output_dir.mkdir(parents=True, exist_ok=True)

        # Process each prompt
        for i, prompt in enumerate(prompts, 1):
            # Proactive throttling with jitter
            if i > 1:
                sleep_time = self.jitter(self.delay)
                await asyncio.sleep(sleep_time)

            retry_count = 0
            max_retries = 3

            while retry_count < max_retries:
                try:
                    # Enhanced prompt with base sticker styling
                    enhanced_prompt = f"{prompt} — {base_prompt}"

                    response = await client.images.generate(
                        model='gpt-image-1',
                        prompt=enhanced_prompt,
                        size='1024x1024',
                        quality='auto',
                        output_compression=100
                    )

                    # Decode base64 image
                    image_base64 = response.data[0].b64_json
                    image_bytes = base64.b64decode(image_base64)

                    # Create filename from prompt (sanitized)
                    sanitized = ''.join(c if c.isalnum() or c.isspace() else '-' for c in prompt.lower())
                    sanitized = '-'.join(sanitized.split())[:50]
                    filename = f'{str(i).zfill(3)}-{sanitized}.png'
                    filepath = output_dir / filename

                    # Save image
                    with open(filepath, 'wb') as f:
                        f.write(image_bytes)

                    # Save to database
                    image_record = Image(
                        job_id=self.job_id,
                        path=str(filepath),
                        prompt_text=prompt,
                        width=1024,
                        height=1024,
                        created_at=datetime.utcnow()
                    )
                    self.db.add(image_record)
                    await self.db.commit()
                    await self.db.refresh(image_record)

                    # Emit event
                    await self.emit_event("image_created", {
                        "image_id": image_record.id,
                        "job_id": self.job_id,
                        "filename": filename,
                        "progress": f"{i}/{len(prompts)}"
                    })

                    # Successful request - cautiously speed up after consecutive successes
                    self.success_streak += 1
                    if self.success_streak >= 5 and self.delay > 2.0:
                        self.delay = max(2.0, self.delay * 0.9)
                        self.success_streak = 0

                    break  # Success, move to next prompt

                except RateLimitError as e:
                    self.success_streak = 0
                    retry_after = None

                    if hasattr(e, 'response') and e.response is not None:
                        retry_after = e.response.headers.get('retry-after')

                    if retry_after:
                        wait_time = self.jitter(float(retry_after))
                    else:
                        self.delay = min(self.max_delay, self.delay * 2.0)
                        wait_time = self.jitter(self.delay)

                    await asyncio.sleep(wait_time)
                    retry_count += 1

                except APIError as e:
                    wait_time = self.jitter(min(self.max_delay, self.delay * 1.5))
                    await asyncio.sleep(wait_time)
                    retry_count += 1

                except Exception as e:
                    print(f"Failed to generate image for prompt '{prompt}': {str(e)}")
                    retry_count += 1

            if retry_count >= max_retries:
                print(f"Skipping prompt after {max_retries} retries: {prompt}")

        # Mark job as succeeded
        await self.update_job_status("succeeded", datetime.utcnow())
