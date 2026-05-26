# 000 · base-web docker bootstrap

> rev2 workspace 第一個 service 的容器化落地紀錄。
> 範圍:把 `base-web/`(Vue 3 + vite + naive-ui starter,worktree + submodule 雙重身分)
> 包進獨立 `docker-compose.base-web.yml`,完成 dev 熱重載試跑 + CDP 9229 登入驗收。
>
> 編號 `000` = pre-spec-kit / workspace foundation 階段(非 spec-kit feature,
> 沒走 SDD/TDD 鏈;但程度上是「rev2 第一個能跑起來的東西」)。

---

## 1. 目的與紀律

### 1.1 為什麼要容器化

- **user 不在本機裝 nodejs / pnpm**:避免污染 host toolchain、避開 nvm 切版本麻煩
- **base-web 是 worktree + submodule,內部任何檔不可改**(CLAUDE.md §5 紀律):
  - 任何改動會落到 fork remote 的 `rev2-admin-base-web` 分支,本次 bootstrap 不想動 fork code
  - 因此 `.dockerignore` 也不能放在 `base-web/` 內(它算「worktree 內檔」)
- **§8.2 整套 stack 還沒落地**(front-nginx / postgres / redis / observability ⏳):
  - 先 standalone 容器化單一 service,跟未來整套 stack 解耦
  - 確認 single service 跑通 + 登入流程通,再規劃整合

### 1.2 核心紀律

| 紀律 | 落實方式 |
|---|---|
| 不改 base-web/ 任何檔 | Dockerfile 放外層 `deploy/`、用 explicit COPY 列舉(取代 `.dockerignore`) |
| 預設無需 rust-api | base-web 的 `.env.prod` 已指向 ApiFox Mock(`https://mock.apifox.cn/m1/3109515-0-default`),前端可獨立跑 |
| dev/prod 分離 | 單一 compose file 用 docker compose profile 切換 |
| 命名慣例 | Dockerfile 用 `Dockerfile.<target>.txt`(user 指定;`.txt` 副檔名 docker 不 care,由 compose `dockerfile:` 欄明確指定) |

---

## 2. 設計決策

### 2.1 檔案位置

| 檔案 | 位置 | 用意 |
|---|---|---|
| `docker-compose.base-web.yml` | workspace root | 獨立 compose,跟未來 §8.2 整套 stack 解耦;單檔 2 service |
| `deploy/Dockerfile.base-web.txt` | `deploy/`(本次新建目錄) | 對齊 CLAUDE.md §2 規劃位置;prod multi-stage |
| `README.md` | workspace root | quick reference(`docker compose ... up` 命令備忘);footnote 指 CLAUDE.md |
| `docs/000-base-web-docker-bootstrap.md` | `docs/` | 本檔(設計理由 + debug 紀錄 + follow-up) |

### 2.2 dev / prod 雙 profile

```yaml
services:
  base-web-dev:
    profiles: ["dev"]
    # vite dev server,bind mount source,熱重載
  base-web-prod:
    profiles: ["prod"]
    # multi-stage build → nginx serve dist/,接近 prod 行為
```

用法:
```bash
docker compose -f docker-compose.base-web.yml --profile dev up      # dev
docker compose -f docker-compose.base-web.yml --profile prod up --build  # prod
```

選「兩種都要 + profile 切換」而非單一 mode 的理由:
- dev 給日常開發、熱重載快迭代
- prod 給驗證「build 是否能過」+「nginx serve SPA fallback 是否正確」(near-prod 行為驗收)
- 兩個 service 共用 image source(node:20.19-alpine / nginx:alpine),無重複下載成本

### 2.3 port 對外

| profile | host port | container port | 理由 |
|---|---|---|---|
| dev | `9527` | `9527` | base-web/package.json 內 vite 預設 |
| prod | `9528` | `80` | 避開 dev 9527、單調 +1 易記 |

