# План: Поддержка `compile_commands-dir`

## Архитектурные решения

- **Хранение директорий**: единый массив `ExternalDir[]` с полем `source`
- **Парсинг JSON**: `JSON.parse` целиком; после извлечения директорий — удалить ссылку на распарсенный JSON для GC; debug-логирование времени парсинга

---

## Шаг 1. `types.ts` — новые типы

Добавить:

```ts
type ExternalDir = {
  path: string
  source: "config" | "compile_commands"
  disabled?: boolean
}
```

Добавить поле `compile_commands_dir?: string` в `Options`.

В `SearchDeps` заменить `resolvedDirs: string[]` на `externalDirs: ExternalDir[]` + добавить helper `activeDirPaths: string[]` — массив путей всех не-disabled директорий.

**Все потребители** (`search.ts`, `handler-grep.ts`, `handler-glob.ts`, `auto-permit.ts`, `strict-paths.ts`, `deps-read.ts`) продолжают работать с `string[]` — в `plugin.ts` при вызове передаётся `activeDirPaths`.

---

## Шаг 2. Новый файл `compile-commands.ts`

Функция:

```ts
parseCompileCommands(
  ccDir: string,            // относительный путь из конфига
  configDir: string,        // configDir для резолвинга
  configDirs: ExternalDir[] // уже разрешённые config-директории
): { dirs: ExternalDir[]; error?: string }
```

### Алгоритм

1. `ccAbsPath = path.resolve(configDir, ccDir)`
2. `ccFile = path.join(ccAbsPath, "compile_commands.json")`
3. Проверить существование через `FsHost.existsSync(ccFile)` → если нет, вернуть `{ dirs: [], error: "..." }`
4. Прочитать через `FsHost.readFileSync(ccFile, "utf-8")`
5. `const t0 = Date.now(); const entries = JSON.parse(raw); log.debug("compile_commands parsed", { ms: Date.now()-t0, entries: entries.length })`
6. Очистить `raw` и `entries` после извлечения директорий: `raw = null; entries = null`
7. Для каждой записи:
   - `absFile = entry.file` если абсолютный, иначе `path.resolve(entry.directory, entry.file)`
   - `candidateDir = path.dirname(absFile)`
   - Пропустить если `candidateDir === configDir` или внутри configDir
   - Пропустить если `candidateDir` совпадает или внутри любой config-директории
8. Дедупликация с принципом «нет вложенных»:
   - Использовать `Set<string>` для хранения
   - Для каждой candidateDir:
     - Проверить, является ли она дочерней к существующей в Set → пропустить
     - Проверить, является ли она родительской к существующим → удалить дочерние
     - Добавить
9. Вернуть `{ dirs: [...set].map(p => ({ path: p, source: "compile_commands" })) }`

---

## Шаг 3. `validation.ts` — обновить

Изменить логику: плагин активен, если указан хотя бы один из `directories` или `compile_commands_dir`.

```ts
if (!opts.directories?.length && !opts.compile_commands_dir) {
  return null
}
```

Добавить `compile_commands_dir` в возвращаемый объект.

---

## Шаг 4. `plugin.ts` — интеграция

Основные изменения в `extSearchPlugin`:

1. После `resolveDirectories()` обернуть результат в `ExternalDir[]` с `source: "config"`
2. Если `opts.compile_commands_dir` указан:
   - Вызвать `parseCompileCommands(opts.compile_commands_dir, configResult.dir, configDirs)`
   - При ошибке → показать toast (variant: error)
3. Объединить: `allDirs = [...configDirs, ...ccResult.dirs]`
4. Пометить config-директории: если config-директория является дочерней к cc-директории → `disabled: true`
5. Сформировать `activeDirPaths = allDirs.filter(d => !d.disabled).map(d => d.path)`
6. Проверка активности: если `activeDirPaths.length === 0` → toast + `return {}`
7. Передать `activeDirPaths` во все потребители вместо `dirsResult.resolved`

Потребители, которым нужны изменения в вызовах:

- `createDepsReadTool(activeDirPaths)`
- `searchDeps.resolvedDirs = activeDirPaths` (или `searchDeps.activeDirPaths`)
- `createAutoPermitHandler(activeDirPaths, ...)`
- `createStrictPathBeforeHook(configResult.dir, activeDirPaths, openDir)`

---

## Шаг 5. Обработка ошибок — toast-уведомления

| Условие | Toast |
|---|---|
| `compile_commands-dir` указан, файл не найден | `{ variant: "error", title: "ext-search", message: "compile_commands.json not found at <absPath>" }` |
| `compile_commands.json` невалидный JSON | `{ variant: "error", title: "ext-search", message: "Failed to parse compile_commands.json: <error>" }` |

---

## Шаг 6. Тесты

### Unit-тесты (`tests/unit/compile-commands.test.ts`)

- Извлечение уникальных директорий из compile_commands.json
- Дедупликация: кандидат-дочерняя пропускается
- Дедупликация: кандидат-родительская заменяет дочерние
- Пропуск директорий внутри configDir
- Пропуск директорий внутри config-внешних директорий
- Относительные пути в file
- Абсолютные пути в file
- Пустой массив записей
- Помечание config-директорий как disabled при перекрытии

### Integration-тесты (`tests/integration/compile-commands.test.ts`)

- Плагин инициализируется с compile_commands-dir, externalDirs корректны
- Toast при отсутствии файла
- Toast при невалидном JSON
- Комбинирование config + cc директорий
- Config-директория disabled при перекрытии с cc

---

## Шаг 7. Документация

- `docs/glossary.md`: добавить ExternalDir, source, disabled, compile_commands-dir
- `docs/scenarios/compile-commands.md`: новый сценарий
- `docs/scenarios.md`: добавить ссылку на сценарий
- `docs/scenarios/toast-notifications.md`: добавить новые toast
- `docs/scenarios/plugin-initialization.md`: добавить этап

---

## Поток данных

```
opencode.json
  ├─ directories → resolveDirectories() → configDirs: ExternalDir[{source:"config"}]
  └─ compile_commands-dir → parseCompileCommands() → ccDirs: ExternalDir[{source:"compile_commands"}]
                                    │
                                    ├─ фильтрация: пропустить configDir и его поддиректории
                                    ├─ фильтрация: пропустить configDirs и их поддиректории
                                    ├─ дедупликация: нет вложенных среди ccDirs
                                    │
                                    ▼
                              mergeExternalDirs(configDirs, ccDirs)
                                    │
                                    ├─ пометить config-директории как disabled,
                                    │  если они дочерние к cc-директориям
                                    │
                                    ▼
                              activeDirPaths = allDirs.filter(d => !d.disabled).map(d => d.path)
                                    │
                                    ▼
                              Передать во все потребители
                              (search, auto-permit, strict-paths, deps-read)
```

---

## Порядок выполнения

1. `types.ts` → типы
2. `compile-commands.ts` → парсер
3. `validation.ts` → валидация
4. `plugin.ts` → интеграция
5. Запуск существующих тестов → проверка, что ничего не сломано
6. Новые unit-тесты
7. Новые integration-тесты
8. Вызов субагента tester
9. Вызов субагента docs-writer
