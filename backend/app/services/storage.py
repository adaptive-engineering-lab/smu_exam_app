"""
PDF storage service.
Dispatches to Supabase Storage (default) or local filesystem.
Set USE_SUPABASE_STORAGE=false to use local disk instead.
"""

import os

from app.core.config import settings


def save_pdf(attempt_id: str, pdf_bytes: bytes) -> str:
    """Saves PDF and returns the storage path/URL."""
    if settings.use_supabase_storage:
        return _save_to_supabase(attempt_id, pdf_bytes)
    return _save_to_local(attempt_id, pdf_bytes)


def _save_to_local(attempt_id: str, pdf_bytes: bytes) -> str:
    os.makedirs(settings.storage_dir, exist_ok=True)
    path = os.path.join(settings.storage_dir, f"{attempt_id}.pdf")
    with open(path, "wb") as f:
        f.write(pdf_bytes)
    return path


def _save_to_supabase(attempt_id: str, pdf_bytes: bytes) -> str:
    from app.core.supabase_client import create_admin_client

    sb = create_admin_client()
    blob_path = f"{attempt_id}.pdf"
    sb.storage.from_(settings.supabase_storage_bucket).upload(
        blob_path,
        pdf_bytes,
        {"content-type": "application/pdf", "upsert": "true"},
    )
    return sb.storage.from_(settings.supabase_storage_bucket).get_public_url(blob_path)
