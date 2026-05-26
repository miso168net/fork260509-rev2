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
| 不改 base-web/ 任何檔 | Dockerfile 放外層 `deploy/`、用 explicit COPY 列舉(取代 `.dockerignore`);pnpm store 重定向避免 fallback 寫 worktree(§2.7) |
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
| `docs/superpowers/000-base-web-docker-bootstrap.md` | `docs/superpowers/` | 本檔(設計理由 + debug 紀錄 + follow-up)— 對齊 CLAUDE.md §3 階段 0 位置 |

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

### 2.7 pnpm store 路徑重定向 + CI=true(避免 cross-fs fallback 污染 worktree)

pnpm 10 預設用 content-addressable global store(`$HOME/.local/share/pnpm/store`),
用 **hardlink** 從 store 連到 node_modules — hardlink **必須在同一 filesystem 內**。

容器內:`$HOME=/root`(image layer fs)≠ `/app`(host bind mount fs)→ 跨 fs →
hardlink 不可用 → pnpm fallback 把 store 放到 `<project-root>/.pnpm-store/` 確保同 fs。
但 `/app` 是 bind mount → store 寫回 host `base-web/.pnpm-store/`(踩到 **1.3 GB 污染**,
違反「不改 worktree」紀律)。

named volume `bw_node_modules` 只 mask `/app/node_modules`,沒 mask `/app/.pnpm-store`,
所以 store 透過 bind mount 漏到 host。

**修法**:env 重定向 + 第三個 named volume,把 store 完全放在 docker volume:

```yaml
environment:
  - npm_config_store_dir=/pnpm-store    # pnpm 認 npm-style env (lowercase)
volumes:
  - ./base-web:/app
  - bw_node_modules:/app/node_modules
  - bw_pnpm_store:/pnpm-store           # 新加 named volume,store 完全留 docker volume

volumes:
  bw_pnpm_store:
    name: rev2_bw_pnpm_store
```

**附加 — `CI=true` 預防 pnpm 跳 confirm prompt 卡 stdin**:

若 named volume `bw_node_modules` 跟 `bw_pnpm_store` 不一致(例如只清一邊),
pnpm install 偵測會跳:

```
The modules directories will be removed and reinstalled from scratch. Proceed? (Y/n) ‣ true
```

`‣ true` 是預設答案 display,但 pnpm 仍等 Enter。容器非互動 TTY → 永遠等不到 → 卡死。
env `CI=true` 讓 pnpm 進 non-interactive mode,自動採用預設答案 proceed。

**驗證**(A 方案成功的指標):
- `pnpm config get store-dir` 在容器內回 `/pnpm-store` ✓
- host `git -C base-web status` 空輸出(無 `.pnpm-store/` 漏出)✓
- 容器內 `/pnpm-store/v10/files` 累積到 ~1.3 GB(內容全在 docker volume)✓
- vite ready 行為不變 ✓

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
      - COREPACK_ENABLE_DOWNLOAD_PROMPT=0    # corepack 不彈 download prompt(保留作 fallback safety)
      - npm_config_store_dir=/pnpm-store     # §2.7 store 重定向到 named volume
      - CI=true                              # §2.7 non-interactive,pnpm 不跳 confirm prompt
    volumes:
      - ./base-web:/app
      - bw_node_modules:/app/node_modules
      - bw_pnpm_store:/pnpm-store            # §2.7 store 完全留 docker volume
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
  bw_pnpm_store:                            # §2.7 新加
    name: rev2_bw_pnpm_store
