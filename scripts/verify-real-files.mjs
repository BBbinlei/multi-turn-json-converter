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

function verifyRecords(result, expected, label) {
  assert.deepEqual(result.errors, [], `${label} 存在转换错误：${JSON.stringify(result.errors)}`);
  assert.equal(result.records.length, expected, `${label} 条数不正确`);
  const lines = toJsonl(result.records).trimEnd().split("\n");
  assert.equal(lines.length, expected, `${label} JSONL 行数不正确`);
  for (const [index, line] of lines.entries()) {
    const item = JSON.parse(line);
    assert.deepEqual(Object.keys(item), ["messages"], `${label} 第 ${index + 1} 条包含多余顶层字段`);
    assert.equal(item.messages[0].role, "system");
    assert.equal(item.messages.at(-1).role, "assistant");
    for (const message of item.messages) {
      assert.equal(typeof message.content, "string", `${label} 第 ${index + 1} 条存在非字符串 content`);
      assert.deepEqual(Object.keys(message), ["role", "content"], `${label} 第 ${index + 1} 条消息包含多余字段`);
    }
  }
}

const prompt = "你是一名女性虚拟女友。";
const training = convertTrainingRows(rowsFromWorkbook(trainingPath, hasTrainingHeader), prompt);
const evaluation = convertEvaluationRows(rowsFromWorkbook(evaluationPath, hasEvaluationHeader), prompt);
verifyRecords(training, 255, "训练集");
verifyRecords(evaluation, 45, "评测集");
console.log(JSON.stringify({ training: training.records.length, evaluation: evaluation.records.length }));
