"""
PDF storage service.
Currently writes to local filesystem.
To switch to Azure Blob Storage:
  1. Set USE_AZURE_STORAGE=true in environment
  2. Set AZURE_STORAGE_CONNECTION_STRING and AZURE_STORAGE_CONTAINER in environment
  3. The Azure branch below activates automatically.
"""

import os

from app.core.config import settings


def save_pdf(attempt_id: str, pdf_bytes: bytes) -> str:
    """Saves PDF and returns the storage path/URL."""
    if settings.use_azure_storage:
        return _save_to_azure(attempt_id, pdf_bytes)
    return _save_to_local(attempt_id, pdf_bytes)


def _save_to_local(attempt_id: str, pdf_bytes: bytes) -> str:
    os.makedirs(settings.storage_dir, exist_ok=True)
    path = os.path.join(settings.storage_dir, f"{attempt_id}.pdf")
    with open(path, "wb") as f:
        f.write(pdf_bytes)
    return path


def _save_to_azure(attempt_id: str, pdf_bytes: bytes) -> str:
    from azure.storage.blob import BlobServiceClient

    client = BlobServiceClient.from_connection_string(settings.azure_storage_connection_string)
    container = client.get_container_client(settings.azure_storage_container)
    blob_name = f"submissions/{attempt_id}.pdf"
    container.upload_blob(blob_name, pdf_bytes, overwrite=True)
    return f"https://{client.account_name}.blob.core.windows.net/{settings.azure_storage_container}/{blob_name}"
