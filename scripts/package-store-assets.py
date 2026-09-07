"""Package the original store artwork and listing text for a GitHub release."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / "package.json").read_text(encoding="utf-8"))["version"]
output = root / "release-artifacts"
output.mkdir(exist_ok=True)
files = {
    "app-icon.png": root / "public/app-icon.png",
    "STORE_LISTING.md": root / "ugreen/STORE_LISTING.md",
}
for image in sorted((root / "public/store-listing").glob("*/*.png")):
    files[image.relative_to(root / "public/store-listing").as_posix()] = image
assert len(files) == 8, "Expected an icon, listing text and six detail images"
checksums = "".join(
    f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {name}\n"
    for name, path in files.items()
)
archive = output / f"KOLFlow-v{version}-ugreen-store-assets.zip"
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
    for name, path in files.items():
        bundle.write(path, name)
    bundle.writestr("SHA256SUMS-ASSETS", checksums)
print(archive.name)