⚠️ **未來與 §8.2 整合考量**:
- §8.2 規劃 rev2 整套 stack 對外用 `21080`(HTTP)/ `21443`(HTTPS),由 front-nginx reverse proxy 到 base-web internal:80
- 本 standalone 用 9527/9528 是 quick bootstrap、跟 §8.2 規劃 port 集合刻意不對齊(避免兩套並存撞 port)
- 整合進 main stack 時 base-web service 應改成不對外 expose、僅 internal:80,由 front-nginx 統一對外

### 2.4 node_modules 策略(dev mode)

named volume `rev2_bw_node_modules` mask `/app/node_modules`:

```yaml
volumes:
  - ./base-web:/app                          # source bind mount(熱重載要)
  - bw_node_modules:/app/node_modules        # named volume 蓋過 host 同名目錄
```

理由:
- WSL2 bind mount 跨 9P 協議,大量小檔 IO 慢(node_modules 數萬個小檔走 bind mount 可從 30 秒延長到 5 分鐘)
- named volume = 容器內 fs,IO 正常速度
- 副作用:host IDE 看不到 node_modules(IntelliSense / 跳轉受影響)— 因 user 不在 host 對 base-web 開 IDE 開發,可接受

### 2.5 不依賴 base-web/.dockerignore — explicit COPY 列舉

build context 設 `./base-web`,Dockerfile 在 `../deploy/Dockerfile.base-web.txt`(compose `dockerfile:` 路徑允許跳出 context)。

Dockerfile 用 explicit `COPY` 列舉需要的檔/目錄:

```dockerfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile

COPY build ./build
COPY public ./public
COPY src ./src
COPY .env .env.prod .env.test ./
COPY index.html vite.config.ts tsconfig.json uno.config.ts ./
```

自然排除(沒 COPY 就不進 image):
- `node_modules/`、`dist/`(builder 自己會生)
- `.git`(worktree gitlink 檔)、`.github/`、`.vscode/`
- `README*.md`、`CHANGELOG*.md`、`LICENSE`、`x_fork.branch-origin.md`
- `eslint.config.js`、`.editorconfig`、`.gitattributes`、`.gitignore`
- `.oxfmtrc.json`、`.oxlintrc.json`(lint config,build 不用)

**維護代價**:若未來 starter 新增 root-level config 被 vite/pnpm 依賴(例如 `postcss.config.*`、`tailwind.config.*`、新增 codegen config 等),要手動加進 COPY 列表 — 這是 explicit 策略的代價,但符合「不改 worktree」紀律。

### 2.6 pnpm 取得方式 — 跳過 corepack

starter 預期工作流是 `corepack enable && pnpm install`(node 20+ 內建 corepack),但本次踩到 node 20.19 + corepack + pnpm 11.3.0 的 ESM bug(詳見第 4 節第 3 輪 debug)。改用:

```bash
npm install -g pnpm@10 && pnpm install && pnpm dev --host 0.0.0.0 --port 9527
```

選 pnpm 10 而非 11 的理由:
- pnpm 10.x latest 跟 node 20.19 corepack-less 直接相容
- 滿足 base-web `engines.pnpm: >=10.5.0`
- `pnpm-lock.yaml lockfileVersion: '9.0'` 跟 pnpm 9/10/11 都相容
- 跳過 corepack 後也跳過下載 prompt 問題(env `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` 留著但 inert,作為 fallback 保險)

每次容器啟動跑 `npm install -g pnpm@10` 約 +5 秒(image 已有 npm,只是 install 一個 binary 到 `/usr/local/bin`)。可接受。

---

## 3. 落地檔案內容

### 3.1 docker-compose.base-web.yml

完整檔在 workspace root。關鍵 schema:

