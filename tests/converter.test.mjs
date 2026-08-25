import test from "node:test";
import assert from "node:assert/strict";
import {
  convertEvaluationRows,
  convertTrainingRows,
  parseEvaluationTranscript,
  toJsonl,
} from "../src/converter.js";

const prompt = "你是一名女性虚拟女友。";

function trainingRows(turnCount) {
  const header = ["样本ID", "核心维度", "用户轮数"];
  const data = ["GF-TEST", "会被剔除", String(turnCount)];
  for (let turn = 1; turn <= 4; turn += 1) {
    header.push(`第${turn}轮用户`, `第${turn}轮AI回答`);
    data.push(turn <= turnCount ? `用户 ${turn}` : "", turn <= turnCount ? `回答 ${turn}` : "");
  }
  return [["标题"], [], header, data];
}

for (const turnCount of [2, 3, 4]) {
  test(`训练集正确转换 ${turnCount} 轮对话`, () => {
    const result = convertTrainingRows(trainingRows(turnCount), prompt);
    assert.deepEqual(result.errors, []);
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].messages.length, 1 + turnCount * 2);
    assert.deepEqual(Object.keys(result.records[0]), ["messages", "thinking"]);
    assert.equal(result.records[0].messages.at(-1).loss_weight, 1.0);
    assert.equal(JSON.stringify(result.records[0]).includes("核心维度"), false);
    assert.equal(JSON.stringify(result.records[0]).includes("GF-TEST"), false);
  });
}

test("评测集解析角色、续行并追加参考答案", () => {
  const rows = [
    ["标题"],
    [],
    ["样本ID", "用户轮数", "待测多轮输入", "参考答案（评测后查看）", "主评分维度"],
    ["GF-EVAL", "2", "用户：第一问\n女友：第一答\n续行内容\n用户：第二问", "最终参考回答", "会被剔除"],
  ];
  const result = convertEvaluationRows(rows, prompt);
  assert.deepEqual(result.errors, []);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].messages[2].content, "第一答\n续行内容");
  assert.equal(result.records[0].messages.at(-1).content, "最终参考回答");
  assert.equal(result.records[0].messages.at(-1).loss_weight, 1.0);
  assert.equal(JSON.stringify(result.records[0]).includes("主评分维度"), false);
});

test("轮数不一致时阻止训练集输出", () => {
  const rows = trainingRows(2);
  rows[3][2] = "3";
  const result = convertTrainingRows(rows, prompt);
  assert.equal(result.errors.length, 1);
  assert.equal(result.records.length, 0);
  assert.match(result.errors[0].message, /声明 3 轮/);
});

test("评测角色不交替时给出错误", () => {
  assert.throws(
    () => parseEvaluationTranscript("用户：第一问\n用户：第二问"),
    /角色必须交替/,
  );
});

test("JSONL 每条记录独占一行并保留结尾换行", () => {
  const records = convertTrainingRows(trainingRows(2), prompt).records;
  const jsonl = toJsonl([...records, ...records]);
  const lines = jsonl.trimEnd().split("\n");
  assert.equal(lines.length, 2);
  assert.doesNotThrow(() => lines.forEach(JSON.parse));
  assert.equal(jsonl.endsWith("\n"), true);
});
