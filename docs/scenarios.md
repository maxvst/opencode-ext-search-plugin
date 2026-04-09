# Сценарии

## Основной сценарий

Плагин расширяет результаты поиска `grep` и `glob` файлами из внешних директорий.

1. OpenCode вызывает `grep` или `glob`.
2. Плагин перехватывает результат через хук `tool.execute.after`.
3. Если поиск выполнен по директории проекта (worktree или openDir), плагин повторяет поиск с теми же условиями во внешних директориях.
4. Внешние результаты дописываются к исходному ответу.
5. К ответу добавляется перечень внешних директорий.

```mermaid
sequenceDiagram
    participant OC as OpenCode
    participant P as Плагин
    participant ED as Внешние директории

    OC->>OC: grep / glob по директории проекта
    OC->>P: tool.execute.after (input, output)
    P->>P: Проверка условий
    P->>ED: Поиск с тем же pattern
    ED-->>P: Результаты
    P->>P: Слияние output + внешние результаты
    P-->>OC: Модифицированный output
```

---

## Подробные разделы

- [Инициализация плагина](scenarios/plugin-initialization.md) — проверка конфигурации, вычисление basePath, разрешение внешних директорий, обнаружение ripgrep (поиск в PATH и директориях OpenCode, кэширование), поиск zod, сопоставление путей при поиске configDir, глубокая вложенность с промежуточными конфигами
- [Обработка grep / glob](scenarios/grep-glob-processing.md) — цепочка проверок, фильтр include для grep, runtime-подсказка при отсутствии rg, ограничения результатов, алгоритм исключений, реализация glob-поиска (Bun.Glob / walkDir fallback), накопление метаданных, слияние результатов
- [deps_read](scenarios/deps-read.md) — кастомный tool для чтения файлов из внешних директорий, формат вывода readFileContent (нумерация, footer, ошибки)
- [Toast-уведомления об ошибках](scenarios/toast-notifications.md) — перечень toast-уведомлений и порядок проверок
- [Логирование](scenarios/logging.md) — структурированные логи через client.app.log, уровни, ключевые точки логирования, fallback через EXT_SEARCH_DEBUG
- [Внутренняя инфраструктура](scenarios/internal-infrastructure.md) — FsHost (абстракция файловой системы), namespace _testing, spawn (Bun.spawn / child_process fallback), IGNORE_TOOLS