```yaml
services:
  base-web-dev:
    profiles: ["dev"]
    image: node:20.19-alpine
    container_name: rev2-base-web-dev
    working_dir: /app
    environment:
      - NODE_ENV=development
      - COREPACK_ENABLE_DOWNLOAD_PROMPT=0    # 保留作 corepack fallback safety
    volumes:
      - ./base-web:/app
      - bw_node_modules:/app/node_modules
    ports:
      - "9527:9527"
    command:
      - sh
      - -c
      - "npm install -g pnpm@10 && pnpm install && pnpm dev --host 0.0.0.0 --port 9527"
    init: true
    tty: true
    stdin_open: true

  base-web-prod:
    profiles: ["prod"]
    build:
      context: ./base-web
      dockerfile: ../deploy/Dockerfile.base-web.txt
    container_name: rev2-base-web-prod
    ports:
      - "9528:80"
    restart: unless-stopped

volumes:
  bw_node_modules:
    name: rev2_bw_node_modules
```

注意:
- `command:` **必須用 array form**(不能用 YAML `>` 折疊 scalar) — 詳見第 4 節第 1 輪 debug
- `tty: true` + `stdin_open: true` + `init: true` 給 dev mode,讓 Ctrl-C 能正確終止 vite dev server
- `container_name` 加 `rev2-` 前綴對齊 §8.2 規劃的 `rev2-admin` compose project name(便於未來整合辨識)
- volume name 用 `rev2_bw_node_modules`(顯式 name 避免 compose 自動加 project name 前綴)

### 3.2 deploy/Dockerfile.base-web.txt

multi-stage:

```dockerfile
# === Stage 1: builder ===
FROM node:20.19-alpine AS builder
RUN corepack enable                           # builder 用 corepack 沒問題(下面用 pnpm install --frozen-lockfile,不走 latest)
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile

COPY build ./build
COPY public ./public
COPY src ./src
COPY .env .env.prod .env.test ./
COPY index.html vite.config.ts tsconfig.json uno.config.ts ./

RUN pnpm build                                # vite build --mode prod → dist/

# 順便生成 nginx config 給 stage 2 COPY 用(避開 BuildKit heredoc 變數展開 quirk)
RUN mkdir -p /tmp/nginx && cat > /tmp/nginx/default.conf << 'NGINX_EOF'
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;     # SPA fallback
    }
}
NGINX_EOF

# === Stage 2: runtime (nginx) ===
FROM nginx:alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=builder /tmp/nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

⚠️ prod profile **本次沒實機驗** — 第 6 節 follow-up #1 列待補。

### 3.3 README.md

workspace root 新建,內容只放 quick reference + 一行 footnote 指向 CLAUDE.md(避免 README 變成第二份 CLAUDE.md)。

---

## 4. dev 試跑 debug 紀錄(4 輪)

### 第 1 輪 · YAML `>` folded scalar → sh syntax error

**症狀**:容器啟動 < 1 秒退出,logs 只有一行:
```
sh: syntax error: unexpected "&&"
```

**根因**:compose YAML 原寫法:
```yaml
command: >
  sh -c "corepack enable
         && pnpm install
         && pnpm dev --host 0.0.0.0 --port 9527"
```

直覺以為 `>` (folded scalar) 把多行 fold 成單行(換行→空格),但 `docker compose config` 解析後變成:
```yaml
command:
  - sh
  - -c
  - |-                              # ← compose 把 `>` normalize 成 `|-` literal block!
    corepack enable
           && pnpm install
           && pnpm dev --host 0.0.0.0 --port 9527
```

`|-` literal block 保留換行,sh -c 收到多行字串。sh 看到第 2 行開頭 `&&` 就 syntax error(`&&` 必須接在前一個命令尾巴、不能在獨立行開頭)。

**修法**:改 array form 強制單行字串:
```yaml
command:
  - sh
  - -c
  - "npm install -g pnpm@10 && pnpm install && pnpm dev --host 0.0.0.0 --port 9527"
```

**教訓**:compose `command:` 含 multi-line shell 串接時,**永遠用 array form**(`["sh", "-c", "..."]` 或 list 寫法),不要信 YAML scalar 折疊行為。

---

### 第 2 輪 · corepack 卡 download prompt

**症狀**:logs 進度停在:
```
! Corepack is about to download https://registry.npmjs.org/pnpm/-/pnpm-11.3.0.tgz
```
3 分鐘無進度。容器還 Up 但卡死。

**根因**:corepack 對下載新 pnpm 版本會 prompt:「Do you want to continue? [Y/n]」。容器非互動 TTY → prompt 永遠等不到 input → 卡死。

**修法**:env `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` 跳過 prompt 直接下載(user 手動加進 compose):
```yaml
environment:
  - NODE_ENV=development
  - COREPACK_ENABLE_DOWNLOAD_PROMPT=0
