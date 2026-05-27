# Contract: `VITE_SERVICE_BASE_URL` build-arg

**Type**: Docker build-arg + Vite mode-aware env file override

## ★ Critical mechanism

研究發現(research.md §1):**vite `loadEnv` 不讀 `process.env`**,只讀 `.env.*` 系列檔。所以 `ARG + ENV + pnpm build` 路徑**對 `VITE_*` prefix 無效**。

**正解**:builder stage 在 `RUN pnpm build` 前 `RUN echo "VITE_SERVICE_BASE_URL=$VITE_SERVICE_BASE_URL" > .env.prod.local`,讓 vite mode-aware env file 機制吃到。

`.env.prod.local` 在 vite mode=prod 下 precedence 最高(高於 `.env.prod`),override 同名 key。

## Dockerfile builder stage

```dockerfile
FROM node:20.19-alpine AS builder
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile

COPY build ./build
COPY public ./public                       # 含本 feature 新增的 health.html
COPY src ./src
COPY .env .env.prod .env.test ./
COPY index.html vite.config.ts tsconfig.json uno.config.ts ./

# build-arg 接 host envvar(無傳時 default 對齊現 .env.prod)
ARG VITE_SERVICE_BASE_URL=https://mock.apifox.cn/m1/3109515-0-default

# 寫 .env.prod.local(vite mode=prod 精準 override .env.prod 同 key)
# 為何不用 ENV:vite loadEnv 只讀 .env.* 檔、不讀 process.env(research §1)
RUN echo "VITE_SERVICE_BASE_URL=$VITE_SERVICE_BASE_URL" > .env.prod.local

RUN pnpm build  # vite build --mode prod 讀 .env.prod.local + .env.prod 合併
```

## compose `build.args`

```yaml
base-web-prod:
  profiles: ["prod"]
  build:
    context: ./base-web
    dockerfile: ../deploy/Dockerfile.base-web.txt
    args:
      VITE_SERVICE_BASE_URL: "${VITE_SERVICE_BASE_URL:-https://mock.apifox.cn/m1/3109515-0-default}"
  image: rev2-admin-base-web:latest
  # ...
```

shell 端用法:
```bash
# 預設 build(走 default 值)
docker compose -f docker-compose.base-web.yml --profile prod up -d --build

# override(切到 rust-api internal name 之類)
VITE_SERVICE_BASE_URL=http://rust-api:21081 \
docker compose -f docker-compose.base-web.yml --profile prod up -d --build
```

## Vite loadEnv precedence

| Priority | 檔 | 場景 |
|---|---|---|
| 1(高) | `.env.prod.local` | **本 feature 在 builder 寫入**,override 同名 key |
| 2 | `.env.local` | 通用 local,本 feature 不寫 |
| 3 | `.env.prod` | base-web upstream 既有(預設 ApiFox Mock) |
| 4(低) | `.env` | 通用,base-web upstream 既有 |

vite `loadEnv('prod', cwd)` 回傳 dict:四層合併,高 priority 同名覆蓋低 priority。

## 安全性 / 紀律

- `.env.prod.local` 寫入 image 內 `/app/.env.prod.local`(builder stage 內、不影響 host base-web/)
- host base-web/.gitignore line 15 含 `*.local` — 若 user 手動在 host 寫 `.env.prod.local`(非預期、本 feature 不做),也不會誤 commit
- builder stage 結束後 `.env.prod.local` 仍存於 builder image filesystem;runtime stage `COPY --from=builder /app/dist /...` 只 copy dist/、不含 .env.prod.local → runtime image 無 leak
- value 是 user-controlled URL(非 secret),即便存在 builder image layer 也低風險

## Examples

```bash
# 預設 build
docker compose -f docker-compose.base-web.yml --profile prod up -d --build --wait
docker run --rm rev2-admin-base-web:latest sh -c "grep -c 'mock.apifox.cn' /usr/share/nginx/html/assets/*.js"
# 預期: > 0(ApiFox URL inline 進 bundle)

# Override build
VITE_SERVICE_BASE_URL=http://rust-api:21081 docker compose -f docker-compose.base-web.yml --profile prod up -d --build --wait
docker run --rm rev2-admin-base-web:latest sh -c "grep -c 'rust-api:21081' /usr/share/nginx/html/assets/*.js"
# 預期: > 0(新 URL inline)

docker run --rm rev2-admin-base-web:latest sh -c "grep -c 'mock.apifox.cn' /usr/share/nginx/html/assets/*.js"
# 預期: 0(舊 URL 已被 override、不在 bundle)

# 不動 inline 驗證(spec User Story 3 Acceptance 3)
git -C base-web diff --name-only HEAD
# 預期: 只 public/health.html(.env.prod / .env / vite.config.ts / src/* 都不該出現)
```

## 後續 feature contract

- Phase 3 base-web 環境配置(CHECKLIST §5.5):override `VITE_SERVICE_BASE_URL=http://rust-api:21081`(rust-api internal service name);本 feature 已交完整機制、後續 Phase 3 只需在 compose 階段帶不同 envvar
- Phase 1 #4 整套 stack:standalone compose 退場,build.args 移到 master compose

## 驗收

對應 spec FR-014/015/016/017 + User Story 3 Acceptance 1/2/3 + SC-003(URL inline 進 bundle)+ SC-005(git diff 不含 .env.prod)。
