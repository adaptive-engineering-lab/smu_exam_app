from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SMU Exam Backend"
    debug: bool = True
    database_url: str = "postgresql://pgadmin:password@localhost:5432/smu_exam"
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # Email / password reset
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    frontend_url: str = "http://localhost:5173"
    allowed_origins: list[str] = ["http://localhost:5173", "http://localhost:5174"]

    # Storage
    storage_dir: str = "./submissions"
    use_azure_storage: bool = False
    azure_storage_connection_string: str = ""
    azure_storage_container: str = "submissions"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
