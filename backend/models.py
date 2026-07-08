from pydantic import BaseModel, Field, field_validator
from typing import Optional


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=100)


class CreateChannelRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    category: Optional[str] = None
    order: Optional[int] = None
    is_mature: bool = False


class UpdateChannelRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    category: Optional[str] = None
    order: Optional[int] = None
    is_mature: Optional[bool] = None


class ProgramCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = ''
    start_datetime: str
    end_datetime: str
    episode_number: Optional[int] = None
    genre: Optional[str] = None
    is_mature: bool = False
    recurring: Optional[str] = None
    recurring_day: Optional[str] = None
    recurring_time: Optional[str] = None


class ProgramUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    start_datetime: Optional[str] = None
    end_datetime: Optional[str] = None
    episode_number: Optional[int] = None
    genre: Optional[str] = None
    is_mature: Optional[bool] = None
    recurring: Optional[str] = None
    recurring_day: Optional[str] = None
    recurring_time: Optional[str] = None


class NotificationCreate(BaseModel):
    message: str = Field(min_length=1, max_length=500)
    channel_id: Optional[str] = None


class SettingsUpdate(BaseModel):
    platform_name: Optional[str] = None
    primary_color: Optional[str] = None
    custom_css: Optional[str] = None
    default_language: Optional[str] = None
    max_login_attempts: Optional[int] = None
    logo_url: Optional[str] = None


class RecordingsUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    published: Optional[bool] = None


class SubtitleUploadResponse(BaseModel):
    url: str
    language: str
    label: str
