from pydantic import BaseModel, Field, field_validator


class LoginRequest(BaseModel):
    username: str = Field(..., max_length=50, pattern=r'^[a-zA-Z0-9_-]+$')
    password: str = Field(..., max_length=128)


class LoginResponse(BaseModel):
    success: bool = True


class ErrorResponse(BaseModel):
    success: bool = False
    error: str | None = None
    detail: str | None = None


class StreamStatusResponse(BaseModel):
    isLive: bool
    viewers: int


class StreamKeyResponse(BaseModel):
    streamKey: str
    rtmpUrl: str


class StreamStartPayload(BaseModel):
    name: str
    addr: str | None = None
    clientid: str | None = None

    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        return v.strip()


class ChatMessage(BaseModel):
    nickname: str = Field(..., max_length=30)
    message: str = Field(..., max_length=500)


class WebSocketMessage(BaseModel):
    action: str
    nickname: str | None = None
    message: str | None = None
