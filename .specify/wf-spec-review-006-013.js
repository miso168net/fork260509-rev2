export const meta = {
  name: 'spec-review-006-013',
  description: 'requesting-code-review 對照 spec.md review feature 006-013',
  phases: [
    { title: 'Review', detail: '8 個 feature 各派 reviewer subagent 對照 spec.md' },
    { title: 'Synthesize', detail: '彙整跨 feature 報告' },
  ],
}

const ROOT = '/mnt/d/AnewSpaces/x_Project/fork260509-rev2'

// 每個 feature 的 review 範圍（落點 + git diff 指令），由 main loop 的 git 考古確定
const FEATURES = [
  {
    id: '006', name: 'docker-volume-naming',
    locus: '外層 repo（docker-compose*.yml named volume 命名規則）。base-web / rust-api 未動。',
    diffCmds:
`# 外層 merge commit（feature branch 全部改動）
git -C ${ROOT} diff a12fd18^1..a12fd18 -- docker-compose.yml docker-compose.dev.yml docker-compose.prod.yml docker-compose.base-web.yml docker-compose.rust-api.yml
# 對照當前 HEAD compose 實況
git -C ${ROOT} show HEAD:docker-compose.yml | grep -nA2 volumes`,
  },
  {
    id: '007', name: 'db-redis-connection',
    locus: 'rust-api（DB/Redis 連線層 + AppState + migration runner proof + config 單測）。',
    diffCmds:
`cd ${ROOT}/rust-api && git diff --stat 44d20fb..091fe6a
cd ${ROOT}/rust-api && git diff 44d20fb..091fe6a`,
  },
  {
    id: '008', name: 'response-envelope',
    locus: 'rust-api（統一回應信封 Res<T> + BizCode 矩陣 + AppError + 404 fallback）。',
    diffCmds:
`cd ${ROOT}/rust-api && git diff --stat 091fe6a..fac12f6
cd ${ROOT}/rust-api && git diff 091fe6a..fac12f6
# 注意：後續 013 把 Res<T> 泛型化、加 BizCode 5003，當前 HEAD 已演進，review 聚焦 008 當時交付物`,
  },
  {
    id: '009', name: 'soft-delete-infra',
    locus: 'rust-api（SoftDeletable trait + entity crate + sys_user facade + deleted_at 欄/partial unique index + facade 外 use entity:: lint test）。',
    diffCmds:
`cd ${ROOT}/rust-api && git diff --stat fac12f6..88ed11e
cd ${ROOT}/rust-api && git diff fac12f6..88ed11e`,
  },
  {
    id: '010', name: 'migration-auto-apply',
    locus: '外層 repo（docker-compose*.yml + deploy/Dockerfile.rust-api.txt 把既有 migration runner 在容器啟動時自動套用）。rust-api 原始碼未動（runner 早於 007 已存在）。',
    diffCmds:
`git -C ${ROOT} diff e4ff2b2^1..e4ff2b2 -- docker-compose.yml docker-compose.dev.yml docker-compose.prod.yml deploy/Dockerfile.rust-api.txt
# 對照當前 HEAD
git -C ${ROOT} show HEAD:deploy/Dockerfile.rust-api.txt`,
  },
  {
    id: '011', name: 'audit-log',
    locus: 'rust-api（sys_operation_log 表/entity + audit.rs AuditEvent + mutate_in_txn 原子寫入 + facade write_in_txn + sys_user soft_delete 接 audit + redact password）。',
    diffCmds:
`cd ${ROOT}/rust-api && git diff --stat 88ed11e..5a72560
cd ${ROOT}/rust-api && git diff 88ed11e..5a72560`,
  },
  {
    id: '012', name: 'sub-crate-setup',
    locus: 'rust-api（拷貝 sea-orm-adapter + xdb 工具 crate 進 workspace + casbin_rule migration 005 委派 adapter + casbin 2.20 編譯閘門 + 活體 smoke）。',
    diffCmds:
`cd ${ROOT}/rust-api && git diff --stat 5a72560..e193c47
cd ${ROOT}/rust-api && git diff 5a72560..e193c47`,
  },
  {
    id: '013', name: 'auth-login-enforce',
    locus: 'rust-api（JWT HS256 模組 + login/getUserInfo/refreshToken handler + Casbin enforce middleware + sys_role/sys_user_role facade + migration 006-009 + BizCode 5003）+ base-web（.env.test）。',
    diffCmds:
`cd ${ROOT}/rust-api && git diff --stat e193c47..bbabdbc
cd ${ROOT}/rust-api && git diff e193c47..bbabdbc
echo "=== base-web ==="
cd ${ROOT}/base-web && git diff 942d4e7..5df2384`,
  },
]

const FINDING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    location: { type: 'string', description: 'file:line 或 commit/檔案位置' },
    what: { type: 'string', description: '哪裡不對' },
    why: { type: 'string', description: '為何重要' },
    fix: { type: 'string', description: '如何修（若非顯而易見）' },
  },
  required: ['location', 'what', 'why'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    feature: { type: 'string' },
    reviewedScope: { type: 'string', description: '你實際 review 了什麼（diff 範圍 / 讀了哪些檔）' },
    specCoverage: { type: 'string', description: 'spec.md 的 FR / Success Criteria / acceptance 是否被實作覆蓋的總評' },
    strengths: { type: 'array', items: { type: 'string' } },
    critical: { type: 'array', items: FINDING_SCHEMA, description: 'bug / 安全 / 資料遺失 / 功能壞掉' },
    important: { type: 'array', items: FINDING_SCHEMA, description: '架構問題 / 缺功能 / 錯誤處理不足 / 測試缺口' },
    minor: { type: 'array', items: FINDING_SCHEMA, description: 'code style / 優化 / 文件' },
    specGaps: { type: 'array', items: { type: 'string' }, description: 'spec 明列但實作未覆蓋的 FR/acceptance（逐項）' },
    assessment: { type: 'string', enum: ['Ready', 'With fixes', 'Not ready'] },
    reasoning: { type: 'string' },
  },
  required: ['feature', 'reviewedScope', 'specCoverage', 'strengths', 'critical', 'important', 'minor', 'specGaps', 'assessment', 'reasoning'],
}

