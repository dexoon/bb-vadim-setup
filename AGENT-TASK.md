# Задание агенту: настрой bb как у Вадима

Last Updated: 2026-10-11

Комплект 0.3.1 проверен на bb 0.46.0, macOS: 11.10 плагины собраны с нуля (`npm ci`, `bb plugin build .`)
и прошли тесты; до 11.10 комплект проверялся на 0.45.0. Windows проверена Вадимом 08.10.2026 на 0.45.0;
маршрут установки не уточнён. Linux-сервер описан по официальной документации,
на настоящем сервере не испытан.

## Как передать агенту

Распакуйте ZIP в постоянную папку **на компьютере, где работает сервер bb**,
и отправьте в тред bb:

> Настрой мой bb по комплекту в папке ПУТЬ_К_ПАПКЕ/bb-vadim-kit. Прочитай AGENT-TASK.md
> и выполни его. GUIDE.md — полная инструкция для человека, сверяйся с ней. Сохрани мои
> текущие настройки и правила. В конце покажи, что работает и что осталось проверить мне.

bb и хотя бы один агент уже должны работать. Вход в аккаунты выполняет пользователь;
в комплекте нет учётных данных.

## Порядок

Команды `bb …` выполняй во встроенном терминале bb или там, где доступен `$BB_CLI`; на Linux-сервере
по SSH — `npx --package bb-app bb …`. В обычном терминале команды `bb` нет.

1. Определи ОС **компьютера, где работает сервер bb**, и его папку данных:
   `bb --version`, `bb status --json`. Если твой тред работает на другом компьютере,
   сначала выясни, где сервер и какие у него пути. Не ставь плагины на один компьютер,
   рассчитывая, что сервер прочитает диск другого.
2. Проверь `node --version` (нужно 22.19 или новее), `npm --version`, `git --version`.
   Чего-то нет — предложи официальный установщик для этой ОС и подожди. bb и агентов
   сам не обновляй.
3. До изменений сохрани локально: изменяемые значения General, текущую тему и её файлы,
   состояние целевых плагинов, копию существующего `AGENTS.md`. Запиши дату и способ отката
   в локальный отчёт. Не экспортируй базы bb, `auth.json`, `.env`, cookie и хранилища паролей.
4. Сверь `MANIFEST.json`: у каждого файла размер и SHA-256, нет абсолютных путей, `..`,
   symlink наружу и лишних файлов. Если комплект — клон репозитория, `.git`, `.gitignore` и `scripts/`
   в манифест не входят: это служебные файлы репозитория.
5. Поставь профиль ОС по таблице ниже. Плагины лежат в `plugins/`: `markdown-view`, `office-preview`,
   `folder-links`, `floating-terminal`, `files-editor`; в bb они видны с суффиксом `_vibecom`
   (Markdown_vibecom, Office_vibecom, Folder links_vibecom, Terminal_vibecom, Explorer_vibecom).
   В папке каждого: `npm ci` (для `files-editor` и `floating-terminal` — `npm ci --ignore-scripts`), `bb plugin build .`,
   `bb plugin install <абсолютный путь папки> --yes`. Уже установленный плагин не дублируй:
   проверь `bb plugin list` и `bb plugin source <id>`. Если плагин с тем же ID стоит из другого
   источника — Floating Terminal из каталога или **Files editor из git** (`files-editor` из комплекта
   его заменяет), — покажи разницу и спроси, прежде чем делать `bb plugin remove <id>`: настройки
   удалённого плагина пропадут. Если плагин уже стоит из этой же папки комплекта (прошлый ZIP), не
   переустанавливай, а пересобери: `npm ci` (для `files-editor` и `floating-terminal` — `npm ci --ignore-scripts`),
   `bb plugin build .`, `bb plugin reload <id>` (ID — имя папки, не имя с `_vibecom`); сверь версию
   в `bb plugin list` (`floating-terminal@0.6.2`, свои плагины — `@0.3.1`). Explorer_vibecom показывает
   Markdown через сервер Markdown_vibecom: без `markdown-view` его не ставь. Lockfile и версии не меняй. Предупреждение сборки о закреплённой версии SDK — норма;
   `bb plugin types` не выполняй.
6. Скопируй папку `theme/atom-one_vibecom` в каталог из `bb theme dir`, выполни
   `bb theme set atom-one_vibecom`, проверь `bb theme show`. Если там есть тема `atom-one` из прошлого
   комплекта (те же файлы под старым именем), предложи пользователю удалить её после проверки.
7. Примени общие настройки (список ниже) и перечитай их через CLI. Текущего агента,
   модель и effort пользователя не меняй.
