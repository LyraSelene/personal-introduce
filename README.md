# 酸橙来信 🍋

**关于我，和我的小小宇宙。**

一个以个人介绍、内心感受和生活手记为主的网站，使用 GitHub Pages 展示页面，使用 Supabase 管理账号与数据。视觉参考《明日方舟》「直到大地变成一颗酸橙」：蓝色天空、奶油色信纸、暖橘色点缀，以及随风漂浮的手绘元素。

> 有一些认真，有一些胡思乱想。还有好多，说不清却想记住的瞬间。

![网站使用的主题主视觉](assets/summer-sky.jpg)

## 页面与功能

| 部分 | 内容 |
| --- | --- |
| 首页 | 短笺式开场、天空主视觉、逐行浮现的标题 |
| 关于我 | 个人介绍、相框头像、状态与小标签 |
| 心里的天气 | 在「对世界好奇」「偶尔没方向」「仍然有期待」之间切换 |
| 心事手记 | 站主新增、编辑、草稿、公开、回收站，记录写入与修改日期 |
| 口袋便签 | 站主编辑后同步云端，所有访客可浏览 |
| 给访客的信 | 一封留给路过这里的人的短笺 |
| 想对我说 | 注册用户发送评价、建议和提问，默认私密，站主可回复并选择公开 |
| 账号与管理 | 邮箱注册、验证、登录、退出、找回密码；只有站主可编辑网站 |

支持晴天／日落配色切换、手机布局、键盘操作、滚动入场动画和动效暂停。无需登录即可浏览公开内容。权限由 Supabase 数据库 RLS 校验，普通账号不能修改网站正文或心事。

**后台首次配置：** 见 [Supabase 接入说明](supabase/SETUP.md)。必须填写 `site-config.js` 并执行 SQL 后，账号和数据功能才会开放；未配置时保留原有静态页面。

## 在线访问与本地浏览

**直接分享网站：** <https://sixmonth12.github.io/personal-introduce/>

这是已经发布的 GitHub Pages 地址，别人打开链接即可访问，不需要下载仓库。

无需 Node.js、安装依赖或执行构建。

1. 下载仓库 ZIP 并解压，或克隆仓库。
2. 静态内容可直接用浏览器打开 `index.html`。账号和邮件回跳请使用上面的 HTTPS 网站地址，并按接入说明配置 Supabase。

```bash
git clone https://github.com/Sixmonth12/personal-introduce.git lime-personal-site
cd lime-personal-site
```

## 目录结构

```text
.
├── index.html               # 页面结构和主要文案
├── style.css                # 基础主题、颜色、响应式布局
├── personal.css             # 个人版样式与入场动画
├── script.js                # 原始手记、心情切换与动效控制
├── system.js                # 登录、内容管理、心事和来信
├── system.css               # 管理界面与来信区样式
├── site-config.js           # Supabase 公开配置（不能放管理员密钥）
├── supabase/                # 数据库权限、站主指定和接入说明
├── tests/                   # 数据库权限与界面回归检查
├── assets/
│   ├── summer-sky.jpg       # 主题主视觉
│   └── pelican-bike.html    # 保留的独立 SVG 动画小作品
├── .gitignore
└── README.md
```

## 换成自己的内容

接通后台并指定站主后，登录网站，点击左下角 **管理我的网站** 即可编辑文字与心事，不必再改源码。以下是未接通后台时的静态初始内容位置：

- **站名、自我介绍、访客信：** 修改 `index.html`。相框图片位于 `assets/profile-portrait.jpg`，采用完整显示方式，可直接替换图片。
- **手记正文：** 修改 `script.js` 中的 `articles` 对象，同时更新 `index.html` 对应卡片的标题与摘要；卡片的 `data-article` 与对象键名需要一致。
- **心情文案：** 修改 `script.js` 中的 `feelingCards`；默认显示的第一张心情也需同步修改 `index.html`。
- **图片：** 替换 `assets/summer-sky.jpg`，或修改 `style.css` 中 `.hero-picture` 的图片路径。
- **颜色和排版：** 基础颜色位于 `style.css` 开头的 `:root`；个人版布局和动画位于 `personal.css`。

