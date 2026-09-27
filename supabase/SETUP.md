# 接通账号与数据

网站地址保持为 https://sixmonth12.github.io/personal-introduce/ 。GitHub Pages 负责页面，Supabase 负责账号、权限和数据。

## 1. 创建项目，找到两项公开配置

1. 在 https://supabase.com/dashboard 登录，点击 **New project**。选择组织，填写项目名与数据库密码，选择合适地区，等待创建完成。数据库密码自己保存。
2. 项目顶部 **Connect** 中复制 Project URL 和 Publishable key。也可以在 **Project Settings → Data API** 找 Project URL，在 **Project Settings → API Keys** 找 Publishable key。
3. 将这两项分别填写到 `site-config.js` 的 `supabaseUrl` 和 `supabaseKey`。URL 类似 `https://abcdefgh.supabase.co`；新式公开密钥以 `sb_publishable_` 开头，旧项目的 `anon public` JWT 也可用。

**不可以填写 `sb_secret_`、`service_role`、数据库密码或数据库连接串。** 浏览器配置会被所有访客看见，这是公开密钥的正常用法；数据权限依靠数据库的 RLS。

## 2. 创建数据库

在 Supabase 左侧 **SQL Editor → New query**，粘贴本目录 `schema.sql` 全文并 Run。可以再次执行，不会删除现有内容。

在 **Authentication → URL Configuration** 中设置：

- Site URL：`https://sixmonth12.github.io/personal-introduce/`
- Redirect URLs：添加 `https://sixmonth12.github.io/personal-introduce/`

保留邮箱验证。检查 Auth 的密码设置，建议最短 10 位。公开注册长期使用时，在 Supabase 配置自己的 SMTP 邮件服务；内置邮件服务有较严格的发送额度。先用自己的邮箱核验注册和密码重置邮件能送达。

## 3. 设置站主

1. 提交配置并发布网站后，在网站左下角注册自己的邮箱，收到验证邮件后点击确认。
2. 打开 `set-owner.sql`，将 `YOUR_VERIFIED_EMAIL` 替换为自己的已验证邮箱。在 Supabase SQL Editor 执行这段 SQL，不要把填过真实邮箱的副本提交仓库。
3. 在网站退出并重新登录，会出现 **管理我的网站**。普通用户不会得到管理权限。

没有“第一个注册自动成为管理员”的逻辑，站主只能在数据库控制台指定。重跑指定其他邮箱会转移站主权限。

## 4. 管理内容

- **编辑网站文字**：选择位置，修改正文并保存；口袋便签也会云端同步。
- **写一篇心事**：标题、正文、分类，选择公开或保存草稿。自动记录首次写入和最后修改时间。
- **管理心事 / 草稿**：编辑或移到回收站，恢复时默认变成草稿。
- **导入原有三篇手记**：将旧示例导入为草稿，记录导入日期；重复导入不覆盖修改。
- **收到的来信**：查看评价、建议与提问，写回复，选择公开或重新设为私密。收起后可以恢复。

留言默认仅发送者与站主可读；站主选择公开后，网站显示昵称、正文、回复和日期，不显示邮箱或用户 ID。投稿界面会事先说明公开方式。每个账号限制每分钟一条、每天 20 条。规模扩大时还需按实际情况配置验证码、邮件额度与反滥用措施。

## 数据备份与维护

Git 只备份代码和初始静态文案，**不会备份 Supabase 中的心事和留言**。按需要通过 Supabase 的数据库备份/导出功能保存数据。回收站是软删除，数据库中仍保留记录。账号删除应在 Supabase 控制台进行；删除普通账号会同时删除该账号的来信，站主账号须先转移权限。

## 验收

运行 `npm ci` 后执行 `npm test` 和 `npm run check`。本地使用嵌入式 PostgreSQL 检查 schema 的权限隔离，使用 DOM 检查前端交互；上线前还须在真实项目核验邮箱送达、登录与刷新会话，并分别用站主、普通访客和未登录窗口验证数据可见范围。

未填写配置时，网站展示原有静态内容，并明确显示账号/来信功能尚未开放。数据库故障时不把失败操作提示为保存成功。
