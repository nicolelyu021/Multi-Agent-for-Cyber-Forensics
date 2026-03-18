from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional
import uuid


class ForensicRecord(BaseModel):
    trace_id: str
    span_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    parent_span_id: Optional[str] = None
    agent_id: str
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    event_type: str  # agent_start, agent_end, tool_call, llm_call, delegation, inter_agent_deliberation, escalation_alert, human_override
    tool_name: Optional[str] = None
    tool_input: Optional[str] = None
    tool_output: Optional[str] = None
    tool_call_hash: Optional[str] = None
    reasoning_summary: Optional[str] = None
    confidence_score: Optional[float] = None
    proposed_action: Optional[str] = None
    datasets_accessed: Optional[str] = None
    record_hash: Optional[str] = None
    previous_record_hash: Optional[str] = None
