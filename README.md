# BB как у Вадима — комплект настройки

Last Updated: 2026-10-11
Версия: 0.3.0 · Лицензия: [MIT](LICENSE) для собственных материалов ·
Сторонние части: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

Инструкция и комплект, чтобы установить [bb](https://github.com/get-bb/bb) и настроить
его так же, как у меня: подключение моделей (в том числе российских), тема, просмотр
и правка Markdown, офисные файлы рядом с чатом, проводник проекта, терминал в панели
треда, ссылки на папки, шаблон правил для агентов. Подходит для кода, документов,
исследований и работы селлера. Доступ к другим репозиториям не нужен.

Это единственный источник комплекта: из него собираются архив `08-BB-VADIM-KIT.zip`,
инструкция `08-BB-VADIM-SETUP.md` и файл для агента `08-BB-AGENT-SETUP.md`.

**Проверено на macOS, bb 0.46.0:** сборка пяти плагинов с нуля и их тесты, установка
так, как это делает bb при установке из Git, тот же код плагинов работает у автора.
Установка из публичного Git проверяется после публикации; Windows проверял автор
на bb 0.45.0, Linux-сервер — только по документации. Подробно — [VALIDATION.md](VALIDATION.md).

## Что внутри

| Путь | Что это |
|---|---|
| [GUIDE.md](GUIDE.md) | Полная инструкция: установка bb, модели, настройка, телефон, проверка |
| [AGENT-TASK.md](AGENT-TASK.md) | Готовое задание кодинговому агенту: настроить bb по комплекту |
| [theme/](theme/README.md) | Тема `atom-one_vibecom` (One Dark / One Light) |
| [plugins/](plugins/README.md) | Исходники плагинов Markdown_vibecom, Office_vibecom, Folder links_vibecom, Explorer_vibecom, Terminal_vibecom |
| [models/pi/](models/pi/README.md) | Шаблоны агента Pi для моделей Яндекса, Cloud.ru и LM Studio, без ключей |
| [instructions/](instructions/README.md) | Универсальный шаблон `AGENTS.md` для агентов в bb |
| [examples/](examples/README.md) | Искусственный `demo.md` для проверки |
| [VALIDATION.md](VALIDATION.md) | Что проверено и что нет |
| [MANIFEST.json](MANIFEST.json) | Состав комплекта: размеры и SHA-256 файлов |
| [CHANGELOG.md](CHANGELOG.md) | История выпусков |
| [scripts/](scripts/README.md) | Сборка и проверка выпуска; в архив не входят |

## Быстрый старт

**Путь 1 — архив.** Скачайте `08-BB-VADIM-KIT.zip` и `08-BB-VADIM-SETUP.md`, распакуйте
архив в `~/Developer` (появится папка `bb-vadim-kit`) и идите по инструкции. Плагины
ставятся из этой папки командами из [GUIDE.md, раздел 12](GUIDE.md#12-мои-плагины-из-комплекта).
Часть 3 инструкции может сделать агент: дайте ему `AGENT-TASK.md` из папки комплекта.

**Путь 2 — Git** (когда репозиторий опубликован). Плагины bb ставит прямо из репозитория
и потом обновляет командой; ставьте только нужные:

```sh
bb plugin install "git:https://github.com/vibe-commerce-org/bb-vadim-setup.git@semver:~0.3.0" --subdirectory plugins/markdown-view
bb plugin install "git:https://github.com/vibe-commerce-org/bb-vadim-setup.git@semver:~0.3.0" --subdirectory plugins/office-preview
bb plugin install "git:https://github.com/vibe-commerce-org/bb-vadim-setup.git@semver:~0.3.0" --subdirectory plugins/folder-links
bb plugin install "git:https://github.com/vibe-commerce-org/bb-vadim-setup.git@semver:~0.3.0" --subdirectory plugins/files-editor
bb plugin install "git:https://github.com/vibe-commerce-org/bb-vadim-setup.git@semver:~0.3.0" --subdirectory plugins/floating-terminal
bb plugin list
```

Тему, правила и шаблоны моделей берите из клона:
`git clone https://github.com/vibe-commerce-org/bb-vadim-setup.git ~/Developer/bb-vadim-setup`.

Explorer_vibecom показывает `.md` через Markdown_vibecom — ставьте их вместе.
Если у вас уже стоят Files editor (abdoutelb) или Floating Terminal (vburojevic),
сначала удалите их: id совпадают (`bb plugin remove files-editor`,
`bb plugin remove floating-terminal`). Folder links_vibecom на Windows пропустите.

## Обновление и откат

| Что | Обновить | Откатить |
|---|---|---|
| Плагин из Git с диапазоном `~0.3.0` | `bb plugin outdated`, затем `bb plugin update ИМЯ` | `bb plugin remove ИМЯ` и установка нужного тега, например `@v0.3.0` |
| Плагин из Git с тегом `@v0.3.0` | закреплён: `remove` и установка нового тега | то же |
| Плагин из папки комплекта | новые файлы в ту же папку, `npm ci`, `bb plugin build .`, `bb plugin reload ИМЯ` | предыдущая версия папки и те же команды |
| Тема | скопировать новую папку `atom-one_vibecom` | резервная копия темы или `bb theme reset` |
| Правила | сравнить новый шаблон со своим `AGENTS.md` и перенести нужное | ваш файл остаётся вашим |

Выпуски 0.3.x совместимы между собой; опубликованные теги не передвигаются.
Диапазоны `~0.1.0` и `~0.2.0` выпуск 0.3.0 не принимают: переустановите плагин
(`bb plugin remove ИМЯ`, затем установка с `@semver:~0.3.0`). Тема с 0.2.0 называется
`atom-one_vibecom`. ИМЯ — id из `bb plugin list`: `markdown-view`, `office-preview`,
`folder-links`, `files-editor`, `floating-terminal`. `bb plugin remove` удаляет настройки,
секреты и расписания плагина (настройки есть у Explorer_vibecom и Terminal_vibecom);
папка комплекта остаётся на диске.

## Ограничения

- Folder links_vibecom использует POSIX-пути и внутренние селекторы чата bb; локальный
  сервер bb на Windows не поддержан.
- Office_vibecom показывает файлы только для чтения; DOC/RTF/ODT конвертирует
  через `textutil` macOS. Его тесты проверяют чтение файлов, но не вёрстку.
- Корзина, домашняя папка, загрузка файлов и «Open in Mac app» в Explorer_vibecom
  работают, когда рабочая копия на том же Mac, что и сервер bb.
- CSS-поправка темы и Folder links_vibecom опираются на внутреннюю разметку bb:
  после обновления bb пройдите [GUIDE.md, раздел 19](GUIDE.md#19-проверка-после-настройки).
- Плагины bb — код с полным доверием. Перед установкой прочитайте источник.

## Участие

Предлагайте исправления через issue или pull request из своего fork.
Личные пути, токены и данные своих проектов в изменения не включайте.
