# Phase 0 Research: dockerfile-base-web

**Status**:1 個 critical research 發現(vite env-loading 機制)— 影響 Dockerfile builder stage 實作策略。其餘為 best-practice 確認。本檔為 brainstorm 5 題拍板 + 技術選型 + research 發現的 Decision/Rationale/Alternatives consolidation。

---

## 1. ★ Vite env-loading 機制(critical 發現)

**Decision**:**不**用 `ARG VITE_SERVICE_BASE_URL` + `ENV VITE_SERVICE_BASE_URL=$ARG` + `RUN pnpm build` 路徑;改用 **`RUN echo "VITE_SERVICE_BASE_URL=$VITE_SERVICE_BASE_URL" > .env.prod.local`** 寫入 vite mode-aware env file 的方式。

**Rationale**:

Research grep 結果(`base-web/vite.config.ts`):
```typescript
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(configEnv => {
  const viteEnv = loadEnv(configEnv.mode, process.cwd()) as unknown as Env.ImportMeta;
  // ...
});
```

vite 的 `loadEnv(mode, envDir, prefixes)` 行為(per [vite docs](https://vite.dev/config/#environment-variables)):
- **只讀** `.env` 系列檔案(`.env` / `.env.local` / `.env.[mode]` / `.env.[mode].local`)
- **不讀** `process.env`(VITE_ prefix env var 必須在 .env 檔內)
- precedence:`.env.[mode].local` > `.env.[mode]` > `.env.local` > `.env`

base-web `package.json` script:
```json
"build": "vite build --mode prod"
```

→ mode = `prod`(非 `production`),vite 讀檔順序:`.env.prod.local` > `.env.prod` > `.env.local` > `.env`

**因此**:Dockerfile builder 內 `ENV VITE_SERVICE_BASE_URL=$ARG` 設了 process env、但 vite 完全忽略;`RUN pnpm build` 出來的 dist/ bundle 內仍是 `.env.prod` 原值(ApiFox Mock URL)。brainstorm 提的 ARG+ENV 路徑**不會生效**。

**正解**:在 builder 內 `RUN echo "VITE_SERVICE_BASE_URL=$VITE_SERVICE_BASE_URL" > .env.prod.local` 寫入 mode-aware local override 檔(`.env.prod.local` 的 precedence 高於 `.env.prod`)。vite `loadEnv` 會讀到並 inline 進 bundle。

**安全性**:
- `base-web/.gitignore` line 15 含 `*.local` → 即使我們在 host base-web/ 寫 .env.prod.local 也不會誤 commit;builder 內寫的更只存在 image filesystem
- `.env.prod.local` 內容 = user 透過 build-arg 傳的 URL,屬 user-controlled、非 secret leak

**Alternatives considered**:
- **ARG + ENV + pnpm build**(brainstorm 原案)— 拒絕:research 證實 vite 不讀 process.env、無效
- **sed -i `.env.prod` `s/.../.../`**(改既有檔)— 拒絕:破壞 base-web inline、違反 constitution §I.1 不改 inline 紀律;且 source COPY 進 image 後 sed,改的是 image 內的副本、host 不動,但語義上是「改 base-web/.env.prod」、未來 reader 看 Dockerfile 容易誤會
- **`vite build --mode prod-rev2` + 新建 `.env.prod-rev2`**(換 mode 名)— 拒絕:要動 base-web `package.json` script + 新增 inline `.env.prod-rev2` 檔(兩處違反 §I.1);過度設計
- **直接覆寫整個 `.env.prod`**(image 內 RUN cat > .env.prod ...)— 拒絕:破壞既有檔內容(.env.prod 還有 VITE_OTHER_SERVICE_BASE_URL 等其他 key);只用 .env.prod.local 加 override 才精準

**驗證對應**:spec FR-014/015/016/017 + SC-003(grep > 0 verify URL inline)

---

## 2. Multi-stage Dockerfile 結構

**Decision**:保留 2 stage(`builder` + `runtime`),**不**加 dev stage(brainstorm 拍板 A 方案、dev 走 inline command 路線)。

**Rationale**:
- 000 既有 2 stage 結構穩定,6 輪 debug 紀錄(corepack ESM bug / pnpm store cross-fs / CI=true 等)都綁在 compose inline command 上
- 加 dev stage 雖節省 ~5s pnpm install per up,但要全部移植 6 輪 debug 紀錄 trick 到 Dockerfile、維護面積大且引入 dev image rebuild 成本
- YAGNI 對齊:dev pattern 不必跟 001 結構強對齊(rust-api 用 cargo-watch 是 toolchain 差異、不是模板)

**Alternatives considered**:
- 3 stage(builder + dev + runtime,完全對齊 001)— 拒絕:見上
- 1 stage(builder 直接 serve 不 multi-stage)— 拒絕:prod image 帶 node + pnpm + source 過肥(估 600MB+ vs 80MB),違反 SC-004 < 80MB

**驗證對應**:brainstorm §2 / spec FR-024/025(凍結 2 stage 結構)

---

## 3. HEALTHCHECK probe 命令(nginx:alpine 限制)

**Decision**:`HEALTHCHECK CMD wget -qO- http://127.0.0.1:21079/health.html | grep -q "ok" || exit 1`

**Rationale**:
- `nginx:alpine`(基於 alpine + busybox)**含 wget 不含 curl** — 用 wget 才不用裝 apt
- 001 rust-api 用 `curl -fsS` 是因為 runtime base 是 `debian:bookworm-slim` + 已 apt install curl(rust-api 需 curl 給 application 用,順便 HEALTHCHECK 用)
- `grep -q "ok"` 比僅靠 `wget` exit code 嚴格 — health.html 內容若被誤改、HEALTHCHECK 立刻 fail
- HEALTHCHECK timing `10s / 3s / 5s / 3` 完全對齊 001(start-period 5s + interval 10s + 至少 1 次 probe 通過 → 30 秒內 healthy,對齊 SC-002)

**Rationale 細節**:
- `wget -q` quiet mode(不寫 progress 到 stderr)
- `wget -O-` body 寫 stdout 給 grep 讀
- `wget -qO-` 對非 200 response body 通常空(wget 行為,有少數版本印 error message),grep -q 對空 input 回 1(非 match)→ HEALTHCHECK fail
- 如果 wget exit 非 0 但有 partial body,grep -q "ok" 仍可能誤判 — busybox wget 行為相對單純(404 直接 stderr 寫 error、stdout 空),低風險
- 替代方案 `wget --spider` 只看 status code,但本場景要驗 body 內容(防 health.html 被誤改成別的),選 body match 路線

**Alternatives considered**:
- `curl -fsS` — 拒絕:nginx:alpine 沒 curl,要 apt add 增加 image size
- `nc -z 127.0.0.1 21079`(僅驗 port open)— 拒絕:nginx 起來 port 就 open,但 dist/ 內 health.html 缺失也算 unhealthy 才合理(健康定義 = service serving the right content)
- `apk add curl` 加進 runtime — 拒絕:不必要的 image size 膨脹(curl ~3 MB),wget 已存在
- `wget --spider`(僅驗 HTTP status)— 拒絕:health.html 被誤改成別內容仍 200,我們要驗 body 含 "ok"

**驗證對應**:spec FR-008/009/010 + SC-002

---

## 4. vite public/ → dist/ copy 行為

**Decision**:相信 vite default:public/* 進 dist/ 不轉譯;**不**改 vite.config.ts。

**Rationale**:
- vite 預設 `publicDir: 'public'`(per vite docs);public/ 內所有檔案 build 時 copy 到 `dist/` 根目錄(維持相對路徑、不 hash 檔名、不轉譯內容)
- `base-web/public/favicon.svg` 已驗證 vite build 後出現在 `dist/favicon.svg`(從 base-web upstream 行為推論,且 000 §5.2 CDP 驗證也走 `/favicon` 邊路徑通)
- 新增 `base-web/public/health.html` 預期同行為 → `dist/health.html`

**Alternatives considered**:
- 改 `vite.config.ts` 加 explicit copy plugin — 拒絕:違反 §I.1 不改 inline 紀律;public/ default 已 work
- 寫進 `index.html` `<link>` 觸發 build inclusion — 拒絕:health.html 不需 SPA 觸發,public/ 直接 copy 更乾淨

**驗證對應**:spec FR-011/012(/health.html 來源 + vite copy 行為)+ acceptance §8.1 / §8.2 curl /health.html 回 "ok"

---

## 5. nginx try_files priority for `/health.html`

**Decision**:既有 nginx config `try_files $uri $uri/ /index.html`,`/health.html` 在 `$uri` 第一段直接命中、不會 fallback 到 SPA index。

**Rationale**:
- nginx `try_files` 行為:依序試每個參數,第一個匹配(實體檔 / 目錄)即 serve、不再往後試
- 順序 `$uri $uri/ /index.html`:`$uri` = request path(`/health.html`)→ nginx 在 root `/usr/share/nginx/html/health.html` 找實體檔 → 存在(來自 dist/)→ 直接 serve `health.html` 內容
- 不會走到 `/index.html`(SPA fallback);curl `/health.html` 回 `ok\n` 而非 SPA bundle bytes

**驗證對應**:spec FR-013 + Edge Cases「nginx try_files fallback 撞到 /health.html」(若 nginx config 寫錯、HEALTHCHECK fail 自動暴露)

---

## 6. 風險與緩解

| 風險 | 緩解 |
|---|---|
| vite env-loading 機制誤解(已 research 發現) | 已改用 `.env.prod.local` fallback 路徑(§1);Dockerfile 實作配合 |
| `.env.prod.local` 被誤 commit 到 base-web fork remote | base-web/.gitignore line 15 含 `*.local`,git 自動 ignore;builder 內寫的更只存在 image filesystem,本 host 不會留檔 |
| `wget -qO- | grep -q "ok"` 在不同 busybox 版本行為差異 | spec/acceptance 階段實機驗;若不穩,替代 `wget --spider` 改純 status check + 接受失去 body 驗證精度 |
| nginx config heredoc `NGINX_EOF` quote 行為跨 BuildKit 版本 | 000 §3.2 既有寫法已驗(2026-05-26 落地),沿用同 pattern;BuildKit 1.7+ 對 quoted heredoc 行為穩定 |
| `public/health.html` 在 SPA upstream rebase 衝突 | 極低風險 — soybean-admin upstream `public/` 內無 `health.html`,git rebase 不 conflict;若未來真衝突,git 提示手動解 |

---

## 7. 後續 feature 邊界(來自 spec Assumptions)

本 feature 留給後續 Phase 的 contract:

| Phase / Feature | 留給後續的 contract |
|---|---|
| Phase 1 #3 TLS 憑證 skeleton | `deploy/generate-dev-cert.sh` + nginx TLS conf;本 feature standalone compose 為 HTTP-only 過渡 |
| Phase 1 #4 容器 port 與編排 | 整套 `docker-compose.yml` + `.dev.yml` + `.prod.yml` + obs override;本 standalone compose 退場(service 移過去);prod 不對外 expose 21079(front-nginx 21080/21443 reverse proxy 至 internal:21079) |
| Phase 3 base-web 環境配置 | `VITE_SERVICE_BASE_URL` 切到 `http://rust-api:21081` internal name;本 feature 已交 build-arg 機制,後續只需 compose `build.args` 帶不同 URL |
