# Проверка выпуска 0.2.0

Last Updated: 2026-10-11

Среда: macOS, BB 0.46.0 (SDK 0.6.37, npm в составе BB 11.16.0), Node.js 25.2.1,
npm 11.6.2. Итоги выпуска 0.1.0 (BB 0.44.0 и 0.45.0) отмечены отдельно.

## Выполнено для этого выпуска

| Проверка | Результат |
|---|---|
| Перенос плагинов | Код пяти плагинов совпадает с рабочими копиями автора побайтово, кроме: README всех пяти (универсальные), `package.json` и корня `package-lock.json` трёх своих плагинов (поле `license`, версия 0.2.0) и семи файлов Explorer_vibecom, где обезличены комментарии и тестовые данные (`app.tsx`, `components/DocumentView.tsx`, `components/FileView.tsx`, `components/Workspace.tsx`, `lib/secrets.ts`, `lib/secrets.test.ts`, `lib/tree.test.ts`) |
| Работа у автора | Рабочие копии загружены в BB 0.46.0 и в статусе `running` под именами Markdown_vibecom, Office_vibecom, Folder links_vibecom, Explorer_vibecom, Terminal_vibecom |
| Установка как у BB из Git | Локальный тестовый репозиторий с новой историей и тегом `v0.2.0`, клон по тегу. Для каждого из пяти плагинов — `npm install --ignore-scripts --omit=dev --omit=optional` npm-ом из состава BB (файлов `.npmrc` и `.yarnrc` в комплекте нет), затем `bb plugin build`: все пять собраны. У Explorer_vibecom пакеты `@vibecommerce/*` стоят настоящими папками из `vendor/*.tgz` со своими зависимостями, SDK BB не ставится. Саму команду `bb plugin install git:…` этот прогон не заменяет |
| Установка разработчика | Отдельный клон, пустой кэш npm: `npm ci` (у Explorer_vibecom и Terminal_vibecom — `npm ci --ignore-scripts`) — пять плагинов, успешно; `bb plugin build .` — пять плагинов |
| Тесты | Markdown_vibecom: `npm test` 28/28; Office_vibecom: 10/10; Folder links_vibecom: 10/10; Terminal_vibecom: 86/86; Explorer_vibecom: 366/366. Проверка типов (`npm run typecheck`) у Explorer_vibecom и Terminal_vibecom — без ошибок |
| Архивы просмотрщиков | Содержимое `plugins/files-editor/vendor/*.tgz` побайтово совпадает с `src/` Markdown_vibecom и Office_vibecom; это же проверяет тест `lib/vendor-viewers.test.ts` |
| Сборка | BB предупреждает, что закреплённый SDK (0.6.15; у Folder links_vibecom — 0.5.9) старше SDK BB 0.6.37 |
| Тема | `theme.css`, `theme.json`, `one-dark.json` побайтово совпадают с рабочей темой автора `atom-one_vibecom` и с темой `atom-one` выпуска 0.1.0. `bb theme show atom-one_vibecom` находит тему по новому id (без активации) |
| SDK | `sdk.files` (чтение, запись, `createPreview`), на который перешли просмотрщики, есть в типах SDK 0.5.9 и 0.5.29 — нижние границы `engines` оставлены прежними |
| Зависимости | Все пакеты lockfile с `integrity`; источники — registry.npmjs.org, cdn.sheetjs.com (SheetJS) и архивы `vendor/` самого комплекта. В lockfile Explorer_vibecom остались четыре записи без источника от прежних ссылок `file:../…` — на установку не влияют |
| Приватность | Поиск по всем файлам выпуска и по содержимому `vendor/*.tgz`: личные пути, логины, ID тредов BB, имена закрытых репозиториев, брифы, ключи и токены, e-mail, IP — совпадений нет. В тестах — только вымышленные пути (`/Users/me/…`) и ID (`thr_1`); автор в `src/package.json` — тот же, что в `LICENSE` |
| Ссылки | Внутренние ссылки и якоря Markdown существуют. Новые внешние ссылки — на репозитории авторов переделанных плагинов и Nerd Fonts; HTTP-ответы не проверялись |
| Git-источник | Дерево клона по тегу `v0.2.0` совпало с манифестом, размеры и SHA-256 всех файлов — тоже |
| Команды гайда | `bb plugin install/outdated/update/remove/build`, `bb theme list/set/show/dir/reset` сверены со справкой BB 0.46.0 |

## Итоги выпуска 0.1.0

На BB 0.44.0 три плагина работали у автора (`running`), тема `atom-one`
была активна. Чистая сборка и тесты проходили на BB 0.45.0. Проверка
Git-источника на локальном тестовом репозитории с тегом `v0.1.0` прошла.

## Не проверено

- Установка в BB из публичного URL: возможна только после публикации.
- Установка в отдельный чистый профиль BB: у CLI нет отдельного профиля,
  а установка в рабочую среду автора заменила бы его плагины.
- Тема на BB 0.46.0 в активном режиме: при проверке у автора была включена
  тема по умолчанию.
- Windows, Linux, физический телефон, подключение Connect.
- Визуальная точность Office_vibecom и просмотра документов в Explorer_vibecom
  на реальных файлах: тесты проверяют чтение файлов и состав пакетов.
- `npm run test:mobile` у Terminal_vibecom: он шлёт команды в живые терминалы BB.
- Работа кода 0.2.0 на BB 0.43–0.45 и на версиях новее 0.46.0.
