# C&A Exercise Journey

一个为 Carol 和 Allen 制作、以手机屏幕为主的极简情侣运动打卡小网页。纯静态页面，数据存在 Supabase。

## 已有功能

- 本周 Carol / Allen 左右分屏训练次数与卡路里对比
- 记录 Carol 或 Allen 的运动项目与时长（可以替对方打卡），卡路里由服务器计算
- 彩色 Notion 风格日历，按两人的训练记录着色；长按记录可删除
- 卡路里自动换算为 XP（卡路里 ÷ 10），两人各自的等级进度条：Lv.0 / Lv.1 / Lv.2 / Lv.3
- 两台手机实时同步；可导出全部记录（JSON）；可退出登录

## 部署

页面必须通过 HTTPS 网址访问（Cloudflare Pages、GitHub Pages、Vercel 都可以），直接双击 `index.html` 无法登录。

### 1. 数据库权限（只需做一次）

在 Supabase 控制台 **SQL Editor** 里粘贴并运行 `supabase/migrations/20261008000000_secure_workouts.sql`。它会：

- 新建 `members` 白名单表，只有白名单里的账号能读写记录；
- 给 `workouts` 开启行级权限（RLS），删除旧策略，未登录用户什么都读不到；
- 卡路里、记录人账号、创建时间由数据库触发器决定，前端改不了；记录不允许修改。

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

本地预览需要一个静态服务器（例如 `npx http-server`），然后在浏览器打开它给出的地址。
