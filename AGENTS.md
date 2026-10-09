# AGENTS.md

## 验证命令

```bash
node --test
```

测试不需要安装依赖，只覆盖 `logic.js` / `game.js` 的纯函数。数据库 SQL 没有自动化测试，需要在 Supabase SQL Editor 手动运行验证。

网页本身没有构建步骤。`npm install` 装的两个开发依赖只用来生成素材：

```bash
npm run build:assets
```

改了任何用户可见的文字、或 `scripts/pixel-art.mjs` 里的像素图后都要跑一次。`index.html` 里 `pixel-sprite` 标记之间的图标、`styles.css` 里 `font-faces` 标记之间的字体声明、`icons/pixel/`、`fonts/fusion-pixel-12px-subset.woff2` 都是生成的，不要手改。

## 约束与易踩的坑

- 保持纯静态（不引入打包器）。`logic.js` 同时被页面（`window.QQLL`）和 Node 测试（`require`）加载，改它时别用 ES module 语法。
- 卡路里系数有两份：`logic.js` 的 `CALORIE_RATES`（只用于预览）和迁移 SQL 里的 `workouts_before_write()`（权威值）。改一处必须同步另一处。
- `index.html` 有 CSP：换 Supabase 项目时同步改 `connect-src`；新增脚本或样式只能放本地文件，不能写内联 `<script>`、`style=""` 或 `onclick=""`。
- supabase-js 锁定版本并带 SRI。升级时从 `https://data.jsdelivr.com/v1/packages/npm/@supabase/supabase-js@<版本>?structure=flat` 取 `/dist/umd/supabase.js` 的 hash，填成 `sha256-<hash>`。
- 迁移 SQL 由人手动粘贴到 SQL Editor 运行，没有 CLI 关联；新增迁移要写成可重复运行的形式。重新运行 `20261008000000_secure_workouts.sql` 会删掉 `workouts` 上全部策略，之后必须再跑 `20261009000000_backup_reader.sql`，否则自动备份静默变空。
- 备份格式只有一种：App 导出、`backup/export.sql`（每日自动备份，跑在私有仓库里）、`backup.js`（导入校验）三处共用 `{ exported_at, workouts: [{ person, activity, minutes, calories, date }] }`。改字段要三处一起改。`backup/` 只是模板，备份数据绝不能进这个公开仓库。
- 在 `onAuthStateChange` 回调里不要直接 await Supabase 调用（会锁死 auth），用 `setTimeout` 推迟。
- 等级、连续天数、徽章、每周 Boss 都由 `game.js` 从打卡记录推算，不存数据库。加新玩法时保持这个做法：数据库只存服务器校验过的打卡，前端就没有可以篡改的分数。
- 像素字体：字号只用 12 / 16 / 24px，其他尺寸在手机上会糊；没有粗体，强调靠颜色和字号。裁剪版字体只含源码里出现过的字，漏跑 `build:assets` 时缺的字会去下载 652KB 的完整字体，不会显示成方块，但会变慢。
- `icons/cat/` 是两只猫的原始照片，只留在本地（已 gitignore）——仓库和网站都是公开的。像素猫按照片画在 `scripts/pixel-art.mjs` 的 `CATS` 里。
- 主屏幕图标的源图是 `icons/QL.png`（1254×1254），改完要重新导出 `apple-touch-icon.png`(180)、`icon-192.png`、`icon-512.png`，三个都必须是不透明的正方形（iOS 会把透明部分填成黑色）。iOS 在添加到主屏幕时缓存图标和名称，换图后要删掉主屏幕图标重新添加。
