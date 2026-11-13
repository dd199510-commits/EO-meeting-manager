import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { IMPORT_FIELDS, buildTimeImportPreview, inferImportLayout } from './timeImportUtils.js'

export function TimeImportModal({ source, currentRecords, onClose, onConfirm }) {
  const [sheetIndex, setSheetIndex] = useState(0)
  const [layout, setLayout] = useState(() => inferImportLayout(source.sheets[0].rows))
  const [mode, setMode] = useState('append')
  const [busy, setBusy] = useState(false)
  const sheet = source.sheets[sheetIndex]
  const preview = useMemo(() => buildTimeImportPreview(sheet.rows, layout, currentRecords), [sheet, layout, currentRecords])
  const valid = preview.filter((row) => !row.errors.length && !row.duplicateInFile && (mode === 'replace' || !row.duplicateExisting))
  const errors = preview.filter((row) => row.errors.length)
  const duplicates = preview.filter((row) => row.duplicateInFile || (mode === 'append' && row.duplicateExisting))
  const hasRequired = layout.mapping.date !== undefined && layout.mapping.date !== '' && layout.mapping.title !== undefined && layout.mapping.title !== ''
  const selectedColumns = Object.values(layout.mapping).filter((value) => value !== '' && value !== undefined).map(Number)
  const repeatedColumns = new Set(selectedColumns).size !== selectedColumns.length
  useEffect(() => {
    const handleKey = (event) => { if (event.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [busy, onClose])

  return <div className="modal-backdrop" onClick={() => !busy && onClose()}>
    <section className="modal-card modal-wide nx-import-preview" role="dialog" aria-modal="true" aria-labelledby="time-import-title" onClick={(event) => event.stopPropagation()}>
      <header className="modal-header"><h2 id="time-import-title">检查并导入会议明细</h2><button className="icon-button" type="button" onClick={onClose} disabled={busy} aria-label="关闭导入预览"><X size={18} /></button></header>
      <p>{source.name} · 当前已有 {currentRecords.length} 条。确认后才会写入数据。</p>
      <div className="nx-import-controls">
        <label className="nx-field"><span>工作表</span><select className="nx-input" value={sheetIndex} onChange={(event) => { const index = Number(event.target.value); setSheetIndex(index); setLayout(inferImportLayout(source.sheets[index].rows)) }}>{source.sheets.map((item, index) => <option value={index} key={`${item.name}-${index}`}>{item.name}</option>)}</select></label>
        <label className="nx-field"><span>表头所在行</span><select className="nx-input" value={layout.headerRow} onChange={(event) => { const headerRow = Number(event.target.value); setLayout({ ...inferImportLayout([sheet.rows[headerRow]]), headerRow }) }}>{sheet.rows.slice(0, 12).map((row, index) => <option value={index} key={index}>第 {index + 1} 行 · {row.slice(0, 3).join(' / ').slice(0, 60)}</option>)}</select></label>
      </div>
      <details className="nx-import-mapping" open={!hasRequired}><summary>确认列对应关系 · 日期与会议主题必选</summary><div className="nx-import-mapping-grid">{IMPORT_FIELDS.map((field) => <label className="nx-field" key={field.key}><span>{field.label}{['date', 'title'].includes(field.key) ? ' *' : ''}</span><select className="nx-input" value={layout.mapping[field.key] ?? ''} onChange={(event) => setLayout((current) => ({ ...current, mapping: { ...current.mapping, [field.key]: event.target.value === '' ? '' : Number(event.target.value) } }))}><option value="">不导入此列</option>{(sheet.rows[layout.headerRow] || []).map((label, index) => <option value={index} key={index}>第 {index + 1} 列 · {String(label || '无表头')}</option>)}</select></label>)}</div></details>
      {repeatedColumns ? <p className="error-text" role="alert">同一原始列被映射到了多个字段，请调整对应关系。</p> : null}
      <fieldset className="nx-import-mode"><legend>导入方式</legend><label><input type="radio" name="time-import-mode" checked={mode === 'append'} onChange={() => setMode('append')} /> 追加新明细，保留原数据并跳过重复</label><label><input type="radio" name="time-import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} /> 覆盖全部明细，用本次有效数据替换</label></fieldset>
      <div className="nx-import-summary" role="status"><span>可导入 {valid.length} 条</span><span>异常 {errors.length} 条</span><span>跳过重复 {duplicates.length} 条</span></div>
      <div className="nx-import-table-scroll"><table className="nx-table"><thead><tr><th>原始行</th><th>日期</th><th>会议主题</th><th>检查结果</th></tr></thead><tbody>{preview.slice(0, 30).map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.record.date || '—'}</td><td>{row.record.title}</td><td>{row.errors.join('、') || (row.duplicateInFile || (mode === 'append' && row.duplicateExisting) ? '重复，跳过' : '可导入')}</td></tr>)}</tbody></table></div>
      <p className="nx-import-note">预览前 30 条，共 {preview.length} 条。异常行不会导入；完成后可在任意工作模式撤销本次导入。</p>
      <footer className="panel-actions"><button className="nx-btn nx-btn-outline" type="button" onClick={onClose} disabled={busy}>取消</button><button className="nx-btn nx-btn-primary" type="button" disabled={busy || !hasRequired || repeatedColumns || !valid.length} onClick={async () => { setBusy(true); try { await onConfirm(preview, mode) } finally { setBusy(false) } }}>{busy ? '正在导入…' : `${mode === 'replace' ? '确认覆盖' : '追加'} ${valid.length} 条`}</button></footer>
    </section>
  </div>
}