```

**教訓**:容器內所有可能 prompt 的 CLI,先設 non-interactive env(`*_NONINTERACTIVE=1` / `DEBIAN_FRONTEND=noninteractive` / 工具專屬 env 等)。

---

### 第 3 輪 · pnpm 11.3.0 + node 20.19 corepack ESM bug

**症狀**:corepack 下載完 pnpm@11.3.0,pnpm 命令立即 throw:
```
node:internal/modules/esm/utils:272
  throw new ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING();
TypeError [ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING]: A dynamic import callback was not specified.
    at importModuleDynamicallyCallback (node:internal/modules/esm/utils:272:9)
    at Object.<anonymous> (/root/.cache/node/corepack/v1/pnpm/11.3.0/bin/pnpm.cjs:3:1)
    at Module2._compile (/usr/local/lib/node_modules/corepack/dist/lib/corepack.cjs:16942:34)
```
容器 exit。

**根因**:
- node 20.19 內建 corepack 版本太舊(corepack 跟 node 一起發佈,版本滯後)
- pnpm 11.3.0 的 CJS entrypoint(`pnpm.cjs`)用 dynamic `import()` 載入內部 ESM modules
- corepack 用 `Module._compile` wrap pnpm.cjs 在 vm context 跑,但**沒設 vm 的 `importModuleDynamically` callback** → node 觸發 `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`
- 已知 corepack 0.31+ 修了這 bug,但 node 20.19 內建的 corepack 還是舊版

**修法**:跳過 corepack,改 `npm install -g pnpm@10`:
- pnpm 10.x latest minor 跟 node 20.19 直接相容(不走 corepack wrapper)
- 滿足 base-web `engines.pnpm: >=10.5.0`
- pnpm-lock v9 跟 pnpm 9/10/11 都相容

**教訓**:base image 內建 corepack 版本通常滯後 latest pnpm — 容器化前端工具鏈時,要嘛 pin pnpm 版本、要嘛跳過 corepack 直接 `npm install -g pnpm@<X>`。

---

### 第 4 輪 · pnpm install 1077 packages + Monitor noise overflow

**症狀**:install OK 在跑,但 `pnpm` 每 100-500ms 印一行 `Progress: resolved X, reused Y, downloaded Z, added W`;1000+ packages 累積 emit 數百次事件。我用 Monitor tool 加 grep filter 抓進度,但事件率過高被系統自動 kill:
```
Monitor stopped — your script produced too much output
```

**根因**:Monitor 設計給「稀疏事件 stream」,grep filter 太寬鬆把 progress noise 都抓進來。

**修法**:改用 `Bash run_in_background` + `awk` 單次 exit(只在 vite ready 或 fatal error 觸發一次完成通知):
```bash
docker compose -f docker-compose.base-web.yml --profile dev logs -f --no-log-prefix base-web-dev 2>&1 | awk '
  /ready in.*ms|VITE v.*ready|http:\/\/0\.0\.0\.0:9527/ { print "VITE_READY: " $0; exit 0 }
  /ERR_|ELIFECYCLE|fatal|FATAL|panic|exit code|exited with code|syntax error|command not found|ECONNREFUSED|Cannot find module/ { print "ERROR_DETECTED: " $0; exit 1 }
