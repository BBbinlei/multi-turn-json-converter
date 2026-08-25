import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { read, utils } from "xlsx";
import {
  convertEvaluationRows,
  convertTrainingRows,
  hasEvaluationHeader,
  hasTrainingHeader,
  toJsonl,
} from "../src/converter.js";

const [trainingPath, evaluationPath] = process.argv.slice(2);
if (!trainingPath || !evaluationPath) {
  throw new Error("用法：node scripts/verify-real-files.mjs <训练集.xlsx> <评测集.xlsx>");
}

function rowsFromWorkbook(path, hasHeader) {
  const workbook = read(readFileSync(path));
  for (const sheetName of workbook.SheetNames) {
    const rows = utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });
    if (hasHeader(rows)) return rows;
  }
  throw new Error(`${path} 中未找到匹配的数据表`);
}

function ensureBailianRecord(item) {
  assert.deepEqual(Object.keys(item), ["messages"]);
  assert.equal(item.messages[0].role, "system");
  assert.equal(item.messages.at(-1).role, "assistant");
  for (const message of item.messages) {
    assert.equal(typeof message.content, "string");
    assert.deepEqual(Object.keys(message), ["role", "content"]);
  }
}

function ensureVolcanoRecord(item) {
  assert.deepEqual(Object.keys(item).sort(), ["messages", "thinking"].sort());
  assert.deepEqual(item.thinking, { type: "disabled" });
  assert.equal(item.messages[0].role, "system");
  assert.equal(item.messages.at(-1).role, "assistant");

  for (const message of item.messages) {
    if (message.role === "assistant") {
      assert.equal(typeof message.content, "string");
      assert.equal(message.loss_weight, 1.0);
      assert.deepEqual(Object.keys(message), ["role", "content", "loss_weight"]);
      continue;
    }

    assert.deepEqual(Object.keys(message), ["role", "content"]);
    assert.equal(Array.isArray(message.content), true);
    assert.equal(message.content.length, 1);
    assert.equal(message.content[0].type, "text");
    assert.equal(typeof message.content[0].text, "string");
  }
}

function ensureQianfanRecord(item) {
  assert.equal(Array.isArray(item), true);
  assert.equal(item.length > 0, true);
  assert.deepEqual(Object.keys(item[0]), ["system", "prompt", "response"]);
  for (const [index, round] of item.entries()) {
    if (index > 0) assert.deepEqual(Object.keys(round), ["prompt", "response"]);
    assert.equal(typeof round.prompt, "string");
    assert.equal(typeof round.response, "string");
    assert.equal("weight" in round, false);
  }
}

function ensureModelartsRecord(item) {
  assert.deepEqual(Object.keys(item), ["system_prompt", "conversations"]);
  assert.equal(typeof item.system_prompt, "string");
  assert.equal(item.conversations.at(-1).from, "gpt");
  for (const [index, message] of item.conversations.entries()) {
    assert.deepEqual(Object.keys(message), ["from", "value"]);
    assert.equal(message.from, index % 2 === 0 ? "human" : "gpt");
    assert.equal(typeof message.value, "string");
  }
}

function verifyRecords(result, expected, label) {
  assert.deepEqual(result.errors, [], `${label} 存在转换错误：${JSON.stringify(result.errors)}`);

  assert.equal(result.records.bailian.length, expected, `${label} 阿里百炼条数不正确`);
  assert.equal(result.records.volcano.length, expected, `${label} 火山方舟条数不正确`);
  assert.equal(result.records.qianfan.length, expected, `${label} 百度千帆条数不正确`);
  assert.equal(result.records.tencent.length, expected, `${label} 腾讯云条数不正确`);
  assert.equal(result.records.modelarts.length, expected, `${label} ModelArts 条数不正确`);

  for (let index = 0; index < expected; index += 1) {
    ensureBailianRecord(result.records.bailian[index]);
    ensureVolcanoRecord(result.records.volcano[index]);
    ensureQianfanRecord(result.records.qianfan[index]);
    assert.deepEqual(result.records.tencent[index], result.records.bailian[index]);
    ensureModelartsRecord(result.records.modelarts[index]);
  }

  for (const records of Object.values(result.records)) {
    const lines = toJsonl(records).trimEnd().split("\n");
    assert.equal(lines.length, expected);
    assert.doesNotThrow(() => lines.forEach(JSON.parse));
  }
}

const training = convertTrainingRows(rowsFromWorkbook(trainingPath, hasTrainingHeader), "你是一名女性虚拟女友。");
const evaluation = convertEvaluationRows(rowsFromWorkbook(evaluationPath, hasEvaluationHeader), "你是一名女性虚拟女友。");

verifyRecords(training, 255, "训练集");
verifyRecords(evaluation, 45, "评测集");
console.log(JSON.stringify({
  training: training.records.bailian.length,
  evaluation: evaluation.records.bailian.length,
  trainingVolcano: training.records.volcano.length,
  evaluationVolcano: evaluation.records.volcano.length,
  trainingQianfan: training.records.qianfan.length,
  evaluationQianfan: evaluation.records.qianfan.length,
  trainingTencent: training.records.tencent.length,
  evaluationTencent: evaluation.records.tencent.length,
  trainingModelarts: training.records.modelarts.length,
  evaluationModelarts: evaluation.records.modelarts.length,
}));
