# Сценарии

## Основной сценарий

Плагин расширяет результаты поиска `grep` и `glob` файлами из внешних директорий.

1. OpenCode вызывает `grep` или `glob`.
2. Плагин перехватывает результат через хук `tool.execute.after`.
3. Если поиск выполнен по широкой директории (worktree, openDir или любой директории на прямом пути от openDir до configDir), плагин повторяет поиск с теми же условиями во внешних директориях, не покрытых основным поиском.
4. Внешние результаты дописываются к исходному ответу.
5. Если не все внешние результаты уместились в бюджет — к ответу добавляется перечень директорий, где остались не показанные результаты (директории без результатов и те, чьи результаты полностью уместились, исключаются).

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

## Авто-permit (автоматическое разрешение доступа)

Плагин автоматически одобряет запросы OpenCode на доступ к внешним директориям (`external_directory`), если запрошенные пути находятся внутри настроенных внешних директорий (resolvedDirs) или внутри configDir. Это устраняет необходимость ручного подтверждения для каждого обращения к файлам, которые пользователь уже явно указал в конфигурации, а также обеспечивает бесшовную работу при включённом `strict_path_restrictions`.

```mermaid
sequenceDiagram
    participant OC as OpenCode (tool)
    participant Bus as OpenCode (bus)
    participant P as Плагин (event hook)
    participant Check as shouldAutoApprove
    participant Reply as client.permission.reply

    OC->>Bus: Запрос доступа к внешней директории
    Bus->>P: event "permission.asked"
    P->>Check: Проверка путей against resolvedDirs и configDir
    Check-->>P: true (путь внутри resolvedDirs)
    P->>Reply: { requestID, reply: "always" }
    Reply-->>Bus: Разрешение одобрено
```

> Подробное описание: [Авто-permit](scenarios/auto-permit.md)

---

## Ограничение путей поиска (strict_path_restrictions)

При включении опции `strict_path_restrictions` плагин перехватывает вызовы `glob` и `grep` **до** их выполнения через хук `tool.execute.before`. Если путь поиска выходит за пределы configDir и внешних директорий — он перенаправляется в configDir. Это предотвращает выполнение поиска по произвольным областям файловой системы.

```mermaid
sequenceDiagram
    participant OC as OpenCode
    participant Before as Плагин (tool.execute.before)
    participant Tool as glob / grep

    OC->>Before: tool.execute.before (input, output)
    Before->>Before: Проверка: glob или grep?
    Before->>Before: Извлечение output.args.path
    Before->>Before: isAllowedPath(path, configDir, resolvedDirs)
    alt Путь разрешён
        Before-->>OC: Без изменений
    else Путь за пределами разрешённых
        Before->>Before: output.args.path = configDir
        Before-->>OC: Путь перенаправлен
    end
    OC->>Tool: Выполнение с (возможно изменённым) path
```

> Подробное описание: [Ограничение путей поиска](scenarios/strict-path-restrictions.md)

---

## Поддержка compile_commands.json

Плагин умеет автоматически извлекать директории исходных файлов из базы компиляции `compile_commands.json` (опциональный параметр `compile_commands_dir`). Извлечённые директории объединяются с явно указанными config-директориями. Если config-директория оказывается внутри cc-директории — она помечается как disabled, чтобы избежать дублирования.

```mermaid
flowchart TD
    A["opencode.json"] --> B["directories → configDirs"]
    A --> C["compile_commands_dir → parseCompileCommands()"]
    C --> D["ccDirs"]
    B --> E["allDirs = [...configDirs, ...ccDirs]"]
    D --> E
    E --> F["markDisabledConfigDirs()"]
    F --> G["activeDirPaths = не-disabled"]
    G --> H["Передать во все потребители"]
```

> Подробное описание: [Поддержка compile_commands.json](scenarios/compile-commands.md)

---

## Подробные разделы

- [Инициализация плагина](scenarios/plugin-initialization.md) — проверка конфигурации, вычисление basePath, разрешение внешних директорий, извлечение cc-директорий, объединение и фильтрация, обнаружение ripgrep (поиск в PATH и директориях OpenCode, кэширование), поиск zod, сопоставление путей при поиске configDir, глубокая вложенность с промежуточными конфигами
- [Обработка grep / glob](scenarios/grep-glob-processing.md) — цепочка проверок, фильтр include для grep, runtime-подсказка при отсутствии rg, ограничения результатов, алгоритм исключений, реализация glob-поиска (Bun.Glob / walkDir fallback), накопление метаданных, слияние результатов, фильтрация подсказки по результатам поиска
- [deps_read](scenarios/deps-read.md) — кастомный tool для чтения файлов из внешних директорий, формат вывода readFileContent (нумерация, footer, ошибки)
- [Авто-permit](scenarios/auto-permit.md) — автоматическое одобрение запросов `external_directory`, извлечение путей из glob и metadata, авто-одобрение configDir, соображения безопасности
- [Ограничение путей поиска](scenarios/strict-path-restrictions.md) — перехват glob/grep через `tool.execute.before`, проверка путей, перенаправление в configDir
- [Поддержка compile_commands.json](scenarios/compile-commands.md) — извлечение директорий исходных файлов из базы компиляции, дедупликация, пометка config-директорий как disabled, объединение с config-директориями
- [Toast-уведомления об ошибках](scenarios/toast-notifications.md) — перечень toast-уведомлений и порядок проверок
- [Логирование](scenarios/logging.md) — структурированные логи через client.app.log, уровни, ключевые точки логирования, fallback через EXT_SEARCH_DEBUG
- [Внутренняя инфраструктура](scenarios/internal-infrastructure.md) — FsHost (абстракция файловой системы), namespace _testing, spawn (Bun.spawn / child_process fallback), IGNORE_TOOLS, compile-commands (парсер базы компиляции)
