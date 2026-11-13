export function parseDelimitedText(input, delimiter) {
  const text = String(input ?? '').replace(/^\uFEFF/, '')
  const separator = delimiter || detectDelimiter(text)
  const rows = []
  let row = [], cell = '', quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1 }
      else if (quoted || cell.trim() === '') quoted = !quoted
      else cell += character
    } else if (!quoted && character === separator) {
      row.push(cell); cell = ''
    } else if (!quoted && (character === '\n' || character === '\r')) {
      row.push(cell)
      if (row.some((value) => value.trim())) rows.push(row)
      row = []; cell = ''
      if (character === '\r' && text[index + 1] === '\n') index += 1
    } else cell += character
  }
  if (quoted) throw new Error('表格中存在未闭合的引号，请检查原文件')
  row.push(cell)
  if (row.some((value) => value.trim())) rows.push(row)
  return rows
}

function detectDelimiter(text) {
  let quoted = false, tabs = 0, commas = 0
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') index += 1
      else quoted = !quoted
    } else if (!quoted) {
      if (character === '\n' || character === '\r') break
      if (character === '\t') tabs += 1
      if (character === ',') commas += 1
    }
  }
  return tabs > 0 && tabs >= commas ? '\t' : ','
}

export function serializeDelimitedRows(rows, delimiter = '\t') {
  return rows.map((row) => row.map((value) => {
    const text = String(value ?? '')
    return text.includes(delimiter) || /["\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }).join(delimiter)).join('\n')
}
