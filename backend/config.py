from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import AnyHttpUrl, field_validator


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    ENVIRONMENT: str = 'development'
    SESSION_SECRET: str
    FRONTEND_ORIGIN: AnyHttpUrl = 'http://localhost:3000'
    ADMIN_USER: str = 'admin'
    ADMIN_PASS_HASH: str
    STREAM_KEY: str = 'mystream'
    HTTP_PORT: int = 3000
    RTMP_PORT: int = 1935
    HLS_PATH: str = './media/hls'
    NGINX_CONFIG_TEMPLATE: str = 'nginx.conf.j2'
    RTMP_PUBLIC_URL: str | None = None
    FFMPEG_PATH: str = 'ffmpeg'

    @field_validator('SESSION_SECRET')
    @classmethod
    def validate_session_secret(cls, v: str) -> str:
        if len(v) < 64:
            raise ValueError('SESSION_SECRET must be at least 64 characters long')
        return v

    @field_validator('ENVIRONMENT')
    @classmethod
    def validate_environment(cls, v: str) -> str:
        if v not in ('development', 'production'):
            raise ValueError('ENVIRONMENT must be development or production')
        return v


settings = Settings()