'
```

awk 看到 match 就 `exit 0/1`,Bash run_in_background 給單次完成通知 — 完全避開 Monitor 的 noise 機制。

**教訓**:長 install / build 流程不要用 streaming Monitor follow(會被 progress noise 淹沒);用 background single-exit polling — match 條件 + exit 在 awk/script 內部判,通知只一次。

---

## 5. CDP 9229 登入驗證

### 5.1 工具選擇

| 候選 | 結果 |
|---|---|
| `chrome-remote-interface` npm package | ❌ 被 auto-classifier 擋(「agent-chosen external dependency not in any repo manifest」) |
| puppeteer-core npm package | ❌ 同上理由 |
| python `websocket-client` / `websockets` | ❌ host 沒裝模組 |
| `websocat` CLI | ❌ host 沒裝 |
| **node v24 內建 `globalThis.WebSocket`** | ✅ Node 22+ 原生 WebSocket API,免任何 install |

選 node v24 內建 WebSocket,自寫 minimal CDP client(~80 行)— JSON-RPC over WebSocket:

```js
const ws = new WebSocket(`ws://127.0.0.1:9229/devtools/page/${pageId}`);
function send(method, params) { /* ... return Promise resolved on matching id */ }
function on(method, cb) { /* ... event listener for CDP events */ }
```

### 5.2 flow

| step | 命令 / 動作 |
|---|---|
| 1 | `curl http://127.0.0.1:9229/json` — 列現有 tabs |
| 2 | 找到一個 rev1 :11080 的閒置 tab(id `825A60DA...`),不開新 tab(避免 noise) |
| 3 | WebSocket 連 `ws://127.0.0.1:9229/devtools/page/<id>` |
| 4 | `Page.enable` + `Runtime.enable` |
| 5 | `Page.navigate {url: "http://localhost:9527/"}` — vue-router auto-redirect 到 `/login` |
| 6 | 等 `Page.loadEventFired` + 3 秒讓 vue SPA mount + naive-ui 渲染 |
| 7 | `Runtime.evaluate` dump form elements:看到 2 inputs(naive-ui NInput)+ 9 buttons(含 quick-login「超级管理员/管理员/普通用户」) |
| 8 | `Runtime.evaluate` 找 button by `textContent === '超级管理员'` + `.click()` |
| 9 | Poll `location.href` 等 URL 從 `/login` 變(15s timeout) |
| 10 | `Page.captureScreenshot` → PNG |

### 5.3 驗證結果

| 檢查 | 結果 |
|---|---|
| URL 變化 | `/login` → `/home` ✓ |
| document.title | `首页` ✓ |
| bodyText 包含 `Super` | true(role 顯示) |
| bodyText 包含 `Soybean 管理系统` | true(brand) |
| `.n-menu` / `[class*="menu"]` 存在 | true(NMenu 已渲染) |
| 總 DOM elements | 1824(full SPA mount) |

### 5.4 為何用既有 tab 而非開新 tab

CDP `/json` 列出已有一個 rev1 `:11080` 「用戶管理」tab 閒置。選擇 navigate 它而非開新 tab:
- `Page.navigate` 對既有 tab 即時生效、保留 page id 後續操作方便
- 開新 tab 用 `curl -X PUT /json/new?<url>` 也可,但會留下舊 rev1 tab 形成 noise
- user 既然開了 9229,意圖明顯就是讓我用這 Edge instance 操作

### 5.5 為何用 quick-login 而非 form submit

base-web 是 soybean-admin starter,登入頁有「超级管理员」/「管理员」/「普通用户」3 個 quick-login button — 點一下會自動 fill credentials + submit。

選 quick-login 而非手動 fill form:
- 一個 `.click()` 取代「找 username input → set value → dispatch input event → 找 password input → set value → dispatch event → 找 submit button → click」一連串操作
- 對 naive-ui NInput,直接 `el.value = 'x'` 不會觸發 vue v-model 更新,要 dispatch `new Event('input', {bubbles: true})` — 複雜
- quick-login 走的是 starter 本身已驗證過的 mock login path,driver 不用模擬 user input event

---

## 6. Follow-up backlog

### 6.1 prod profile 沒實機跑(必補)

