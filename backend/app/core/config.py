from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SMU Exam Backend"
    debug: bool = True
    database_url: str = "postgresql://pgadmin:password@localhost:5432/smu_exam"

    # Supabase
    supabase_url: str = ""
    supabase_service_role_key: str = ""  # for admin API calls (Settings > API > service_role)
    supabase_jwt_secret: str = ""        # for JWT verification (Settings > API > JWT Settings)
    supabase_storage_bucket: str = "submissions"
    use_supabase_storage: bool = True

    frontend_url: str = "http://localhost:5173"
    allowed_origins: list[str] = ["http://localhost:5173", "http://localhost:5174"]

    # Local filesystem fallback for PDF storage (when use_supabase_storage=false)
    storage_dir: str = "./submissions"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