```

注意:
- `command:` **必須用 array form**(不能用 YAML `>` 折疊 scalar) — 詳見第 4 節第 1 輪 debug
- `tty: true` + `stdin_open: true` + `init: true` 給 dev mode,讓 Ctrl-C 能正確終止 vite dev server
- `container_name` 加 `rev2-` 前綴對齊 §8.2 規劃的 `rev2-admin` compose project name(便於未來整合辨識)
- volume name 用 `rev2_bw_node_modules` / `rev2_bw_pnpm_store`(顯式 name 避免 compose 自動加 project name 前綴)

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

## 4. dev 試跑 debug 紀錄(6 輪)

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

### 第 5 輪 · pnpm 10 cross-fs fallback 污染 worktree(`.pnpm-store` 1.3 GB 漏到 host)

**症狀**:dev 跑起來、登入測通 → outer `git status` 出現:
```
modified:   base-web (untracked content)
```
進去看:`git -C base-web status --short` 顯示 `?? .pnpm-store/`,大小 **1.3 GB**。
違反「不改 worktree」紀律(若不察覺被 commit/push 到 fork remote 就糟了)。

**根因**(完整鏈條):
1. pnpm 預設 `$HOME/.local/share/pnpm/store` 是 global store,用 hardlink 從 store 連 node_modules(省磁碟)
2. hardlink **必須同 filesystem** — 容器內 `$HOME=/root`(image layer)≠ `/app`(host bind mount)
3. pnpm fallback 把 store 放到 `<project-root>/.pnpm-store/` 確保同 fs(這對 native dev 是正解)
4. 但 `/app` 是 bind mount → 寫回 host `base-web/.pnpm-store/`
5. named volume `bw_node_modules` 只 mask `/app/node_modules`,沒 mask `/app/.pnpm-store`,所以漏出去

**驗證**:
- 容器內 `pnpm store path` 回 `/app/.pnpm-store/v10`(在 bind mount 內 = host base-web/.pnpm-store/v10)
- 結構 `files/` + `index/` + `projects/` = pnpm 10 content-addressable layout(`v10` schema version)

**修法**:詳見 §2.7。env `npm_config_store_dir=/pnpm-store` + 第三個 named volume `bw_pnpm_store:/pnpm-store` 把 store 完全留在 docker volume。

清現有污染:
```bash
docker compose -f docker-compose.base-web.yml --profile dev down
rm -rf base-web/.pnpm-store/      # 1.3 GB
docker compose -f docker-compose.base-web.yml --profile dev up -d
```

**驗證 A 方案成功**(全 6 項通過):
| 指標 | 結果 |
|---|---|
| vite ready | `VITE v8.0.12 test ready in 3331 ms` ✓ |
| host `base-web/` worktree | `git status` 空輸出 ✓ |
| host `base-web/.pnpm-store` | 不存在 ✓ |
| `/pnpm-store/v10/files` in named volume | **1.3 GB**(內容全進 docker volume) |
| `/app/node_modules/.pnpm` in bw_node_modules | 1.4 GB |
| `curl http://127.0.0.1:9527` | HTTP 200 / 622 bytes / 10 ms ✓ |

**教訓**:bind mount source + named volume 蓋 node_modules 是常見 dev 容器化 pattern,
但 pnpm / yarn / npm 各自 cache/store 目錄都可能 fallback 到 project root。
**容器化前要 grep 所有工具的 default cache/store 路徑,確認都不會落在 bind mount 內**。

---

### 第 6 輪 · pnpm 卡 confirm prompt(node_modules / store volume 不一致)

**症狀**:加完第 5 輪修法後 down + up,容器跑 23 分鐘卡 prompt,log 停在:
```
Scope: all 9 workspace projects
? The modules directories will be removed and reinstalled from scratch. Proceed? (Y/n) ‣ true
```
`/pnpm-store/v10` 只 2 MB(metadata),但 `/app/node_modules/.pnpm` 已 1.4 GB(上次 install 殘留)。
容器 status 看是 Up,看 logs 才知卡哪。

**根因**:
- down 後 `bw_node_modules` named volume 保留(沒 down -v 也沒 docker volume rm)
- 新加 `bw_pnpm_store` 從零開始(空)
- pnpm install 偵測 node_modules 跟 store **inconsistent**(node_modules 內 packages 對應的 store metadata 在新 volume 內找不到)→ 預設行為跳 confirm prompt
- `‣ true` 是 pnpm 預設答案 display,但仍等 Enter → 容器非互動 TTY → 永遠卡

