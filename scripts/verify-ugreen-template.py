"""Check generated package metadata and legacy/custom mounts before publishing."""
import json
from pathlib import Path
import subprocess
import sys
import yaml

root = Path(__file__).resolve().parents[1]
package = Path(sys.argv[1])
config = json.loads((package / "config.json").read_text(encoding="utf-8"))
params = {p["key"]: p for p in config["installParameters"]["list"]}
data = params["DATA_PATH"]
assert data["paramType"] == 1 and not data["multi"]
assert not data["isRequired"] and data["changeable"]
assert {p["langName"] for p in data["i18ns"]} == {"en-US", "zh-CN"}
invite = params["INVITE_CODE"]
assert invite["miniLength"] == 6 and invite["maxLength"] == 64
assert invite["isRequired"] and invite["changeable"]
descriptions = {p["langName"]: p["description"] for p in invite["i18ns"]}
assert descriptions["zh-CN"] == "请自定义6-64位邀请码，新用户注册 KOLFlow 账号时必须填写此邀请码。"
assert descriptions["en-US"] == "Please define your own 6-64 character invite code. New users must provide this code when registering."
go = sys.argv[2] if len(sys.argv) > 2 else "go"
rendered = subprocess.check_output([
    go, "run", str(root / "scripts/render-ugreen-template.go"),
    str(package / "docker-compose.tmpl"),
], encoding="utf-8")
for case in json.loads(rendered):
    service = yaml.safe_load(case["compose"])["services"]["kolflow"]
    mounts = service["volumes"]
    assert len(mounts) == 1, (case["name"], mounts)
    mount = mounts[0]
    if isinstance(mount, str):
        source, target = mount.rsplit(":", 1)
    else:
        assert mount["type"] == "bind"
        source, target = mount["source"], mount["target"]
    assert source == case["source"] and target == "/app/data", case
    assert service["environment"]["DATA_DIR"] == "/app/data"
    assert service["environment"]["INVITE_CODE"] == "test-invite"
    print(f"PASS {case['name']}: exactly one correct data mount")
print("PASS bilingual installer metadata, optional folder picker and invite-code rules")
