# AGENTS.md

## 验证命令

```bash
node --test
```

测试不需要安装依赖，只覆盖纯函数模块（`logic.js`、`game.js`、`cycle.js`、`backup.js`、`gomoku.js`、`theme.js`）。数据库 SQL 没有自动化测试，需要在 Supabase SQL Editor 手动运行验证。

网页本身没有构建步骤。`npm install` 装的两个开发依赖只用来生成素材：

```bash
npm run build:assets
```

改了任何用户可见的文字、或 `scripts/pixel-art.mjs` 里的像素图后都要跑一次。`index.html` 里 `pixel-sprite` 标记之间的图标、`styles.css` 里 `font-faces` 标记之间的字体声明、`icons/pixel/paw*.svg`、`fonts/fusion-pixel-12px-subset.woff2` 都是生成的，不要手改。

## 约束与易踩的坑

- 保持纯静态（不引入打包器）。`logic.js` 同时被页面（`window.QQLL`）和 Node 测试（`require`）加载，改它时别用 ES module 语法。
- 卡路里系数有两份：`logic.js` 的 `CALORIE_RATES`（只用于预览）和迁移 SQL 里的 `workouts_before_write()`（权威值）。改一处必须同步另一处。
- `index.html` 有 CSP：换 Supabase 项目时同步改 `connect-src`；新增脚本或样式只能放本地文件，不能写内联 `<script>`、`style=""` 或 `onclick=""`。
- supabase-js 锁定版本并带 SRI。升级时从 `https://data.jsdelivr.com/v1/packages/npm/@supabase/supabase-js@<版本>?structure=flat` 取 `/dist/umd/supabase.js` 的 hash，填成 `sha256-<hash>`。
- 迁移 SQL 由人手动粘贴到 SQL Editor 运行，没有 CLI 关联；新增迁移要写成可重复运行的形式。重新运行 `20261008000000_secure_workouts.sql` 会删掉 `workouts` 上全部策略，之后必须按文件名顺序把后面的迁移全部再跑一遍（否则自动备份静默变空、插入策略放宽；"只能给自己打卡"由独立触发器保证，不受影响）。
- 备份格式只有一种：App 导出、`backup/export.sql`（每日自动备份，跑在私有仓库里）、`backup.js`（导入校验）三处共用 `{ exported_at, workouts: [{ person, activity, minutes, calories, date }], periods: [{ person, date }] }`（`periods` 可缺省，兼容旧备份）。改字段要三处一起改，并同步私有仓库 sum-tree/qqll-backup 里的 `export.sql`——**必须先在 Supabase 跑完对应迁移再更新它**，否则每日备份会因为表不存在而失败。`backup/` 只是模板，备份数据绝不能进这个公开仓库。
- 经期（`period_days` + `cycle.js`）：敏感健康数据。界面只给 `CYCLE_PERSON`（Carol）显示标记入口，始终共享给对方是用户的决定。**只记录、不预测**也是用户的决定：不要加回下次经期推算、周期平均值或排卵相关内容。显示上只把格子底色变淡粉（热力图的爪印外包一层 `.px-box`，日历是 `.day.is-period-day`），爪印本身保持原色；标记按日期范围整段写入（`Cy.rangeDays`，一次最多 15 天）。经期里没运动的日子作为 `restDays` 传给 `G.streaks`，桥接连续天数但不计入。前端在表不存在时（迁移没跑）静默隐藏经期功能，不影响打卡。
- 五子棋（`gomoku_games` / `gomoku_moves` + `gomoku.js`）：数据库是唯一权威，`gomoku.js` 只是给界面镜像同一套规则（改规则两边一起改）。棋局不进备份。同 `period_days` 一样，表不存在时前端隐藏「对战」标签。
- 写 `security definer` 触发器时**不要**用 `current_user not in ('authenticated', 'anon')` 做管理员放行：definer 函数里 `current_user` 是函数属主，这个判断对所有人都成立，会把全部校验跳过（五子棋开局触发器就踩过）。需要放行管理员时，用非 definer 的触发器。
- 在 `onAuthStateChange` 回调里不要直接 await Supabase 调用（会锁死 auth），用 `setTimeout` 推迟。
- 等级、连续天数、徽章、每周 Boss 都由 `game.js` 从打卡记录推算，不存数据库。加新玩法时保持这个做法：数据库只存服务器校验过的打卡，前端就没有可以篡改的分数。
- 像素字体：字号只用 12 / 16 / 24px，其他尺寸在手机上会糊；没有粗体，强调靠颜色和字号。裁剪版字体只含源码里出现过的字，漏跑 `build:assets` 时缺的字会去下载 652KB 的完整字体，不会显示成方块，但会变慢。
- 猫咪头像 `icons/pixel/cat-carol.svg`、`cat-allen.svg` 是用户提供的 32×32 手绘像素画，**不是生成的**，脚本不会碰它们；替换时保持文件名不变（注意别带空格）、只用 `<rect>`，不要有脚本或外链。`icons/cat/` 是猫的原始照片，只留在本地（已 gitignore）——仓库和网站都是公开的。
- 主屏幕图标的源图是 `icons/QL.png`（目前 1024×1024，内容其实是 JPEG，扩展名是 png，不影响导出），改完要重新导出 `apple-touch-icon.png`(180)、`icon-192.png`、`icon-512.png`，三个都必须是不透明的正方形（iOS 会把透明部分填成黑色）。iOS 在添加到主屏幕时缓存图标和名称，换图后要删掉主屏幕图标重新添加。
