import { read, utils, write } from "xlsx";
import {
  convertEvaluationRows,
  convertTrainingRows,
  hasEvaluationHeader,
  hasTrainingHeader,
  toJsonl,
} from "./converter.js";
import "./style.css";

const RECORD_FORMATS = [
  {
    key: "bailian",
    label: "阿里百炼（文本 SFT ChatML）",
    filename: (kind) => kind === "evaluation" ? "evaluation_bailian.xlsx" : "training_bailian_multiturn.jsonl",
  },
  {
    key: "volcano",
    label: "火山引擎（方舟格式）",
    filename: (kind) => `${kind}_volcano_multiturn.jsonl`,
  },
  {
    key: "qianfan",
    label: "百度千帆（多轮 SFT）",
    filename: (kind) => `${kind}_qianfan_multiturn.jsonl`,
  },
  {
    key: "tencent",
    label: "腾讯云（TI-ONE SFT）",
    filename: (kind) => `${kind}_tencent_multiturn.jsonl`,
  },
  {
    key: "modelarts",
    label: "华为云 ModelArts（ShareGPT）",
    filename: (kind) => `${kind}_modelarts_sharegpt_multiturn.jsonl`,
  },
];

const emptyRecords = () => ({
  bailian: [],
  volcano: [],
  qianfan: [],
  tencent: [],
  modelarts: [],
});

const systemPrompt = document.querySelector("#system-prompt");
const convertButton = document.querySelector("#convert-button");
const state = {
  train: { file: null, result: null },
  eval: { file: null, result: null },
};

const config = {
  train: {
    input: document.querySelector("#train-file"),
    status: document.querySelector("#train-file-status"),
    panel: document.querySelector("#train-result"),
    title: "训练集",
    output: "training",
    hasHeader: hasTrainingHeader,
    convert: convertTrainingRows,
    formats: RECORD_FORMATS,
  },
  eval: {
    input: document.querySelector("#eval-file"),
    status: document.querySelector("#eval-file-status"),
    panel: document.querySelector("#eval-result"),
    title: "评测集",
    output: "evaluation",
    hasHeader: hasEvaluationHeader,
    convert: convertEvaluationRows,
    formats: RECORD_FORMATS,
  },
};

function updateConvertButton() {
  convertButton.disabled = !state.train.file && !state.eval.file;
}

function clearResult(kind) {
  state[kind].result = null;
  config[kind].panel.hidden = true;
  config[kind].panel.replaceChildren();
}

function acceptFile(kind, file) {
  if (!file) return;
  clearResult(kind);
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    state[kind].file = null;
    config[kind].status.textContent = "请选择 .xlsx 文件";
    config[kind].status.className = "file-status error-text";
    updateConvertButton();
    return;
  }
  state[kind].file = file;
  config[kind].status.textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB`;
  config[kind].status.className = "file-status selected";
  updateConvertButton();
}

for (const [kind, options] of Object.entries(config)) {
  options.input.addEventListener("change", (event) => acceptFile(kind, event.target.files[0]));
  const dropZone = document.querySelector(`[data-kind="${kind}"]`);
  for (const eventName of ["dragenter", "dragover"]) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add("dragging");
    });
  }
  for (const eventName of ["dragleave", "drop"]) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove("dragging");
    });
  }
  dropZone.addEventListener("drop", (event) => acceptFile(kind, event.dataTransfer.files[0]));
}

systemPrompt.addEventListener("input", () => {
  if (state.train.result || state.eval.result) {
    clearResult("train");
    clearResult("eval");
  }
});

function workbookRows(workbook, hasHeader) {
  for (const sheetName of workbook.SheetNames) {
    const rows = utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });
    if (hasHeader(rows)) return rows;
  }
  return utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });
}

function createElement(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadJsonl(filename, records) {
  if (!records.length) return;
  download(filename, new Blob([toJsonl(records)], { type: "application/jsonl;charset=utf-8" }));
}

function downloadBailianEvaluation(filename, records) {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.json_to_sheet(records, { header: ["Prompt", "Completion"] }), "Sheet1");
  download(filename, new Blob([write(workbook, { type: "array", bookType: "xlsx" })], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }));
}

function renderDownloads(result, options) {
  const actions = createElement("div", "download-actions");
  for (const format of options.formats) {
    const records = result.records?.[format.key] || [];
    const count = records.length;
    const bailianEvaluation = format.key === "bailian" && options.output === "evaluation";
    const label = bailianEvaluation ? "阿里百炼（Prompt / Completion）Excel" : format.label;
    const button = createElement("button", "download-button", `下载 ${label}`);
    button.type = "button";
    button.disabled = !count;
    button.addEventListener("click", () => bailianEvaluation
      ? downloadBailianEvaluation(format.filename(options.output), records)
      : downloadJsonl(format.filename(options.output), records));
    actions.append(button);
  }
  return actions;
}

function renderResult(kind, result) {
  const options = config[kind];
  const panel = options.panel;
  panel.hidden = false;
  panel.replaceChildren();

  const heading = createElement("div", "result-heading");
  const titleWrap = createElement("div");
  titleWrap.append(createElement("p", "result-kicker", options.title), createElement("h3", "", result.errors.length ? "需要修正" : "转换完成"));
  heading.append(titleWrap);

  if (result.errors.length) {
    heading.append(createElement("span", "count-badge error-badge", `${result.errors.length} 个问题`));
    panel.append(heading);
    const list = createElement("ol", "error-list");
    for (const item of result.errors.slice(0, 20)) {
      const location = item.row ? `Excel 第 ${item.row} 行：` : "";
      list.append(createElement("li", "", `${location}${item.message}`));
    }
    if (result.errors.length > 20) list.append(createElement("li", "", `另有 ${result.errors.length - 20} 个问题未显示`));
    panel.append(list);
    return;
  }

  const firstFormat = options.formats[0]?.key || "bailian";
  const count = result.records?.[firstFormat]?.length || 0;
  heading.append(createElement("span", "count-badge", `${count} 条`));
  const summary = createElement("p", "result-summary", kind === "eval"
    ? "五套结果共存：阿里百炼评测集下载为 Prompt / Completion Excel，其他平台下载为 JSONL。下方预览默认展示阿里百炼第一条。"
    : "五套结果共存：阿里百炼、火山引擎、百度千帆、腾讯云与华为云 ModelArts。下方预览默认展示阿里百炼第一条。");
  const previewRecord = result.records?.[firstFormat]?.[0];
  const preview = createElement("pre", "json-preview", JSON.stringify(previewRecord, null, 2));
  const actions = renderDownloads(result, options);
  panel.append(heading, summary, preview, actions);
}

async function convertOne(kind) {
  const current = state[kind];
  const options = config[kind];
  if (!current.file) return;
  try {
    const workbook = read(await current.file.arrayBuffer());
    const rows = workbookRows(workbook, options.hasHeader);
    current.result = options.convert(rows, systemPrompt.value);
  } catch (error) {
    current.result = { records: emptyRecords(), errors: [{ row: null, message: `无法读取文件：${error.message}` }] };
  }
  renderResult(kind, current.result);
}

convertButton.addEventListener("click", async () => {
  convertButton.disabled = true;
  convertButton.textContent = "正在转换…";
  await Promise.all([convertOne("train"), convertOne("eval")]);
  convertButton.textContent = "重新转换";
  convertButton.disabled = false;
  document.querySelector("#results").scrollIntoView({ behavior: "smooth", block: "start" });
});
