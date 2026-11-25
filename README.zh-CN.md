# AI爽窥 (AI Peek)

[English](README.md) | **简体中文**

偷窥你想知道的一切。

用手机摄像头自动锁定车辆，也可以上传图片识别车辆、地标和物品。网页右上角支持一键切换 **English / 中文**。扫描结果、关键帧、语言偏好和主题选择保存在当前浏览器。

## 本地运行

安装 Node.js 22.19.0，在项目根目录执行。

```sh
npm ci
npm run dev
```

打开终端给出的本地地址。在「模型设置」里选一个支持图片输入的模型，填入对应 API Key。预设服务经 `/api/scan` 调用，自定义接口由浏览器连接，需要支持 HTTPS 和跨域请求。

## 上传到 GitHub 私有仓库

在 GitHub 新建一个可见性为 **Private** 的空仓库。如果从 ZIP 解压得到项目，先在项目根目录执行 `git init -b main`。把下面的 GitHub 地址换成你的仓库地址，然后执行。

```sh
git add .
git commit -m "Add AI Peek Workers release"
git remote add origin "https://github.com/YOUR_ACCOUNT/YOUR_PRIVATE_REPO.git"
git push -u origin main
```

## 从 GitHub 部署到 Cloudflare Workers

在 Cloudflare 的 **Workers & Pages** 中创建 Worker，导入 GitHub 仓库。授权 **Cloudflare Workers and Pages** 应用时，选 **Only select repositories** 并勾选上一步的私有仓库。按下表填写构建设置。

| 设置 | 值 |
| --- | --- |
| Worker 名称 | `ai-shuang-kui` |
| 生产分支 | `main` |
| 根目录 | 仓库根目录 |
| 构建命令 | `npm run build` |
| 部署命令 | `npm run deploy` |

如果自定义 Worker 名称，也修改 `wrangler.jsonc` 的 `name`。首次部署成功后，推送到 `main` 会触发更新。构建会将前端资源放在 `dist/client`，并在 `dist/server` 生成 Worker 和部署配置。

[Cloudflare 的 GitHub 接入文档](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)

## 从本机部署到 Cloudflare Workers

```sh
npm ci
npm run typecheck
npm run build
npm run deploy -- --dry-run
npx wrangler login
npm run deploy
```

`--dry-run` 用于本地检查部署包。在部署前，也可以运行 `npm run preview` 在本机预览构建好的 Worker。

部署需要一个 Cloudflare 账号。使用自己的 API 时，在网页里填写模型 API Key。新域名拥有独立的浏览器配置和扫描记录。GitHub 的仓库可见性与 Worker 的访问权限分别管理。

## 开启体验账户

部署 Worker 后，在 **Settings → Variables and Secrets** 填写运行时配置。配置齐全后，模型设置里会出现「体验账户」。输入体验密码就能启用内置模型。

| 运行时配置 | 类型 | 用途 |
| --- | --- | --- |
| `TRIAL_PASSWORD` | Secret | 发给体验者的随机长密码 |
| `TRIAL_API_KEY` | Secret | 模型服务的 API Key，建议为体验单独创建一个 |
| `TRIAL_SESSION_SECRET` | Secret | 独立的随机签名密钥，至少 32 字符 |
| `TRIAL_BASE_URL` | Text | HTTPS 的 OpenAI 兼容接口地址，可填写基础地址或完整的 `/chat/completions` 地址 |
| `TRIAL_MODEL` | Text | 服务端使用的视觉模型 ID |
| `TRIAL_SCANS_PER_IP_PER_HOUR` | Text | 同一 IP 滚动一小时内允许的扫描次数，默认 `20`，可填正整数 |

例如，体验模型使用 Google Gemini 时，可把 `TRIAL_BASE_URL` 设为 `https://generativelanguage.googleapis.com/v1beta/openai`，模型名填该 Key 可用的视觉模型。生成随机签名密钥可以用下面的命令，然后把输出填入 Secret。

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

密码验证在 Worker 完成，会话有效期为 8 小时。修改密码或签名密钥可以使旧会话失效。体验开启后，模型请求使用服务端的地址、模型和 Key。

体验额度按来源 IP 共享，刷新和重新登录会继续使用同一份额度。每次通过校验并发往模型的体验请求占用一次额度。超限后页面会提示等待时间。Worker 部署时会创建用于计数的 SQLite Durable Object，以及限制密码尝试次数的登录限流绑定。模型 Key 自带的配额仍由对应服务管理。

本地测试可以在项目根目录复制 [.dev.vars.example](.dev.vars.example) 为 `.dev.vars`，填写测试值后运行 `npm run dev`。实际密钥通过 Cloudflare Secrets 管理，`.dev.vars` 已加入 Git 忽略规则。

[Cloudflare Secrets 文档](https://developers.cloudflare.com/workers/configuration/secrets/) · [Durable Objects 文档](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
