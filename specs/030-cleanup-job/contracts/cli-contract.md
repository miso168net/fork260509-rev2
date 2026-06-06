# Contract — `cleanup-job` CLI

> cleanup-job 無 HTTP/wire 介面;它對外的「契約」是 CLI 行為 + 連線 env + stdout/exit。對應 spec FR-001..008。

## 叫用形式

| 模式 | 命令（直接 binary） | 行為 |
|---|---|---|
| **dry-run（預設）** | `cleanup-job`（無 arg） | 計數「將移除」列、**不改 DB**、印報告、exit 0 |
| **execute** | `cleanup-job --execute` | 實刪符合列、印實刪筆數、exit 0 |

- 手寫 arg 解析（不用 clap，對齊 `migration` bin 範式）。未知 arg → usage + 非 0 exit。
- `--execute` 之外無其他 flag（margin 為常數 `SKEW_MARGIN_SECS=60`、不開 CLI 旗標——決策定案;若未來要可調再開）。

## 連線 env（鏡像 migration bin，`migration/src/main.rs:6-14`）

解析序：`DATABASE_URL` →（`APP_DATABASE_URL_FILE` 讀檔內容 trim）→ `APP_DATABASE_URL`;皆無 → 退出非 0 + 明確錯誤。

compose service 注入 `APP_DATABASE_URL_FILE=/run/secrets/cleanup_database_url`。

## stdout / exit code 契約

| 情況 | stdout | exit |
|---|---|---|
| dry-run 成功 | `would delete <N> rows (cutoff=<ts>)` | 0 |
| execute 成功 | `deleted <N> rows (cutoff=<ts>)` | 0 |
| 無可刪列 | `would delete 0 rows` / `deleted 0 rows` | 0 |
| 連線/查詢失敗 | stderr 錯誤訊息 | 非 0（供 host cron 監控）|
| 未知 arg | `usage: cleanup-job [--execute]` | 非 0 |

## 刪除述詞（唯一）

`expires_at < (now - 60s)`，**與 status 無關**（見 data-model §3、research D1）。dry-run 與 execute 用**完全相同**的 filter（僅 count vs delete 之差）。