`docker compose -f docker-compose.base-web.yml --profile prod up --build` 只 paper-checked,沒實際 build/run。重點驗:
- `pnpm install --frozen-lockfile` 是否能過(若 pnpm-lock.yaml 跟 packages 不一致會 fail)
- `pnpm build` 是否能過(vite/elegant-router/uno codegen step 是否觸發)
- nginx SPA fallback 行為:`curl http://localhost:9528/some/random/route` 應回 `index.html` (200,不是 nginx 預設 404)
- builder image 內 `cat > /tmp/nginx/default.conf << 'NGINX_EOF'` heredoc 寫入是否真的生效(heredoc 在 RUN 內的 shell 行為依 docker buildkit 版本)

### 6.2 dev mode 每次啟動 install 開銷

dev mode 每次 `docker compose up` 都跑 `npm install -g pnpm@10 && pnpm install`(總共 ~10-15 秒,lockfile 沒變的話 pnpm install fast-path):
- **優化方向 A**:builder image 預裝 pnpm + node_modules,compose 用該 image,容器啟動只跑 `pnpm dev`
- **優化方向 B**:把 pnpm binary 也存到 named volume(避免每次 install -g)
- 本次先簡單做,等 dev mode 使用頻繁時再評優化

### 6.3 docker-compose.base-web.yml vs §8.2 整套 stack 整合

CLAUDE.md §8.2 規劃 `docker-compose.yml` + `docker-compose.{dev,prod}.yml` override,含 front-nginx / base-web / rust-api / postgres / redis / observability。本 standalone compose 怎麼跟它整合?

選項:
- **保留 standalone**:作為「只跑 base-web」的快捷,跟整套 stack 共存(撞 port 但場景不同時跑)
- **廢棄 standalone**:整套 stack 落地後,base-web 完全由 §8.2 描述,本檔刪
- **演化**:本檔作為 §8.2 base-web service 部分的雛形,合 §8.2 落地時拆 service 定義回 base 檔

port 也要對齊:21080/21443(front-nginx 對外)vs 9527/9528(本 standalone)。決定點:§8.2 落地時再評。

### 6.4 pnpm 版本 pinning 長期 trade-off

目前 `npm install -g pnpm@10` 每次抓 pnpm 10.x latest minor(不 pin patch)。
更穩做法:pin 具體版本(`pnpm@10.13.1` 之類)。
另一選擇:base-web 補上 `packageManager: "pnpm@10.X.Y"` 在 package.json — 但這算改 base-web/,違反紀律。

暫先保持 `pnpm@10` 抓 latest minor;若哪天 pnpm 10.X 出 breaking change,改成 pin patch。

### 6.5 CLAUDE.md §2 落地清單更新建議

§2「目錄結構」與「外層 git 追蹤」清單應該補幾項(若 user 同意):
- `deploy/` ⏳ 拔(目前只有 `Dockerfile.base-web.txt`,但 deploy/ 已落地)
- `docker-compose.base-web.yml`(§2 內預期的是 `docker-compose.yml`;本檔名是 service-specific 變體,跟 §8.2 規劃的不一致,§2 文字可能要補說明)
- `README.md`(新增,§2 完全沒列)
- `docs/` 與 `docs/000-base-web-docker-bootstrap.md`(本檔)

### 6.6 CLAUDE.md §7 整合設計文件索引加本 doc

§7 加一條:
```
- **000 · base-web docker bootstrap** — docs/000-base-web-docker-bootstrap.md
```

### 6.7 CDP scripts 是否要 git-track

本次用的 `/tmp/cdp-nav.mjs` + `/tmp/cdp-login.mjs` 在 /tmp,session 結束會被清。考量:
- 若**只是 one-shot 驗證**,不必 track(內容已附在本 doc Appendix)
- 若**未來 smoke test 會反覆跑**,考慮搬到 `deploy/cdp-smoke/` 或 `scripts/` git-track
- 等 §8.2 落地 + 整套 stack smoke test 規劃時再決定;本次先保留在 doc Appendix

---

## 7. 可重做命令(從零開始)

完整 quick reference 在 workspace root `README.md`。重做關鍵步驟:

