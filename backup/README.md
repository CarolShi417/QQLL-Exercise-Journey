# 自动备份

每天北京时间 03:00，GitHub Actions 用只读账号把全部打卡记录导出成 `backups/latest.json`，提交到一个**私有**仓库。

- 文件格式和 App 里「导出全部记录」一样，可以直接用 App 的「导入备份」恢复。
- 每次都会提交，git 历史里保留每天一份快照，想回到哪天就取哪天的版本。
- 每天的查询也让 Supabase 免费项目保持活跃，不会因为一周没访问被暂停。

**为什么要放私有仓库：** App 的仓库和网站都是公开的，备份里有全部运动记录，不能放进去。这个文件夹里只有模板，没有数据。

## 一次性设置

### 1. 建只读账号（Supabase SQL Editor）

1. 运行 `supabase/migrations/20261009000000_backup_reader.sql`。
2. 再单独运行下面这句设置密码，密码用一串足够长的随机字符：

   ```sql
   alter role backup_reader password '这里换成随机密码';
   ```

   运行完把这句从 SQL Editor 里删掉，不要保存。随机密码可以在 PowerShell 里运行 `[guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")` 生成。

这个账号只能读打卡记录里备份需要的几列，不能写，也看不到白名单和登录信息。

### 2. 拿到连接地址

Supabase 控制台点顶部的 **Connect**，选 **Session pooler**，复制连接串，形如：

```
postgresql://postgres.<项目ID>:[YOUR-PASSWORD]@aws-0-<区域>.pooler.supabase.com:5432/postgres
```

改两处：

- 用户名 `postgres.<项目ID>` 换成 `backup_reader.<项目ID>`；
- `[YOUR-PASSWORD]` 换成第 1 步设置的密码。

最后在末尾加上 `?sslmode=require`。

必须用 Session pooler：Direct connection 只支持 IPv6，GitHub Actions 连不上。

### 3. 私有仓库

1. 新建一个 **Private** 仓库。
2. 放入两个文件：本文件夹的 `export.sql` 放在根目录，`backup.yml` 放到 `.github/workflows/backup.yml`。
3. 在仓库 **Settings → Secrets and variables → Actions** 新建 secret：名字 `BACKUP_DB_URL`，值是第 2 步的连接串。
4. 在 **Actions** 页手动运行一次 **Daily backup**，确认成功后 `backups/latest.json` 里有记录。

## 恢复

1. 在私有仓库下载 `backups/latest.json`。要更早的版本，在这个文件的 History 里找对应日期的提交。
2. App 里「成就」→「导入备份（JSON）」选择这个文件。

已经存在的记录会自动跳过，重复导入同一个文件不会产生重复记录。导入的记录算作导入人记下的，卡路里由服务器重新计算。

## 注意

- 重新运行 `20261008000000_secure_workouts.sql` 会清掉 `workouts` 上的所有权限规则，之后要再运行一次 `20261009000000_backup_reader.sql`，否则备份会变成空的。
- 换密码：再运行一次第 1 步的 `alter role`，然后更新 GitHub secret。
- 备份失败时 GitHub 会给仓库所有者发邮件。
