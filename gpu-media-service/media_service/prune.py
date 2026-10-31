"""Remove expired private files after Redis job state has expired or settled."""
import os
import shutil
import time
from rq.job import Job
from rq.exceptions import NoSuchJobError

from .config import JOB_RETENTION_SECONDS, ROOT, job_dir, redis_connection

def sweep():
    connection = redis_connection()
    connection.ping()  # Fail closed on Redis connectivity issues.
    ROOT.mkdir(parents=True, exist_ok=True)
    deleted = 0
    for folder in ROOT.iterdir():
        if not folder.is_dir() or folder.is_symlink():
            continue
        try:
            job_dir(folder.name)
        except ValueError:
            continue
        if time.time() - folder.stat().st_mtime < JOB_RETENTION_SECONDS:
            continue
        try:
            job = Job.fetch(folder.name, connection=connection)
            status = job.get_status(refresh=True)
            status = status.value if hasattr(status, "value") else str(status)
            if status not in ("finished", "failed", "canceled", "stopped"):
                continue
            job.delete()
        except NoSuchJobError:
            pass
        shutil.rmtree(folder)
        deleted += 1
    return deleted

if __name__ == "__main__":
    while True:
        try:
            print("media artifacts pruned:", sweep(), flush=True)
        except Exception as exc:
            print("media cleanup deferred (Redis or filesystem unavailable):",
                  type(exc).__name__, flush=True)
        time.sleep(3600)
