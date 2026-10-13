"""Собирает выпуск комплекта из репозитория: MANIFEST.json, ZIP и файл для агента.

Использование: python3 scripts/build-kit.py [--date ГГГГ-ММ-ДД]

Состав комплекта — файлы репозитория (отслеживаемые и новые, не игнорируемые),
кроме служебных: .gitignore, scripts/, release/. Метаданные манифеста (плагины,
тема, проверенная среда) правятся вручную в MANIFEST.json; скрипт обновляет в нём
version, created и files.

Результат в release/:
  08-BB-VADIM-KIT.zip    — детерминированный ZIP с папкой bb-vadim-kit/
  08-BB-VADIM-SETUP.md   — копия GUIDE.md
  08-BB-AGENT-SETUP.md   — файл для агента со встроенным ZIP
  SHA256SUMS.txt         — суммы всех файлов release/
  catalog.json           — копия каталога для сайта (в корне репозитория — тот же файл)

В catalog.json сборщик сам проставляет version, tag, адрес архива и гайда на теге и версии
плагинов из их package.json; остальное (тексты, разделы, промпты) правится вручную.
"""
import argparse
import base64
import hashlib
import json
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RELEASE = ROOT / "release"
PREFIX = "bb-vadim-kit"
SERVICE = (".gitignore", "scripts/", "release/")


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def kit_files() -> list[str]:
    out = subprocess.run(
        ["git", "-C", str(ROOT), "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        check=True, capture_output=True,
    ).stdout.decode()
    paths = set()
    for p in out.split("\0"):
        if not p or p == "MANIFEST.json" or p.endswith(".DS_Store") or p.startswith(SERVICE):
            continue
        f = ROOT / p
        if f.is_symlink():
            raise SystemExit(f"symlink in kit: {p}")
        if f.is_file():
            paths.add(p)
    return sorted(paths)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", help="дата выпуска; по умолчанию — из прошлого манифеста")
    args = ap.parse_args()

    version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    manifest = json.loads((ROOT / "MANIFEST.json").read_text(encoding="utf-8"))
    date = args.date or manifest["created"]
    stamp = tuple(int(x) for x in date.split("-")) + (0, 0, 0)

    catalog_path = ROOT / "catalog.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    tag = f"v{version}"
    repo = catalog["repository"]
    catalog.update({"version": version, "tag": tag, "guide": f"{repo}/blob/{tag}/GUIDE.md"})
    catalog["archive"]["url"] = f"{repo}/releases/download/{tag}/{catalog['archive']['name']}"
    for item in catalog["items"]:
        pkg = ROOT / "plugins" / item["id"] / "package.json"
        if pkg.exists():
            item["version"] = json.loads(pkg.read_text(encoding="utf-8"))["version"]
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    files = kit_files()
    manifest.update({"version": version, "created": date})
    manifest["files"] = [
        {"path": p, "bytes": (ROOT / p).stat().st_size, "sha256": sha((ROOT / p).read_bytes())} for p in files
    ]
    (ROOT / "MANIFEST.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    RELEASE.mkdir(exist_ok=True)
    zip_out = RELEASE / "08-BB-VADIM-KIT.zip"
    tmp_zip = zip_out.with_suffix(".zip.tmp")
    entries = sorted(files + ["MANIFEST.json"])
    with zipfile.ZipFile(tmp_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in entries:
            info = zipfile.ZipInfo(f"{PREFIX}/{p}", date_time=stamp)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, (ROOT / p).read_bytes())
    with zipfile.ZipFile(tmp_zip) as z:
        if z.testzip():
            raise SystemExit("CRC error in zip")
        names = z.namelist()
        if len(names) != len(set(names)) or any(n.startswith("/") or ".." in n.split("/") for n in names):
            raise SystemExit("bad paths in zip")
    tmp_zip.replace(zip_out)
    zip_bytes = zip_out.read_bytes()
    zip_sha = sha(zip_bytes)

    guide = (ROOT / "GUIDE.md").read_bytes()
    (RELEASE / "08-BB-VADIM-SETUP.md").write_bytes(guide)
    (RELEASE / "catalog.json").write_bytes(catalog_path.read_bytes())

    env = manifest.get("checked_environment", [{}])
    env = env[0] if isinstance(env, list) else env
    task_body = (ROOT / "AGENT-TASK.md").read_text(encoding="utf-8").split("## Порядок", 1)[1]
    b64 = base64.b64encode(zip_bytes).decode()
    b64_lines = "\n".join(b64[i:i + 100] for i in range(0, len(b64), 100))
    extract_js = (ROOT / "scripts" / "extract-kit.mjs").read_text(encoding="utf-8").rstrip("\n")
    agent = f"""# Настрой bb как у Вадима — файл для кодингового агента

Last Updated: {date}
KIT_SHA256: {zip_sha}
Комплект {version}: bb {env.get("bb", "?")}/macOS, {len(entries)} файлов. Windows проверена Вадимом 08.10 на
bb 0.45.0 (маршрут не уточнён); Linux-сервер — по документации, не испытан. ZIP встроен в конец этого файла.

Это необязательный вариант для случая, когда ZIP передать нельзя. Обычный путь — распаковать
`08-BB-VADIM-KIT.zip` и дать агенту `AGENT-TASK.md` из него.

## Как передать

Прикрепите **только этот файл** к треду bb и напишите:

> Настрой мой bb по этому файлу. Прочитай текст до раздела «Встроенный комплект», а большой
> Base64-блок извлеки скриптом из раздела «Извлечение», не выводя его в чат. Распакуй ZIP в
> постоянную папку на компьютере, где работает сервер bb, и выполни порядок ниже. Сохрани мои
> текущие настройки и правила. В конце покажи, что работает и что осталось проверить мне.

bb и хотя бы один агент уже должны работать. Вход в аккаунты выполняет пользователь;
этот файл не содержит учётных данных.

## Извлечение

Скрипт использует только стандартные модули Node.js и работает на macOS, Linux и Windows.
Он проверяет SHA-256 и не перезаписывает чужой файл.

```text
node extract-kit.mjs "ПУТЬ_К_ЭТОМУ_ФАЙЛУ.md" "ПУТЬ_ДЛЯ_КОМПЛЕКТА.zip"
```

```js
{extract_js}
```

Распаковка: macOS — `ditto -x -k КОМПЛЕКТ.zip ПАПКА`, Linux — `unzip КОМПЛЕКТ.zip -d ПАПКА`,
Windows — `Expand-Archive -LiteralPath КОМПЛЕКТ.zip -DestinationPath ПАПКА`. Внутри — папка
`{PREFIX}`: читай её `AGENT-TASK.md` и `GUIDE.md`.

## Порядок{task_body.rstrip()}

## Встроенный комплект

Этот раздел предназначен скрипту извлечения. Не выводи Base64 в ответы,
логи или контекст модели. Комплект не включает аккаунты и личные данные.

<!-- BB_KIT_BASE64_BEGIN -->
{b64_lines}
<!-- BB_KIT_BASE64_END -->
"""
    (RELEASE / "08-BB-AGENT-SETUP.md").write_text(agent, encoding="utf-8")

    sums = [f"{sha(p.read_bytes())}  {p.name}" for p in sorted(RELEASE.iterdir())
            if p.is_file() and p.name != "SHA256SUMS.txt" and not p.name.startswith(".")]
    (RELEASE / "SHA256SUMS.txt").write_text("\n".join(sums) + "\n", encoding="utf-8")

    print(json.dumps({"version": version, "date": date, "files_in_zip": len(entries),
                      "zip_bytes": len(zip_bytes), "zip_sha256": zip_sha}, ensure_ascii=False))


if __name__ == "__main__":
    main()