const METHOD = `
你是資深 code reviewer（軟體架構 / design pattern / 最佳實務）。依 superpowers:requesting-code-review 方法論，把已完成的實作對照其 spec 驗收，找出問題。

## 檢查面向
- **Spec 對齊**：實作是否符合 spec.md 的 FR / Success Criteria / User Story 驗收？偏離是「正當改良」還是「有問題的偏差」？所有 spec 明列功能都在嗎？逐項對 spec.md 的 FR-xxx / SC-xxx 核對，缺的列入 specGaps。
- **Code quality**：關注點分離、錯誤處理、type safety、DRY（不過度抽象）、edge case。
- **架構**：設計決策是否健全？scalability / performance / 安全？與周邊 code 是否乾淨整合？
- **測試**：測真實行為而非 mock？edge case 覆蓋？該有的整合測試有嗎？（rust-api 為 bin-only，整合測試走 in-crate #[ignore] + live postgres，可接受）
- **Production readiness**：schema 改動有 migration？向後相容？文件完整？明顯 bug？

## 校準
依「實際嚴重度」分類，不是什麼都 Critical。先誠實肯定做得好的地方，再列問題。發現顯著偏離 spec 要明確標出讓 implementer 確認是否刻意。若問題出在 spec 本身（而非實作），講清楚。

每個 issue 要給：location（file:line）、what（哪裡不對）、why（為何重要）、fix（如何修，若非顯而易見）。

## 重要紀律
- 這是 **READ-ONLY review**，絕不修改任何檔案。
- 不要對「沒實際讀過的 code」給回饋。具體（file:line），不要含糊（不要只說「改善錯誤處理」）。
- rust-api 無 host cargo，不要嘗試 cargo build/test；靠讀 code + git diff + grep 判斷。
- 給明確 verdict：Ready / With fixes / Not ready。
`

phase('Review')
const reviews = await parallel(FEATURES.map((f) => () =>
  agent(
`${METHOD}

## 你要 review 的 feature
**${f.id}-${f.name}**

## 實作落點
${f.locus}

## Spec / 需求來源（review 對照基準）
- ${ROOT}/specs/${f.id}-${f.name}/spec.md  ← 主要驗收基準（讀完整）
- ${ROOT}/specs/${f.id}-${f.name}/plan.md、tasks.md、contracts/、data-model.md（需要時讀，輔助理解設計意圖與驗收命令）

## 取得實作 diff（先跑這些）
\`\`\`bash
${f.diffCmds}
\`\`\`
（worktree 的 git diff 跨歷史 SHA 可用，因為 fork object store 完整。需要時也直接 Read 當前檔案理解上下文。）

## 步驟
1. 完整讀 spec.md，列出它的 FR / Success Criteria / User Story 驗收清單。
2. 跑上面 diff 指令拿到實作改動，必要時 Read/Grep 實際檔案。
3. 逐項對照：每條 spec 要求是否被實作覆蓋？實作有無 spec 沒提到的偏差/overbuild？
4. 依方法論輸出結構化結果（StructuredOutput）。

注意：008/009/011 等基礎 feature 的 code 在後續 feature 持續累積演進，當前 HEAD 可能已超出該 feature 當時交付物 —— review 聚焦「該 feature 的 diff 範圍交付了什麼、對不對得上 spec」，後續演進不算缺陷。`,
    { label: `review:${f.id}`, phase: 'Review', schema: REVIEW_SCHEMA }
  )
)).then((rs) => rs.filter(Boolean))

phase('Synthesize')
const report = await agent(
`你是 review 彙整者。下面是 feature 006-013 共 ${reviews.length} 個 feature 的 spec-compliance code review 結構化結果（JSON）。

請產出一份 **繁體中文 markdown 彙整報告**，包含：

1. **總覽表**：每個 feature 一行 —— feature | assessment(Ready/With fixes/Not ready) | Critical 數 | Important 數 | specGaps 數 | 一句話結論。
2. **必須處理（Critical + 重要 specGaps）**：跨 feature 把所有 Critical issue 與「spec 明列但未實作」的 gap 集中列出，標明 feature 與 location，依風險排序。
3. **建議處理（Important）**：分 feature 列。
4. **跨 feature 主題**：歸納反覆出現的模式（例如測試策略、錯誤處理、facade 邊界紀律、wire DTO 型對齊等），這些比單點 issue 更有價值。
5. **整體結論**：006-013 整體是否健康？最該優先動手的 3 件事是什麼？

報告要可直接給人看：具體、附 file/location、不灌水。Minor 不用全列，只在主題裡點到即可。

=== 各 feature review 結果 JSON ===
${JSON.stringify(reviews, null, 2)}`,
  { label: 'synthesize', phase: 'Synthesize' }
)

return { reviews, report }
