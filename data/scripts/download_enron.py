"""Download the Enron email corpus from CMU."""
import os
import sys
import tarfile
import urllib.request
from pathlib import Path

ENRON_URL = "https://www.cs.cmu.edu/~enron/enron_mail_20110402.tgz"
RAW_DIR = Path(__file__).parent.parent / "raw"


def download():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    archive_path = RAW_DIR / "enron_mail.tgz"

    if (RAW_DIR / "maildir").exists():
        print("Enron maildir already exists, skipping download.")
        return

    if not archive_path.exists():
        print(f"Downloading Enron corpus from {ENRON_URL}...")
        print("This is ~423MB and may take a while.")
        urllib.request.urlretrieve(ENRON_URL, archive_path, _progress)
        print("\nDownload complete.")
    else:
        print("Archive already downloaded.")

    print("Extracting...")
    with tarfile.open(archive_path, "r:gz") as tar:
        tar.extractall(path=RAW_DIR)
    print("Extraction complete.")

    # Clean up archive
    archive_path.unlink()
    print(f"Enron maildir available at: {RAW_DIR / 'maildir'}")


def _progress(block_num, block_size, total_size):
    downloaded = block_num * block_size
    pct = downloaded * 100 / total_size
    sys.stdout.write(f"\r  {pct:.1f}% ({downloaded // (1024*1024)}MB / {total_size // (1024*1024)}MB)")
    sys.stdout.flush()


if __name__ == "__main__":
    download()
