# 多轮数据转换器

在浏览器本地将指定格式的训练集和评测集 Excel 清洗为各平台要求的多轮数据文件。文件不会上传到服务器，也不会被保存。

## 支持的表格

- 训练集：包含 `样本ID`、`用户轮数`、`第 N 轮用户`、`第 N 轮AI回答`。
- 评测集：包含 `样本ID`、`用户轮数`、`待测多轮输入`、`参考答案（评测后查看）`。

转换结果支持五套输出：

- 阿里百炼：文本 SFT ChatML，只保留 `messages`；`system`、`user`、`assistant` 的 `content` 均为字符串。
- 火山引擎（方舟格式）：`system`/`user` 使用 `[{"type":"text","text":"..."}]`，`assistant` 保留 `loss_weight`，并带顶层 `thinking: {"type":"disabled"}`。
- 百度千帆：每条记录为轮次数组，首轮包含 `system`、`prompt`、`response`，后续轮次包含 `prompt`、`response`。
- 腾讯云 TI-ONE：使用文本 SFT `messages`，结构与阿里百炼一致，但独立下载。
- 华为云 ModelArts：使用 ShareGPT 的 `system_prompt` 与 `conversations`，角色为 `human`、`gpt`。

训练集下载为：

- 阿里百炼：`training_bailian_multiturn.jsonl`
- 火山引擎（方舟格式）：`training_volcano_multiturn.jsonl`
- 百度千帆：`training_qianfan_multiturn.jsonl`
- 腾讯云：`training_tencent_multiturn.jsonl`
- 华为云 ModelArts：`training_modelarts_sharegpt_multiturn.jsonl`

评测集下载为：

- 阿里百炼：`evaluation_bailian.xlsx`，仅包含 `Prompt`、`Completion` 两列
- 火山引擎（方舟格式）：`evaluation_volcano_multiturn.jsonl`
- 百度千帆：`evaluation_qianfan_multiturn.jsonl`
- 腾讯云：`evaluation_tencent_multiturn.jsonl`
- 华为云 ModelArts：`evaluation_modelarts_sharegpt_multiturn.jsonl`

百炼评测集的 `Prompt` 保留清洗后的完整多轮输入，`Completion` 使用参考答案；其他平台的评测结果仍为 JSONL。

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
