from supabase import create_client, Client

from app.core.config import settings


def create_admin_client() -> Client:
    """Create a Supabase client authenticated with the service role key (admin privileges)."""
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
