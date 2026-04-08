# E2E-тесты

Проект содержит два набора e2e-тестов:

1. **Vitest-тесты** (`tests/*.test.ts`) — запускаются через `vitest`, используют глобальный сетап и общие хелперы.
2. **Автономный скрипт** (`tests/e2e-test.mjs`) — запускается напрямую через `node`, полностью самостоятельный.

---

## Инфраструктура

### Фикстуры

| Фикстура | Путь | Описание |
|---|---|---|
| `monorepo` | `tests/fixtures/monorepo/` | Плоская структура монорепы |
| `monorepo-deep` | `tests/fixtures/monorepo-deep/` | Глубоко вложенная структура с промежуточным `opencode.json` |

**Структура `monorepo/`:**

```
monorepo/
├── common-utils/
│   ├── helpers.ts        (formatDate, parseConfig)
│   └── validator.ts      (isValidEmail)
├── shared-types/
│   ├── types.ts          (UserProfile, UserId)
│   └── enums.ts          (Status)
└── team-alpha/
    ├── opencode.json     (конфигурация плагина: root=../, dirs=[shared-types, common-utils])
    ├── .opencode/plugins/ext-search/   (копия плагина — добавляется при сетапе)
    └── my-app/
        ├── main.ts       (импортирует UserProfile из shared-types)
        ├── config.json
        └── src/util.ts   (narrowHelper — используется для теста «узкого» пути)
```

**Структура `monorepo-deep/`:**

```
monorepo-deep/
├── common-utils/
│   ├── helpers.ts
│   └── validator.ts
├── shared-types/
│   ├── types.ts
│   └── enums.ts
└── team-alpha/
    ├── opencode.json     (конфигурация плагина: root=../../, dirs=[shared-types, common-utils])
    ├── .opencode/plugins/ext-search/
    └── services/
        ├── opencode.json (промежуточный конфиг с другим плагином — НЕ ext-search)
        └── web/my-app/
            ├── main.ts
            └── config.json
```

Рабочей директорией OpenCode при тестах является:
- **Плоский вариант:** `team-alpha/my-app/`
- **Глубокий вариант:** `team-alpha/services/web/my-app/` — на 4 уровня глубже корня монорепы, при этом на промежуточном уровне `team-alpha/services/` находится «чужой» `opencode.json`.

### Сетап и хелперы

| Файл | Назначение |
|---|---|
| `tests/global-setup.ts` | Создаёт временные директории, копирует фикстуры и плагин, устанавливает env-переменные `EXT_SEARCH_TEST_DIR` и `EXT_SEARCH_DEEP_TEST_DIR` |
| `tests/setup.ts` | Функции `setupTestMonorepo()`, `setupTestMonorepoDeep()`, `getTestDirs()`, `getDeepTestDirs()`, `cleanup()` |
| `tests/helpers.ts` | `runOpencode()`, `runOpencodeJson()`, `findToolEvents()`, `getToolNames()` — запуск OpenCode и парсинг JSON-событий |

### Конфигурация vitest

```ts
// vitest.config.ts
{
  test: {
    globals: true,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    globalSetup: ["tests/global-setup.ts"],
    testTimeout: 180_000,
  }
}
```

Последовательное выполнение (`singleFork`) и увеличенный таймаут (3 мин) — из-за того, что каждый тест запускает реальный процесс OpenCode.

---

## Vitest-тесты: сценарии

### 1. Загрузка плагина (`plugin-load.test.ts`)

**Тест: "loads plugin without errors"**

- Запускает `opencode debug config` в директории `team-alpha/my-app/`
- Проверяет, что stderr не содержит одновременно слова «error» и «plugin»
- **Цель:** убедиться, что плагин загружается без ошибок инициализации

### 2. Базовые операции (`basic-ops.test.ts`)

**Тест: "executes basic bash command in test dir"**

- Отправляет промпт: `Use bash to run: echo test-plugin-ok`
- Ищет среди событий tool_use с tool=bash и status=completed
- Проверяет, что output содержит `test-plugin-ok`
- **Цель:** убедиться, что OpenCode корректно работает с загруженным плагином и может выполнять базовые bash-команды

