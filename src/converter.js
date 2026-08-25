const TRAIN_REQUIRED = ["样本ID", "用户轮数", "第1轮用户", "第1轮AI回答"];
const EVAL_REQUIRED = ["样本ID", "用户轮数", "待测多轮输入", "参考答案（评测后查看）"];

const text = (value) => String(value ?? "").trim();
const hasValue = (value) => text(value) !== "";

function headerMap(row) {
  return new Map(row.map((cell, index) => [text(cell), index]).filter(([name]) => name));
}

function findHeader(rows, required) {
  for (let index = 0; index < rows.length; index += 1) {
    const columns = headerMap(rows[index] ?? []);
    if (required.every((name) => columns.has(name))) return { index, columns };
  }
  return null;
}

export const hasTrainingHeader = (rows) => Boolean(findHeader(rows, TRAIN_REQUIRED));
export const hasEvaluationHeader = (rows) => Boolean(findHeader(rows, EVAL_REQUIRED));

function systemMessage(systemPrompt) {
  return {
    role: "system",
    content: [{ type: "text", text: systemPrompt }],
  };
}

function userMessage(content) {
  return {
    role: "user",
    content: [{ type: "text", text: content }],
  };
}

function assistantMessage(content) {
  return { role: "assistant", content, loss_weight: 1.0 };
}

function record(messages) {
  return { messages, thinking: { type: "disabled" } };
}

function issue(row, message) {
  return { row, message };
}

function nonEmptyDataRows(rows, headerIndex) {
  return rows
    .map((row, index) => ({ row: row ?? [], index }))
    .filter(({ row, index }) => index > headerIndex && row.some(hasValue));
}

export function convertTrainingRows(rows, rawSystemPrompt) {
  const systemPrompt = text(rawSystemPrompt);
  const header = findHeader(rows, TRAIN_REQUIRED);
  if (!header) return { records: [], errors: [issue(null, `缺少训练集必需列：${TRAIN_REQUIRED.join("、")}`)] };
  if (!systemPrompt) return { records: [], errors: [issue(null, "System 提示词不能为空")] };

  const turns = new Map();
  for (const [name, index] of header.columns) {
    const userMatch = /^第(\d+)轮用户$/.exec(name);
    const assistantMatch = /^第(\d+)轮AI回答$/.exec(name);
    if (userMatch) turns.set(Number(userMatch[1]), { ...turns.get(Number(userMatch[1])), user: index });
    if (assistantMatch) turns.set(Number(assistantMatch[1]), { ...turns.get(Number(assistantMatch[1])), assistant: index });
  }

  const orderedTurns = [...turns.entries()].sort(([a], [b]) => a - b);
  const headerErrors = orderedTurns
    .filter(([, columns]) => columns.user === undefined || columns.assistant === undefined)
    .map(([turn]) => issue(null, `第 ${turn} 轮缺少用户列或 AI 回答列`));
  if (headerErrors.length) return { records: [], errors: headerErrors };

  const records = [];
  const errors = [];
  const idColumn = header.columns.get("样本ID");
  const countColumn = header.columns.get("用户轮数");

  for (const { row, index } of nonEmptyDataRows(rows, header.index)) {
    const excelRow = index + 1;
    const sampleId = text(row[idColumn]);
    const declaredTurns = Number(text(row[countColumn]));
    const populated = [];

    if (!sampleId) {
      errors.push(issue(excelRow, "样本ID为空，无法确认该行是否为有效样本"));
      continue;
    }
    if (!Number.isInteger(declaredTurns) || declaredTurns < 1) {
      errors.push(issue(excelRow, "用户轮数必须是大于 0 的整数"));
      continue;
    }

    for (const [turn, columns] of orderedTurns) {
      const user = text(row[columns.user]);
      const assistant = text(row[columns.assistant]);
      if ((user && !assistant) || (!user && assistant)) {
        errors.push(issue(excelRow, `第 ${turn} 轮的用户或 AI 回答缺失`));
      }
      if (user && assistant) populated.push({ turn, user, assistant });
    }

    const expectedTurns = Array.from({ length: declaredTurns }, (_, position) => position + 1);
    const actualTurns = populated.map(({ turn }) => turn);
    if (actualTurns.length !== declaredTurns || actualTurns.some((turn, position) => turn !== expectedTurns[position])) {
      errors.push(issue(excelRow, `声明 ${declaredTurns} 轮，但实际完整轮次为 ${actualTurns.join("、") || "0"}`));
      continue;
    }

    const messages = [systemMessage(systemPrompt)];
    for (const { user, assistant } of populated) {
      messages.push(userMessage(user), assistantMessage(assistant));
    }
    records.push(record(messages));
  }

  return { records, errors };
}

