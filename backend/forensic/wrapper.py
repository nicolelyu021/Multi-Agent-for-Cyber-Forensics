"""Decorator-based forensic wrapper for LangGraph nodes and tool functions.

Intercepts agent/tool execution to produce ForensicRecords with:
- Pre-hook: logs entry state + intent
- Post-hook: logs output + reasoning
- Hash chain: links sequential records
"""
import functools
import json
import uuid
from datetime import datetime

from forensic.schema import ForensicRecord
from forensic.store import append_forensic_record
from forensic.hasher import hash_tool_call


def forensic_agent(agent_id: str):
    """Decorator for LangGraph node functions. Logs agent_start and agent_end events."""

    def decorator(func):
        @functools.wraps(func)
        async def wrapper(state: dict, *args, **kwargs):
            trace_id = state.get("root_trace_id", str(uuid.uuid4()))
            span_id = str(uuid.uuid4())

            # Pre-hook: agent_start
            start_record = ForensicRecord(
                trace_id=trace_id,
                span_id=span_id,
                agent_id=agent_id,
                event_type="agent_start",
                reasoning_summary=f"Agent {agent_id} starting with state keys: {list(state.keys())}",
                datasets_accessed=json.dumps(state.get("datasets_accessed", [])),
            )
            await append_forensic_record(start_record)

            # Execute the actual agent function
            result = await func(state, *args, **kwargs)

            # Post-hook: agent_end
            end_record = ForensicRecord(
                trace_id=trace_id,
                span_id=str(uuid.uuid4()),
                parent_span_id=span_id,
                agent_id=agent_id,
                event_type="agent_end",
                reasoning_summary=result.get("reasoning_summary", ""),
                confidence_score=result.get("confidence_score"),
                proposed_action=result.get("proposed_action"),
            )
            await append_forensic_record(end_record)

            return result

        return wrapper

    return decorator


def forensic_tool(tool_name: str, agent_id: str):
    """Decorator for tool functions. Logs tool_call events with SHA-256 hashes."""

    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            trace_id = kwargs.get("trace_id", "unknown")
            tool_input = json.dumps({"args": [str(a) for a in args], "kwargs": {k: str(v) for k, v in kwargs.items() if k != "trace_id"}})

            # Execute tool
            result = await func(*args, **kwargs)
            tool_output = json.dumps(result, default=str) if not isinstance(result, str) else result

            # Compute tool call hash
            call_hash = hash_tool_call(tool_name, tool_input, tool_output)

            record = ForensicRecord(
                trace_id=trace_id,
                agent_id=agent_id,
                event_type="tool_call",
                tool_name=tool_name,
                tool_input=tool_input,
                tool_output=tool_output[:50000],  # Preserve full email data for reports
                tool_call_hash=call_hash,
            )
            await append_forensic_record(record)

            return result

        return wrapper

    return decorator