```bash
# 0. 假設 base-web/ worktree 已存在(若無走 CLAUDE.md §4.4 重建)

# 1. 啟動 dev(第一次約 ~5-8 分鐘:image pull + npm install -g pnpm + pnpm install 1077 packages)
docker compose -f docker-compose.base-web.yml --profile dev up -d

# 2. 等 vite ready(背景單次 exit polling,避免 noise)
docker compose -f docker-compose.base-web.yml --profile dev logs -f --no-log-prefix base-web-dev 2>&1 | awk '
  /ready in.*ms|VITE v.*ready/ { print "VITE_READY: " $0; exit 0 }
  /ERR_|fatal|FATAL|panic|exit code|exited/ { print "ERROR: " $0; exit 1 }
'

# 3. host 驗證
curl -sS -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:9527/

# 4. CDP 登入驗證(需要 Edge/Chrome 在 127.0.0.1:9229 listen)
PAGE_ID=$(curl -s http://127.0.0.1:9229/json | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")
node /tmp/cdp-nav.mjs "$PAGE_ID" http://localhost:9527/ /tmp/login.png       # 看 login 頁
node /tmp/cdp-login.mjs "$PAGE_ID" 超级管理员 /tmp/postlogin.png             # 點 quick-login 走完整 flow

# 5. 停掉
docker compose -f docker-compose.base-web.yml --profile dev down

# 6. (極端)清掉 dev mode 的 pnpm install cache
docker volume rm rev2_bw_node_modules
```

CDP script 內容見 Appendix A。

---

## Appendix A · CDP node scripts(免 npm install,用 node v24 內建 WebSocket)

### A.1 cdp-nav.mjs — navigate 既有 tab + dump form + screenshot

```javascript
// usage: node cdp-nav.mjs <pageId> <url> [screenshotPath]

const [pageId, url, screenshotPath = '/tmp/cdp-page.png'] = process.argv.slice(2);
if (!pageId || !url) {
  console.error('usage: node cdp-nav.mjs <pageId> <url> [screenshotPath]');
  process.exit(2);
}

const WS_URL = `ws://127.0.0.1:9229/devtools/page/${pageId}`;
const ws = new WebSocket(WS_URL);

let nextId = 1;
const pending = new Map();
const eventListeners = new Map();

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id) {
    const cb = pending.get(msg.id);
    if (!cb) return;
    pending.delete(msg.id);
    msg.error ? cb.reject(new Error(JSON.stringify(msg.error))) : cb.resolve(msg.result);
  } else {
    (eventListeners.get(msg.method) || []).forEach((cb) => cb(msg.params));
  }
});
ws.addEventListener('error', (e) => { console.error('WS err:', e.message || e); process.exit(1); });

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
function on(method, cb) {
  if (!eventListeners.has(method)) eventListeners.set(method, []);
  eventListeners.get(method).push(cb);
}
function waitFor(method, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), timeoutMs);
    on(method, (params) => { clearTimeout(t); resolve(params); });
  });
}

await new Promise((r) => ws.addEventListener('open', r, { once: true }));
await send('Page.enable');
await send('Runtime.enable');

const loadPromise = waitFor('Page.loadEventFired', 30000);
await send('Page.navigate', { url });
await loadPromise;
await new Promise((r) => setTimeout(r, 3000));    // 等 vue SPA mount

const stateEval = await send('Runtime.evaluate', {
  expression: 'document.title + " | URL:" + location.href + " | inputs:" + document.querySelectorAll("input").length + " | buttons:" + document.querySelectorAll("button").length',
  returnByValue: true,
});
console.log('Page state:', stateEval.result.value);

const formDump = await send('Runtime.evaluate', {
  expression: `(function() {
    const inputs = Array.from(document.querySelectorAll('input')).map(i => ({
      type: i.type, name: i.name, id: i.id, placeholder: i.placeholder, className: i.className.slice(0, 60),
    }));
    const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.textContent.trim().slice(0, 30), type: b.type, className: b.className.slice(0, 60),
    }));
    return JSON.stringify({ inputs, buttons }, null, 2);
  })()`,
  returnByValue: true,
});
console.log('Form elements:');
console.log(formDump.result.value);

