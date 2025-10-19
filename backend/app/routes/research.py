from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel
from datetime import datetime
from pathlib import Path
from typing import List, Optional
from sse_starlette.sse import EventSourceResponse
import json
import asyncio

from ..database import get_db, AppConfig, ResearchSession, ResearchMessage

router = APIRouter(prefix="/api/research", tags=["research"])

# Ensure research results directory exists
RESEARCH_DIR = Path(__file__).parent.parent.parent.parent / "data" / "research"
RESEARCH_DIR.mkdir(parents=True, exist_ok=True)


class CreateSessionRequest(BaseModel):
    initial_query: str


class SendMessageRequest(BaseModel):
    message: str


class SessionResponse(BaseModel):
    id: int
    title: str
    status: str
    created_at: datetime
    completed_at: Optional[datetime]
    has_result: bool


class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime


class SessionDetailResponse(BaseModel):
    id: int
    title: str
    status: str
    created_at: datetime
    completed_at: Optional[datetime]
    has_result: bool
    messages: List[MessageResponse]


@router.post("/sessions", response_model=SessionResponse)
async def create_session(
    request: CreateSessionRequest,
    db: AsyncSession = Depends(get_db)
):
    """Create a new research session"""

    # Generate title from query (first 60 chars)
    title = request.initial_query[:60] + ("..." if len(request.initial_query) > 60 else "")

    session = ResearchSession(
        title=title,
        status='active'
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    # Add initial user message
    message = ResearchMessage(
        session_id=session.id,
        role='user',
        content=request.initial_query
    )
    db.add(message)
    await db.commit()

    return SessionResponse(
        id=session.id,
        title=session.title,
        status=session.status,
        created_at=session.created_at,
        completed_at=session.completed_at,
        has_result=session.result_path is not None
    )


@router.get("/sessions", response_model=List[SessionResponse])
async def list_sessions(db: AsyncSession = Depends(get_db)):
    """List all research sessions"""
    result = await db.execute(
        select(ResearchSession).order_by(desc(ResearchSession.created_at))
    )
    sessions = result.scalars().all()

    return [
        SessionResponse(
            id=s.id,
            title=s.title,
            status=s.status,
            created_at=s.created_at,
            completed_at=s.completed_at,
            has_result=s.result_path is not None
        )
        for s in sessions
    ]


@router.get("/sessions/{session_id}", response_model=SessionDetailResponse)
async def get_session(
    session_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific research session with messages"""
    result = await db.execute(
        select(ResearchSession).where(ResearchSession.id == session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return SessionDetailResponse(
        id=session.id,
        title=session.title,
        status=session.status,
        created_at=session.created_at,
        completed_at=session.completed_at,
        has_result=session.result_path is not None,
        messages=[
            MessageResponse(
                id=m.id,
                role=m.role,
                content=m.content,
                created_at=m.created_at
            )
            for m in session.messages
        ]
    )


@router.post("/sessions/{session_id}/messages")
async def send_message(
    session_id: int,
    request: SendMessageRequest,
    db: AsyncSession = Depends(get_db)
):
    """Send a message in a research session"""
    result = await db.execute(
        select(ResearchSession).where(ResearchSession.id == session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Add user message
    message = ResearchMessage(
        session_id=session.id,
        role='user',
        content=request.message
    )
    db.add(message)
    await db.commit()

    return {"status": "message_added"}


@router.get("/sessions/{session_id}/stream")
async def stream_research(
    session_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Stream deep research progress using SSE"""

    result = await db.execute(
        select(ResearchSession).where(ResearchSession.id == session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get API key
    api_result = await db.execute(
        select(AppConfig).where(AppConfig.key == "api_key")
    )
    config = api_result.scalar_one_or_none()
    api_key = config.value if config else ""

    if not api_key:
        raise HTTPException(status_code=400, detail="API key not configured")

    # Get all messages for context
    msg_result = await db.execute(
        select(ResearchMessage)
        .where(ResearchMessage.session_id == session_id)
        .order_by(ResearchMessage.created_at)
    )
    messages = msg_result.scalars().all()

    async def event_generator():
        try:
            from openai import AsyncOpenAI

            client = AsyncOpenAI(api_key=api_key)

            # Build conversation history
            conversation = []
            user_query = ""
            for msg in messages:
                if msg.role == 'user':
                    user_query = msg.content
                    conversation.append({
                        "role": "user",
                        "content": [{"type": "input_text", "text": msg.content}]
                    })
                elif msg.role == 'assistant':
                    conversation.append({
                        "role": "assistant",
                        "content": [{"type": "output_text", "text": msg.content}]
                    })

            # Check if we need clarification first (only if this is the first user message)
            if len(messages) == 1 and messages[0].role == 'user':
                yield {
                    "event": "status",
                    "data": json.dumps({"status": "analyzing_query", "message": "Analyzing your query..."})
                }

                # Use GPT-4 to determine if we need clarification
                clarification_check = await client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {
                            "role": "system",
                            "content": "You are a research assistant. Determine if the following query needs clarification. If it's clear and specific, respond with 'CLEAR'. If you need more information, ask 1-2 specific follow-up questions. Be concise."
                        },
                        {
                            "role": "user",
                            "content": user_query
                        }
                    ],
                    max_tokens=200
                )

                clarification_response = clarification_check.choices[0].message.content.strip()

                # If not clear, ask for clarification
                if not clarification_response.startswith("CLEAR"):
                    # Save assistant clarification message
                    async with AsyncSessionLocal() as new_db:
                        clarification_msg = ResearchMessage(
                            session_id=session_id,
                            role='assistant',
                            content=clarification_response
                        )
                        new_db.add(clarification_msg)
                        await new_db.commit()

                    yield {
                        "event": "clarification",
                        "data": json.dumps({"message": clarification_response})
                    }

                    yield {
                        "event": "done",
                        "data": json.dumps({"status": "awaiting_response"})
                    }
                    return

            # Proceed with deep research
            yield {
                "event": "status",
                "data": json.dumps({"status": "starting_research", "message": "Starting deep research..."})
            }

            # Build the research query from conversation
            research_query = user_query

            # Call deep research API with streaming
            yield {
                "event": "status",
                "data": json.dumps({"status": "researching", "message": "Performing web searches..."})
            }

            # Use responses.create for deep research
            response = await client.responses.create(
                model="o3-deep-research-2025-06-26",
                input=[
                    {
                        "role": "user",
                        "content": [{"type": "input_text", "text": research_query}]
                    }
                ],
                reasoning={"summary": "auto"},
                tools=[
                    {"type": "web_search_preview"},
                    {"type": "code_interpreter"}
                ]
            )

            # Process the response output
            final_report = ""
            reasoning_steps = []
            web_searches = []

            for item in response.output:
                if hasattr(item, 'type'):
                    if item.type == "reasoning":
                        # Extract reasoning summary
                        if hasattr(item, 'summary'):
                            for summary_item in item.summary:
                                if hasattr(summary_item, 'text'):
                                    reasoning_steps.append(summary_item.text)
                                    yield {
                                        "event": "thinking",
                                        "data": json.dumps({"text": summary_item.text})
                                    }

                    elif item.type == "web_search_call":
                        # Extract web search query
                        if hasattr(item, 'action'):
                            query = item.action.get('query', '')
                            web_searches.append(query)
                            yield {
                                "event": "web_search",
                                "data": json.dumps({"query": query})
                            }

                    elif item.type == "message":
                        # This is likely the final report
                        if hasattr(item, 'content'):
                            for content_item in item.content:
                                if hasattr(content_item, 'text'):
                                    final_report = content_item.text

            # If no final report found, try to get it from the last item
            if not final_report and response.output:
                last_item = response.output[-1]
                if hasattr(last_item, 'content'):
                    for content_item in last_item.content:
                        if hasattr(content_item, 'text'):
                            final_report = content_item.text

            yield {
                "event": "status",
                "data": json.dumps({"status": "finalizing", "message": "Generating final report..."})
            }

            # Generate descriptive filename using GPT-4o
            try:
                filename_prompt = f"""Based on this research query, create a short, descriptive filename of 1-4 words that captures the topic. Use only lowercase letters, numbers, and underscores. No file extension.

Query: {research_query[:500]}

Examples:
- "climate_change_impact"
- "ai_healthcare"
- "quantum_computing"
- "mars_exploration"

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
                import re
                filename_base = re.sub(r'[^a-z0-9_]', '', filename_base.lower())
                if not filename_base or len(filename_base) < 2:
                    # Fallback to session ID
                    filename_base = f"research_{session_id}"
            except:
                # Fallback if GPT-4o fails
                filename_base = f"research_{session_id}"

            filename = f"{filename_base}.txt"
            filepath = RESEARCH_DIR / filename

            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(f"Research Query: {research_query}\n")
                f.write(f"Date: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')}\n")
                f.write("=" * 80 + "\n\n")
                f.write(final_report)

            # Update session in database
            from ..database import AsyncSessionLocal
            async with AsyncSessionLocal() as new_db:
                result = await new_db.execute(
                    select(ResearchSession).where(ResearchSession.id == session_id)
                )
                db_session = result.scalar_one_or_none()
                if db_session:
                    db_session.status = 'completed'
                    db_session.completed_at = datetime.utcnow()
                    db_session.result_path = str(filepath)
                    await new_db.commit()

                # Save assistant response
                assistant_msg = ResearchMessage(
                    session_id=session_id,
                    role='assistant',
                    content=final_report
                )
                new_db.add(assistant_msg)
                await new_db.commit()

            yield {
                "event": "result",
                "data": json.dumps({
                    "report": final_report,
                    "download_url": f"/api/research/sessions/{session_id}/download"
                })
            }

            yield {
                "event": "done",
                "data": json.dumps({"status": "completed"})
            }

        except Exception as e:
            # Update session status to failed
            from ..database import AsyncSessionLocal
            async with AsyncSessionLocal() as new_db:
                result = await new_db.execute(
                    select(ResearchSession).where(ResearchSession.id == session_id)
                )
                db_session = result.scalar_one_or_none()
                if db_session:
                    db_session.status = 'failed'
                    await new_db.commit()

            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)})
            }

    return EventSourceResponse(event_generator())


@router.get("/sessions/{session_id}/download")
async def download_research(
    session_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Download research result as .txt file"""
    from fastapi.responses import FileResponse

    result = await db.execute(
        select(ResearchSession).where(ResearchSession.id == session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.result_path:
        raise HTTPException(status_code=404, detail="Research result not available")

    filepath = Path(session.result_path)
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=filepath,
        filename=filepath.name,
        media_type='text/plain'
    )


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Delete a research session"""
    result = await db.execute(
        select(ResearchSession).where(ResearchSession.id == session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Delete result file if exists
    if session.result_path:
        filepath = Path(session.result_path)
        if filepath.exists():
            filepath.unlink()

    # Delete from database (cascade will handle messages)
    await db.delete(session)
    await db.commit()

    return {"status": "deleted"}
