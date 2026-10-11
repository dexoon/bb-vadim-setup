# BB как у Вадима — комплект настройки

Last Updated: 2026-10-11
Версия: 0.2.0 · Лицензия: [MIT](LICENSE) для собственных материалов ·
Сторонние части: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

Открытая инструкция и комплект, чтобы настроить [BB](https://github.com/get-bb/bb)
так же, как у меня: тема, просмотр и правка Markdown, офисные файлы рядом с чатом,
проводник проекта, терминал в панели треда, ссылки на папки, шаблон правил для агентов. Подходит для кода, документов и
исследований. Доступ к другим репозиториям не нужен.

**Проверено на macOS, Node.js 25.2.1, BB 0.46.0:** установка зависимостей и сборка
пяти плагинов так, как это делает BB при установке из Git, тесты; тот же код
плагинов работает у автора. Тема проверялась активной на BB 0.44.0
под прежним именем, файлы с тех пор не менялись. Установка из публичного Git
проверяется после публикации; Windows и телефон не испытывались — см.
[VALIDATION.md](VALIDATION.md).

## Что внутри

| Путь | Что это |
|---|---|
| [GUIDE.md](GUIDE.md) | Полная инструкция: настройки BB, тема, плагины, правила, телефон |
| [theme/](theme/README.md) | Тема `atom-one_vibecom` (One Dark / One Light) |
| [plugins/](plugins/README.md) | Исходники плагинов Markdown_vibecom, Office_vibecom, Folder links_vibecom, Explorer_vibecom, Terminal_vibecom |
| [instructions/](instructions/README.md) | Универсальный шаблон `AGENTS.md` для агентов в BB |
| [examples/](examples/README.md) | Искусственный `demo.md` для проверки |
| [VALIDATION.md](VALIDATION.md) | Что проверено и что нет |
| [MANIFEST.json](MANIFEST.json) | Состав выпуска: размеры и SHA-256 файлов |
| [CHANGELOG.md](CHANGELOG.md) | История выпусков |

## Быстрый старт

Нужны установленный и запущенный BB (`bb --version`) и `git` (`git --version`).
Node.js 22.18+ и npm нужны только для локальной установки из папки и тестов.

**1. Плагины — из Git.** Ставьте только нужные; BB покажет источник и попросит
подтверждение:

```sh
bb plugin install "git:https://github.com/vibe-commerce-org/bb-vadim-setup.git@semver:~0.2.0" --subdirectory plugins/markdown-view
bb plugin install "git:https://github.com/vibe-commerce-org/bb-vadim-setup.git@semver:~0.2.0" --subdirectory plugins/office-preview
bb plugin install "git:https://github.com/vibe-commerce-org/bb-vadim-setup.git@semver:~0.2.0" --subdirectory plugins/folder-links
bb plugin install "git:https://github.com/vibe-commerce-org/bb-vadim-setup.git@semver:~0.2.0" --subdirectory plugins/files-editor
bb plugin install "git:https://github.com/vibe-commerce-org/bb-vadim-setup.git@semver:~0.2.0" --subdirectory plugins/floating-terminal
bb plugin list
```

Explorer_vibecom показывает `.md` через Markdown_vibecom — ставьте их вместе.
Если у вас уже стоят Files editor (abdoutelb) или Floating Terminal (vburojevic),
сначала удалите их: id совпадают (`bb plugin remove files-editor`,
`bb plugin remove floating-terminal`). Folder links_vibecom рассчитан на сервер
BB под macOS; на Windows его пропустите.

**2. Тема, правила, пример — из клона или ZIP релиза.**

```sh
git clone https://github.com/vibe-commerce-org/bb-vadim-setup.git ~/Developer/bb-vadim-setup
bb theme dir
```

Скопируйте папку `theme/atom-one_vibecom` в каталог, который показал `bb theme dir`
(одноимённую тему предварительно сохраните), затем:

```sh
bb theme set atom-one_vibecom
bb theme show
```

Шаблон `instructions/AGENTS.md` просмотрите и объедините со своими правилами
вручную — как описано в [GUIDE.md, раздел 9](GUIDE.md#9-универсальные-инструкции-агентам).
Без Git: скачайте `bb-vadim-setup-v0.2.0.zip` и `SHA256SUMS.txt` со страницы Releases,
сверьте сумму (`shasum -a 256 -c SHA256SUMS.txt`; в PowerShell —
`Get-FileHash`) и распакуйте архив в `~/Developer`: появится папка
`bb-vadim-setup`. Из ZIP плагины ставятся локально: в папке плагина `npm ci`
(у Explorer_vibecom и Terminal_vibecom — `npm ci --ignore-scripts`),
`bb plugin build .`, `bb plugin install .`.

## Обновление и откат

| Что | Обновить | Откатить |
|---|---|---|
| Плагин из Git с диапазоном `~0.2.0` | `bb plugin outdated`, затем `bb plugin update ИМЯ` | `bb plugin remove ИМЯ` и установка нужного тега, например `@v0.2.0` |
| Плагин из Git с тегом `@v0.2.0` | закреплён: `remove` и установка нового тега | то же |
| Локальный плагин | новые файлы, `npm ci`, `bb plugin build .`, `bb plugin reload ИМЯ` | предыдущая версия папки, `npm ci`, `bb plugin build .`, `bb plugin reload ИМЯ` |
| Тема | скопировать новую папку `atom-one_vibecom` из выпуска | резервная копия темы или `bb theme reset` |
| Правила | сравнить новый шаблон со своим `AGENTS.md` и перенести нужное | ваш файл остаётся вашим |

Выпуски 0.2.x совместимы между собой; опубликованные теги не передвигаются.
**Переход с 0.1.x:** диапазон `~0.1.0` выпуск 0.2.0 не принимает, поэтому
`bb plugin update` его не предложит. Переустановите плагин: `bb plugin remove ИМЯ`,
затем установка с `@semver:~0.2.0`. Тема теперь называется `atom-one_vibecom`:
скопируйте новую папку и выполните `bb theme set atom-one_vibecom`.
Обновляйте только нужные части: личные правила и настройки комплект не трогает.
ИМЯ — id из `bb plugin list`: `markdown-view`, `office-preview`, `folder-links`,
`files-editor`, `floating-terminal`. `bb plugin remove` удаляет настройки, секреты
и расписания плагина (настройки есть у Explorer_vibecom и Terminal_vibecom) и
копию, скачанную из Git; локальная папка остаётся на диске.

## Ограничения

- Folder links_vibecom использует POSIX-пути и внутренние селекторы чата BB; локальный
  сервер BB на Windows не поддержан.
- Office_vibecom показывает файлы только для чтения; DOC/RTF/ODT конвертирует
  через `textutil` macOS. Его тесты проверяют чтение файлов, но не вёрстку —
  визуальную точность проверяйте сами.
- Корзина, домашняя папка, загрузка файлов и «Open in Mac app» в Explorer_vibecom
  работают для рабочей копии на Mac с сервером BB.
- CSS-поправка темы и Folder links_vibecom опираются на внутреннюю разметку BB:
  после обновления BB проверьте сценарии из [GUIDE.md, раздел 13](GUIDE.md#13-проверка-после-настройки).
- Плагины BB — код с полным доверием. Перед установкой прочитайте источник.

## Участие

Предлагайте исправления через issue или pull request из своего fork.
Личные пути, токены и данные своих проектов в изменения не включайте.