**修法 ①(立即 unstuck)**:全清相關 volume:
```bash
docker compose -f docker-compose.base-web.yml --profile dev down
docker volume rm rev2_bw_node_modules rev2_bw_pnpm_store
docker compose -f docker-compose.base-web.yml --profile dev up -d
```

**修法 ②(預防)**:env `CI=true` 讓 pnpm 進 non-interactive mode,自動採用預設答案(proceed):
```yaml
environment:
  - CI=true
```

**教訓**:
- 改 volume 結構(加/刪 named volume)時,**所有相關 volume 一起清**或 `down -v`,避免不一致觸發 confirm prompt
- 容器啟動命令包含 install 時,`CI=true` 是基本防護(很多前端工具認這 env 進 non-interactive)
- 卡 stdin 的 prompt **不會主動 error**,容器 status 看是 Up — 必須看 logs 才知卡哪;background polling 加 `Proceed?` 訊號當 error signature 抓得到

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
| 2 | 找到一個 :9527 tab(若無,讓 user 開新 tab 並 navigate;見 §5.7 §5.8) |
| 3 | WebSocket 連 `ws://127.0.0.1:9229/devtools/page/<完整 32 字元 id>`(見 §5.6) |
| 4 | `Page.enable` + `Runtime.enable` |
| 5 | `Page.navigate {url: "http://localhost:9527/"}` — vue-router auto-redirect 到 `/login`(若未登入) |
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

A 方案後重做 fresh re-login 結果:**1824 elements 完全相同** — fresh stack 行為 deterministic ✓

### 5.4 為何用既有 tab 而非開新 tab(本次最初)

CDP `/json` 列出已有一個 rev1 `:11080` 「用戶管理」tab 閒置。選擇 navigate 它而非開新 tab:
- `Page.navigate` 對既有 tab 即時生效、保留 page id 後續操作方便
- 開新 tab 用 `curl -X PUT /json/new?<url>` 也可,但會留下舊 rev1 tab 形成 noise
- user 既然開了 9229,意圖明顯就是讓我用這 Edge instance 操作

⚠️ **但這個策略也踩坑** — 見 §5.8:操作的 tab 不一定是 user 親眼看的 tab。

### 5.5 為何用 quick-login 而非 form submit

base-web 是 soybean-admin starter,登入頁有「超级管理员」/「管理员」/「普通用户」3 個 quick-login button — 點一下會自動 fill credentials + submit。

選 quick-login 而非手動 fill form:
- 一個 `.click()` 取代「找 username input → set value → dispatch input event → 找 password input → set value → dispatch event → 找 submit button → click」一連串操作
- 對 naive-ui NInput,直接 `el.value = 'x'` 不會觸發 vue v-model 更新,要 dispatch `new Event('input', {bubbles: true})` — 複雜
- quick-login 走的是 starter 本身已驗證過的 mock login path,driver 不用模擬 user input event

### 5.6 ⚠️ CDP page id 必須完整 32 字元(8 字元截短被 reject)

`/json` 的 `id` field 是 **32 字元 hex**(例:`9D470061FD35AB266E4E85A38E39FCCF`)。
若 WS URL 用截短的 8 字元(`9D470061`),Chromium reject:
- WebSocket close code **1006**(abnormal,no close frame)
- `error event` 訊息空字串,難以直接看出原因

**踩坑**:命令列 fetch `/json` 為了 print 簡潔用 `id[:8]` 截短顯示,然後**直接拿截短 id 餵 cdp-*.mjs script**。
所有後續 attach 全 fail,我**誤推**為「DevTools 占用」或「internal page 限制」— 都是錯的歸因。

**正解**:從 `/json` 拿完整 id,**永遠不要截短**;或直接讀 `webSocketDebuggerUrl` field 內既有的完整 URL。

```bash
# Wrong:截短 + 手構 URL
ID=$(curl -sS http://127.0.0.1:9229/json | python3 -c "import json,sys;print(json.load(sys.stdin)[0]['id'][:8])")
node script.mjs "$ID"   # ❌ close 1006

# Right:完整 32 字元 id
ID=$(curl -sS http://127.0.0.1:9229/json | python3 -c "import json,sys;print(json.load(sys.stdin)[0]['id'])")
node script.mjs "$ID"   # ✓ work
```