### 3. Перехват grep (`grep.test.ts`)

#### 3.1. "finds pattern in external dependencies"

- Отправляет промпт на поиск `"UserProfile"` через grep из `team-alpha/my-app/`
- Проверяет в output grep:
  - содержит секцию `"External dependencies"`
  - содержит текст `"UserProfile"`
  - содержит `"types.ts"` — файл из внешней директории `shared-types`
- **Цель:** плагин расширяет область поиска grep, добавляя результаты из внешних зависимостей

#### 3.2. "applies include filter for external results"

- Отправляет промпт на поиск `"formatDate"` с фильтром `include "*.ts"`
- Проверяет, что output содержит `"External dependencies"` или `"helpers.ts"`
- **Цель:** фильтр `include` корректно применяется к результатам из внешних директорий

#### 3.3. "does not duplicate external dependencies when path is already external"

- Отправляет промпт на поиск `"formatDate"` с `path="../../common-utils"`
- Подсчитывает количество секций `--- External dependencies ---` в output
- Проверяет, что секция встречается не более одного раза
- **Цель:** когда путь поиска уже указывает на внешнюю директорию, плагин не дублирует результаты

#### 3.4. "skips external search when subdirectory path is narrow"

- Отправляет промпт на поиск `"narrowHelper"` с `path="src"`
- Проверяет, что output **не содержит** `"External dependencies"`
- **Цель:** при поиске в узкой поддиректории (внутри проекта) плагин не добавляет внешние результаты — они не релевантны

### 4. Перехват glob (`glob.test.ts`)

**Тест: "finds TypeScript files in external dependencies"**

- Отправляет промпт на glob-поиск `"**/*.ts"` из `team-alpha/my-app/`
- Проверяет:
  - output содержит `"External dependencies"`
  - output содержит `types.ts` или `helpers.ts` (файлы из внешних директорий)
- **Цель:** плагин расширяет результаты glob, добавляя файлы из внешних зависимостей

### 5. Инструмент deps_read (`deps-read.test.ts`)

**Тест: "reads file content from external directory"**

- Формирует абсолютный путь к `shared-types/types.ts`
- Отправляет промпт на использование `deps_read` для чтения этого файла
- Проверяет:
  - output — непустая строка
  - output содержит `"UserProfile"` или `"interface"`
- **Цель:** инструмент `deps_read` позволяет читать файлы из внешних директорий, недоступных через обычный `read`

### 6. Глубокая вложенность с промежуточным конфигом (`deep-nesting.test.ts`)

#### 6.1. "finds pattern in external deps despite intermediate opencode.json"

- Рабочая директория: `team-alpha/services/web/my-app/` (4 уровня от корня монорепы)
- На промежуточном уровне `team-alpha/services/` лежит `opencode.json` с другим плагином
- Отправляет промпт на grep `"UserProfile"`
- Проверяет: `"External dependencies"`, `"UserProfile"`, `"types.ts"`
- **Цель:** плагин корректно обходит промежуточные конфигурации и находит конфиг `ext-search` на нужном уровне, даже если на пути встречаются «чужие» `opencode.json`

#### 6.2. "finds files in external deps via glob with deep nesting"

- Та же глубокая структура
- Отправляет промпт на glob `"**/*.ts"`
- Проверяет: `"External dependencies"`, `"helpers.ts"`, `"types.ts"`
- **Цель:** glob также работает корректно при глубокой вложенности проекта

### 7. Логирование (`logging.test.ts`)

**Тест: "writes structured log entries to opencode log files"**

- Запускает bash-команду через OpenCode
- Читает последние log-файлы OpenCode (`~/.local/share/opencode/log/*.log`)
- Ищет строки, содержащие `"service=ext-search"`
- Проверяет:
  - количество таких строк > 0
  - среди них есть строка с `"initialized"` или `"ext-search plugin initializing"`
- **Цель:** плагин пишет структурированные логи через `client.app.log`, что позволяет отслеживать его работу

### 8. Структура логов (`logging-debug.test.ts`)

#### 8.1. "log entries have correct level prefix and service tag"

