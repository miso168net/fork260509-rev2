# Contract — 033 dashboard provisioning config + 叫用

> 033 無 HTTP/wire 介面;對外「契約」是 ① 新/改 grafana config 檔形狀 ② datasource uid 穩定引用 ③ community dashboard pin + datasource resolution ④ 維運叫用命令。對應 spec FR-001..010。

## 1. 新增 / 改動檔案 manifest（全 outer/deploy、worktree+base-web 零改）

| 檔 | 動作 | repo |
|---|---|---|
| `deploy/grafana-provisioning/dashboards/provider.yaml` | 新增（file provider、folder obs-full、options.path `/etc/grafana/provisioning/dashboards/json`） | outer |
| `deploy/grafana-provisioning/dashboards/json/master-overview.json` | 新增（greenfield、schemaVersion 39、uid:prometheus） | outer |
| `deploy/grafana-provisioning/dashboards/json/rust-api.json` | 新增（greenfield、uid:prometheus） | outer |
| `deploy/grafana-provisioning/dashboards/json/audit-log.json` | 新增（greenfield、**uid:loki**） | outer |
| `deploy/grafana-provisioning/dashboards/json/cleanup-job.json` | 新增（greenfield、uid:prometheus） | outer |
| `deploy/grafana-provisioning/dashboards/json/postgres.json` | 新增（community pin postgres_mixin@v0.19.1 + datasource 變數 pin uid:prometheus+hide） | outer |
| `deploy/grafana-provisioning/dashboards/json/redis.json` | 新增（community pin 763 rev6 + `${DS_PROM}`→`prometheus`、刪 `__inputs`） | outer |
| `deploy/grafana-provisioning/datasources/loki.yml` | 改（加 `uid: loki`、D4） | outer |

**無 compose / secret / rust-api / base-web / migration 改動**（grafana 已雙 profile `["obs","metrics"]`、provisioning 目錄已整掛）。

## 2. provider yaml 契約（`deploy/grafana-provisioning/dashboards/provider.yaml`）

```yaml
apiVersion: 1
providers:
  - name: 'obs-full-dashboards'
    orgId: 1
    folder: obs-full          # reuse 032 alert folder（依名 resolve、不重建）
    type: file
    disableDeletion: true
    updateIntervalSeconds: 30
    allowUiUpdates: false
    options:
      path: /etc/grafana/provisioning/dashboards/json   # ★ JSON 在此子目錄;provider yaml 不可放進此 path
      foldersFromFilesStructure: false
```

- **★ 路徑分工**：grafana 掃 `/etc/grafana/provisioning/dashboards/*.yaml`（provider config）;每 provider `options.path` 指**另一** JSON 目錄。故 JSON 放 `dashboards/json/`、provider yaml 放 `dashboards/`（不混）。
- dashboard JSON **`schemaVersion: 39`**（grafana 13.0.2 接受、hand-author sweet spot）。

## 3. datasource 引用契約

- greenfield dashboard：panel target `{"type":"prometheus","uid":"prometheus"}`（master/rust-api/cleanup-job）或 `{"type":"loki","uid":"loki"}`（audit-log）。
- **loki.yml 加 `uid: loki`**（D4、現 auto-gen）→ audit-log 板穩定引用;loki `isDefault:true` 保留。
- **community dashboard datasource resolution**（R4 hardcode uid）：
  - redis 763：`${DS_PROM}`→`prometheus`、刪 top-level `__inputs`。
  - postgres mixin：`templating.list` 的 `datasource` 變數 `current` pin `{text:prometheus,value:prometheus}`+`hide:2`（或 `$datasource`→`prometheus`）。

## 4. community dashboard pin 契約（deterministic、版本鎖 exporter）

| 板 | pin 來源 | metric-match（live 驗） |
|---|---|---|
| postgres | `prometheus-community/postgres_exporter` `postgres_mixin/dashboards/postgres-overview.json` **@ tag `v0.19.1`** | 14/17=82%（3 absent=PG17 移除 bgwriter 子 counter、1 panel 影響） |
| redis | grafana.com **dashboard 763 revision 6**（= oliver006 repo `contrib/...@v1.85.0`、byte-identical） | 15/15=100% |

- 下載後 commit JSON（不浮動 latest）;**對 live prometheus 真實 `pg_*`/`redis_*` 命名驗**（postgres-exporter v0.19.1 / redis_exporter v1.85.0）。

## 5. 維運叫用契約

| 操作 | 命令 |
|---|---|
| 套用 dashboards（dev、改 provisioning 後） | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --force-recreate grafana`（★ 非 restart、WSL2 drvfs） |
| dev 起完整觀察性（log+metrics+dashboards） | `docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile obs --profile metrics up -d --wait` |
| 看 dashboards | `http://127.0.0.1:23000` → Dashboards → folder `obs-full`（6 張） |
| prod 起 | `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile obs --profile metrics up -d --wait`（internal-only、無對外 host port） |

## 6. 不變式

- dashboard 引用 datasource **一律用穩定 uid**（`prometheus`/`loki`），不用 auto-gen uid 或 `${DS_*}` import 變數（FR-007）。
- 純 grafana config：**無 rust-api/base-web 改、無採集/埋點新增、無 wire/碼/狀態變**（FR-009）。
- prod 觀察查詢入口 **internal-only**（grafana 無對外 host port、沿 031/032、FR-010）。
- panel query **grounded 真實 metric/label 命名**（不信抽象）;空樣本情形（5xx 無樣本、cleanup_job 無 fresh push）顯 "No data" 為預期。