现有第一人称文案是可编辑初稿，公开展示前请按个人真实想法调整。网站未填写虚构的联系方式或社交账号。

## 动画与可访问性

四个模块使用柔和的角色切入转场：关于我（纸飞机漂入）、心情（拍照轻晃）、手记（旅行漂浮）、访客信（送信轻跃）。角色以小幅动作在模块边缘浮现，约 2.3 秒后淡出，不使用横扫幕带，也不改变正文透明度。图片已生成透明 WebP，降低饱和度并与页面颜色混合；原始 JPG 仍保留在 `assets/stickers/`。快速切换会取消上一段，浮层不占排版空间、不拦截点击。暂停动效、系统减少动态效果或切到后台时立即停止。实现位于 `chapter-entrances.css` 和 `chapter-entrances.js`。

标题与导航参考活动 UI，使用手写中文、卷曲英文、错落字形和星形卷线装饰；正文保留清晰的阅读字体。样式位于 `lettering.css`。本地托管的 Henny Penny 与 ZCOOL KuaiLe 字体遵循 SIL Open Font License，许可证位于 `assets/fonts/`。字体已按本站内容精简，添加新中文标题时需补充相应字形，否则会使用后备字体。并非游戏原版定制字形。

- 开场短笺自动退场，按 `Tab` 或 `Escape` 可以跳过。
- 标题与导航错落入场，内容进入视野时轻量浮现。
- 使用原生 CSS、Web Animations API 和 IntersectionObserver，无第三方动画库。
- 右下角可暂停动效，遵循系统的 `prefers-reduced-motion` 设置。
- 弹窗支持键盘关闭，按钮提供焦点样式与必要的辅助标签。
- JavaScript 不可用时，页面主体仍可阅读，交互功能需要 JavaScript。

## 背景音乐

导航栏的「播放 BGM」可播放指定的[网易云音乐歌曲](https://music.163.com/song?id=1436614177)，播放结束后自动单曲循环，再次点击可暂停。音频通过网易云公开外链播放，仓库不保存音频副本。

首次访问需要点击播放；若之前主动开启过音乐，下次访问会尝试恢复，但浏览器可能仍要求点击。音乐加载失败时会显示提示，其可用性取决于网易云、网络及地区限制。

## 内容与隐私

网站文字、心事与来信保存在 Supabase。口袋便签现在属于站主内容，访客不能编辑。旧版本浏览器本地便签不会自动上传，可由站主手动复制到文字编辑器。

来信默认仅发送者和站主可见；站主可以公开昵称、正文与回复，也可以撤回公开。公开接口不返回账号 ID 或邮箱。心事草稿和回收站仅站主可读。写入日期由数据库生成，编辑不会改变首次写入日期。

GitHub 备份的是代码，**不包含数据库中的新内容**。心事与来信需要另行通过 Supabase 备份或导出。

## Git 备份

修改后，可在本目录查看并提交变更：

```bash
git status
git diff
git add index.html style.css personal.css script.js system.js system.css site-config.js supabase tests package.json package-lock.json README.md assets
git commit -m "Update personal website"
git push
```

提交前检查文件列表。`.gitignore` 已排除常见环境文件、私钥文件、依赖目录和临时文件。

## GitHub Pages 发布

本仓库已经开启 GitHub Pages，从 `main` 分支根目录发布。上传源码是备份，GitHub Pages 才是对外分享入口：

<https://sixmonth12.github.io/personal-introduce/>

如果未来关闭 Pages 或更换仓库，需要在仓库的 **Settings → Pages** 中重新选择 `main` 分支的根目录；通常修改 `main` 后 GitHub 会自动重新构建。

## 素材与说明

本项目由站点所有者与 AI 协作制作，是非官方个人主题习作，与《明日方舟》官方无隶属关系。`summer-sky.jpg` 为提供的参考图片，相关游戏名称及美术素材权利归原权利人所有；仓库未对该素材授予额外使用许可。

开发检查：`npm ci`、`npm test`、`npm run check`。开发依赖只用于本地检查，无需上传 `node_modules`。Supabase JS 客户端固定为 2.57.4 并随站点托管，MIT 许可证位于 `assets/vendor/SUPABASE-LICENSE`。真实项目的邮箱送达和登录流程仍需在配置后验证。
