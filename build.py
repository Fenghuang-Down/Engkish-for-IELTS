#!/usr/bin/env python3
"""Builds the standalone app (public/index.html) from the Claude version of the course page.
Usage: python3 build.py path/to/ielts-course.html"""
import sys, re, pathlib
src = pathlib.Path(sys.argv[1]).read_text()
here = pathlib.Path(__file__).parent
def rep(s, old, new, cnt=1):
    n = s.count(old)
    if n != cnt: raise SystemExit(f"pattern found {n}x (expected {cnt}): {old[:70]!r}")
    return s.replace(old, new)

s = src
# document head
s = rep(s, '<!doctype html><html><head>', '<!doctype html><html lang="ru"><head>')
s = rep(s, '</style></head><body>', '''</style>
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#1e8a55">
<link rel="icon" href="/icons/icon-192.png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="IELTS 6.5">
</head><body>''')
s = rep(s, '<title>Илья · IELTS 6.5</title>', '<title>IELTS 6.5</title>')
s = re.sub(r'<meta name="claude:[^>]*>\n?', '', s)
# login / onboarding gate + app root
s = rep(s, '<div class="wrap">\n  <header class="top">', '''<div id="gate" class="gate-scr"><div class="gate-card" id="gate-body"><p class="note">Загрузка…</p></div></div>
<div class="wrap" id="app-root" hidden>
  <header class="top">''')
s = rep(s, '<div class="sub">Курс Ильи · 9 ноября 2026 – май 2027</div>', '<div class="sub" id="course-sub">Курс IELTS</div>')
s = rep(s, '<input type="date" id="exam" min="2027-04-01" max="2027-07-31">', '<input type="date" id="exam">')
# main script runs after login
i = s.index('\n<script>\n'); j = s.rindex('</script>')
s = s[:i] + '\n<script type="text/plain" id="main-src">\n' + s[i+len('\n<script>\n'):j] + '</script>\n<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.105.0/dist/umd/supabase.js"></script>\n<script src="/boot.js"></script>' + s[j+len('</script>'):]
# per-user dates and storage
s = rep(s, 'const START = new Date(2026,10,9); // Mon 9 Nov 2026', 'const START = window.__START || new Date(2026,10,9);')
s = rep(s, 'const QSTART=new Date(2026,10,9);', 'const QSTART=START;')
s = rep(s, 'const LS = "ilya-ielts-v2";', 'const LS = "ielts-app-state-"+(window.__UID||"local");')
s = rep(s, 'settings:{examDate:"2027-05-18"}', 'settings:{examDate:(window.__PROFILE&&window.__PROFILE.examDate)||"2027-05-18"}')
s = rep(s, '  function toast(t){', '  window.__toast=t=>toast(t);\n  function toast(t){')
# texts that talked about the Claude chat
T = [
 ('Сохранённые эссе я вижу; напиши в чат «проверь эссе», и я разберу последнее.', 'Нажми «Проверить ИИ», и получишь оценку по 4 критериям IELTS, ошибки и советы.'),
 ('Сохранено. Напиши в чат «проверь эссе».', 'Сохранено. Нажми «Проверить ИИ», чтобы получить разбор.'),
 ('Напиши мне в чат, что тест пройден.', 'Следующий шаг: короткое эссе ниже.'),
 ('Сохранено. Напиши мне в чат, и я проверю.', 'Сохранено.'),
 ('→ отправить Claude', '→ «Проверить ИИ» в «Темах эссе»'),
 ('→ Claude', '→ разбор в «Практике»'),
 ('Отправить Claude оба эссе из пробника', 'Проверить оба эссе пробника кнопкой «Проверить ИИ»'),
 ('<h3>Присылай мне работы на проверку</h3><p>Эссе сохраняй на сайте кнопкой «Сохранить и отправить мне» или вставляй прямо в чат. Speaking записывай на диктофон, расшифровку (диктовкой в телефоне) присылай в чат. Потом напиши «проверь».</p>', '<h3>Проверяй работы с ИИ</h3><p>Эссе: «Темы эссе» → «Проверить ИИ». Speaking: «Практика» → «Speaking», надиктуй ответ текстом и нажми «Разобрать ответ». Лимит ИИ-запросов в день ограничен.</p>'),
 ('сайт должен быть открыт в Claude с разрешением', 'ИИ сейчас недоступен'),
 ('когда сайт открыт в Claude с разрешением', 'когда ИИ доступен'),
]
for a, b in T: s = s.replace(a, b)
# app-only CSS
s = rep(s, '#rd-gate{justify-content:space-between}', '''#rd-gate{justify-content:space-between}
#rv-panel{display:none}
.gate-scr{min-height:100vh;display:grid;place-items:center;padding:24px 16px;box-sizing:border-box;background:var(--bg)}
.gate-scr[hidden]{display:none}
.gate-card{width:100%;max-width:420px;background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:22px;box-sizing:border-box}
.gate-card h1{margin:0 0 8px}.gate-card input,.gate-card select{font:inherit;width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink);margin-top:4px}''')
out = here / "public" / "index.html"
out.write_text(s)
print("built", out, len(s))
