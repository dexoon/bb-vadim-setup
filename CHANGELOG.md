# Changelog

Last Updated: 2026-10-11

Формат — по [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/),
версии — по [SemVer](https://semver.org/lang/ru/).

## [0.2.0] — 2026-10-11

В комплекте пять плагинов: к трём своим добавлены Explorer_vibecom и
Terminal_vibecom. Плагины и тема получили имена с суффиксом `_vibecom`.
Плагины из 0.1.0 с диапазоном `~0.1.0` на 0.2.0 сами не обновятся —
переустановите их с `@semver:~0.2.0` (README, «Обновление и откат»).

### Добавлено

- Explorer_vibecom 0.1.6 (`plugins/files-editor`) — проводник и редактор
  рабочей копии: дерево проекта и домашней папки, сортировка, поиск по именам и
  тексту, меню файла, операции с файлами с корзиной и отменой, загрузка и
  скачивание, PDF, Word, Excel, PowerPoint и Markdown внутри панели, защита
  секретных файлов. Переделка abdoutelb/bb-plugin-files-editor v0.1.6 с кодом
  загрузки из file-manager (xMinor-1/bb-plugins). Ставится из Git: просмотрщики
  лежат в `vendor/` архивами пакетов. Для `.md` нужен установленный Markdown_vibecom.
- Terminal_vibecom 0.6.2 (`plugins/floating-terminal`) — терминал вкладкой в
  правой панели треда и плавающим окном; вставка на iPhone, многострочная
  вставка без выполнения, новый терминал не портит текст в остальных.
  Переделка vburojevic/bb-plugin-floating-terminal v0.5.3.
- Папки `src/` Markdown_vibecom и Office_vibecom — пакеты
  `@vibecommerce/markdown-view` и `@vibecommerce/office-preview` (в npm не
  публикуются); из них Explorer_vibecom показывает документы.
- Тесты: Markdown_vibecom — 28, Office_vibecom — 10, Explorer_vibecom — 366,
  Terminal_vibecom — 86.
- В THIRD_PARTY_NOTICES — полные тексты лицензий MIT авторов переделанных
  плагинов и шрифта Nerd Fonts.

### Изменено

- Видимые имена плагинов: Markdown_vibecom, Office_vibecom, Folder links_vibecom.
  Id, папки и имена пакетов прежние: `markdown-view`, `office-preview`, `folder-links`.
- Тема `atom-one` переименована в `atom-one_vibecom`: новая папка и
  `bb theme set atom-one_vibecom`. Файлы темы не изменились.
- Markdown_vibecom 0.2.0: файл открывается только для чтения в виде Typora
  (Vditor): ссылки, таблицы, метки заголовков, относительные картинки, цвета из
  темы BB. Правка — по кнопке «Редактировать». На телефоне панель инструментов —
  одна строка с прокруткой. Открыватель называется «Markdown (как в Typora, правка)».
  SDK для сборки — 0.6.15.
- Office_vibecom 0.2.0: компоненты просмотра вынесены в `src/openers.tsx`,
  контракт RPC — в `src/rpc.ts`. SDK для сборки — 0.6.15.
- Folder links_vibecom 0.2.0: изменилось только имя.
- GUIDE, раздел 5: вместо сторонних File Manager и Files editor — Explorer_vibecom.
- Версия трёх своих плагинов в `package.json` и корне `package-lock.json` равна
  версии комплекта; их зависимости рабочей установки не изменились.

### Исправлено

- Markdown_vibecom и Office_vibecom читают файлы через `sdk.files` вместо
  внутренних адресов BB: в BB 0.45 эти адреса сменились, и чтение в 0.1.0
  перестало работать. Файлы хранилища треда Markdown_vibecom находит через
  SDK и больше не ограничивает их просмотром.

## [0.1.0] — 2026-10-06

Первый публичный выпуск.

### Добавлено

- `GUIDE.md` — инструкция «Как настроить BB как у Вадима» для любых проектов.
- Тема `atom-one` (One Dark / One Light) с лицензией основы подсветки.
- Плагины Markdown view 0.1.0, Office preview 0.1.0, Folder links 0.1.0:
  установка из Git по подпапке или локально.
- Шаблон `instructions/AGENTS.md` и искусственный пример `examples/demo.md`.
- `LICENSE` (MIT), `THIRD_PARTY_NOTICES.md`, `VALIDATION.md`, `MANIFEST.json`.
