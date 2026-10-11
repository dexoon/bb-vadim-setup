# Folder links_vibecom 0.3.1

Last Updated: 2026-10-11

Папка и id плагина — `folder-links`; в интерфейсе BB он называется Folder links_vibecom.
Ссылка на папку в сообщении открывает дерево справа. BB >= 0.44, SDK >= 0.5.9.
Читает только внутри домашней папки сервера. Отсутствующая папка подменяется
существующим предком с пояснением. Ссылки на файлы обрабатывает BB.

Установка из Git:

```sh
bb plugin install "git:https://github.com/vibe-commerce-org/bb-vadim-setup.git@semver:~0.3.0" --subdirectory plugins/folder-links
```

Локально, в этой папке: npm ci, bb plugin build ., bb plugin install .
Тесты: npm test (Node.js >= 22.18; проверено на 25.2.1).

Используются POSIX-пути и внутренние селекторы чата BB. Плагин рассчитан
на сервер macOS; локальные Windows-пути не покрыты. После обновления BB
проверьте ссылку на папку. Файлы на другом хосте плагин не обслуживает.
