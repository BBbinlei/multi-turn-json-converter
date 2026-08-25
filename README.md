# 多轮 JSONL 转换器

在浏览器本地将指定格式的训练集和评测集 Excel 清洗为多轮对话 JSONL。文件不会上传到服务器，也不会被保存。

## 支持的表格

- 训练集：包含 `样本ID`、`用户轮数`、`第 N 轮用户`、`第 N 轮AI回答`。
- 评测集：包含 `样本ID`、`用户轮数`、`待测多轮输入`、`参考答案（评测后查看）`。

转换结果只保留 `messages` 和 `thinking`。训练集中的每轮 AI 回答、评测历史中的“女友”回答以及最终参考答案都会添加 `loss_weight: 1.0`。

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