- Запускает bash-команду, читает логи
- Проверяет, что хотя бы одна строка `service=ext-search` начинается с валидного префикса уровня: `INFO  `, `DEBUG `, `WARN  `, `ERROR `
- **Цель:** лог-записи плагина имеют корректный формат с указанием уровня

#### 8.2. "logs initialized message with directory count and rg info"

- Запускает bash-команду, читает логи
- Проверяет, что среди записей есть строка, содержащая одновременно `"initialized"` и `"dirs="`
- **Цель:** при инициализации плагин логирует количество подключённых внешних директорий и информацию о ripgrep

### 9. Юнит-тесты бюджета (`budget.test.ts`)

Эти тесты проверяют чистые функции из `plugins/ext-search/src/budget.ts` — не являются e2e, но запускаются в общем тестовом наборе.

#### 9.1. `countNonEmptyLines`

| Сценарий | Вход | Ожидание |
|---|---|---|
| Пустая строка | `""` | `0` |
| Несколько строк | `"a\nb\nc"` | `3` |
| Пропуск пустых и пробельных | `"a\n\n  \nb"` | `2` |
| Завершающий перевод строки | `"a\nb\n"` | `2` |

#### 9.2. `calculateBudget`

| Сценарий | Вход | Ожидание |
|---|---|---|
| Пустой output | `""` | `TOTAL_BUDGET` |
| 30 строк | 30×`"some line"` | `TOTAL_BUDGET - 30` |
| 150 строк | 150×`"line"` | `0` (минимум) |
| Ровно TOTAL_BUDGET строк | TOTAL_BUDGET×`"line"` | `0` |
| TOTAL_BUDGET - 1 строк | (TOTAL_BUDGET-1)×`"line"` | `1` |
| Игнорирование пустых строк | 50 строк + 3 пустых | `TOTAL_BUDGET - 50` |

#### 9.3. `buildHint`

| Сценарий | Проверка |
|---|---|
| Содержит пути директорий | `"/a"` и `"/b"` присутствуют |
| Упоминание deps-read | содержит `"deps-read tool"` |
| Объединение путей через запятую | `"/a, /b, /c"` |
| Отступ от основного output | начинается с `"\n\n("` |

#### 9.4. `mergeExternalOutput`

| Сценарий | Вход | Ожидание |
|---|---|---|
| Пустой external | `("main output", "")` | `"main output"` (без изменений) |
| Main содержит "No files found" | `("No files found.\n", "ext")` | `"ext"` (замена) |
| Обычное слияние | `("main", "ext")` | `"main\n\n--- External dependencies ---\next"` |
| Сохранение контента | `("a\nb", "c\nd")` | содержит и `"a\nb"`, и `"c\nd"` |

#### 9.5. `buildRgFallbackHint`

| Сценарий | Проверка |
|---|---|
| Содержит пути директорий | пути присутствуют |
| Упоминание ripgrep | содержит `"ripgrep"` |
| Упоминание deps-read и glob | содержит `"deps-read tool"` и `"glob"` |
| Объединение путей | `"/a, /b, /c"` |
| Отступ | начинается с `"\n\n("` |

---

## Автономный e2e-скрипт (`tests/e2e-test.mjs`)

Самостоятельный скрипт, не требует vitest. Создаёт временную копию фикстуры `monorepo/` и плагина, запускает OpenCode через `child_process.spawnSync`.

### Подготовка (`setupTestMonorepo`)

1. Копирует `tests/fixtures/monorepo/` во временную директорию `/tmp/ext-search-e2e-*`
2. Копирует `plugins/ext-search/` в `team-alpha/.opencode/plugins/ext-search/`
3. Читает `opencode.json` и добавляет `permission.external_directory` с абсолютными путями к `shared-types/*` и `common-utils/*` (allow)

### Тесты скрипта

