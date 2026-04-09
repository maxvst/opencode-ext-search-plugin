# Логирование

Плагин отправляет структурированные лог-сообщения через API OpenCode (`client.app.log`). Каждая запись содержит:

| Поле | Значение | Описание |
|---|---|---|
| `service` | `"ext-search"` | Идентификатор службы |
| `level` | `debug`, `info`, `warn`, `error` | Уровень логирования |
| `message` | строка | Человекочитаемое сообщение |
| `extra` | объект (опционально) | Дополнительные контекстные данные |

## Уровни и типичные сообщения

| Уровень | Когда используется | Примеры сообщений |
|---|---|---|
| `debug` | Детальные этапы обработки | `"dispatching to handleGrep"`, `"handleGlob budget"`, `"using Bun.Glob for glob search"` |
| `info` | Ключевые события | `"ext-search plugin initializing"`, `"initialized"`, `"grep found matches"` |
| `warn` | Не-фатальные проблемы | `"no directories configured"`, `"directory not found, skipping"`, `"zod not found"` |
| `error` | Ошибки выполнения | `"Bun.Glob error"`, `"grep error"` |

## Ключевые точки логирования

### Инициализация

- `"ext-search plugin initializing"` — начало инициализации, в `extra` передаются `directory` и `worktree`.
- `"resolved context paths"` — нормализованные `worktree` и `openDir`.
- `"basePath computed"` — вычисленная базовая директория, в `extra` передаются `basePath` и `root`.
- `"resolvedDirs"` — массив разрешённых внешних директорий.
- `"initialized"` — завершение инициализации, в `extra` передаются `dirs` (количество) и `rg` (путь или `"not found"`).

### Обработка grep / glob

- `"tool ignored"` — tool из `IGNORE_TOOLS`, внешний поиск не выполняется.
- `"dispatching to handleGrep"` / `"dispatching to handleGlob"` — начало обработки.
- `"handleGrep budget"` / `"handleGlob budget"` — вычисленный бюджет.
- `"handleGrep: budget exhausted"` / `"handleGlob: budget exhausted"` — бюджет исчерпан, пропуск поиска.
- `"searchPath already in external dirs"` — путь уже указывает на внешнюю директорию.
- `"grep found matches"` / `"glob found files"` — найдены внешние результаты.

### Поиск rg и zod

- `"rg binary found in PATH"` / `"rg binary found in opencode paths"` — найден бинарник rg, в `extra` передаётся `path`.
- `"rg binary not found"` — rg недоступен.
- `"zod not found"` — библиотека zod недоступна.

## Fallback при отсутствии клиента

Если `client.app.log` недоступен (например, при отладке вне OpenCode) и установлена переменная окружения `EXT_SEARCH_DEBUG=1`, логи выводятся в `stderr` в формате:

```
[ext-search HH:MM:SS] [level] message { extra }
```

Без `EXT_SEARCH_DEBUG` и без клиента — логи подавляются полностью.
