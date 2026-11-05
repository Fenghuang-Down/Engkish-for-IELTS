# IELTS Academic 6.5 — приложение

Курс подготовки к IELTS Academic для разных людей: вход по почте и паролю, у каждого свой прогресс и свой план на 28 недель, работает на компьютере и телефоне (можно «установить» значком на главный экран).

## Как устроено

| Часть | Где | Что делает |
|---|---|---|
| `public/` | Vercel (статичные файлы) | Сам сайт: `index.html`, `boot.js` (вход, профиль, хранение), значки, офлайн-режим |
| `api/ai.js` | Vercel (серверная функция) | ИИ-функции: проверка эссе, Speaking, переводчик, генераторы. Ключ Anthropic хранится только на сервере |
| `api/config.js` | Vercel | Отдаёт сайту публичные настройки Supabase |
| `supabase/schema.sql` | Supabase | Таблица с данными пользователей и счётчик ИИ-запросов |
| `build.py` | — | Собирает `public/index.html` из версии курса в Claude |

## Запуск (один раз)

1. **Supabase.** Создай проект на supabase.com. Открой *SQL Editor → New query*, вставь содержимое `supabase/schema.sql`, нажми *Run*.
2. **Вход без писем.** *Authentication → Sign In / Providers → Email*: выключи **Confirm email** и сохрани. Вход идёт по почте и паролю. (Встроенная почта Supabase отправляет всего несколько писем в час, поэтому письма нужны только для «Забыл пароль».)
3. **Vercel.** *Add New → Project*, выбери репозиторий `ielts-app`, нажми *Deploy*.
4. **Переменные окружения** (Vercel → проект → *Settings → Environment Variables*), потом *Deployments → Redeploy*:

   | Имя | Откуда взять |
   |---|---|
   | `SUPABASE_URL` | Supabase → *Project Settings → API → Project URL* |
   | `SUPABASE_ANON_KEY` | там же, *anon public* |
   | `SUPABASE_SERVICE_ROLE_KEY` | там же, *service_role* (секретный, никому не присылай) |
   | `ANTHROPIC_API_KEY` | console.anthropic.com → *API Keys* (секретный) |
   | `AI_DAILY_LIMIT` | необязательно, сколько ИИ-запросов в день на человека (по умолчанию 60) |
   | `AI_MODEL` | необязательно, по умолчанию `claude-opus-5-5`. `claude-haiku-5-5` примерно в 40 раз дешевле |

5. **Адрес сайта в Supabase.** *Authentication → URL Configuration*: в *Site URL* и *Redirect URLs* впиши адрес от Vercel (например `https://ielts-app.vercel.app`).

## Перенос прогресса из версии в Claude

В старой версии: *Настройки → Перенос данных → Скачать мои данные*. В приложении: *Настройки → Аккаунт → Перенести прогресс* и выбрать файл.

## Обновление курса

Курс правится в версии для Claude, потом: `python3 build.py путь/к/ielts-course.html` и коммит `public/index.html`.
