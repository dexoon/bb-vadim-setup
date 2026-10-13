# Плагины BB

Last Updated: 2026-10-11

Каждый подкаталог — отдельный плагин. Установка описана в GUIDE.md, раздел 12:
из Git — `bb plugin install "git:<адрес репозитория>@semver:~0.3.0"
--subdirectory plugins/<папка>`; из папки — `npm ci` (у files-editor и
floating-terminal — `npm ci --ignore-scripts`) → `bb plugin build .` →
`bb plugin install <путь папки>`.

| Папка и id | Имя в BB | Версия | Что делает |
|---|---|---|---|
| markdown-view/ | Markdown_vibecom | 0.3.4 | просмотр Markdown в виде Typora и правка в Vditor |
| office-preview/ | Office_vibecom | 0.3.4 | просмотр таблиц, Word и PowerPoint |
| folder-links/ | Folder links_vibecom | 0.3.4 | ссылки на папки открывают дерево справа; macOS/POSIX |
| files-editor/ | Explorer_vibecom | 0.1.6 | проводник и редактор рабочей копии, документы внутри панели; переделка плагина abdoutelb |
| floating-terminal/ | Terminal_vibecom | 0.6.2 | терминал вкладкой правой панели и плавающим окном; переделка плагина vburojevic |

Суффикс `_vibecom` есть только в видимом имени плагина: id, папки и имена
пакетов прежние, поэтому команды `bb plugin update/reload/remove` используют
id из первой колонки. У двух переделок версии продолжают версии их авторов;
откуда они взяты и что изменено — в их README, лицензии — в LICENSE и
THIRD_PARTY_NOTICES.md.

Explorer_vibecom показывает документы кодом Markdown_vibecom и Office_vibecom:
их папки `src/` — пакеты `@vibecommerce/markdown-view` и `@vibecommerce/office-preview`,
упакованные в `files-editor/vendor/`. Для `.md` нужен установленный Markdown_vibecom.

Исходники взяты из работающих локальных плагинов автора; README заменены
универсальными, в коде Explorer_vibecom обезличены комментарии и тестовые данные.
В package.json трёх своих плагинов добавлено поле license, их версия поднята
до версии комплекта (в package.json и корне package-lock.json). node_modules,
dist, служебные документы, образцы и снимки экрана исключены.