**教訓**:用截短 id 顯示時要 explicit 標明,避免後續誤當完整 id 用。CDP page id 任何 mismatch / 截短 = WS reject;close code 1006 + 空 error message 是常見表徵。

### 5.7 ⚠️ edge:// / chrome:// internal pages 不可 CDP attach

新 tab 預設是 `edge://newtab/` 或 `chrome://newtab/`(Edge/Chrome internal page),
CDP attach 會 reject(security:internal pages 不允許 remote control)。
這個限制即使用完整 32 字元 id 也存在。

**解法**:在新 tab address bar 手動輸入任何 `http(s)://` URL,等 page navigate 出 internal 範圍,
**page id 通常會變**(Chromium 在內部頁 ↔ 外部頁切換時 swap target id)。然後對新 page id 跑 CDP script。

```bash
# 例:user 開新 tab + 輸入 http://localhost:9527/login,然後:
NEW_ID=$(curl -sS http://127.0.0.1:9229/json | python3 -c "
import json, sys
for p in json.load(sys.stdin):
    if p['type']=='page' and 'localhost:9527' in p['url']:
        print(p['id']); sys.exit(0)
")
```

### 5.8 ⚠️ CDP 操作的 page 不一定是 user 親眼看的 tab

CDP `/json` 列出 Edge **所有** inspectable targets — 包括 background tabs / minimized windows / 別的 instances。
若直接「拿第一個 page」當操作目標,可能是 user 沒 focus 的 background tab,
**user 不會親眼看到** navigate / click / URL 變化,雖然 script 印的 log 顯示 success。

**踩坑**:本次第一次 CDP 操作的 page id `825A60DA...` 是某個 rev1 :11080 閒置 tab;
但 user 親眼看的是另一個 rev1 tab(`1EB0A290`)。從 user 視角:「我怎麼沒看到登入成功?」

**對策**:
- 讓 user **明確開一個新 tab** 給 CDP 操作專用(避開 user 既有 tabs 的混淆)
- 該新 tab 先 navigate 到任何 http URL(讓它變 inspectable,§5.7)
- 記下該 tab 完整 32 字元 id,後續所有 CDP 命令對該 id 跑
- User 親眼看那 tab 操作 = 即時驗收

或:讓 user 在他親眼看的 tab 內按 F12 開 DevTools,通常會 attach 該 tab — 但 **DevTools 占用後 CDP script 第二 attach 會 fail**(單一 page 只能一個 client attach,除非用 browser-level WS + `Target.attachToTarget` + `flatten:true`)。

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
- `deploy/` ⏳ 拔(目前有 `Dockerfile.base-web.txt`,deploy/ 已落地)
- `docker-compose.base-web.yml`(§2 內預期的是 `docker-compose.yml`;本檔名是 service-specific 變體,跟 §8.2 規劃的不一致,§2 文字可能要補說明)
- `README.md`(新增,§2 完全沒列)
- `docs/` 與 `docs/superpowers/000-base-web-docker-bootstrap.md`(本檔)

### 6.6 CLAUDE.md §7 整合設計文件索引加本 doc

§7 加一條:
```
- **000 · base-web docker bootstrap** — docs/superpowers/000-base-web-docker-bootstrap.md
```

### 6.7 CDP scripts 是否要 git-track

本次用的 CDP scripts(都在 /tmp,session 結束會被清):
- `/tmp/cdp-nav.mjs` — navigate + dump form elements + screenshot
- `/tmp/cdp-login.mjs` — click quick-login + wait URL change + screenshot
- `/tmp/cdp-clear-and-relogin.mjs` — clear origin storage(localhost:9527)+ navigate /login + quick-login + verify /home(force fresh login,給 re-verify 用)

