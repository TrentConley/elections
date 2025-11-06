from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Dict, List, Optional
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, validator


ADMIN_KEYWORD = os.getenv("ADMIN_KEYWORD", "TrentAdmin")
ADMIN_HEADER_NAME = "X-Admin-Key"


class PollStatus(str):
    OPEN = "open"
    CLOSED = "closed"


@dataclass
class PollOptionRecord:
    id: str
    label: str
    votes: int = 0


@dataclass
class PollRecord:
    id: str
    title: str
    status: str = PollStatus.OPEN
    created_at: datetime = field(default_factory=datetime.utcnow)
    closed_at: Optional[datetime] = None
    options: Dict[str, PollOptionRecord] = field(default_factory=dict)
    voters: Dict[str, str] = field(default_factory=dict)


class LoginRequest(BaseModel):
    name: str

    @validator("name")
    def validate_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("Name is required")
        return name


class LoginResponse(BaseModel):
    name: str
    role: str
    admin_key: Optional[str] = None


class PollOption(BaseModel):
    id: str
    label: str
    votes: int


class PollResponse(BaseModel):
    id: str
    title: str
    status: str
    created_at: datetime
    closed_at: Optional[datetime] = None
    options: List[PollOption]


class CreatePollRequest(BaseModel):
    title: str
    options: List[str]

    @validator("title")
    def validate_title(cls, value: str) -> str:
        title = value.strip()
        if not title:
            raise ValueError("Title is required")
        return title

    @validator("options")
    def validate_options(cls, value: List[str]) -> List[str]:
        cleaned = [opt.strip() for opt in value if opt.strip()]
        unique = []
        seen = set()
        for option in cleaned:
            lower = option.lower()
            if lower not in seen:
                seen.add(lower)
                unique.append(option)
        if len(unique) < 2:
            raise ValueError("At least two unique options are required")
        return unique


class VoteRequest(BaseModel):
    voter_name: str
    option_id: str

    @validator("voter_name")
    def validate_voter_name(cls, value: str) -> str:
        voter = value.strip()
        if not voter:
            raise ValueError("Voter name is required")
        return voter


class PollStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._polls: Dict[str, PollRecord] = {}

    def _to_response(self, record: PollRecord) -> PollResponse:
        options = [
            PollOption(id=option.id, label=option.label, votes=option.votes)
            for option in record.options.values()
        ]
        options.sort(key=lambda opt: opt.label.lower())
        return PollResponse(
            id=record.id,
            title=record.title,
            status=record.status,
            created_at=record.created_at,
            closed_at=record.closed_at,
            options=options,
        )

    def all_polls(self) -> List[PollResponse]:
        with self._lock:
            records = list(self._polls.values())
        records.sort(key=lambda poll: poll.created_at, reverse=True)
        return [self._to_response(record) for record in records]

    def create_poll(self, title: str, options: List[str]) -> PollResponse:
        with self._lock:
            poll_id = uuid4().hex
            option_records = {}
            for label in options:
                option_id = uuid4().hex
                option_records[option_id] = PollOptionRecord(id=option_id, label=label)
            poll = PollRecord(id=poll_id, title=title, options=option_records)
            self._polls[poll_id] = poll
        return self._to_response(poll)

    def close_poll(self, poll_id: str) -> PollResponse:
        with self._lock:
            poll = self._polls.get(poll_id)
            if not poll:
                raise KeyError("Poll not found")
            poll.status = PollStatus.CLOSED
            poll.closed_at = datetime.utcnow()
        return self._to_response(poll)

    def vote(self, poll_id: str, voter_name: str, option_id: str) -> PollResponse:
        voter_key = voter_name.strip().lower()
        with self._lock:
            poll = self._polls.get(poll_id)
            if not poll:
                raise KeyError("Poll not found")
            if poll.status != PollStatus.OPEN:
                raise ValueError("Poll is closed")
            if voter_key in poll.voters:
                raise ValueError("This voter has already voted in this poll")
            option = poll.options.get(option_id)
            if not option:
                raise ValueError("Option not found")
            option.votes += 1
            poll.voters[voter_key] = option_id
        return self._to_response(poll)


poll_store = PollStore()

app = FastAPI(title="Quick Election Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


def require_admin(x_admin_key: str = Header(None, alias=ADMIN_HEADER_NAME)) -> None:
    if not x_admin_key or x_admin_key != ADMIN_KEYWORD:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")


@app.post("/api/login", response_model=LoginResponse)
def login(payload: LoginRequest) -> LoginResponse:
    name = payload.name
    if name == ADMIN_KEYWORD:
        return LoginResponse(name=name, role="admin", admin_key=ADMIN_KEYWORD)
    return LoginResponse(name=name, role="participant")


@app.get("/api/polls", response_model=List[PollResponse])
def list_polls() -> List[PollResponse]:
    return poll_store.all_polls()


@app.post("/api/polls", response_model=PollResponse, status_code=status.HTTP_201_CREATED)
def create_poll(payload: CreatePollRequest, _: None = Depends(require_admin)) -> PollResponse:
    try:
        return poll_store.create_poll(payload.title, payload.options)
    except ValueError as exc:  # pragma: no cover - explicit message passed to user
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@app.post("/api/polls/{poll_id}/vote", response_model=PollResponse)
def vote(poll_id: str, payload: VoteRequest) -> PollResponse:
    try:
        return poll_store.vote(poll_id, payload.voter_name, payload.option_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@app.post("/api/polls/{poll_id}/close", response_model=PollResponse)
def close_poll(poll_id: str, _: None = Depends(require_admin)) -> PollResponse:
    try:
        return poll_store.close_poll(poll_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@app.get("/api/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


static_dir = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")
else:

    @app.get("/", response_class=HTMLResponse)
    def placeholder() -> str:
        return "<!DOCTYPE html><html><head><title>Quick Elections</title></head><body><p>Frontend not built yet.</p></body></html>"


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)

