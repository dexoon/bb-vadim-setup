# Шаблоны Pi для российских и локальных моделей

Last Updated: 2026-10-08

- models.json — модели Яндекса (DeepSeek V4.1 Flash, Qwen3.6 35B), Cloud.ru (GLM-5.2,
  Kimi K2.6) и LM Studio (Qwen3.8 27B, Qwen3.6 35B A3B). Ключей нет. Замените
  YOUR_FOLDER_ID на ID каталога Яндекса (два раза).
- auth.example.json — образец файла ключей. Скопируйте в ~/.pi/agent/auth.json и впишите
  свои ключи; на macOS и Linux — chmod 600. Никому не пересылайте.

Pi читает оба файла только из ~/.pi/agent/ (на Windows — %USERPROFILE%\.pi\agent\).
Существующий models.json не перезаписывайте — добавьте нужные блоки в "providers".
Подробно — GUIDE.md, часть 2, путь 2.
