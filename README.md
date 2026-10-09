# C&A Exercise Journey

一个为 Carol 和 Allen 制作、以手机屏幕为主的极简情侣运动打卡小网页。纯静态页面，数据存在 Supabase。

## 已有功能

- 像素风猫咪主题：照着两只猫画的像素头像、像素中文字体、猫爪热力图，加载时有小猫跳跳的过渡动画
- 首页三张卡片（Carol / Allen / 一起运动）：最近 22 周的猫爪热力图、本周次数和卡路里、连续打卡天数
- 每周猫咪天敌（吸尘器魔王、洗澡盆怪…）：3,000 HP，两人本周消耗的卡路里合起来就是伤害，周一刷新
- 记录 Carol 或 Allen 的运动项目与时长（可以替对方打卡），卡路里由服务器计算
- 像素风月历；当天记录列表里可以删除自己记的、或记在自己名下的记录
- 卡路里 ÷ 10 = XP，等级没有上限（Lv.n 需要 100 ×（1 + … + n）XP），每级有称号
- 徽章墙：每人 12 枚个人徽章，另有 5 枚两人共同的徽章；升级、得徽章、打败 Boss 时有庆祝动画
- 深浅模式可切换；两台手机实时同步；可导出全部记录、从备份文件导入（自动跳过已有记录）；可退出登录
- 每日自动备份到私有 GitHub 仓库，设置方法见 [backup/README.md](backup/README.md)

## 部署

页面必须通过 HTTPS 网址访问（Cloudflare Pages、GitHub Pages、Vercel 都可以），直接双击 `index.html` 无法登录。

### 0. 新建 Supabase 项目

1. 在 [supabase.com](https://supabase.com) 点 **New project**，Region 选 **Southeast Asia (Singapore)** 或 **Northeast Asia (Tokyo)**，离国内近。
2. 数据库密码设成强密码并保存好（日常用不到，但丢了很麻烦）。
3. 在 **Project Settings → API Keys** 里拿到项目地址 `https://xxxx.supabase.co` 和 **publishable key**（`sb_publishable_…`）。
   填进 `app.js` 顶部的 `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`，并把 `index.html` 里 CSP 的 `connect-src` 两处域名换成新的。
   **不要用 secret / service_role key。**
4. **Authentication → URL Configuration** 把 Site URL 设成网站地址，找回密码邮件会跳到这里。

### 1. 建表和权限

在 **SQL Editor** 里粘贴并运行 `supabase/migrations/20261008000000_secure_workouts.sql`（可重复运行）。它会：

- 创建 `workouts` 记录表和 `members` 白名单表，只有白名单里的账号能读写记录；
- 开启行级权限（RLS），未登录用户什么都读不到；
- 卡路里、记录人账号、创建时间由数据库触发器决定，前端改不了；记录不允许修改。

### 搬迁旧项目的记录（可选）

1. 在**旧**项目的 SQL Editor 运行 `supabase/export-old-workouts.sql`，复制结果那一格的全部内容（结果是 NULL 说明没有旧记录，跳过）。
2. 在**新**项目的 SQL Editor 粘贴运行。SQL Editor 是管理员身份，会保留原来的卡路里和时间。
3. 搬完后在旧项目关闭注册，或直接删除旧项目。

### 2. 创建两个账号并关闭注册

1. **Authentication → Users → Add user → Create new user**，给两人各建一个账号（邮箱 + 强密码），勾选 **Auto Confirm User**。
2. **Authentication → Sign In / Providers**，关闭 **Allow new users to sign up**。这样别人拿到网址也注册不了。
3. 在 SQL Editor 里把账号和人对应起来（把邮箱换成真实的）：

```sql
insert into public.members (user_id, person)
select id, 'Carol' from auth.users where email = 'carol@example.com';
insert into public.members (user_id, person)
select id, 'Allen' from auth.users where email = 'allen@example.com';
```

### 3. 修改密码 / 移除账号

- 改密码：**Authentication → Users → 选中账号 → Send password recovery** 或直接重设。
- 移除账号：在 **Authentication → Users** 删除即可，白名单记录会一起删掉。

## 隐私与安全

| 措施 | 在哪里 |
|---|---|
| 邮箱 + 密码登录，没有注册入口，并关闭公开注册 | 部署第 2 步 |
| 只有 `members` 白名单里的两个账号能读写，未登录什么都拿不到 | 迁移 SQL 的 RLS |
| 卡路里由服务器按项目和时长计算，记录不能修改 | `workouts_before_write` 触发器 |
| 只能删除自己的记录，或自己记下的记录 | 删除策略 |
| 运动记录不缓存在手机上，退出登录后页面上不留数据 | `app.js` |
| 记录内容一律转义后再显示，并用 CSP 禁止内联脚本 | `logic.js`、`index.html` |
| Supabase SDK 锁定版本并校验完整性（SRI） | `index.html` |

页面里的 Supabase 地址和 publishable key 是公开信息，安全靠数据库权限保证。**千万不要把 service_role / secret key 写进代码。**

## 开发

```bash
node --test
```

改了界面文字或像素图之后，重新生成字体子集和图标（需要先 `npm install`）：

```bash
npm run build:assets
```

素材授权：像素字体 [Fusion Pixel Font](https://github.com/TakWolf/fusion-pixel-font)（OFL，见 `fonts/FusionPixel-OFL.txt`），图标 [pixelarticons](https://github.com/halfmage/pixelarticons)（MIT）。

本地预览需要一个静态服务器（例如 `npx http-server`），然后在浏览器打开它给出的地址。