| # | Название | Сценарий | Проверки |
|---|---|---|---|
| 1 | grep finds pattern in external dependencies | Из директории `team-alpha/my-app/` LLM получает промпт: искать паттерн `"UserProfile"` через grep по всей кодовой базе. Строка `UserProfile` определена в файле `shared-types/types.ts`, который находится за пределами рабочего проекта. Плагин должен перехватить вызов grep, дополнительно запустить поиск во внешних директориях (`shared-types`, `common-utils`) и добавить найденные совпадения в отдельную секцию output. | `"External dependencies"`, `"UserProfile"`, `"types.ts"` |
| 2 | glob finds files in external dependencies | Из директории `team-alpha/my-app/` LLM получает промпт: найти все TypeScript-файлы через glob с паттерном `"**/*.ts"`. Во внешних директориях `shared-types` и `common-utils` лежат `.ts`-файлы, не входящие в рабочий проект. Плагин должен перехватить вызов glob, выполнить поиск во внешних директориях и добавить найденные файлы в отдельную секцию. | `"External dependencies"`, есть `types.ts` или `helpers.ts` |
| 3 | deps_read tool is registered | Плагин регистрирует собственный инструмент `deps_read`, позволяющий читать файлы из внешних директорий. LLM получает промпт с абсолютным путём к файлу `shared-types/types.ts` и инструкцией использовать `deps_read`. Проверяется, что инструмент зарегистрирован, вызывается и возвращает корректное содержимое файла. | output — непустая строка, содержит `"UserProfile"` или `"interface"` |
| 4 | grep with include filter works | Аналогично тесту 1, но с фильтром `include "*.ts"` — поиск `"formatDate"` только в TypeScript-файлах. Функция `formatDate` определена в `common-utils/helpers.ts`. Проверяется, что плагин корректно передаёт параметр `include` в ripgrep при поиске по внешним директориям и не теряет результаты из-за фильтра. | `"External dependencies"` или `"helpers.ts"` |
| 5 | plugin loads without errors | Запускается команда `opencode debug config` в рабочей директории. Проверяется, что в stderr нет одновременно слов «error» и «plugin» — это гарантирует, что плагин инициализируется без ошибок парсинга конфигурации, загрузки модулей и т.д. | stderr не содержит «error» + «plugin» |
| 6 | grep no-duplicate when path is external dir | LLM получает промпт искать `"formatDate"` через grep с явным параметром `path="../../common-utils"`, то есть путь уже указывает на внешнюю директорию. Без корректной обработки плагин мог бы добавить секцию «External dependencies» поверх результатов, которые уже и так пришли из этой директории, создав дубли. Проверяется, что секция `"--- External dependencies ---"` встречается в output не более одного раза. | Секция `"--- External dependencies ---"` встречается ≤ 1 раза |
| 7 | grep with narrow subdirectory path skips external search | LLM получает промпт искать `"narrowHelper"` через grep с `path="src"` — узкая поддиректория внутри проекта (`team-alpha/my-app/src/`). Функция `narrowHelper` определена в `src/util.ts`. Когда поиск ограничен поддиректорией, добавлять результаты из внешних зависимостей некорректно — пользователь ищет локально. Проверяется, что плагин не добавляет секцию «External dependencies». | Output **не** содержит `"External dependencies"` |
| 8 | opencode run basic command works in test dir | Выполняется простейший промпт: запустить `echo test-plugin-ok` через bash. Тест проверяет, что OpenCode в целом работоспособен в тестовой директории с загруженным плагином — плагин не ломает стандартные инструменты. | Output содержит `"test-plugin-ok"` |

### Особенности скрипта

- В каждом тесте LLM может выбрать другой инструмент вместо запрошенного. Если LLM не вызвал нужный инструмент, тест отмечается как **skipped**, а не failed.
- Выводится список инструментов, которые LLM фактически использовал.
- Таймаут каждого запуска OpenCode — 120 секунд.
- После завершения тестов временная директория удаляется.
- Код возврата: `1` если есть failed-тесты, `0` иначе.

---

## Запуск

```bash
# Vitest-тесты (все)
npx vitest run

# Автономный e2e-скрипт
node tests/e2e-test.mjs

# С кастомным бинарником OpenCode
OPENCODE_BIN=/path/to/opencode npx vitest run
OPENCODE_BIN=/path/to/opencode node tests/e2e-test.mjs
```