考量:
- 若**只是 one-shot 驗證**,不必 track(內容已附在 Appendix A)
- 若**未來 smoke test 會反覆跑**,考慮搬到 `deploy/cdp-smoke/` 或 `scripts/` git-track
- 等 §8.2 落地 + 整套 stack smoke test 規劃時再決定;本次先保留在 doc Appendix

---

## 7. 可重做命令(從零開始)

完整 quick reference 在 workspace root `README.md`。重做關鍵步驟:

```bash
# 0. 假設 base-web/ worktree 已存在(若無走 CLAUDE.md §4.4 重建)

# 1. 啟動 dev(第一次約 ~3-5 分鐘:image pull + npm install -g pnpm + pnpm install 1077 packages)
docker compose -f docker-compose.base-web.yml --profile dev up -d

# 2. 等 vite ready(背景單次 exit polling,避免 noise)
docker compose -f docker-compose.base-web.yml --profile dev logs -f --no-log-prefix base-web-dev 2>&1 | awk '
  /ready in.*ms|VITE v.*ready/ { print "VITE_READY: " $0; exit 0 }
  /ERR_|fatal|FATAL|panic|exit code|exited|Proceed\?/ { print "ERROR: " $0; exit 1 }
'

# 3. host 驗證
curl -sS -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:9527/

# 4. CDP 登入驗證(需要 Edge/Chrome 在 127.0.0.1:9229 listen)
#    ⚠️ PAGE_ID 必須完整 32 字元,不要 id[:8] 截短(Chromium reject;見 §5.6)
#    ⚠️ 篩 type=page + url 含 localhost:9527,避開 DevTools 跟 edge://newtab/ 等 internal pages(§5.7)
PAGE_ID=$(curl -s http://127.0.0.1:9229/json | python3 -c "
import json, sys
pages = [p for p in json.load(sys.stdin) if p['type']=='page' and 'localhost:9527' in p['url']]
print(pages[0]['id']) if pages else sys.exit(1)
")
echo "PAGE_ID=$PAGE_ID (長度應為 32: ${#PAGE_ID})"
node /tmp/cdp-nav.mjs   "$PAGE_ID" http://localhost:9527/  /tmp/login.png        # 看 login 頁
node /tmp/cdp-login.mjs "$PAGE_ID" 超级管理员              /tmp/postlogin.png    # 點 quick-login 走完整 flow
# 或:fresh from-zero 重驗(清 session 後重跑完整 flow)
# node /tmp/cdp-clear-and-relogin.mjs "$PAGE_ID" 超级管理员 /tmp

# 5. 停掉(volume 保留 → 下次 up 跳過 pnpm install)
docker compose -f docker-compose.base-web.yml --profile dev down

# 6. (極端)清掉所有 dev mode named volume(下次重 pnpm install 從零)
docker volume rm rev2_bw_node_modules rev2_bw_pnpm_store
```

CDP script 內容見 Appendix A。

---

## Appendix A · CDP node scripts(免 npm install,用 node v24 內建 WebSocket)

### A.1 cdp-nav.mjs — navigate 既有 tab + dump form + screenshot

```javascript
// usage: node cdp-nav.mjs <pageId> <url> [screenshotPath]
// pageId 必須完整 32 字元(見 §5.6)

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
// pageId 必須完整 32 字元(見 §5.6)

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

### A.3 cdp-clear-and-relogin.mjs — force fresh login(clear origin storage + /login + quick-login)

用途:不依賴 session 既有狀態,強制清掉 localhost:9527 的 localStorage / sessionStorage / cookies,
從 `/login` 頁開始走完整 quick-login flow,verify `/home` dashboard。給 re-verify / smoke test 用。

**重要**:用 `Storage.clearDataForOrigin {origin: 'http://localhost:9527'}` 是 **origin-scoped**,
**不會**清其他 origin(例如 :11080)的 cookies。**避免用** `Network.clearBrowserCookies`(browser-level,會清整個 browser 所有 cookies,影響別的 tab session)。

```javascript
// usage: node cdp-clear-and-relogin.mjs <pageId> [quickLoginText] [screenshotDir]
// pageId 必須完整 32 字元(見 §5.6)