8. Объедини `instructions/AGENTS.md` с `<папка данных bb>/AGENTS.md`: добавь блок между
   маркерами `<!-- bb-vadim-setup begin -->` и `<!-- bb-vadim-setup end -->`; при повторном
   запуске обновляй только его. Правила пользователя сохрани, противоречия покажи.
9. Открыватели файлов назначь по разделу 13 GUIDE.md, если тебе доступен интерфейс.
   Есть только CLI — перечисли, что пользователю закрепить в **Settings → File openers**.
10. Российские модели (путь 2 GUIDE.md) — только если пользователь попросил. Скопируй
    `models/pi/models.json` и `models/pi/auth.example.json` в `~/.pi/agent/`
    (`models.json`, `auth.json`), **не перезаписывая** существующие файлы: при наличии —
    покажи, какие блоки добавить. На macOS и Linux сразу выполни `chmod 600 ~/.pi/agent/auth.json`.
    Удали из `models.json` блоки провайдеров, которыми пользователь не будет пользоваться.
    Ключи и ID каталога пользователь вписывает сам; не проси вставлять ключи в чат и не читай
    `auth.json` после заполнения.
11. Проверь сборки и `npm test` в папке каждого из пяти плагинов. В `floating-terminal` запускай только
    `npm test`: другие его скрипты шлют команды в открытый терминал. Из раздела 19 GUIDE.md
    выполни пункты 2–4; остальные (новый и дочерний тред, вид Markdown, документы в Explorer_vibecom,
    офисные файлы, вкладка Terminal_vibecom, ссылка на папку, очередь по Enter, телефон) внеси в список того, что пользователь
    проверит сам. Соблюдай текущие разрешения: не отключай sandbox и не повышай
    режим прав.

## Профили ОС

| Компонент | macOS | Linux-сервер | Windows |
|---|---|---|---|
| Тема atom-one_vibecom | ставить | ставить | ставить, проверить вид |
| Markdown_vibecom (`markdown-view`) | ставить | ставить | ставить как кандидат: ссылки между файлами могут не работать |
| Office_vibecom (`office-preview`) | ставить | ставить, без `.doc/.rtf/.odt` | ставить, без `.doc/.rtf/.odt` |
| Folder links_vibecom (`folder-links`) | ставить | ставить | **пропустить** — нет поддержки путей Windows |
| Terminal_vibecom (`floating-terminal`) | ставить | ставить | ставить как кандидат |
| Explorer_vibecom (`files-editor`) | ставить | ставить; «Open documents in» — не `Mac app`: вне Mac он не работает | ставить; «Open documents in» — не `Mac app` |
| Не давать уснуть | `bb keep-awake enable`, если пользователь попросил | не нужно | `bb keep-awake enable` и параметры электропитания, если попросил |

## Общие настройки

```text
bb settings general steerActiveThreadOnEnter false
bb settings general showKeyboardHints true
bb settings general showDiagnosticEvents false
bb settings general confirmThreadArchive true
bb thread-list prefs set organizationMode project
bb thread-list prefs set environmentGrouping true
bb plugin config floating-terminal set fontSize 13
bb plugin config files-editor set openDocumentsIn "This panel"
bb plugin config provider-retry set maximumWait "24 hours"
```

Команды `bb plugin config floating-terminal …` и `bb plugin config files-editor …` выполняй только после
установки этих плагинов из комплекта. Внешний File Manager из прошлых выпусков не ставь: файлы, загрузку
и скачивание даёт Explorer_vibecom. Если File Manager уже стоит, не удаляй его без просьбы пользователя.
Сочетание Ctrl+` для вкладки Terminal_vibecom задаёт bb
(команда «Terminal_vibecom: open in side panel», Settings → Keyboard) — отдельной настройки плагина нет. Concurrency оставь
автоматическим. Переназначение клавиш Вадима (раздел 8 GUIDE.md) — по желанию пользователя.

## Чего не делать

- Не меняй телеметрию, аккаунты, ключи, глобальные разрешения и текущую модель.
- Не подключай Connect, не выставляй порты наружу, не создавай публичных адресов.
- Не клонируй репозитории без выбора пользователя; не делай commit, push, публикацию,
  покупки и новые треды в рамках этой установки.

## Отчёт

Версии bb, Node.js и ОС; какие плагины `running`, какие пропущены и почему; результаты сборок
и тестов; где резервные копии и как откатить. Отдельно — что пользователю проверить глазами
(открыватели, вид Markdown, документы в Explorer_vibecom, вкладка Terminal_vibecom и терминал с телефона). Установку у пользователя не называй проверенной,
пока не прошли её собственные проверки.
