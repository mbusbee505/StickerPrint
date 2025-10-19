from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse
import asyncio
import json

router = APIRouter(prefix="/api", tags=["events"])

# Global event queue for SSE
event_subscribers = []


async def event_generator():
    """Generate SSE events"""
    queue = asyncio.Queue()
    event_subscribers.append(queue)

    try:
        while True:
            event = await queue.get()
            yield {
                "event": event["type"],
                "data": json.dumps(event["data"])
            }
    except asyncio.CancelledError:
        event_subscribers.remove(queue)


@router.get("/events")
async def sse_endpoint():
    """Server-Sent Events endpoint for live updates"""
    return EventSourceResponse(event_generator())


async def broadcast_event(event_type: str, data: dict):
    """Broadcast an event to all SSE subscribers"""
    event = {"type": event_type, "data": data}

    for queue in event_subscribers:
        try:
            await queue.put(event)
        except:
            pass
