# Глоссарий

Директория проекта, директория открытого проекта, открытая директория - значение переменной openDir - директория, открытая в редакторе OpenCode, передается в плагин через параметр directory.

Директория команды, директория конфига - значение переменной configDir - директория, в которой находится opencode.json в котором инициализируется данный плагин.

Базовая директория - хранится в переменной basePath - директория, которая вычисляется на основе configDir и параметра root из opencode.json, если root не задан, производится fallback на worktree.

Директории внешних зависимостей, директории поиска, внешние директории - хранятся в массиве resolvedDirs, вычисляются исходя из basePath и параметров root и directories из opencode.json

Основной поиск - поиск, инициированный OpenCode, на хук которого настроен плагин.

Вспомогательный поиск, расширенный поиск - поиск, который запускается плагином по внешним директориям. 

Toast-уведомление - всплывающее уведомление в интерфейсе OpenCode, вызывается через `client.showToast`. Плагин использует его для информирования о проблемах конфигурации и ограничениях работы.

FsHost - абстракция над файловой системой (интерфейс в `fs-host.ts`), предоставляет методы `existsSync`, `readFileSync`, `statSync`. Используется для мокирования в интеграционных тестах. По умолчанию делегирует вызовы к `fs` модуля Node.js.

_testing - экспортируемый namespace в плагине, предоставляющий функции для настройки тестового окружения: `setFsHost`, `resetFsHost`, `setPluginDirOverride`, `resetConfigState`, `setRgPathOverride`, `resetRgCache`, `resetAll`. Подробнее см. [Внутренняя инфраструктура](scenarios/internal-infrastructure.md#namespace-_testing).

spawn - функция (`process.ts`) для запуска внешних процессов с автоматическим выбором runtime: `Bun.spawn` при доступности, fallback на `child_process.execFileSync`. Возвращает `{ stdout, exitCode }`. Подробнее см. [Внутренняя инфраструктура](scenarios/internal-infrastructure.md#spawn--запуск-внешних-процессов).

IGNORE_TOOLS - множество (`constants.ts`) имён инструментов OpenCode, для которых плагин пропускает обработку в хуке `tool.execute.after`. Содержит: `bash`, `read`, `write`, `edit`, `apply_patch`, `task`, `webfetch`, `websearch`, `codesearch`, `skill`, `question`, `todo`, `batch`, `plan`, `lsp`, `deps_read`. Подробнее см. [Внутренняя инфраструктура](scenarios/internal-infrastructure.md#ignore_tools--набор-игнорируемых-инструментов).

excludePatterns - массив строковых паттернов для исключения файлов и директорий из внешнего поиска. По умолчанию: `["node_modules", ".git", "dist"]`. Паттерны без диких карт проверяют сегменты пути, с дикими картами (`*`, `?`, `[`) — применяют glob-matching к имени файла. Подробнее см. [Обработка grep / glob](scenarios/grep-glob-processing.md#алгоритм-исключений).

configDir, директория конфига - директория, в которой находится `opencode.json`, ссылающийся на данный плагин. Определяется обходом от openDir вверх с поддержкой точного и префиксного сопоставления путей. Подробнее см. [Инициализация плагина](scenarios/plugin-initialization.md#сопоставление-путей-при-поиске-configdir).

Широкий searchPath - searchPath, который не указан, либо совпадает с worktree или openDir. Только при широком searchPath выполняется внешний поиск.

