# Quickstart — 033-dashboard-provisioning

> 給 implementer / reviewer 的最短路徑:改哪、怎麼跑、怎麼驗收。詳設計見 [plan.md](plan.md) / [research.md](research.md) / [data-model.md](data-model.md) / [contracts/](contracts/)。

## 改動清單（全 outer/deploy、base-web+rust-api 零改）

1. **`deploy/grafana-provisioning/datasources/loki.yml`**（改）— 加 `uid: loki`（D4、現 auto-gen;audit-log 板穩定引用）**＋ `deleteDatasources:[{name:Loki,orgId:1}]`**（★ as-built 必要、見 R8 修正:直接改顯式 uid 會 crash-loop、deleteDatasources 先刪舊 row 再重建、對 fresh volume no-op）。
2. **`deploy/grafana-provisioning/dashboards/provider.yaml`**（新）— file provider、`folder: obs-full`、`options.path: /etc/grafana/provisioning/dashboards/json`、`allowUiUpdates:false`/`disableDeletion:true`。
3. **`deploy/grafana-provisioning/dashboards/json/*.json`**（新 6 檔、`schemaVersion: 39`）:
   - **master-overview.json**（greenfield、prometheus）— `up{job=~"rust-api|postgres|redis|pushgateway"}` / `pg_up`·`redis_up` / 總請求率 / deny 率 / cleanup age。
   - **rust-api.json**（greenfield、prometheus）— 請求率 by endpoint·status / 延遲 p50·p95·p99（histogram_quantile）/ **5xx `(... or vector(0))/clamp_min(...)`** / in-flight / enforce allow·deny。
   - **cleanup-job.json**（greenfield、prometheus）— last-success 時間/age/rows_deleted / `up{job="pushgateway"}`（**不**做 `up{job="cleanup_job"}`）。
   - **audit-log.json**（greenfield、**loki**）— log 量 by service / rust-api error·warn（`level` top-level）/ **nginx status（`|~ \`^{\` | json`）** / trace_id（`fields_trace_id` nested）。★ **as-built:rust-api 三 `| json` panel(error·warn/by-level/enforce-deny)同樣補 `|~ \`^{\`` guard**（R7 假設「rust-api 全 JSON」被推翻、見 R7 修正）。
   - **postgres.json**（community pin）— `postgres_mixin/postgres-overview.json @ v0.19.1` + datasource 變數 pin uid:prometheus+hide。
   - **redis.json**（community pin）— grafana.com `763 rev6` + `${DS_PROM}`→`prometheus`、刪 `__inputs`。

## pin / 版本（不浮動）

- **grafana** `13.0.2`（reuse 031/032、無新 image）;dashboard JSON `schemaVersion: 39`。
- **postgres dashboard**：`prometheus-community/postgres_exporter` `postgres_mixin/dashboards/postgres-overview.json` **@ tag v0.19.1**（對 live `pg_*` 驗 82% match）。
- **redis dashboard**：grafana.com **763 revision 6**（= oliver006 repo `@v1.85.0`、對 live `redis_*` 驗 100% match）。

## 製法建議（implementer）

- **community（pg/redis）**：下載 pin URL 的 JSON → commit → datasource 引用 resolve 成 uid `prometheus`（redis 刪 `__inputs`+`${DS_PROM}`→`prometheus`;postgres pin `datasource` 變數 `current`+hide）。
- **greenfield（master/rust-api/cleanup-job/audit-log）**：建議**在 live grafana（HTTP API / UI）建好再 export JSON** commit（schema 正確、同 032 alert rule 對 live 迭代;hand-write 全控但 fiddly）;每 panel query 用 research R5-R7 已 live-驗的 PromQL/LogQL。

## 本機跑（dev stack + 完整觀察性 + dashboards）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
bash deploy/generate-secrets.sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile obs --profile metrics up -d --wait
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile obs --profile metrics up -d --force-recreate grafana   # ★ 載入新 dashboards/ + loki uid(非 restart、WSL2)
# grafana: http://127.0.0.1:23000（admin / cat deploy/secrets/grafana_admin_password.txt）→ Dashboards → folder obs-full（6 張）
# cleanup-job 板要資料 → 先觸發一次 cleanup-job push（contracts C0）
```

## 驗收要點（對 SC）

| 驗 | SC | 命令（見 contracts/verification-commands.md） |
|---|---|---|
| 6 張 dashboard provisioned | SC-001/003 | C1 |
| datasource 解析（loki-uid 修 + 無 dangling） | SC-002 | C2 |
| panel query 經 proxy 回資料 | SC-002 | C3 |
| provisioning log 乾淨 | SC-003 | C4 |
| prod internal-only | SC-005 | C5 |
| 031/032 不破（datasource+alert+Explore） | SC-004 | 守恆 |

## 紀律提醒

- **無新單元測試**：dashboard 全 config、由 C-V 活體覆蓋（§3 明示）。
- **無 CDP**：grafana 獨立 ops UI（非 base-web）。
- **純 config、零 rust/base-web 改**：無 migration/crate/secret/compose service → §3「新 crate ⇒ prod build」**嚴格不觸發**;但 C5 仍驗 prod `--profile obs --profile metrics` 起 + internal-only。
- **★ live-grounded 修正（research）**：job 名 `postgres`/`redis`（非 _exporter）/ 無 `up{job=cleanup_job}` / 5xx `or vector(0)` / nginx LogQL `|~ \`^{\``（裸 `| json` 回 400）/ rust-api `level` top-level·`fields_trace_id` nested / cleanup_job 現無 fresh push（C0 先觸發）。
- **★ loki uid patch（as-built 修正）**：R8 原判「只需 force-recreate」**錯**——Loki 在 031 無 uid 首次 provision、auto-gen uid 已 persist 進 `grafana_data` 卷,直接改顯式 uid 會 **crash-loop**`data source not found`。**修:loki.yml 加 `deleteDatasources:[{name:Loki,orgId:1}]`**（先刪舊 row 再以 uid 重建、對 fresh volume no-op、idempotent、零手動步驟;**部署地雷**:已跑 031/032 環境落 033 必經此修）。
- **§I.5 greenfield**：app 板自寫、infra 板用 upstream exporter dashboard（版本鎖 exporter tag、非拷 rev1）。
- **收尾**：純 outer/deploy 改動（無 worktree）;push/merge 不早於 `superpowers:finishing-a-development-branch`。
- **WSL2**：改 provisioning 後 grafana `--force-recreate`（非 restart、drvfs bind-mount shadow-path 衝突、031/032 gotcha）。
