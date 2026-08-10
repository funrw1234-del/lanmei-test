# Настройка панели редактирования сайта (admin.html)

Пилотная версия: подключен один блок — «Опорные цифры» (5 карточек + подпись,
8 полей). Если подход устроит — доразмечу оставшиеся 16 блоков.

Как это работает: `admin.html` → Cloudflare Worker (хранит пароль и
GitHub-токен как секреты) → GitHub API коммитит изменения прямо в
`index.html` → GitHub Pages сам передеплоивает сайт (1-2 минуты).

Нужно сделать 3 шага — как обычно, аккаунты может завести только владелец.

---

## 1. GitHub-токен (доступ на запись только в этот репозиторий)

1. GitHub → фото профиля (справа сверху) → **Settings**
2. Слева внизу: **Developer settings**
3. **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
4. Заполните:
   - **Token name**: `lanmei-cms`
   - **Expiration**: на ваше усмотрение (например, 1 год)
   - **Repository access**: **Only select repositories** → выберите `lanmei-test`
   - **Permissions** → **Repository permissions** → **Contents** → **Read and write**
     (остальные права не нужны)
5. **Generate token** → скопируйте токен (вида `github_pat_...`) — он показывается
   один раз, сохраните его, он понадобится на шаге 2.

---

## 2. Cloudflare Worker

1. Как и с формами: [dash.cloudflare.com](https://dash.cloudflare.com/) →
   **Workers & Pages** → **Create** → **Start with Hello World!**
2. Имя, например `lanmei-cms`, **Deploy**.
3. **Edit code** → удалите содержимое, вставьте код из
   [`cloudflare-worker/cms-save.js`](cloudflare-worker/cms-save.js) → **Deploy**.
4. **Settings → Variables and Secrets** у этого Worker'а:
   - **Secret** `ADMIN_PASSWORD` — придумайте пароль для входа в панель
   - **Secret** `GITHUB_TOKEN` — токен с шага 1
   - **Text** (обычная переменная) `GITHUB_OWNER` — `funrw1234-del`
   - **Text** `GITHUB_REPO` — `lanmei-test`
   - **Text** `GITHUB_BRANCH` — `main`
5. Скопируйте адрес Worker'а (вида `https://lanmei-cms.ваш-аккаунт.workers.dev`).

---

## 3. Подключить панель

Пришлите мне адрес Worker'а и пароль, который выбрали — впишу в `admin.html`
и запушу. После этого панель будет доступна прямо на сайте:
`https://funrw1234-del.github.io/lanmei-test/admin.html`

---

## Проверка

Откройте `admin.html`, поправьте любое поле в блоке «Опорные цифры»,
впишите пароль, «Сохранить». Через 1-2 минуты обновите главный сайт —
изменение должно быть на месте. Заодно проверьте в GitHub репозитории
(вкладка **Commits**) — должен появиться коммит от CMS.