export function parseEvaluationTranscript(rawTranscript) {
  const transcript = String(rawTranscript ?? "");
  const messages = [];
  let current = null;

  for (const line of transcript.split(/\r?\n/)) {
    const roleLine = /^\s*(用户|女友)\s*[：:]\s*(.*)$/.exec(line);
    if (roleLine) {
      if (current) messages.push({ ...current, content: text(current.content) });
      current = { role: roleLine[1] === "用户" ? "user" : "assistant", content: roleLine[2] };
      continue;
    }
    if (!current) {
      if (text(line)) throw new Error("首行必须以“用户：”或“女友：”开头");
      continue;
    }
    current.content += `\n${line}`;
  }

  if (current) messages.push({ ...current, content: text(current.content) });
  if (!messages.length) throw new Error("待测多轮输入为空");
  if (messages.some(({ content }) => !content)) throw new Error("对话中存在空内容");
  if (messages[0].role !== "user") throw new Error("待测多轮输入必须从用户消息开始");
  if (messages.at(-1).role !== "user") throw new Error("待测多轮输入必须以用户消息结束");
  if (messages.some((message, index) => index > 0 && message.role === messages[index - 1].role)) {
    throw new Error("用户与女友角色必须交替出现");
  }

  return messages;
}

export function convertEvaluationRows(rows, rawSystemPrompt) {
  const systemPrompt = text(rawSystemPrompt);
  const header = findHeader(rows, EVAL_REQUIRED);
  if (!header) return { records: [], errors: [issue(null, `缺少评测集必需列：${EVAL_REQUIRED.join("、")}`)] };
  if (!systemPrompt) return { records: [], errors: [issue(null, "System 提示词不能为空")] };

  const records = [];
  const errors = [];
  const idColumn = header.columns.get("样本ID");
  const countColumn = header.columns.get("用户轮数");
  const transcriptColumn = header.columns.get("待测多轮输入");
  const referenceColumn = header.columns.get("参考答案（评测后查看）");

  for (const { row, index } of nonEmptyDataRows(rows, header.index)) {
    const excelRow = index + 1;
    const sampleId = text(row[idColumn]);
    const declaredTurns = Number(text(row[countColumn]));
    const reference = text(row[referenceColumn]);

    if (!sampleId) {
      errors.push(issue(excelRow, "样本ID为空，无法确认该行是否为有效样本"));
      continue;
    }
    if (!Number.isInteger(declaredTurns) || declaredTurns < 1) {
      errors.push(issue(excelRow, "用户轮数必须是大于 0 的整数"));
      continue;
    }
    if (!reference) {
      errors.push(issue(excelRow, "参考答案为空"));
      continue;
    }

    try {
      const history = parseEvaluationTranscript(row[transcriptColumn]);
      const userTurns = history.filter(({ role }) => role === "user").length;
      if (userTurns !== declaredTurns) throw new Error(`声明 ${declaredTurns} 轮，但实际用户轮数为 ${userTurns}`);
      const messages = [
        systemMessage(systemPrompt),
        ...history.map((message) => message.role === "user" ? userMessage(message.content) : assistantMessage(message.content)),
        assistantMessage(reference),
      ];
      records.push(record(messages));
    } catch (error) {
      errors.push(issue(excelRow, error.message));
    }
  }

  return { records, errors };
}

export function toJsonl(records) {
  return records.length ? `${records.map((item) => JSON.stringify(item)).join("\n")}\n` : "";
}
