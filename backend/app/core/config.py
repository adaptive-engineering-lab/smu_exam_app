from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SMU Exam Backend"
    debug: bool = True
    database_url: str = "postgresql://pgadmin:password@localhost:5432/smu_exam"
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # Storage
    storage_dir: str = "./submissions"
    use_azure_storage: bool = False
    azure_storage_connection_string: str = ""
    azure_storage_container: str = "submissions"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
