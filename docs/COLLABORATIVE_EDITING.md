# Collaborative Editing для Reports

## Обзор

Система совместного редактирования позволяет нескольким пользователям одновременно работать над одним отчётом в реальном времени.

## Возможности

### 1. Real-time синхронизация
- Изменения одного пользователя моментально видны другим
- Используется WebSocket (Socket.IO) для низкой задержки
- Автоматическое переподключение при потере связи

### 2. Индикация активных редакторов
- В sidebar панели "Active Editors" видно всех, кто редактирует отчёт
- В header отображаются аватары активных пользователей
- Цветные метки показывают, какое поле редактирует каждый пользователь

### 3. Conflict Resolution (разрешение конфликтов)
- Стратегия: **Last-Write-Wins** (побеждает последнее изменение)
- Все операции записываются с timestamp и sequence number
- При конфликте применяется операция с большим sequence number

### 4. Audit Log
- Все изменения записываются в таблицу `edit_operations`
- Хранится: user_id, field_path, old_value, new_value, timestamp

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                     Strapi Admin Panel                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ Active Editors  │  │ Collaborative   │                   │
│  │    Panel        │  │   Indicator     │                   │
│  └────────┬────────┘  └────────┬────────┘                   │
│           │                    │                             │
│           └──────────┬─────────┘                             │
│                      │                                       │
│           ┌──────────▼──────────┐                            │
│           │ useCollaborativeSocket │                         │
│           │       (React Hook)     │                         │
│           └──────────┬──────────┘                            │
└──────────────────────┼──────────────────────────────────────┘
                       │ WebSocket
┌──────────────────────▼──────────────────────────────────────┐
│                    Strapi Server                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │  Socket.IO      │  │  Collaborative  │                   │
│  │  Plugin (io)    │──│    Service      │                   │
│  └─────────────────┘  └────────┬────────┘                   │
│                                │                             │
│           ┌────────────────────┼────────────────────┐        │
│           │                    │                    │        │
│  ┌────────▼────────┐  ┌────────▼────────┐  ┌───────▼───────┐│
│  │  edit_sessions  │  │ edit_operations │  │    reports    ││
│  │    (table)      │  │    (table)      │  │   (table)     ││
│  └─────────────────┘  └─────────────────┘  └───────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Socket.IO Events

### Client → Server

| Event | Данные | Описание |
|-------|--------|----------|
| `join-report` | `{ reportId, userId, userName, userRole }` | Присоединиться к редактированию |
| `leave-report` | `{ reportId }` | Покинуть редактирование |
| `field-change` | `{ reportId, userId, userName, fieldPath, oldValue, newValue }` | Изменение поля |
| `field-focus` | `{ reportId, userId, userName, fieldPath, cursorPosition }` | Фокус на поле |
| `field-blur` | `{ reportId, userId, userName, fieldPath }` | Потеря фокуса |
| `request-sync` | `{ reportId, sinceSequence }` | Запрос синхронизации |
| `heartbeat` | `{ reportId }` | Keep-alive |

### Server → Client

| Event | Данные | Описание |
|-------|--------|----------|
| `editors-list` | `{ editors }` | Список активных редакторов |
| `user-joined` | `{ userId, userName, userRole, editors }` | Пользователь присоединился |
| `user-left` | `{ userId, userName, editors }` | Пользователь ушёл |
| `field-updated` | `{ userId, userName, fieldPath, newValue, sequence }` | Поле изменено |
| `user-focus` | `{ userId, userName, fieldPath }` | Пользователь фокусируется |
| `user-blur` | `{ userId, userName, fieldPath }` | Пользователь убрал фокус |
| `sync-operations` | `{ operations, currentSequence }` | Операции для синхронизации |
| `change-confirmed` | `{ operation, sequence, applied }` | Подтверждение изменения |
| `error` | `{ message }` | Ошибка |

## API Endpoints

### HTTP API

```
GET  /api/collaborative/editors/:reportId  - Список активных редакторов
POST /api/collaborative/join               - Присоединиться к сессии
POST /api/collaborative/leave              - Покинуть сессию
POST /api/collaborative/operation          - Отправить операцию
GET  /api/collaborative/operations/:reportId - Получить операции
POST /api/collaborative/focus              - Обновить фокус
POST /api/collaborative/cleanup            - Очистить устаревшие сессии
```

## Конфигурация

### config/plugins.js

```javascript
module.exports = ({ env }) => ({
  'collaborative-editing': {
    enabled: true,
    resolve: './src/plugins/collaborative-editing',
  },
  io: {
    enabled: true,
    config: {
      contentTypes: ['api::report.report'],
      socket: {
        serverOptions: {
          cors: {
            origin: env('CORS_ORIGIN', '*'),
            methods: ['GET', 'POST'],
          },
        },
      },
    },
  },
});
```

## Таблицы в БД

### edit_sessions

| Поле | Тип | Описание |
|------|-----|----------|
| id | integer | Primary key |
| report | relation | Связь с отчётом |
| user_id | integer | ID пользователя |
| user_name | string | Имя пользователя |
| user_role | string | Роль |
| socket_id | string | ID сокета |
| connected_at | datetime | Время подключения |
| last_activity | datetime | Последняя активность |
| current_field | string | Текущее поле |
| cursor_position | json | Позиция курсора |

### edit_operations

| Поле | Тип | Описание |
|------|-----|----------|
| id | integer | Primary key |
| report | relation | Связь с отчётом |
| user_id | integer | ID пользователя |
| user_name | string | Имя пользователя |
| operation_type | enum | insert/update/delete |
| field_path | string | Путь к полю (например, "content_blocks.0.title") |
| old_value | json | Старое значение |
| new_value | json | Новое значение |
| timestamp | datetime | Время операции |
| sequence_number | bigint | Порядковый номер |
| applied | boolean | Применено ли |
| conflict_resolved | boolean | Был ли конфликт |

## Ограничения

1. **Не полный Google Docs-стиль**: cursor presence показывает только какое поле редактируется, не точную позицию курсора в тексте
2. **Last-write-wins**: при одновременном редактировании одного поля последнее изменение перезапишет предыдущее
3. **Нет offline support**: требуется постоянное соединение

## Планы развития

- [ ] Operational Transformation для текстовых полей
- [ ] Offline mode с синхронизацией при восстановлении
- [ ] Показ точной позиции курсора в rich-text полях
- [ ] Field-level locking как опция
