# Тестовое задание

## Подготовка:

- Создайте проект в [Google Cloud](https://console.cloud.google.com/)
- Укажите обязательную информацию в брендинге https://console.cloud.google.com/auth/branding
- Создайте OAuth клиент https://console.cloud.google.com/auth/clients/create :
  - Тип: Web Application
  - Authorized redirect URIs: добавьте URL по которому будет доступен сервис с путём `/authreturn` (например, если сервис запущен локально и портом приложения указан 5000, укажите URL `http://localhost:5000/authreturn`)
Скопируйте Client ID и Client secret клиента. (При отсутсвии Client secret - создайте его)

## Параметры окружения:

- POSTGRES_PORT - Порт для базы данных
- POSTGRES_DB - Имя базы данныз
- POSTGRES_USER - Имя пользователя 
- POSTGRES_PASSWORD - Пароль
- WB_TOKEN - Токен Wildberries для получения информации о тарифах
- GOOGLE_CLIENT_ID - Client ID OAuth клиента Google
- GOOGLE_CLIENT_SECRET - Client secret OAuth клиента Google
- GOOGLE_REDIRECT_URL - URL на который возвращается код после авторизации
- APP_PORT - Порт сервиса

## Запуск и использование:

Заполните параметры окружения и запустите контейнеры командой:
```bash
docker compose up --build -d
```
Перейдите по пути `/auth` для авторизации Google. Если вы ранее входили в это приложение Google, отзовите его права на странице https://myaccount.google.com/u/0/permissions. Обновление таблиц будет происходить от имени авторизованного пользователя.

Для добавления Google таблицы отправьте POST запрос по пути `/sheets` с JSON объектом, содержащим ID таблицы:
```json
{ "spreadsheet_id": "ID таблицы" }
```

## Команды:

Запуск базы данных:
```bash
docker compose up -d --build postgres
```

Для выполнения миграций и сидов не из контейнера:
```bash
npm run knex:dev migrate latest
```

```bash
npm run knex:dev seed run
```
Также можно использовать и остальные команды (`migrate make <name>`,`migrate up`, `migrate down` и т.д.)

Для запуска приложения в режиме разработки:
```bash
npm run dev
```

Запуск проверки самого приложения:
```bash
docker compose up -d --build app
```

Для финальной проверки рекомендую:
```bash
docker compose down --rmi local --volumes
docker compose up --build
```