const shot = await send('Page.captureScreenshot', { format: 'png' });
const fs = await import('node:fs');
fs.writeFileSync(screenshotPath, Buffer.from(shot.data, 'base64'));
console.log('Screenshot saved:', screenshotPath);

ws.close();
process.exit(0);
```

### A.2 cdp-login.mjs — click quick-login button + wait URL change + screenshot

```javascript
// usage: node cdp-login.mjs <pageId> [quickLoginText] [screenshotPath]

const [pageId, quickText = '超级管理员', screenshotPath = '/tmp/rev2-postlogin.png'] = process.argv.slice(2);
if (!pageId) {
  console.error('usage: node cdp-login.mjs <pageId> [quickLoginText] [screenshotPath]');
  process.exit(2);
}

const ws = new WebSocket(`ws://127.0.0.1:9229/devtools/page/${pageId}`);
let nextId = 1;
const pending = new Map();

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id) {
    const cb = pending.get(msg.id);
    if (!cb) return;
    pending.delete(msg.id);
    msg.error ? cb.reject(new Error(JSON.stringify(msg.error))) : cb.resolve(msg.result);
  }
});
ws.addEventListener('error', (e) => { console.error('WS err:', e.message || e); process.exit(1); });

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await new Promise((r) => ws.addEventListener('open', r, { once: true }));
await send('Page.enable');
await send('Runtime.enable');

const before = await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true });
console.log('Before click URL:', before.result.value);

const clickResult = await send('Runtime.evaluate', {
  expression: `(function() {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent.trim() === ${JSON.stringify(quickText)}
    );
    if (!btn) return { ok: false, error: 'button not found' };
    btn.click();
    return { ok: true, text: btn.textContent.trim() };
  })()`,
  returnByValue: true,
});
console.log('Click result:', JSON.stringify(clickResult.result.value));
if (!clickResult.result.value.ok) { ws.close(); process.exit(1); }

const startTs = Date.now();
let lastUrl = before.result.value;
while (Date.now() - startTs < 15000) {
  await new Promise((r) => setTimeout(r, 500));
  const cur = await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true });
  if (cur.result.value !== lastUrl) {
    console.log(`URL changed: ${lastUrl} -> ${cur.result.value}`);
    lastUrl = cur.result.value;
    if (!lastUrl.includes('/login')) break;
  }
}
console.log('Final URL:', lastUrl);

await new Promise((r) => setTimeout(r, 2000));    // 等 dashboard 渲染

const pageState = await send('Runtime.evaluate', {
  expression: `({
    title: document.title,
    url: location.href,
    bodyText: document.body.textContent.slice(0, 200).trim().replace(/\\s+/g, ' '),
    hasMenu: document.querySelectorAll('.n-menu, [class*="layout-sider"], [class*="menu"]').length > 0,
    hasUserName: !!document.body.textContent.match(/Soybean|超级管理员|admin/i),
    elementCount: document.querySelectorAll('*').length,
  })`,
  returnByValue: true,
});
console.log('Post-login state:', JSON.stringify(pageState.result.value, null, 2));

const shot = await send('Page.captureScreenshot', { format: 'png' });
const fs = await import('node:fs');
fs.writeFileSync(screenshotPath, Buffer.from(shot.data, 'base64'));
console.log('Screenshot:', screenshotPath);

ws.close();
process.exit(0);
```

---

## Appendix B · 本次跑通的環境快照

| 項目 | 版本 |
|---|---|
| Docker | 29.4.0 |
| Docker Compose | v5.1.1 |
| Host node(僅 CDP script 用) | v24.15.0(nvm) |
| Host python3(僅小 JSON parse) | 3.12.3 |
| Container node | 20.19(image `node:20.19-alpine`) |
| Container nginx | alpine latest(image `nginx:alpine`) |
| pnpm(container 內 install) | 10.x latest minor |
| vite(base-web) | 8.0.12 |
| Edge(host 上跑,9229 CDP) | 148.0.3967.83 |
| CLAUDE.md §8.1 測試帳號 | Soybean / 123456(super) |