const [pageId, quickText = '超级管理员', shotDir = '/tmp'] = process.argv.slice(2);
if (!pageId) { console.error('usage: node cdp-clear-and-relogin.mjs <pageId> [quickLoginText] [shotDir]'); process.exit(2); }

const ws = new WebSocket(`ws://127.0.0.1:9229/devtools/page/${pageId}`);
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
function waitFor(method, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), timeoutMs);
    on(method, (p) => { clearTimeout(t); resolve(p); });
  });
}

await new Promise((r) => ws.addEventListener('open', r, { once: true }));
await send('Page.enable');
await send('Runtime.enable');

console.log('--- clearing storage for localhost:9527 only (origin-scoped, 不影響其他 tab) ---');
await send('Storage.clearDataForOrigin', { origin: 'http://localhost:9527', storageTypes: 'all' });
// Also clear via Runtime (defensive,page 內 navigated 後再清一次)
await send('Runtime.evaluate', {
  expression: 'try { localStorage.clear(); sessionStorage.clear(); } catch(e) {}; document.cookie.split(";").forEach(c => { const eq = c.indexOf("="); document.cookie = (eq > -1 ? c.substr(0, eq) : c) + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/"; });',
});
console.log('storage cleared');

console.log('--- navigate /login ---');
const loadPromise = waitFor('Page.loadEventFired', 15000);
await send('Page.navigate', { url: 'http://localhost:9527/login' });
await loadPromise;
await new Promise((r) => setTimeout(r, 3000));   // SPA mount

const beforeState = await send('Runtime.evaluate', {
  expression: '({ title: document.title, url: location.href, inputCount: document.querySelectorAll("input").length, hasQuickLogin: !!Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim() === ' + JSON.stringify(quickText) + ') })',
  returnByValue: true,
});
console.log('Pre-login state:', JSON.stringify(beforeState.result.value));

if (!beforeState.result.value.url.includes('/login')) {
  console.error('ERROR: not on /login after clear+navigate;router 沒 reset');
  process.exit(1);
}

const fs = await import('node:fs');
const shotLogin = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(`${shotDir}/rev2-fresh-login.png`, Buffer.from(shotLogin.data, 'base64'));
console.log('Login screenshot:', `${shotDir}/rev2-fresh-login.png`);

console.log('--- click quick-login button ---');
const clickResult = await send('Runtime.evaluate', {
  expression: `(function() {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(quickText)});
    if (!btn) return { ok: false, error: 'button not found' };
    btn.click();
    return { ok: true, text: btn.textContent.trim() };
  })()`,
  returnByValue: true,
});
console.log('Click:', JSON.stringify(clickResult.result.value));

const startTs = Date.now();
let lastUrl = '/login';
while (Date.now() - startTs < 15000) {
  await new Promise((r) => setTimeout(r, 500));
  const cur = await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true });
  if (cur.result.value !== lastUrl && !cur.result.value.endsWith('/login')) {
    console.log(`URL: ${lastUrl} -> ${cur.result.value}`);
    lastUrl = cur.result.value;
    if (!lastUrl.includes('/login')) break;
  } else {
    lastUrl = cur.result.value;
  }
}
console.log('Final URL:', lastUrl);

await new Promise((r) => setTimeout(r, 2000));
const postState = await send('Runtime.evaluate', {
  expression: `({
    title: document.title,
    url: location.href,
    hasMenu: document.querySelectorAll('.n-menu, [class*="layout-sider"], [class*="menu"]').length > 0,
    hasSuper: !!document.body.textContent.match(/Super/),
    elementCount: document.querySelectorAll('*').length,
  })`,
  returnByValue: true,
});
console.log('Post-login state:', JSON.stringify(postState.result.value, null, 2));

const shotDash = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(`${shotDir}/rev2-fresh-postlogin.png`, Buffer.from(shotDash.data, 'base64'));
console.log('Dashboard screenshot:', `${shotDir}/rev2-fresh-postlogin.png`);

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
