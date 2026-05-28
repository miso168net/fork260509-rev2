# Contract: Verification commands(C-V acceptance)

**Type**: Shell command sequence;對應 spec User Stories + SCs。

> **CLAUDE.md §3 紀律提醒**:本 feature 屬「wiring / static asset + Dockerfile / compose 配置」,**無新純函式邏輯**(全為 build pipeline + nginx config + 1 個 4-line static HTML 檔)。整體 feature 由本 C-V contract 覆蓋驗收;`tasks.md` 與 `plan.md` 明示「無單元測試,由 acceptance commands 覆蓋」及理由。

---

## §1 Dev profile + /health.html 驗收(對應 SC-001 + User Story 1 Acceptance 1)

```bash
# 從 workspace root
docker compose -f docker-compose.base-web.yml --profile dev up -d

# 等 ~30-60s(pnpm install + vite ready;首次更久)
for i in $(seq 1 60); do
  sleep 1
  # 用 grep -q 對齊 §2/§3 紀律 + HEALTHCHECK probe(health.html 含 2 行 HTML 註解 + ok body,字面 `=` 比對會失敗)
  if curl -fsS http://127.0.0.1:21079/health.html 2>/dev/null | grep -q "ok"; then echo "${i}s: /health.html=ok"; break; fi
done
```

**預期**:`/health.html` 回 `ok`(60 秒內,SC-001)。

```bash
curl -fsS http://127.0.0.1:21079/
# 預期: HTTP 200 + SPA index.html(走 vue-router)
```

---

## §2 Prod profile + 3 acceptance(對應 SC-002 / SC-003 / User Story 1+2+3)

```bash
# (a) Standard build(預設 ApiFox Mock URL)
DOCKER_BUILDKIT=1 docker compose -f docker-compose.base-web.yml --profile prod up -d --build --wait
```

**預期**:image build 成功,container `healthy`(start-period 5s + interval probe pass)。

```bash
curl -fsS http://127.0.0.1:21079/health.html
# 預期: ok

curl -fsS http://127.0.0.1:21079/some/random/route
# 預期: HTTP 200 + SPA index.html(try_files fallback)

curl -fsS http://127.0.0.1:21079/
# 預期: HTTP 200 + SPA index.html

docker inspect rev2-admin-base-web --format='{{.State.Health.Status}}'
# 預期: healthy(SC-002 < 30s)
```

```bash
# (b) build-arg override 驗收(User Story 3 Acceptance 1/2/3 + SC-003)
docker compose -f docker-compose.base-web.yml --profile prod down

VITE_SERVICE_BASE_URL=http://rust-api:21081 \
  docker compose -f docker-compose.base-web.yml --profile prod up -d --build --wait

docker run --rm rev2-admin-base-web:latest sh -c "grep -c 'rust-api:21081' /usr/share/nginx/html/assets/*.js"
# 預期: > 0(新 URL inline 進 bundle)

docker run --rm rev2-admin-base-web:latest sh -c "grep -c 'mock.apifox.cn' /usr/share/nginx/html/assets/*.js"
# 預期: 0(舊 URL 被 override、不在 bundle)
```

```bash
# (c) HEALTHCHECK 故障驗證(User Story 2 Acceptance 2)
docker exec rev2-admin-base-web rm /usr/share/nginx/html/health.html
sleep 60  # ~30s × 2 倍 safety margin
docker inspect rev2-admin-base-web --format='{{.State.Health.Status}}'
# 預期: unhealthy
```

---

## §3 Image tag 獨立 run 驗收(對應 FR-007 / User Story 1 Acceptance 3)

```bash
# 確認 image 已 build
docker image inspect rev2-admin-base-web:latest --format='{{.Size}}' | numfmt --to=iec
# 預期: < 80 MB(SC-004)

# 獨立 docker run
docker run -d --name bw_test -p 127.0.0.1:21079:21079 rev2-admin-base-web:latest
sleep 10
curl -fsS http://127.0.0.1:21079/health.html
# 預期: ok

docker stop bw_test && docker rm bw_test
```

---

## §4 不動 base-web inline 紀律驗收(對應 SC-005 / FR-023 / User Story 3 Acceptance 3)

```bash
# base-web worktree 內 git diff
git -C base-web diff --name-only HEAD
```

**預期**:**只**含 `public/health.html`(BASE-WEB-ADAPT 軌道驗證:不改 inline、新增為主)。
- 若出現 `.env.prod` / `.env` / `vite.config.ts` / `src/*` / `package.json` 等 → 違反紀律、必須回 fix

```bash
# 進一步檢查無 base-web stage 改動洩漏
git -C base-web status --short
# 預期: 只 `?? public/health.html`(如果還沒 add)或 `A  public/health.html`(已 add)
```

---

## §5 000-bootstrap.md 修正驗收(對應 FR-018/019/020/021/022 + SC-006)

```bash
# §6.1 標題改成 "✅ feature 002 完成"
grep -n "prod profile 實機驗收 ✅" /mnt/d/AnewSpaces/x_Project/fork260509-rev2/docs/superpowers/000-base-web-docker-bootstrap.md
# 預期: 找到 1 行 match(原 "prod profile 沒實機跑(必補)" 被替換)

# 不可仍含原 deferred 字串
grep -n "prod profile 沒實機跑" docs/superpowers/000-base-web-docker-bootstrap.md
# 預期: 0 match(SC-006 驗證)

# 檔尾 footnote 存在
tail -5 docs/superpowers/000-base-web-docker-bootstrap.md | grep -c "feature 002"
# 預期: > 0
```

---

## §6 Constitution Compliance 自我覆查(對應 plan Constitution Re-Check)

```bash
# (1) 不從 rev1 拷貝 — base-web worktree git history 應無 rev1 reference 新增
cd base-web
git log main..HEAD --stat 2>/dev/null | head -20
# 預期: 只有 public/health.html 1 檔的 commit

# (2) 不動 rust-api(本 feature 完全不該動 rust-api)
git -C ../rust-api status --short
# 預期: 空(rust-api 完全不動)

# (3) base-web inline 不動
grep -c "rev2-admin-base-web" base-web/src/ 2>/dev/null | head
# 預期: 0(base-web src 內無任何「rev2-admin-base-web」字串植入)
```

---

## §7 dev hot reload 驗收(可選、對齊 000 既有行為)

```bash
# dev profile up 後改 source
docker compose -f docker-compose.base-web.yml --profile dev up -d
sleep 30
# 模擬改 base-web/src 內某檔 → vite HMR 應自動 reload
# (本 feature 不變動 vite HMR 行為,只是 port 改 21079,既有 HMR 機制應自動跟著走)
```

**預期**:vite dev server 接受 HMR,改檔後 browser reload(本 feature scope 內不深入驗,SC 也未含此項)。

---

## 驗收紀律總結

- §1-§3 為 user-facing acceptance(operator 跑命令、看結果)
- §4 為 BASE-WEB-ADAPT 軌道紀律驗收
- §5 為 000-bootstrap.md surgical patch 驗收
- §6 為 Constitution Compliance 自我覆查
- §7 為可選的 dev hot reload sanity(不在 SC 內)

`tasks.md` 階段需把以上 §1-§6 排程進 task 內、對應到 spec 各 acceptance scenario 與 SC。
