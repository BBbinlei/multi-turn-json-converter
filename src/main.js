import { read, utils } from "xlsx";
import {
  convertEvaluationRows,
  convertTrainingRows,
  hasEvaluationHeader,
  hasTrainingHeader,
  toJsonl,
} from "./converter.js";
import "./style.css";

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
    output: "训练集_多轮对话.jsonl",
    hasHeader: hasTrainingHeader,
    convert: convertTrainingRows,
  },
  eval: {
    input: document.querySelector("#eval-file"),
    status: document.querySelector("#eval-file-status"),
    panel: document.querySelector("#eval-result"),
    title: "评测集",
    output: "评测集_多轮对话.jsonl",
    hasHeader: hasEvaluationHeader,
    convert: convertEvaluationRows,
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

function downloadJsonl(filename, records) {
  const blob = new Blob([toJsonl(records)], { type: "application/jsonl;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
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

  heading.append(createElement("span", "count-badge", `${result.records.length} 条`));
  const summary = createElement("p", "result-summary", "多余字段已剔除，文件可直接下载。下方预览第 1 条记录。" );
  const preview = createElement("pre", "json-preview", JSON.stringify(result.records[0], null, 2));
  const download = createElement("button", "download-button", `下载 ${options.output}`);
  download.type = "button";
  download.addEventListener("click", () => downloadJsonl(options.output, result.records));
  panel.append(heading, summary, preview, download);
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
    current.result = { records: [], errors: [{ row: null, message: `无法读取文件：${error.message}` }] };
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
