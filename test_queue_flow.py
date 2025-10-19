#!/usr/bin/env python3
"""Test script to verify the prompt queue flow"""

import asyncio
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent / "backend"))

from app.database import AsyncSessionLocal, GeneratedPromptFile, PromptQueue, PromptsFile
from sqlalchemy import select


async def test_queue_flow():
    """Test the complete queue flow"""

    # Create a test generated file
    test_content = "Test prompt 1\nTest prompt 2\nTest prompt 3\n"
    test_file_path = Path(__file__).parent / "data" / "generated_prompts" / "test_file.txt"
    test_file_path.parent.mkdir(parents=True, exist_ok=True)

    print("Creating test prompt file...")
    with open(test_file_path, 'w') as f:
        f.write(test_content)

    async with AsyncSessionLocal() as db:
        # 1. Create GeneratedPromptFile
        print("Step 1: Creating GeneratedPromptFile in database...")
        gen_file = GeneratedPromptFile(
            filename="test_file.txt",
            path=str(test_file_path),
            user_input="Test demographic",
            prompt_count=3
        )
        db.add(gen_file)
        await db.commit()
        await db.refresh(gen_file)
        print(f"  ✓ Created GeneratedPromptFile with ID: {gen_file.id}")

        # 2. Add to PromptQueue
        print("Step 2: Adding to PromptQueue...")
        queue_item = PromptQueue(
            generated_file_id=gen_file.id,
            status='pending'
        )
        db.add(queue_item)
        await db.commit()
        await db.refresh(queue_item)
        print(f"  ✓ Added to PromptQueue with ID: {queue_item.id}")

        # 3. Call the processing function
        print("Step 3: Processing queue item...")
        from app.routes.prompt_generator import _process_next_prompt_queue_item
        result = await _process_next_prompt_queue_item(db)
        print(f"  ✓ Processing result: {result}")

        # 4. Verify results
        print("\nStep 4: Verifying results...")

        # Check PromptQueue status
        result = await db.execute(
            select(PromptQueue).where(PromptQueue.id == queue_item.id)
        )
        updated_queue = result.scalar_one_or_none()
        print(f"  Queue item status: {updated_queue.status if updated_queue else 'DELETED'}")
        print(f"  Queue item prompts_file_id: {updated_queue.prompts_file_id if updated_queue else 'N/A'}")

        # Check PromptsFile creation
        result = await db.execute(select(PromptsFile))
        prompts_files = result.scalars().all()
        print(f"  PromptsFiles created: {len(prompts_files)}")
        if prompts_files:
            for pf in prompts_files:
                print(f"    - ID: {pf.id}, filename: {pf.filename}, status: {pf.status}")

        print("\n✅ Test completed successfully!" if result else "\n❌ Test failed!")

        # Cleanup
        print("\nCleaning up test data...")
        if updated_queue:
            await db.delete(updated_queue)
        for pf in prompts_files:
            await db.delete(pf)
            # Delete copied file
            if Path(pf.path).exists():
                Path(pf.path).unlink()
        await db.delete(gen_file)
        await db.commit()

        # Delete original test file
        if test_file_path.exists():
            test_file_path.unlink()
        print("  ✓ Cleanup complete")


if __name__ == "__main__":
    asyncio.run(test_queue_flow())
