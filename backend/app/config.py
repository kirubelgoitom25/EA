from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    supabase_url: str
    access_token_expire_minutes: int = 60
    # Reaches the private payment-proofs bucket. Bypasses all database security, so it
    # lives only in the backend's environment, never in Expo or Vite variables.
    supabase_service_role_key: str = ""
    # Comma-separated extra browser origins, such as the hosted teacher dashboard.
    cors_origins: str = ""
    # The calendar day streaks count in (see app/clock.py).
    app_timezone: str = "Africa/Addis_Ababa"
    # Students sign up with a phone and username. Supabase still needs an email for every
    # account, so each student gets a hidden internal address on this domain. The default is
    # under ".invalid", a name reserved by RFC 2606/6761 that can never exist, so mail to these
    # addresses can never reach anyone and nothing has to be bought. Supabase's admin "create
    # user" checks only the address format (no DNS). Set it empty to turn registration off
    # (the route then answers 503). Never change it once students exist: their logins use it.
    student_email_domain: str = "students.ea.invalid"
    # Signs the stand-in login addresses for unknown phones and usernames, so the login
    # form never reveals which accounts exist. Falls back to the service key.
    login_lookup_secret: str = ""

    model_config = SettingsConfigDict(env_file=".env")

    @property
    def supabase_issuer(self) -> str:
        return f"{self.supabase_url}/auth/v1"

    @property
    def supabase_jwks_url(self) -> str:
        return f"{self.supabase_url}/auth/v1/.well-known/jwks.json"


settings = Settings()
