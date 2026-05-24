from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "MeetAI Transcriber"
    WHISPER_MODEL: str = "base"          # tiny=~75MB, base=~145MB — both free-tier safe
    WHISPER_DEVICE: str = "cpu"
    WHISPER_COMPUTE: str = "int8"        # int8 = fastest on CPU
    MAX_SESSIONS: int = 50
    CHUNK_DURATION_MS: int = 3000        # send audio every 3s
    CORS_ORIGINS: list = ["*"]

    class Config:
        env_file = ".env"

config = Settings()
