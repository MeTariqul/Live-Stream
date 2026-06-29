from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime
import re


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=100)


class SignupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=30)
    password: str = Field(min_length=6, max_length=100)

    @field_validator('username')
    @classmethod
    def validate_username(cls, v: str) -> str:
        if not re.match(r'^[a-zA-Z0-9_]+$', v):
            raise ValueError('Username must be alphanumeric + underscore')
        return v


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=6, max_length=100)


class DeleteAccountRequest(BaseModel):
    password: str = Field(min_length=1)


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


class ReminderCreate(BaseModel):
    program_id: str


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


class ParentalPinRequest(BaseModel):
    pin: str = Field(min_length=4, max_length=10)


class SetParentalPinRequest(BaseModel):
    pin: str = Field(min_length=4, max_length=10)
    current_password: str = Field(min_length=1)


class RecordingsUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    published: Optional[bool] = None


class UserTierUpdate(BaseModel):
    tier: str = Field(pattern=r'^(basic|premium)$')


class SubtitleUploadResponse(BaseModel):
    url: str
    language: str
    label: str
