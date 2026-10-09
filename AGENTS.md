# AGENTS.md

## 验证命令

```bash
node --test
```

无依赖、无构建步骤；测试只覆盖 `logic.js` 的纯函数。数据库 SQL 没有自动化测试，需要在 Supabase SQL Editor 手动运行验证。

## 约束与易踩的坑

- 保持纯静态（不引入打包器）。`logic.js` 同时被页面（`window.QQLL`）和 Node 测试（`require`）加载，改它时别用 ES module 语法。
- 卡路里系数有两份：`logic.js` 的 `CALORIE_RATES`（只用于预览）和迁移 SQL 里的 `workouts_before_write()`（权威值）。改一处必须同步另一处。
- `index.html` 有 CSP：换 Supabase 项目时同步改 `connect-src`；新增脚本或样式只能放本地文件，不能写内联 `<script>`、`style=""` 或 `onclick=""`。
- supabase-js 锁定版本并带 SRI。升级时从 `https://data.jsdelivr.com/v1/packages/npm/@supabase/supabase-js@<版本>?structure=flat` 取 `/dist/umd/supabase.js` 的 hash，填成 `sha256-<hash>`。
- 迁移 SQL 由人手动粘贴到 SQL Editor 运行，没有 CLI 关联；新增迁移要写成可重复运行的形式。
- 在 `onAuthStateChange` 回调里不要直接 await Supabase 调用（会锁死 auth），用 `setTimeout` 推迟。
- 主屏幕图标的源图是 `icons/QL.png`（1254×1254），改完要重新导出 `apple-touch-icon.png`(180)、`icon-192.png`、`icon-512.png`，三个都必须是不透明的正方形（iOS 会把透明部分填成黑色）。iOS 在添加到主屏幕时缓存图标和名称，换图后要删掉主屏幕图标重新添加。
