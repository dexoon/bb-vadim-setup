# Как установить и настроить bb как у Вадима

Last Updated: 2026-10-11 · Комплект **0.3.0** (история версий — `CHANGELOG.md` в комплекте)
Проверенная среда: **bb 0.46.0, macOS на Apple Silicon** (11.10 плагины комплекта собраны с нуля и прошли
тесты; до 11.10 комплект проверялся на 0.45.0). **Windows проверена Вадимом 08.10.2026** на 0.45.0;
маршрут установки (нативная Windows или WSL) не уточнён. Linux-сервер описан по официальной
документации; на настоящем сервере эти шаги не проверялись.

bb — приложение, в котором вы даёте задания ИИ-агентам и рядом читаете и правите их результаты:
документы, таблицы, папки, терминал. Инструкция ведёт от чистого компьютера до среды как у Вадима.
Она подходит для любых задач: кода, исследований, документов, работы селлера.

Инструкция состоит из двух файлов. Пересылайте **оба**:

- **этот файл** — `08-BB-VADIM-SETUP.md`;
- **комплект** `08-BB-VADIM-KIT.zip` — тема, пять плагинов, шаблоны
  для подключения российских моделей и правила для агентов. Внутри нет ключей, паролей и личных данных.

Внутри ZIP лежит `GUIDE.md` — этот же текст. Команды удобнее копировать оттуда, а не из PDF.
Оба файла собираются из репозитория комплекта `bb-vadim-setup`: в нём та же инструкция (`GUIDE.md`),
история версий и установка плагинов прямо из Git ([раздел 12](#12-мои-плагины-из-комплекта)).

Хотите, чтобы часть 3 сделал агент? После частей 1–2 (bb и агент уже работают) распакуйте ZIP и дайте
агенту файл `AGENT-TASK.md` из корня комплекта — там готовое задание. Если передать ZIP нельзя, есть самодостаточный файл
`08-BB-AGENT-SETUP.md` с комплектом внутри — необязательный вариант, его присылают отдельно.

## Как читать

| Шаг | Что сделать | Раздел |
|---|---|---|
| 1 | Поставить bb на свой компьютер или сервер | Часть 1: [macOS](#2-macos), [Windows](#3-windows), [Linux-сервер](#4-linux-сервер-vps) |
| 2 | Подключить модель: подписка, российское облако или локальная | [Часть 2](#часть-2-подключить-модель) |
| 3 | Настроить как у Вадима: тема, терминал, файлы, редактор Markdown, правила агентам | [Часть 3](#часть-3-настройка-как-у-вадима) |
| 4 | Пользоваться с телефона и проверить, что всё работает | [Часть 4](#часть-4-телефон-проверка-и-ошибки) |

Для первой задачи хватит шагов 1 и 2. Шаг 3 делает работу удобной, его можно пройти позже.

Пометки в тексте: ✅ — проверено на Mac Вадима 04–11.10.2026; ⚠️ — не проверено на чистом
компьютере или на этой системе.

**Где выполнять команды `bb …`.** Команда `bb` есть только **во встроенном терминале bb** — его
открывает Cmd+Shift+Enter на Mac или кнопка терминала в правой панели треда. В обычном Terminal
или PowerShell её нет: там будет «command not found». На Linux-сервере по SSH пишите
`npx --package bb-app bb …` вместо `bb …` или тоже работайте в терминале bb, открытом в браузере.
Остальные команды — `git`, `npm`, `curl`, `pi`, `claude`, `codex` — работают в любом терминале.

## 1. Что получится

| Возможность | Что используется | Откуда |
|---|---|---|
| Агенты Claude Code и Codex по подписке | провайдеры bb | официальные установщики |
| Российские модели Яндекса и Cloud.ru без VPN, локальные модели | агент Pi | установщик Pi + шаблоны из ZIP |
| Цвета интерфейса и подсветка кода | тема `atom-one_vibecom` (One Dark / One Light) | ZIP |
| Терминал рядом с чатом, в том числе с телефона | встроенный терминал + Terminal_vibecom 0.6.2: вкладка в правой панели, исправленная вставка | ZIP |
| Папки, загрузка и скачивание файлов | File Manager 0.9.2 | внешний плагин |
| Дерево проекта или домашней папки, поиск, редактор, операции с файлами; PDF, офис и Markdown открываются рядом с деревом | Explorer_vibecom (копия Files editor 0.1.6) | ZIP |
| Markdown как в Typora, правка, ссылки между файлами и репозиториями | Markdown_vibecom | ZIP |
| Excel, Word, PowerPoint рядом с чатом | Office_vibecom | ZIP |
| Клик по папке в ответе агента открывает её дерево | Folder links_vibecom | ZIP, только macOS и Linux |
| PDF, редактор кода, повторы после лимита, задачи, документы | встроенные плагины bb | уже в bb |
| Основной чекаут, дочерние треды, планы, правила агентам | шаблон `AGENTS.md` | ZIP |
| Работа с телефона | bb Connect через getbb.app | ваш аккаунт bb |

## Часть 1. Установка bb

Выберите свой блок. Если у вас и ноутбук, и сервер, начните с ноутбука.

| Ваш компьютер | Блок |
|---|---|
| Mac на Apple Silicon (M1 и новее) | [2. macOS](#2-macos) |
| Mac на Intel | [2. macOS](#2-macos), шаг 2.2 — отдельная ссылка |
| Windows 11 на Intel или AMD (x64) | [3. Windows](#3-windows), нативная установка (alpha) |
| Windows 10 или Windows на ARM | [3. Windows](#3-windows), маршрут через WSL2 |
| Сервер Linux (VPS) — чтобы агенты работали, пока ноутбук выключен | [4. Linux-сервер](#4-linux-сервер-vps) |

### 2. macOS

**2.1. Откройте Terminal.** `Cmd + Пробел` → наберите `Terminal` → Enter. Команды из блоков
копируйте целиком, вставляйте `Cmd + V` и нажимайте Enter.

**2.2. Поставьте bb.** ✅

1. Откройте [getbb.app](https://getbb.app) и нажмите **Download for macOS**. Скачается
   `bb-<версия>-arm64.dmg` — для Apple Silicon и macOS 13 или новее.
   **Mac на Intel:** приложения для них нет. Пройдите шаги 2.3–2.4 (Git и Node.js), затем запустите
   bb командой `npx bb-app@latest` и откройте в браузере `http://localhost:38886`. На getbb.app этот путь —
   ссылка **Windows, Intel Macs & remote machines**. ⚠️ Не проверено.
2. Откройте файл и перетащите bb в **Applications**. Запустите bb из Launchpad или Spotlight. ⚠️ Окно
   первого запуска на чистом Маке не проверялось.
3. Войдите в аккаунт bb, если приложение попросит: он нужен для доступа с телефона.

**2.3. Проверьте Git.** bb работает с папками-репозиториями через Git.

```bash
git --version
```

Если macOS предложит поставить **Command Line Tools** — согласитесь и дождитесь окончания,
затем повторите команду. Предложение можно вызвать и вручную: `xcode-select --install`.

**2.4. Поставьте Node.js 22.19 или новее.** Он нужен для плагинов из комплекта. Скачайте
установщик **LTS** с [nodejs.org](https://nodejs.org/en/download) и пройдите его. Если у вас уже есть
Homebrew, можно так: `brew install node`. Проверка:

```bash
node --version
npm --version
```

**2.5. Создайте общую папку для репозиториев.** Как в инструкции курса 8.5:

```bash
mkdir -p ~/Developer/_CODE
```

Не кладите её в iCloud Drive и другие синхронизируемые папки.

**2.6. Кириллица в терминале bb.** Откройте терминал внутри bb (раздел 10) и выполните
`echo $LANG`. Если строка пустая, а русские буквы показываются квадратами, добавьте:

```bash
echo 'export LANG=en_US.UTF-8' >> ~/.zshenv
```

и откройте терминал заново. У Вадима эта строка стоит с 26.09. ✅

Дальше — [распакуйте комплект](#распакуйте-комплект) и [подключите модель](#часть-2-подключить-модель).

### 3. Windows

Нативная Windows-версия bb появилась в 0.45.0 и пока имеет статус **alpha**: возможны ошибки.
Она рассчитана на **Windows 11 x64**. Для Windows 10 (версия 2004 и новее) и компьютеров на ARM —
[маршрут через WSL2](https://github.com/get-bb/bb/blob/desktop-v0.45.0/packages/bb-app/README.md#supported-host-environments),
Linux внутри Windows: в PowerShell **от администратора** выполните `wsl --install`, перезагрузите компьютер,
откройте **Ubuntu** из меню Start и пройдите шаги L1–L5 [блока Linux](#4-linux-сервер-vps) прямо в окне
Ubuntu: `ssh` и `scp` не нужны, комплект скопируйте из папки загрузок Windows —
`cp /mnt/c/Users/ИМЯ_В_WINDOWS/Downloads/08-BB-VADIM-KIT.zip ~/ && unzip -o ~/08-BB-VADIM-KIT.zip -d ~/Developer`.
bb откроется в браузере Windows по адресу `http://localhost:38886`; службу systemd и шаг L7 для домашнего
компьютера можно пропустить. В WSL действует профиль Linux, ограничения Windows из шага W5 к нему
не относятся. Репозитории держите внутри Ubuntu (`~/Developer/_CODE`): папки `/mnt/c/…`
работают медленнее. [Установка WSL — Microsoft](https://learn.microsoft.com/windows/wsl/install).
⚠️ Шаги ниже сверены с официальными источниками 04.10, на настоящем компьютере с Windows не выполнялись.

**W1. Откройте PowerShell без прав администратора.** **Start** → наберите `PowerShell` →
**Windows PowerShell**. Не выбирайте **Run as administrator**: в заголовке окна не должно быть
`Administrator`. Codex отказывается запускаться из окна администратора, а установщики сами
попросят права, когда нужно. Проверьте компьютер:

```powershell
Get-CimInstance Win32_OperatingSystem | Select-Object Caption
Get-CimInstance Win32_ComputerSystem | Select-Object SystemType
winget --version
```

Ожидается Windows 11, `x64-based PC` и номер версии `winget`. Если `winget` не найден, поставьте
**App Installer** из Microsoft Store:

```powershell
Start-Process 'ms-windows-store://pdp/?ProductId=9NBLGGH4NNS1'
```

После установки закройте все окна PowerShell и откройте новое.

**W2. Поставьте Git и Node.js, создайте рабочую папку.**

```powershell
winget install --id Git.Git --exact --source winget --accept-source-agreements --accept-package-agreements
winget install --id OpenJS.NodeJS.LTS --exact --source winget --accept-source-agreements --accept-package-agreements
```

Закройте все окна PowerShell, откройте новое и проверьте:

```powershell
git --version
node --version
npm --version
```

Рабочая папка курса — `C:\Developer\_CODE\vibecommerce_code`: короткий путь без кириллицы,
вне «Документов» и OneDrive.

```powershell
$bbProjectPath = 'C:\Developer\_CODE\vibecommerce_code'
New-Item -ItemType Directory -Path $bbProjectPath -Force | Out-Null
Set-Location -LiteralPath $bbProjectPath
Get-Location
```

Существующие файлы эти команды не трогают.

**W3. Поставьте bb.** Блок скачивает установщик 0.45.0 с официального GitHub, проверяет
контрольную сумму и ставит bb для текущего пользователя.

```powershell
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$bbInstallerPath = Join-Path $env:TEMP 'bb-0.45.0-x64.exe'
$bbDownloadUrl = 'https://github.com/get-bb/bb/releases/download/desktop-v0.45.0/bb-0.45.0-x64.exe'
$bbExpectedHash = '9e480f38f4e832ce2c0186fd55f7b796169636da74f6b173b393579f90233da1'

Invoke-WebRequest -Uri $bbDownloadUrl -OutFile $bbInstallerPath -UseBasicParsing
$bbActualHash = (Get-FileHash -Path $bbInstallerPath -Algorithm SHA256).Hash
if ($bbActualHash -ne $bbExpectedHash) {
    throw 'SHA-256 mismatch. Download the installer again before continuing.'
}

$bbInstallProcess = Start-Process -FilePath $bbInstallerPath -ArgumentList '/S' -Wait -PassThru
if ($bbInstallProcess.ExitCode -ne 0) {
    throw "bb installer failed: exit code $($bbInstallProcess.ExitCode)"
}
Write-Host 'bb installation finished.'
```

Скачивание занимает несколько минут и идёт без индикатора. `/S` — установка без мастера, права администратора не нужны: bb ставится в
`%LOCALAPPDATA%\Programs\bb`. Версия зафиксирована, чтобы ссылка и контрольная сумма совпадали;
дальше приложение обновляется само. Установщик не подписан: если скачиваете его браузером и запускаете
двойным щелчком, Windows SmartScreen предупредит — нажмите **More info → Run anyway**.
Источник: [релиз 0.45.0](https://github.com/get-bb/bb/releases/tag/desktop-v0.45.0).

**W4. Агенты по подписке (путь 1, нужен VPN).** Ставить нужно хотя бы одного агента — этого
или Pi из части 2.

Claude Code:

```powershell
winget install --id Anthropic.ClaudeCode --exact --source winget --accept-source-agreements --accept-package-agreements
```

Codex — официальный установщик в отдельном процессе PowerShell (`Bypass` действует только на него):

```powershell
powershell -ExecutionPolicy Bypass -Command "irm https://chatgpt.com/codex/install.ps1 | iex"
```

Закройте все окна PowerShell, откройте новое, обновите в нём пути к программам и войдите:

```powershell
Set-Location -LiteralPath 'C:\Developer\_CODE\vibecommerce_code'
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
claude --version
codex --version
```

- Claude Code: наберите `claude`, войдите в аккаунт Pro, Max, Team или Enterprise в браузере,
  затем `/exit`.
- Codex: `codex login`, вход в ChatGPT-аккаунт. `Successfully logged in` — вход завершён.
  Хотите войти через другой браузер, например Brave, — скопируйте полную ссылку из PowerShell
  в его адресную строку, окно PowerShell не закрывайте.

Если PowerShell пишет, что команда не распознана, — [раздел 20](#20-если-что-то-не-получилось).

**W5. Запустите bb.** После установки агентов полностью закройте bb и откройте снова:
так он увидит новые программы.

```powershell
Start-Process -FilePath "$env:LOCALAPPDATA\Programs\bb\bb.exe"
```

Не нашлось — откройте **bb** через **Start**. Создавать репозиторий в папке и добавлять проект —
в [разделе 14](#14-репозитории-папки-и-дочерние-треды).

Особенности Windows в части 3: Folder links_vibecom не ставьте; в Explorer_vibecom не выбирайте `Open documents in = Mac app`; File Manager видит только папки внутри
`%USERPROFILE%`, поэтому `C:\Developer\_CODE` открывайте через проект bb. В Markdown_vibecom ссылки
между файлами и картинки по относительным путям на Windows могут не работать: в коде пути
склеиваются через `/`. ⚠️

Дальше — [распакуйте комплект](#распакуйте-комплект) и [подключите модель](#часть-2-подключить-модель).

### 4. Linux-сервер (VPS)

Сервер нужен, чтобы агенты работали круглосуточно: ноутбук можно закрыть, а задания давать с телефона
или из браузера. bb на сервере — тот же bb: проекты, треды, терминал и плагины работают там, а вы
подключаетесь к нему через getbb.app.
⚠️ Блок собран по официальной документации bb 0.45.0; на настоящем VPS эти шаги не выполнялись.

**L0. Какой сервер взять.**

| Что | Рекомендация | Почему |
|---|---|---|
| Система | Ubuntu 22.04 или 24.04 LTS, x64 или ARM64 | bb проверяют в CI на Ubuntu; Claude Code поддерживает Ubuntu 20.04+, Debian 10+ |
| Память | от 4 ГБ RAM | минимум Claude Code |
| Где | для пути 1 (Claude, Codex) — **за пределами РФ**; для пути 2 (Яндекс, Cloud.ru) — любой, в том числе в РФ | с российского IP Anthropic и OpenAI отвечают отказом; российские облака работают отовсюду |
| Доступ | вход по SSH-ключу, обычный пользователь с `sudo` | не работайте от `root` |

Источники: [поддержка платформ bb](https://github.com/get-bb/bb/blob/desktop-v0.45.0/docs/platform-support.md),
[требования Claude Code](https://code.claude.com/docs/en/setup).

**L1. Зайдите на сервер и поставьте базовые программы.** На ноутбуке в Terminal (macOS) или
PowerShell (Windows):

```bash
ssh ИМЯ@IP_СЕРВЕРА
```

На сервере:

```bash
sudo apt update
sudo apt install -y git curl unzip build-essential python3
git --version
```

Здесь и дальше: если после установки программа «не найдена» (`command not found`), перезайдите по SSH
или выполните `exec bash -l` — новые папки попадают в PATH только при следующем входе.

`build-essential` и `python3` нужны на случай, если для встроенных модулей bb (`better-sqlite3`,
`node-pty`, `@parcel/watcher`) нет готовой сборки под ваш сервер.

**L2. Поставьте Node.js 22.19 или новее.** bb поддерживает Node.js 22.19, 24 и 26. Один из способов —
пакеты [NodeSource](https://github.com/nodesource/distributions), на которые ссылается nodejs.org:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

**L3. Запустите bb.** Официальный способ — пакет `bb-app` из npm:

```bash
npx bb-app@latest start --in-app-updates
```

Команда скачает bb, запустит сервер и сама перезапустит его при сбое. Данные лежат в `~/.bb/`, логи —
`~/.bb/logs/server-stdio.log` и `~/.bb/logs/host-daemon-stdio.log`. Флаг `--in-app-updates` включает
обновление из интерфейса: **Settings → Updates**. Остановить: `npx bb-app stop`.

Если при запуске видите `Could not locate the bindings file` — у вас npm 12 или новее, он блокирует
сборку встроенных модулей. Разрешите её и запустите заново:

```bash
npm config set allow-scripts=better-sqlite3,node-pty,@parcel/watcher --location=user
```

Источник: [bb-app README](https://github.com/get-bb/bb/blob/desktop-v0.45.0/packages/bb-app/README.md).

**Чтобы bb работал после выхода из SSH и перезагрузки**, оформите его службой systemd. Готовой службы
для сервера bb в документации нет, ниже — стандартная конструкция systemd. ⚠️ Не проверена.
Сначала остановите bb, запущенный вручную (`Ctrl+C`), затем:

```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/bb-app.service <<'EOF'
[Unit]
Description=bb server
After=network-online.target

[Service]
Environment=PATH=%h/.local/bin:%h/.pi/agent/bin:/usr/local/bin:/usr/bin:/bin
Environment=LANG=C.UTF-8
ExecStart=/usr/bin/npx bb-app start --in-app-updates
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF
sudo loginctl enable-linger "$USER"
systemctl --user daemon-reload
systemctl --user enable --now bb-app.service
systemctl --user status bb-app.service
```

`enable-linger` нужен, чтобы служба пользователя работала без открытой SSH-сессии.
`PATH` в службе нужен, чтобы bb видел агентов: установщики Claude Code и Pi кладут их в `~/.local/bin` или `~/.pi/agent/bin`.
Если bb не видит агента, посмотрите `which claude` (или `which pi`) и добавьте эту папку в строку `Environment=PATH=`.
Журнал службы: `journalctl --user -u bb-app -f`.

**L4. Кириллица в терминале.** В службе из L3 кодировка уже задана (`LANG=C.UTF-8`). Для SSH-сессий
выполните `echo $LANG`; если пусто, добавьте и перезайдите по SSH:

```bash
echo 'export LANG=C.UTF-8' >> ~/.profile
```

⚠️ На сервере не проверено; на Mac аналогичная строка решила проблему.

**L5. Поставьте агентов и войдите без браузера.** На сервере нет браузера: ссылку для входа открываете
на ноутбуке, а код вставляете обратно в SSH-сессию.

- **Claude Code:** `curl -fsSL https://claude.ai/install.sh | bash`, затем `claude`. Клавиша `c`
  копирует ссылку входа; откройте её на ноутбуке, войдите и вставьте код в строку
  `Paste code here if prompted`. [Документация](https://code.claude.com/docs/en/authentication)
- **Codex:** `curl -fsSL https://chatgpt.com/codex/install.sh | sh`, затем `codex login --device-auth`.
  Вход по коду устройства — бета: сначала включите его в настройках безопасности ChatGPT.
  Запасной путь — скопировать файл входа с компьютера, где вход уже выполнен:
  `ssh ИМЯ@IP_СЕРВЕРА 'mkdir -p ~/.codex && cat > ~/.codex/auth.json && chmod 600 ~/.codex/auth.json' < ~/.codex/auth.json`.
  Это фактически пароль — не пересылайте его по почте и в чатах. На Mac вход может храниться в Связке
  ключей, тогда файла `~/.codex/auth.json` нет. [Документация](https://learn.chatgpt.com/docs/auth)
- **Pi:** `curl -fsSL https://pi.dev/install.sh | sh`. Модели облаков подключите по шагу 3 пути 2
  ([часть 2](#6-путь-2-российское-облако-через-агента-pi)): ключи нужны те же, браузер не нужен.

Комплект на сервер передайте с ноутбука и распакуйте:

```bash
scp ~/Downloads/08-BB-VADIM-KIT.zip ИМЯ@IP_СЕРВЕРА:~/
ssh ИМЯ@IP_СЕРВЕРА 'mkdir -p ~/Developer && unzip -o ~/08-BB-VADIM-KIT.zip -d ~/Developer'
```

С Windows первая строка — `scp "$env:USERPROFILE\Downloads\08-BB-VADIM-KIT.zip" ИМЯ@IP_СЕРВЕРА:~/`.

После установки агентов перезапустите bb: `systemctl --user restart bb-app` (или `Ctrl+C` и запуск из L3).

**L6. Подключитесь к серверу с ноутбука и телефона.** Привяжите сервер к своему аккаунту bb:

```bash
npx --package bb-app bb account login
```

Команда покажет ссылку и код — подтвердите их в браузере на ноутбуке. Другой способ — одноразовый код
из кабинета [getbb.app](https://getbb.app): `npx --package bb-app bb connect --code КОД`.
После этого bb сервера открывается по адресу `https://ВАШЕ_ИМЯ.getbb.app` — в браузере ноутбука
и телефона, под вашим аккаунтом. Адрес покажет `npx --package bb-app bb connect status`. Приложение bb на Mac подключается к серверу через меню **Server**;
тогда свой локальный сервер Mac не запускает.
[Документация о нескольких устройствах](https://github.com/get-bb/bb/blob/desktop-v0.45.0/docs/multiple-devices.md).

Проекты на сервере: **New project** → папка на сервере, например `~/Developer/_CODE/vibecommerce_code`
(клонируйте шаблон по [разделу 14](#14-репозитории-папки-и-дочерние-треды)). Плагины из части 3 ставятся
**на сервер**. Удобнее всего — во встроенном терминале bb, открытом в браузере: он работает на сервере,
и команды `bb …` там есть. В SSH-сессии вместо `bb …` пишите `npx --package bb-app bb …`.

Есть и обратная схема: bb остаётся на ноутбуке, а VPS подключается к нему как машина —
**Settings → Machines → Add a machine**. Тогда при спящем ноутбуке недоступно всё, поэтому для
круглосуточной работы держите сервер bb на самом VPS.

**L7. Безопасность.**

- bb слушает только `127.0.0.1:38886`, и так должно остаться. Его API без пароля **выполняет команды
  и читает файлы**: не запускайте bb с `--server-bind-host 0.0.0.0`, не открывайте порт 38886 в
  интернет, не публикуйте его через Tailscale Funnel или туннели. Доступ снаружи — только через
  getbb.app.
- Оставьте открытым только SSH. Если SSH у вас не на порту 22, сначала разрешите свой порт
  (`sudo ufw allow ПОРТ/tcp`), иначе потеряете доступ к серверу:

```bash
sudo ufw allow OpenSSH
sudo ufw enable
```

- Ключи облаков — в `~/.pi/agent/auth.json` с правами 600; в репозиторий не кладите.
- Потерянный телефон или компьютер отключите в кабинете getbb.app.

**L8. Обновление.** В интерфейсе: **Settings → Updates → Update** или `npx --package bb-app bb updates app apply`
(работает, если bb запущен с `--in-app-updates`). Отката нет. Без этого флага — остановите bb и запустите
`npx bb-app@latest start --in-app-updates` заново.

Дальше — [часть 2](#часть-2-подключить-модель): на сервере проще всего путь 2.

### Распакуйте комплект

Распакуйте `08-BB-VADIM-KIT.zip` в постоянную папку — bb будет брать плагины из неё. Внутри архива
уже есть папка `bb-vadim-kit`.

macOS и Linux (архив скачан в «Загрузки»):

```bash
mkdir -p ~/Developer
unzip -o ~/Downloads/08-BB-VADIM-KIT.zip -d ~/Developer
ls ~/Developer/bb-vadim-kit
```

Windows (PowerShell):

```powershell
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\08-BB-VADIM-KIT.zip" -DestinationPath "$env:USERPROFILE\Developer" -Force
Get-ChildItem "$env:USERPROFILE\Developer\bb-vadim-kit"
```

В папке должны быть `GUIDE.md`, `AGENT-TASK.md`, `theme`, `plugins`, `models`, `instructions`,
`examples` и `MANIFEST.json`. Для сервера — шаг L5 блока Linux.

## Часть 2. Подключить модель

bb — среда для работы с агентами. Сама языковая модель — «мозги» агента — работает
в облаке или на вашем компьютере. Есть три пути, их можно совмещать.

| | **Путь 1. Claude или ChatGPT по подписке** | **Путь 2. Российское облако: Яндекс или Cloud.ru** | **Путь 3. Локальная модель** |
|---|---|---|---|
| VPN | Нужен: из РФ поставщик доступ закрыл | Не нужен | Не нужен, работает без интернета |
| Оплата | Около $20 в месяц, зарубежной картой или через посредника | Рублями, российской картой; компании — по счёту | Бесплатно |
| Чтобы попробовать | Сразу платно | Грант новым пользователям: 4 000 ₽ на 60 дней в каждом облаке | Нужен мощный компьютер |
| Агент в bb | Claude Code или Codex | Pi | Pi |
| Модели | Claude Opus, GPT | DeepSeek V4.1 Flash (Яндекс), GLM-5.2 и Kimi K2.6 (Cloud.ru) | Qwen3.8 27B, Qwen3.6 35B |
| Где проверено | ✅ Mac · ⚠️ Windows, Linux — не проверены | ✅ Mac · ⚠️ Windows, Linux — не проверены | ✅ Mac · ⚠️ Windows — не проверена · ✗ VPS без видеокарты не подходит |

Не знаете, что выбрать, — начните с пути 2: на старте он бесплатный и работает без VPN.

### 5. Путь 1. Claude Code или Codex по подписке

Нужны VPN и подписка: Claude Pro или Max — для Claude Code, ChatGPT Plus или выше — для Codex.

| ОС | Claude Code | Codex |
|---|---|---|
| macOS, Linux | `curl -fsSL https://claude.ai/install.sh \| bash` | `curl -fsSL https://chatgpt.com/codex/install.sh \| sh` |
| Windows | см. блок Windows, шаг W4 | см. блок Windows, шаг W4 |

Вход: в терминале наберите `claude` и войдите в аккаунт с подпиской; для Codex — `codex login`
→ «Sign in with ChatGPT». На сервере без браузера см. блок Linux, шаг L5.
После входа полностью перезапустите bb: агент появится в списке провайдеров.

Если упрётесь в лимит подписки, bb подождёт обновления лимита и продолжит работу сам
(плагин Provider retry, раздел 16).

### 6. Путь 2. Российское облако через агента Pi

**1. Поставьте Pi.**

| ОС | Команда |
|---|---|
| macOS, Linux | `curl -fsSL https://pi.dev/install.sh \| sh` |
| Windows | нужен Node.js 22.19+ и Git for Windows: `npm install -g --ignore-scripts @earendil-works/pi-coding-agent` |

Проверка: `pi --version` показывает номер версии (у Вадима 1.1.0).

**2. Получите ключ облака.** Ключ показывают **один раз**: сразу сохраните в менеджер паролей.
Подойдёт любое облако, можно оба.

*Яндекс AI Studio — DeepSeek V4.1 Flash*

1. Зарегистрируйтесь в [Yandex AI Studio][yandex-ai-studio] с Яндекс ID и создайте платёжный аккаунт.
   **Карту привяжите сразу при создании**: если привязать позже, грант 4 000 ₽ не начислят.
2. В AI Studio нажмите «Создать API-ключ» справа вверху → выберите срок → «Создать». Сохраните секретный ключ.
3. Запишите **ID каталога**: он нужен в шаге 3.

*Cloud.ru — GLM-5.2 и Kimi K2.6*

1. Зарегистрируйтесь в [Cloud.ru][cloud-ru] по телефону и почте или через Сбер ID.
2. Привяжите карту в разделе «Контроль затрат»: придут **4 000 бонусов на 60 дней**.
   Компании и ИП подключаются по договору и платят по счёту.
3. В личном кабинете: **Evolution → Foundation Models**.
4. Создайте сервисный аккаунт: меню (девять точек) → «Пользователи» → «Сервисные аккаунты» →
   «Создать аккаунт», уровень — **«Проект»**.
5. Откройте аккаунт → «Учетные данные доступа» → «Создать API-ключ». Сервис — Foundation Models, срок — 90 дней.
6. Скопируйте **Key Secret**: после закрытия окна его больше не покажут.

Нужен ключ **сервисного аккаунта уровня «Проект»**. С другим ключом список моделей виден,
а запрос к модели падает с ошибкой 401.

**3. Подключите модели к Pi.** У Pi два файла в папке `.pi/agent` в домашней папке:
`models.json` — какие модели подключены, без ключей; `auth.json` — ваши ключи.
Готовые шаблоны лежат в комплекте: `models/pi/models.json` и `models/pi/auth.example.json`.

Если файла `~/.pi/agent/models.json` у вас ещё нет — скопируйте шаблон. Если есть, не перезаписывайте:
добавьте нужные блоки из шаблона внутрь `"providers"` своего файла.

macOS и Linux, из папки распакованного комплекта ([как распаковать](#распакуйте-комплект)):

```bash
cd ~/Developer/bb-vadim-kit
```


```bash
mkdir -p ~/.pi/agent
cp -n models/pi/models.json ~/.pi/agent/models.json
cp -n models/pi/auth.example.json ~/.pi/agent/auth.json
chmod 600 ~/.pi/agent/auth.json
```

Windows (PowerShell):

```powershell
cd "$env:USERPROFILE\Developer\bb-vadim-kit"
```


```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.pi\agent" | Out-Null
if (-not (Test-Path "$env:USERPROFILE\.pi\agent\models.json")) { Copy-Item models\pi\models.json "$env:USERPROFILE\.pi\agent\models.json" }
if (-not (Test-Path "$env:USERPROFILE\.pi\agent\auth.json")) { Copy-Item models\pi\auth.example.json "$env:USERPROFILE\.pi\agent\auth.json" }
```

Папка `.pi` скрыта в Finder и Проводнике, поэтому откройте файлы командой:
macOS — `open -e ~/.pi/agent/models.json ~/.pi/agent/auth.json`;
Linux — `nano ~/.pi/agent/models.json`, затем `nano ~/.pi/agent/auth.json`;
Windows — `notepad "$env:USERPROFILE\.pi\agent\models.json"` и `notepad "$env:USERPROFILE\.pi\agent\auth.json"`.

Замените:

- в `models.json` — `YOUR_FOLDER_ID` на ID каталога Яндекса (встречается два раза). ID каталога —
  строка вида `b1g…`, её видно на странице каталога в [консоли Yandex Cloud](https://console.yandex.cloud).
  ⚠️ Где он показан в самом AI Studio, не проверялось;
- в `auth.json` — `YOUR_YANDEX_API_KEY` и `YOUR_CLOUD_RU_KEY_SECRET` на свои ключи.
  Подключили одно облако — удалите строку второго и запятую перед закрывающей скобкой.

Удалите из `models.json` блоки провайдеров, которыми не пользуетесь (`yandex`, `cloudru` или `lmstudio`):
иначе их модели будут в списке и падать с ошибкой. Если `auth.json` у вас уже был, команда выше его
не тронула — допишите в него нужные строки из `models/pi/auth.example.json`.

У Яндекса модель указывается только полным ID с `/latest` на конце: короткое имя даёт ошибку.
Файл `auth.json` никому не пересылайте и не кладите в репозиторий.

**4. Проверьте в bb.** Перезапустите bb, создайте тред, выберите агента **Pi** и модель,
например **DeepSeek V4.1 Flash · Yandex** или **GLM-5.2 · Cloud.ru**. Список моделей виден и командой
`bb provider models pi`.

### 7. Путь 3. Локальная модель

Подходит для мощного компьютера и данных, которые не должны покидать компьютер.
Проверено на Mac M4 Pro с 48 ГБ памяти. На Windows не проверялось, на VPS без видеокарты не подходит.

1. Поставьте [LM Studio](https://lmstudio.ai) и скачайте модель: `qwen/qwen3.8-27b` (лучше качество)
   или `qwen/qwen3.6-35b-a3b` (в 3–4 раза быстрее).
2. В настройках LM Studio поставьте контекст по умолчанию **от 64 тыс. токенов**: при стандартных 8 192 агент
   не помещается.
3. Включите сервер: вкладка **Developer** → **Status** → **Running**.
4. Блок `lmstudio` уже есть в шаблоне `models/pi/models.json`. Если у вас свой файл — добавьте этот блок
   внутрь `"providers"`. Ключ `lm-studio` — заглушка, LM Studio его не проверяет.

**Честно о качестве.** Локальная модель медленнее и слабее облака. На одной задаче Qwen3.8-27B работала
16 минут против 33 секунд у облачной DeepSeek V4.1 Flash, провалила 14 скрытых проверок из 49 и при этом
написала в отчёте, что всё сделала. Результат проверяйте особенно внимательно.

### Сколько стоит

- **Яндекс, DeepSeek V4.1 Flash:** 300 ₽ за миллион токенов на входе, 500 ₽ — на выходе, 75 ₽ — за кэш.
- **Cloud.ru:** GLM-5.2 — 173 ₽ и 606 ₽; Kimi K2.6 — 176 ₽ и 726 ₽.
- **Claude Pro, ChatGPT Plus:** около $20 в месяц.
- **Локальная модель:** бесплатно.

Для ориентира: учебная задача по коду в тесте 06.10 обошлась в 21 ₽ на Яндексе и 34 ₽ на Cloud.ru,
карточка товара — в 2–11 ₽. Расход видно в личном кабинете облака. Цены — на 06–07.10.2026,
перед оплатой сверяйте в кабинете.

### Безопасность данных

- Ключ — как пароль: не публикуйте и не вставляйте в чаты. Засветили — удалите в кабинете и выпустите новый.
- **Персональные данные покупателей** (ФИО, телефоны, адреса) — только в модели, про которые провайдер
  письменно подтверждает работу в России: **DeepSeek V4.1 Flash у Яндекса** и **Kimi K2.6 у Cloud.ru**.
  GLM-5.2 у Cloud.ru — партнёрская модель без такого подтверждения: ей — задачи без персональных данных.
  В Claude и ChatGPT такие данные не отправляйте. С локальной моделью данные остаются на компьютере.
  С провайдером нужен договор поручения обработки данных — покажите его юристу.
- Россия не входит в список стран, где официально работают Anthropic и OpenAI. По пути 1 вы работаете
  через VPN, и компании вправе ограничить такой аккаунт.

Справочно: у MWS GPT (МТС) модель GLM-5.3, ЦОДы в РФ подтверждены письменно. Подключение к bb
не проверялось, поэтому шагов нет.

## Часть 3. Настройка как у Вадима

Всё ниже необязательно, но делает работу заметно удобнее. Нужен распакованный комплект
([как распаковать](#распакуйте-комплект)): `~/Developer/bb-vadim-kit` на macOS и Linux,
`%USERPROFILE%\Developer\bb-vadim-kit` на Windows. Не удаляйте папку после установки: bb берёт
плагины из неё. Команды `bb …` выполняйте во встроенном терминале bb, перейдя в папку комплекта:
`cd ~/Developer/bb-vadim-kit` (Windows: `cd "$env:USERPROFILE\Developer\bb-vadim-kit"`).

### 8. Общие настройки bb

**Settings → General.** Значения Вадима:

| Настройка | Значение | Зачем |
|---|---|---|
| `steerActiveThreadOnEnter` | `false` | Enter ставит сообщение работающему агенту в очередь; Cmd+Enter вмешивается в текущий ход |
| `showKeyboardHints` | `true` | подсказки сочетаний клавиш |
| `showDiagnosticEvents` | `false` | служебные события не засоряют ленту |
| `defaultProviderId` | `claude-code` | агент по умолчанию; другой выбирается под задачу |
| `managedBranchPrefix` | `bb/` | префикс веток, если создаётся worktree |
| `confirmThreadArchive` | `true` | перед архивацией треда bb переспрашивает |

Команды одинаковы на macOS, Windows и сервере (во встроенном терминале bb):

```text
bb settings general steerActiveThreadOnEnter false
bb settings general showKeyboardHints true
bb settings general showDiagnosticEvents false
bb settings general confirmThreadArchive true
bb settings general defaultProviderId claude-code
```

Последняя строка только выбирает агента по умолчанию — ставить его и входить в аккаунт всё равно нужно.
Подключили только российские облака (путь 2) — выберите Pi: `bb settings general defaultProviderId pi`.

Список тредов — группировка **By project** и сворачивание тредов одного окружения:

```text
bb thread-list prefs set organizationMode project
bb thread-list prefs set environmentGrouping true
```

Проверка: `bb thread-list prefs list`. Видимые кнопки боковой панели: Tasks, New thread, Docs,
Search threads.

**Горячие клавиши.** Штатные: Cmd+P — файл, Cmd+Shift+P — палитра действий, Cmd+K — поиск тредов,
Cmd+J — правая панель. Вадим переназначил переход между панелями на **Cmd+Shift+стрелки**
(по умолчанию Cmd+Ctrl+Shift+стрелки): **Settings → Keyboard** → `pane.focus.left/right/up/down`.
На Windows `Mod` означает Ctrl. Проверка: `bb settings keyboard list`.

**Голосовой ввод** включён (`voiceTranscriptionEnabled = true`): удобно диктовать задания.
Расшифровку, а также заголовки тредов и сообщения коммитов делает облачный сервис bb (встроенный плагин
`bb-ai`, режим **Automatic**); проверка — `bb settings ai-services show`.

### 9. Тема atom-one_vibecom

В ZIP три файла темы: `theme/atom-one_vibecom/theme.css`, `theme.json` и `one-dark.json`. CSS задаёт цвета
интерфейса и терминала, JSON — подсветку кода. Нужны все три.

1. `bb theme dir` покажет папку тем bb. Если там уже есть тема `atom-one_vibecom`, сначала сохраните её копию.
   До комплекта 0.2.0 тема называлась `atom-one`, файлы те же: старую папку удалите после проверки новой.
2. Скопируйте папку темы из комплекта (во встроенном терминале bb, в папке комплекта):

```bash
mkdir -p "$(bb theme dir)" && cp -R theme/atom-one_vibecom "$(bb theme dir)/"
```

Windows: `Copy-Item -Recurse -Force theme\atom-one_vibecom (bb theme dir)`.

3. Выполните:

```text
bb theme set atom-one_vibecom
bb theme show
```

Тёмный вариант: фон `#1a1c21`, текст `#abb2bf`, акцент `#61afef`; светлый — `#fafafa`, `#383a42`,
`#4078f2`. Режим выбирается в интерфейсе bb. В конце CSS есть поправка для bb 0.44: после раскрытия поля
сообщения остаются видны кнопки режимов разрешений. ⚠️ На 0.45 и 0.46 её работу отдельно не перепроверяли —
если кнопки пропали, удалите последний блок CSS. Вернуть штатную тему: `bb theme reset`.
Основа подсветки — [Atom One Dark](https://github.com/akamud/vscode-theme-onedark), лицензия в комплекте.

### 10. Терминал

В bb два терминала, и оба продолжают работу, пока вы переключаетесь на агентов.

| | Встроенный терминал | Terminal_vibecom (плагин из комплекта) |
|---|---|---|
| Где | правая панель треда, **Cmd+Shift+Enter** | вкладка **Terminal_vibecom** в правой панели треда: меню **«+»** или **Ctrl+&#96;**; вне треда то же сочетание показывает плавающее окно, ещё оно открывается кнопкой **Floating terminal** внизу боковой панели |
| Несколько оболочек | вкладками панели | вкладками внутри терминала, выбор оболочки; вкладка и окно показывают одни и те же оболочки |
| С телефона | без Ctrl, Esc и вставки | строка клавиш: `esc`, `tab`, `ctrl`, стрелки, `^C`, `^D`, `^Z`, `^R`, `find`, `paste`; на телефоне вкладка подстраивается над клавиатурой |
| Как закрыть | закрыть вкладку | вкладку или окно можно спрятать — команда работает дальше; **× у названия оболочки** закрывает её вместе с командой |

**Terminal_vibecom** — копия [vburojevic/bb-plugin-floating-terminal](https://github.com/vburojevic/bb-plugin-floating-terminal)
0.5.3 (MIT), версия 0.6.2: терминал вкладкой в правой панели, два исправления кнопки `paste` и одно —
отрисовки:

1. вставка срабатывает при отпускании пальца — так iPhone разрешает читать буфер обмена. В версии
   из каталога вставка на iPhone всегда падает с «Clipboard is not available here»;
2. текст вставляется как вставка, а не как набор: многострочная команда встаёт в строку ввода и ждёт
   Enter, а не выполняется по строке;
3. новый терминал больше не превращает текст в уже открытых терминалах в мешанину букв: шрифт
   значков грузится один раз на страницу, и общую текстуру символов перерисовывают все терминалы сразу.

Первое исправление отправлено автору ([issue #3](https://github.com/vburojevic/bb-plugin-floating-terminal/issues/3)).
Вкладки в правой панели у автора нет (на 11.10), поэтому на каталожную версию возвращаться не стоит.

Сочетание — команда BB **«Terminal_vibecom: open in side panel»**, по умолчанию Ctrl+&#96;; переназначается в
**Settings → Keyboard**. До версии 0.6.1 вкладка и команда назывались просто «Terminal»; переназначенное
сочетание после обновления сохраняется. ⚠️ Если две панели в split показывают терминал одновременно, переносы строк
подстраиваются под ту, что менялась последней (не проверено). Установка и настройка Вадима (шрифт 13) —
в [разделе 12](#12-мои-плагины-из-комплекта).

**Команду за вас наберёт агент.** Напишите в треде: «отправь в терминал: <команда>». Агент положит
её в терминал без Enter — запуск подтверждаете вы. Пароли и ключи так не передавайте: они останутся
в истории чата.

Ограничения: с телефона терминал работает, пока есть связь с getbb.app, и пока компьютер
не спит; о завершении команды плагин не сообщает; на Mac вставка — Cmd+V, а не Ctrl+V. ✅ На iPhone
вставка подтверждена Вадимом; ⚠️ многострочная вставка на iPhone, Android, Windows и Linux не проверены.

### 11. Файлы: File Manager и Explorer_vibecom

File Manager — внешний плагин для папок и файловых операций. Explorer_vibecom — дерево проекта или
домашней папки, поиск, редактор и те же операции с файлами, включая загрузку и скачивание. У Вадима пока
стоят оба; File Manager можно не ставить, если хватает Explorer_vibecom.
File Manager ставится так:

```text
bb plugin install git:https://github.com/xMinor-1/bb-plugins.git@file-manager/v0.9.2 --subdirectory plugins/file-manager
```

bb покажет источник стороннего плагина: прочитайте и подтвердите. Команда закрепляет ту же версию, что
у Вадима; ⚠️ в такой форме не запускалась — у Вадима плагин поставлен диапазоном версий
(`…bb-plugins.git@semver:file-manager/:^0.9.1`). Explorer_vibecom ставится из комплекта —
[раздел 12](#12-мои-плагины-из-комплекта).

**File Manager** — **New tab → Actions → File Manager**; кнопка **Thread folder** ведёт в папку
текущего треда. Значения Вадима:

```text
bb plugin config file-manager set restoreLastFolder true
bb plugin config file-manager set openThreadWorkspace false
bb plugin config file-manager set showHiddenFiles true
bb plugin config file-manager set confirmOnDelete true
bb plugin config file-manager set sortField name
bb plugin config file-manager set sortDirection asc
bb plugin config file-manager set viewMode list
bb plugin config file-manager set uploadChunkMiB 16
```

Стартовую папку (**Start folder**) выберите в настройках плагина или командой с **полным** путём:
`bb plugin config file-manager set startFolder "$HOME/Developer/_CODE"`. File Manager видит только
домашнюю папку пользователя.

**Explorer_vibecom** — вкладка правой панели (меню **«+»** → **Explorer_vibecom** или в палитре действий
**Files: browse this thread's project**) и страница **Files** в боковой панели. Что умеет:

- дерево проекта или домашней папки (переключатель Project / Home), сортировка по имени, дате изменения
  и типу, поиск по именам, поиск по тексту всего проекта (Cmd+Shift+F), переход к файлу по имени (Cmd+P),
  поиск в файле, вкладки;
- меню по правому клику (на телефоне — долгим нажатием): создать, переименовать, дублировать, переместить,
  в корзину с отменой, Copy path, Add to chat, Download, открыть в новой вкладке; загрузка файлов кнопкой
  или перетаскиванием;
- PDF, Word, Excel, PowerPoint и Markdown открываются прямо в панели кодом Office_vibecom и
  Markdown_vibecom. Для Markdown должен быть установлен Markdown_vibecom: редактор Vditor отдаёт его сервер;
- секретные файлы (`.ssh`, `.env`, `.aws` и т. п.) видны в дереве, но содержимое и передача в чат — только
  после подтверждения;
- текстовые файлы — просмотр с подсветкой, Read / Edit с сохранением по Cmd+S. Если агент изменил файл,
  пока вы его правите, сохранение остановится и предложит **Reload** или **Overwrite**.

Исключены `.git`, `node_modules`, `vendor` — это значения по умолчанию (**Excluded directories**, по одному
имени на строку). Корзина, Home, загрузка и «Open in Mac app» работают, когда рабочая копия на том же Mac,
что и сервер bb; файлы подключённой машины идут через bb, корзины там нет.

Куда открываются PDF и офисные документы по клику — настройка **Open documents in**:

| Значение | Что происходит |
|---|---|
| `This panel` (по умолчанию) | рядом с деревом, в той же вкладке |
| `BB viewer` | отдельной вкладкой в просмотрщике bb: PDF — встроенный, офис — Office_vibecom |
| `Mac app` | приложение macOS по умолчанию (Preview, Word, Excel, Keynote). Только когда bb работает на Mac: на Windows и Linux-сервере выберите другое значение |

```text
bb plugin config files-editor set openDocumentsIn "This panel"
```

CSV и TSV остаются текстом.

### 12. Мои плагины из комплекта

В `plugins/` — исходники пяти плагинов с `package-lock.json`. Зависимости скачивает npm, собирает
bb. Они не привязаны к конкретному репозиторию. В bb они видны с суффиксом `_vibecom`, ID прежние.

| Папка (ID) | Имя в bb | Версия | macOS | Linux-сервер | Windows |
|---|---|---|---|---|---|
| `markdown-view` | Markdown_vibecom | 0.3.0, bb 0.45+ | ✅ | ⚠️ должен работать | ⚠️ ссылки между файлами могут не работать |
| `office-preview` | Office_vibecom | 0.3.0, bb 0.45+ | ✅ | ⚠️ без `.doc/.rtf/.odt` | ⚠️ без `.doc/.rtf/.odt` |
| `folder-links` | Folder links_vibecom | 0.3.0 | ✅ | ⚠️ должен работать | ✗ не ставить |
| `floating-terminal` | Terminal_vibecom | 0.6.2 | ✅ | ⚠️ | ⚠️ |
| `files-editor` | Explorer_vibecom | 0.1.6 с правками | ✅ | ⚠️ без `Mac app` | ⚠️ без `Mac app` |

Свои три плагина нумеруются версией комплекта; у копий чужих плагинов версии продолжают версии их авторов.
Explorer_vibecom показывает Markdown через сервер Markdown_vibecom — ставьте их вместе.

**Первая установка из папки комплекта.** Откройте терминал **в папке плагина** и выполните:

macOS и Linux:

```bash
npm ci
bb plugin build .
bb plugin install "$PWD" --yes
```

Windows (PowerShell):

```powershell
npm ci
bb plugin build .
bb plugin install (Get-Location).Path --yes
```

На bb 0.46 все пять плагинов при сборке предупреждают о закреплённой версии SDK — это не ошибка, сборка
проходит. Команду `bb plugin types` из предупреждения не выполняйте: она меняет версию SDK в плагине. Для `files-editor` и `floating-terminal` вместо `npm ci` выполните `npm ci --ignore-scripts`: так npm не
собирает нативные инструменты разработки, плагинам они не нужны. ⚠️ На Windows и Linux не проверено.

Если плагин с тем же ID уже стоит из другого источника (Floating Terminal из каталога, Files editor из git),
удалите его до установки: `bb plugin remove floating-terminal` или `bb plugin remove files-editor`.
Настройки удалённого плагина пропадут. ⚠️ Установка поверх без удаления не проверялась. После установки обновите окно bb
(Cmd+R / Ctrl+R).

Настройки после установки. У Вадима шрифт терминала 13, документы открываются рядом с деревом
(`This panel`, значение по умолчанию):

```text
bb plugin config floating-terminal set fontSize 13
bb plugin config files-editor set openDocumentsIn "This panel"
```

**Обновление** из нового ZIP (в том числе с прошлой версии комплекта): замените файлы в той же папке, затем `npm ci`
(для `files-editor` и `floating-terminal` — `npm ci --ignore-scripts`), `bb plugin build .`,
`bb plugin reload <ID>` — ID это имя папки, например `bb plugin reload floating-terminal`, а не имя с `_vibecom`. Если папка переехала — заново `bb plugin install <новый путь>`.
`node_modules` не удаляйте: Markdown_vibecom берёт оттуда редактор. Для `office-preview` npm
скачивает библиотеку `xlsx` с `cdn.sheetjs.com` — сайт должен открываться.
Проверка: `bb plugin list` — нужные плагины в статусе `running`.

**Установка из Git** — когда репозиторий комплекта опубликован на GitHub. bb сам скачает выпуск, поставит
зависимости, соберёт плагин и сможет обновлять его командой. Ставьте только нужные:

```text
bb plugin install "git:https://github.com/vibe-commerce-org/bb-vadim-setup.git@semver:~0.3.0" --subdirectory plugins/markdown-view
bb plugin install "git:https://github.com/vibe-commerce-org/bb-vadim-setup.git@semver:~0.3.0" --subdirectory plugins/office-preview
bb plugin install "git:https://github.com/vibe-commerce-org/bb-vadim-setup.git@semver:~0.3.0" --subdirectory plugins/folder-links
bb plugin install "git:https://github.com/vibe-commerce-org/bb-vadim-setup.git@semver:~0.3.0" --subdirectory plugins/files-editor
bb plugin install "git:https://github.com/vibe-commerce-org/bb-vadim-setup.git@semver:~0.3.0" --subdirectory plugins/floating-terminal
```

bb покажет источник и попросит подтвердить. Диапазон `~0.3.0` принимает выпуски 0.3.x: новую совместимую
версию покажет `bb plugin outdated`, поставит `bb plugin update <ID>`. Для точного повторения укажите тег
`@v0.3.0` вместо диапазона — такой источник `update` не меняет. Плагины из выпусков с диапазоном `~0.2.0`
на 0.3.0 сами не перейдут: удалите и поставьте заново.

Один плагин ставится одним путём. Чтобы перейти с папки на Git или обратно, сначала `bb plugin remove <ID>`:
команда удаляет и настройки плагина (они есть у Explorer_vibecom и Terminal_vibecom) — задайте их заново
командами выше. ⚠️ Из России GitHub бывает медленным; тогда ставьте из папки ZIP.

#### Markdown_vibecom — Markdown как в Typora

Открывает `.md`, `.mdx`, `.markdown` на всю ширину, с оглавлением. Изменения на диске подхватывает
примерно за 1,5 секунды, у файлов больше 256 КБ — за 5 секунд.

- **Вид как в Typora:** синие ссылки, код в «чипах», таблицы с рамками, метки H1/H2. Цвета берутся
  из темы bb и переключаются вместе с ней.
- **Ссылки работают:** `http` — в браузере; `mailto:` и `tel:` — в системе; `#раздел` — переход
  к заголовку; относительный путь — от папки файла, во вкладке bb; абсолютный путь и `file://` —
  файл на компьютере, в том числе из **другого репозитория**.
- **Картинки по относительным путям** показываются, если лежат внутри чекаута.
- **Правка:** кнопка **«Редактировать»** включает редактор Vditor, на её месте появляется **«Готово»**.
  Пока вы в документе, вокруг него синяя рамка; перешли в чат — серая. Режимы: «Как в Typora»,
  «Как в Word», «Исходник». **«Вид»** — размер текста, интервал, ширина, шрифт; **«Оглавление»** —
  показать или скрыть.
- **Сохранение** — само через секунду, по Cmd+S (Ctrl+S) и по «Готово».
- **Правленые строки сохраняются точечно**, остальной исходник не переформатируется. Если агент изменил
  файл одновременно с вами, появится выбор версии — молча чужая версия не перезаписывается.
  После правки посмотрите diff.
- Файлы хранилища треда теперь можно не только смотреть, но и править.
- Голые адреса без `[текст](…)` ссылками не становятся.
- **На телефоне** шапка и лента инструментов правки занимают одну строку, ленту листают пальцем.
  Свайп по ленте больше не нажимает кнопки редактора: раньше на iPhone он мог испортить файл.

Настройки вида хранятся в браузере, отдельно от файлов. Тесты: `npm test` (28 проверок ✅).

#### Office_vibecom — Excel, Word, PowerPoint

Показывает Excel / CSV / ODS, Word DOCX и PowerPoint PPTX с заметками докладчика. Формулы Excel не
пересчитываются — выводится сохранённый результат. Редактирования нет. Есть кнопки «Обновить» и
«Во внешнем приложении». `.doc`, `.rtf`, `.odt` конвертируются через `textutil` — только когда bb
работает на Mac; на Windows и Linux их открывайте внешним приложением. Старые `.ppt`/`.pps` — тоже
внешним приложением. PDF показывает встроенный `pdf-preview`. Тесты: `npm test` (10 проверок ✅).

#### Folder links_vibecom — папка из ответа агента в дерево справа

Клик по абсолютной ссылке на папку в сообщении открывает её дерево справа, а не встроенный браузер. Если папки уже нет,
открывается ближайшая существующая папка-предок с пояснением. Ссылки на файлы остаются у штатных
открывателей. Работает с путями macOS и Linux внутри домашней папки; Windows не поддерживает.
Тесты: `npm test` (10 проверок ✅).

### 13. Открытие файлов

**Settings → File openers** — закрепите:

| Формат | Открыватель |
|---|---|
| `.md`, `.mdx`, `.markdown` | «Markdown (как в Typora, правка)» |
| `.xlsx`, `.xlsm`, `.xls`, `.xlsb`, `.ods`, `.numbers`, `.csv`, `.tsv` | «Таблица (Excel)» |
| `.docx`, `.docm`, `.dotx` | «Документ (Word)» |
| `.pptx` | «Презентация (PowerPoint)» |
| `.pdf` | встроенный PDF preview |
| код и конфигурации | встроенный редактор Monaco или BB preview |

**Важно:** File Manager тоже регистрируется открывателем для многих форматов. Пока Markdown_vibecom
не закреплён для `.md`, клик по файлу в чате может открыть его в File Manager. Для отдельного файла —
правый клик → **Open with**.

### 14. Репозитории, папки и дочерние треды

bb работает с **папкой проекта на компьютере**. Репозиторий — эта папка вместе с историей Git;
GitHub хранит её копию.

**Бесплатные шаблоны Вадима** — достаточно одного:

| Для чего | Репозиторий |
|---|---|
| Разработка и общая работа с ИИ-агентами | [vadim-bakanov-ai-dev](https://github.com/vibe-commerce/vadim-bakanov-ai-dev) |
| ВАЙБ-КОММЕРС: работа селлера и задачи маркетплейсов | [vibecommerce_test_code](https://github.com/vibe-commerce/vibecommerce_test_code) |

Платный VIP-репозиторий — [состав и доступ](https://vibecommerce.ru/repo/),
[сравнение с бесплатной версией](https://vibecommerce.ru/repo-base/). После оплаты в течение рабочего
дня приходит приглашение в GitHub. Для настройки bb VIP не нужен.

**Пути, как в инструкции курса 8.5:**

| Система | Рабочая папка |
|---|---|
| macOS | `~/Developer/_CODE/vibecommerce_code` |
| Windows | `C:\Developer\_CODE\vibecommerce_code` |
| Linux-сервер | `~/Developer/_CODE/vibecommerce_code` |

Имена папок репозиториев заканчивайте на `_code`: `vibecommerce_code`, `client_acme_code`. Это
договорённость, а не требование bb. Отдельные репозитории клиентов — соседние папки в `_CODE`,
приватные, каждый своим проектом bb.

**Готовое задание агенту** — отправьте в первый тред:

> Подготовь мой рабочий репозиторий. На macOS и Linux используй ~/Developer/_CODE/vibecommerce_code,
> на Windows — C:\Developer\_CODE\vibecommerce_code. Склонируй выбранный мной шаблон:
> для общей работы с ИИ — https://github.com/vibe-commerce/vadim-bakanov-ai-dev,
> для ВАЙБ-КОММЕРС — https://github.com/vibe-commerce/vibecommerce_test_code.
> Если выбор не указан, уточни его. Клонируй в корень папки, без лишней вложенной папки. Если папка
> не пуста, покажи её состояние и спроси, что делать; файлы не удаляй. Проверь, что AGENTS.md и
> CLAUDE.md лежат в корне, покажи дерево и добавь папку как проект bb в основном чекауте.
> Не создавай remote, commit и push без отдельного задания.

Или вручную: склонируйте шаблон и добавьте папку как проект (команда `bb` — во встроенном терминале bb):

```bash
git clone https://github.com/vibe-commerce/vibecommerce_test_code.git ~/Developer/_CODE/vibecommerce_code
bb project create --name vibecommerce_code --root "$HOME/Developer/_CODE/vibecommerce_code"
```

На Windows: `git clone https://github.com/vibe-commerce/vibecommerce_test_code.git C:\Developer\_CODE\vibecommerce_code`,
затем `bb project create --name vibecommerce_code --root "C:\Developer\_CODE\vibecommerce_code"`.
Папка для клонирования должна быть пустой или ещё не существовать.

Проверка: `bb status` и `bb environment list`.

**Основная рабочая копия.** По умолчанию — **Project checkout**: все треды проекта видят живые
незакоммиченные файлы. Worktree — отдельная копия из последнего коммита: только когда нужна изоляция.

**Дочерний тред** — отдельный разговор под самостоятельную задачу, привязанный к исходному. Например,
в основном треде обсуждаете проект, а дочерний готовит план и возвращает ссылку. Формулировка:

> Создай дочерний тред в основном чекауте этого проекта. Модель — последний Opus, effort xhigh.
> В нём подготовь план задачи в Markdown, без исполнения. Уточнения веди там, мне верни ссылку на план.

Через CLI из работающего треда:

```text
bb provider models claude-code
bb thread spawn --project ID_ПРОЕКТА --environment ID_ОКРУЖЕНИЯ --parent-self --provider claude-code --model 'claude-opus-5-5[1m]' --reasoning-level xhigh --prompt-file task.md
```

ID — из `bb status` и `bb environment list`, модель — сверьте с каталогом. Режимы прав bb:
**Accept Edits**, **Approve for me**, **Full Access**; effort задаёт глубину работы модели и разрешений
не добавляет. `--lifecycle-owner-thread` не ставьте, если дочерний тред не должен архивироваться
вместе с родителем.

### 15. Правила агентам

`instructions/AGENTS.md` в ZIP — обобщённые правила Вадима: план перед реализацией, основной чекаут,
сохранение чужих правок, абсолютные ссылки на файлы, дочерние треды и продолжения тредов, варианты
А/Б/В с рекомендацией, терминал, проверяемый результат. С 11.10 добавлены ещё два: слова и решения
пользователя агент записывает в файл-бриф рядом с планом, а при заполнении контекста треда на 75 %
предлагает сохранить статус в план, чтобы при сжатии контекста ничего не потерялось.

- **Для всех проектов** — положите как `<папка данных bb>/AGENTS.md`. Папку показывает `bb status`,
  обычно `~/.bb`. Если файл уже есть — объедините правила, свои не удаляйте.
- **Для одного репозитория** — `<репозиторий>/.bb/AGENTS.md`.

Это отдельный механизм от корневого `AGENTS.md` у Codex и `CLAUDE.md` у Claude Code. bb подключает
общий файл, затем проектный, при старте сессии. Проверьте в новом треде.
[Описание в документации bb](https://github.com/get-bb/bb/blob/main/docs/configuration.md#agent-instructions).

### 16. Skills и встроенные плагины

- **bb-guide** — справка по bb для агента (introduction, skills, bbCli, pluginAuthoring, skillCreator,
  submitPlugin — все включены). Проверка: `bb plugin config bb-guide`.
- **Provider retry** — после лимита подписки bb ждёт и продолжает сам, до 24 часов:

```text
bb plugin config provider-retry set maximumWait "24 hours"
bb provider-retry status
```

- **Concurrency limit** — автоматический, зависит от процессоров машины: `bb concurrency-limit status`.
- **Keep awake** (macOS и Windows) — не даёт компьютеру уснуть, пока работает bb: `bb keep-awake enable`. ⚠️ На Windows не проверено.
- **Push notifications** — уведомления на компьютер и телефон. На macOS разрешите:
  **System Settings → Notifications → bb → Allow notifications**.
- Skills смотрите через `bb skill list`. Принцип: повторяется методика — skill; самостоятельная задача
  со своей перепиской — дочерний тред; внутренний субагент — инструмент конкретного агента.
- Агентам **вне** bb можно поставить те же skills: `bb skill cli-skills-status`, затем
  `bb skill install-cli-skills` (меняет глобальные папки агентов).

### 17. Полный снимок настроек Вадима на 11.10

| Группа | Значения |
|---|---|
| Плагины | 44 всего: 35 running, 9 disabled (bb 0.46.0) |
| Свои (в bb — `_vibecom`) | `markdown-view`, `office-preview`, `folder-links` (в комплекте — 0.3.0); `floating-terminal` 0.6.2 и `files-editor` 0.1.6 — копии чужих плагинов с правками |
| Внешние | `file-manager` 0.9.2 из git |
| Настройки плагинов | `floating-terminal`: `fontSize=13`; `files-editor`: `excludedDirectories` по умолчанию, `openDocumentsIn=This panel`; `file-manager` — раздел 11 |
| Новые встроенные | в 0.45 — `bb-account`, `bb-ai` (облачный ИИ для заголовков, коммитов, голосового ввода); в 0.46 — `bb--prompt-library`, `bb--storage-retention` (у Вадима отключены), встроенного `navigation` больше нет |
| Встроенные активные | automations, bb--provider-usage, bb-guide, concurrency-limit, connect, custom-instructions, drafts, environment-git-worktree, environment-personal-workspace, environment-project-checkout, inline-vis, keep-awake, monaco-editor, pdf-preview, provider-acp, provider-claude-code, provider-codex, provider-pi, provider-retry, push-notifications, scheduled-send, secrets, side-chat, simple-notes (Docs), tasks, thread-list |
| Отключены | account-pool, agent-annotations, ask-user-question, bb--prompt-library, bb--storage-retention, file-tree, plugin-api-docs, plugin-api-tester, workflows — включать ради совпадения не нужно |
| Агенты | Claude Code, Codex, Pi; Pi — Яндекс, Cloud.ru, LM Studio |
| Клавиши | 4 переназначения: переход между панелями — Cmd+Shift+стрелки (mac) |
| Прочее | `confirmThreadArchive=true`, `allowFastServiceTier=true`, `voiceTranscriptionEnabled=true`, AI-сервисы bb — Automatic, тема `atom-one_vibecom`, эксперименты `changelogPreview=false`, `serverMove=false`, `performanceDiagnostics=false` |

Личный диагностический плагин `focus-probe` в комплект не входит. Explorer_vibecom в комплекте — вторая
версия (документы в проводнике, меню операций с файлами, защита секретных файлов); на iPhone Вадим её
проверил 11.10.

## Часть 4. Телефон, проверка и ошибки

### 18. bb с телефона

**Компьютер или сервер с bb должен быть включён, с интернетом и не спать.** Телефон — пульт: отправляет
задания, показывает ответы и запросы разрешений. Агенты и репозитории работают на компьютере.
С сервером (блок 4) ноутбук можно выключать.

На компьютере:

1. Запустите bb и войдите в свой аккаунт на [getbb.app](https://getbb.app).
2. В кабинете выберите имя сервера, скопируйте команду подключения и выполните её в терминале. Вид
   команды — `bb connect --code ОДНОРАЗОВЫЙ_КОД --server https://ВАШЕ_ИМЯ.getbb.app`. Код никому не
   пересылайте.
3. Проверьте: `bb connect status` — команда покажет и ваш адрес. Серверов несколько — `bb connect servers`.

На телефоне откройте в Safari или Chrome **свой** адрес `https://ВАШЕ_ИМЯ.getbb.app` и войдите в тот же
аккаунт. Добавьте в закладки. Одна Wi-Fi-сеть не нужна: работает и мобильный интернет.

Терминал с телефона — через Terminal_vibecom (раздел 10) в браузере: у встроенного терминала на телефоне
нет Ctrl, Esc и вставки.

**Чтобы компьютер не уснул:** питание от сети, крышка открыта. `bb keep-awake enable` (выключить —
`bb keep-awake disable`) работает на macOS и Windows; с закрытой крышкой ноутбук всё равно уснёт.
На Windows дополнительно проверьте сон в параметрах электропитания. ⚠️ Keep awake на Windows не проверен.

**Приложение** — по желанию. Ссылки на iOS (TestFlight) и Android (APK) покажет `bb settings mobile-app`;
подключение — **Settings → Mobile → Add mobile device**, одноразовый код вводится в приложении.
В приложении не работают интерфейсы плагинов: Terminal_vibecom, Markdown_vibecom, Explorer_vibecom и File Manager доступны
только в браузере. Поэтому для терминала с телефона открывайте `https://ВАШЕ_ИМЯ.getbb.app` в браузере.
Вход в агентов (`claude`, `codex login`) с телефона не делается — нужен терминал на компьютере.
Отключить удалённый доступ: `bb connect off`.

`bb connect expose` открывает наружу отдельный порт — для доступа к bb с телефона он не нужен.
Не выставляйте порты в интернет без необходимости.
[Документация bb о нескольких устройствах](https://github.com/get-bb/bb/blob/main/docs/multiple-devices.md).

### 19. Проверка после настройки

1. В новом треде агент ответил: «Напиши “bb работает” и укажи путь к рабочей папке. Файлы не меняй».
2. `bb provider models pi` показывает модели облака, если вы подключали путь 2.
3. `bb theme show` → `atom-one_vibecom`.
4. `bb plugin list` → нужные плагины `running`.
5. `examples/demo.md` из комплекта открывается в Markdown_vibecom: таблица, оглавление, рабочие ссылки.
   «Редактировать» → поменять строку → «Готово» → в diff изменилась одна строка.
6. Excel, DOCX, PPTX открываются справа своими открывателями.
7. В треде Ctrl+&#96; открывает вкладку Terminal_vibecom справа; спрятанная вкладка не останавливает команду; видна кириллица.
8. Во вкладке Explorer_vibecom в треде клик по PDF или DOCX открывает документ рядом с деревом, а не заглушку.
9. На macOS и Linux клик по ссылке на папку открывает дерево справа.
10. Дочерний тред появился под родителем с заданными моделью и effort.
11. Enter во время работы агента ставит сообщение в очередь.
12. С телефона по мобильному интернету видны треды и уходит короткое сообщение.

### 20. Если что-то не получилось

| Симптом | Что сделать |
|---|---|
| Агента нет в списке bb | Проверьте `claude --version`, `codex --version` или `pi --version`, завершите вход и полностью перезапустите bb |
| Pi: модели не видны | Проверьте `~/.pi/agent/models.json` — валидный JSON, `YOUR_FOLDER_ID` заменён; перезапустите bb |
| Cloud.ru: ошибка 401 | Ключ не того типа: нужен ключ **сервисного аккаунта уровня «Проект»** |
| Яндекс: модель не найдена | Нужен полный ID вида `gpt://ID_КАТАЛОГА/deepseek-v4.1-flash/latest` |
| Плагин не `running` | `bb plugin list`; в папке плагина повторите `npm ci` и `bb plugin build .`, затем `bb plugin reload <ID>` (ID — имя папки плагина) |
| Markdown открывается не в Markdown_vibecom | Закрепите для `.md` открыватель «Markdown (как в Typora, правка)» в **Settings → File openers** (раздел 13) |
| Квадраты вместо русских букв в терминале | Раздел 2.6 (macOS) или L4 (Linux) |
| Windows: `winget` не найден | Шаг W1 — App Installer, новое окно PowerShell |
| Windows: «codex не распознано» | Обновите PATH: `$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')`, затем `codex --version`. Не помогло — повторите установку из шага W4 |
| Windows: `start the Windows daemon from a non-elevated terminal` | Окно PowerShell открыто от администратора. Откройте обычное и выполните `codex login status`, затем `codex` — повторный вход обычно не нужен |
| Windows: несовпадение SHA-256 | Скачайте установщик заново; с другой суммой не запускайте |
| bb не запускается | Логи ниже; Windows-версия — alpha, повторяющуюся ошибку можно сообщить в [Issues bb](https://github.com/get-bb/bb/issues) |
| Телефон не подключается | Компьютер включён и не спит, bb запущен, есть интернет; `bb connect status` |

Логи bb: на macOS и Linux — `~/.bb/logs/`, на Windows:

```powershell
Get-Content -Path "$env:USERPROFILE\.bb\logs\server-stdio.log" -Tail 40
Get-Content -Path "$env:USERPROFILE\.bb\logs\host-daemon-stdio.log" -Tail 40
```

Ошибку установщика сохраните целиком (скриншот всего окна) — по ней видно причину.

### 21. Как проверена инструкция

- **Mac Вадима, bb 0.45.0, 04–11.10.2026; bb 0.46.0 — 11.10:** настройки и плагины сняты командами `bb settings`,
  `bb plugin list/source/config`, `bb provider models`; 11.10 снимок повторён на 0.46.0 и совпал, кроме
  списка встроенных плагинов (раздел 17).
- **Комплект 0.3.0, bb 0.46.0, 11.10:** все пять плагинов собраны с нуля во временной папке (`npm ci` с пустым
  кэшем, `bb plugin build .`) и прошли тесты: Markdown 28/28, Office 10/10, Folder links 10/10,
  Explorer 373/373, Terminal 86/86. Установка как у bb из Git — клон выпуска по тегу, установка зависимостей
  без инструментов разработки npm-ом из bb, `bb plugin build` — все пять собраны. В bb из папки комплекта
  плагины не устанавливались. Подробно — `VALIDATION.md`.
  Агент Pi с моделями Яндекса, Cloud.ru и LM Studio работает в bb; прогон моделей — 06.10.
- **Терминал:** исправленная вставка проверена в браузере с экраном iPhone и Вадимом на iPhone;
  вкладка в правой панели — в работе у Вадима с 10.10.
- **Windows:** Вадим 08.10.2026 сообщил: «Проверял — на винде всё прекрасно работает».
  Маршрут установки (нативная Windows или WSL) и отдельные сценарии проверки не уточнены;
  проверки каждого провайдера и плагина на Windows отдельно не подтверждены.
- **Linux-сервер:** команды и ссылки сверены с официальной документацией; на настоящем VPS
  эти шаги не выполнялись.
- **Новая машина:** установка в чистый bb на другом компьютере не проверялась; `npm ci` с нуля — только на Mac.
- **bb 0.46.0:** проверены сборка и тесты, установка плагинов комплекта из папки — нет (см. «Новая машина»).
  Поправка темы для кнопок режимов разрешений на 0.46 не перепроверялась.
- Лицензии: комплект — MIT (`LICENSE`), чужой код и шрифты — `THIRD_PARTY_NOTICES.md`.
- В ZIP нет аккаунтов, ключей, `auth.json`, `.env`, баз bb, личных путей и клиентских данных.
  Шаблон `models.json` — без ID каталога и ключей.
- Цены моделей — на 06–07.10.2026; перед оплатой сверяйте в кабинете облака.

Компоненты комплекта — снимок, а не автообновление. После обновления bb пройдите раздел 19.
Справка по командам: `bb guide commands settings`, `bb guide commands plugin`,
`bb guide commands thread`, `bb guide terminals`, `bb guide machines`.

[yandex-ai-studio]: https://aistudio.yandex.ru
[cloud-ru]: https://cloud.ru
