from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    gfw_api_key: str = ""
    gfw_api_base_url: str = "https://data-api.globalforestwatch.org"
    gfw_alerts_lookback_days: int = 365

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


def get_settings() -> Settings:
    return Settings()
