# 多轮 JSONL 转换器

在浏览器本地将指定格式的训练集和评测集 Excel 清洗为多轮对话 JSONL。文件不会上传到服务器，也不会被保存。

## 支持的表格

- 训练集：包含 `样本ID`、`用户轮数`、`第 N 轮用户`、`第 N 轮AI回答`。
- 评测集：包含 `样本ID`、`用户轮数`、`待测多轮输入`、`参考答案（评测后查看）`。

转换结果支持两套输出：

- 阿里百炼：文本 SFT ChatML，只保留 `messages`；`system`、`user`、`assistant` 的 `content` 均为字符串。
- 火山引擎（方舟格式）：`system`/`user` 使用 `[{"type":"text","text":"..."}]`，`assistant` 保留 `loss_weight`，并带顶层 `thinking: {"type":"disabled"}`。

训练集下载为：
- 阿里百炼：`training_bailian_multiturn.jsonl`
- 火山引擎（方舟格式）：`training_volcano_multiturn.jsonl`

评测集下载为：
- 阿里百炼：`evaluation_bailian_multiturn.jsonl`
- 火山引擎（方舟格式）：`evaluation_volcano_multiturn.jsonl`

评测集 JSONL 是本工具按多轮对话结构生成的转换文件；百炼控制台原生评测集上传格式仍为 xlsx。

## 本地运行

```bash
npm install
npm run dev
```

## 验证

```bash
npm test
npm run build
node scripts/verify-real-files.mjs /path/to/训练集.xlsx /path/to/评测集.xlsx
```

## 部署

`main` 分支更新后，GitHub Actions 会自动测试、构建并发布到 GitHub Pages。
