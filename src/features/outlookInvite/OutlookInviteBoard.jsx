import { useMemo, useRef, useState } from 'react'
import { toast } from '../../components/Feedback'
import { CalendarPlus, CheckCircle2, CheckSquare, ChevronDown, Download, Search, Square, TriangleAlert } from 'lucide-react'
import { FREQUENCY_LABELS } from '../../data/meetingData'
import { buildOutlookInviteRows, downloadOutlookVbaScript, downloadOutlookVbsScript } from './outlookInviteUtils'
import { WorkflowBlocker } from '../../components/WorkflowBlocker'
import { detectConflicts } from '../../lib/conflicts'
import { isValidEmail } from '../../lib/email'
import { parseOutlookReceipt } from './outlookScript'

function rowReady(row) {
  return row.requiredEmails.length > 0 && row.recipientIssues.length === 0 && row.timeErrors.length === 0
}

function formatDateTime(row) {
  return `${row.date} ${row.startTime} - ${row.endTime}`
}

function summarizePeople(people, fallback = '无') {
  if (!Array.isArray(people) || people.length === 0) return fallback
  return people.map((person) => person.label).join('、')
}

function formatScheduleDate(dateString) {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return dateString || '未定日期'
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`
}

export function OutlookInviteBoard({
  meetings = [],
  schemeOptions = [],
  taskOptions = [],
  selectedTaskId = '',
  onTaskChange,
  onExportDrafts,
  onGoToPlanner,
  onBackToReview,
  onResolveContacts,
  onGoToContacts,
}) {
  const [selectedIds, setSelectedIds] = useState([])
  const [searchText, setSearchText] = useState('')
  const [senderEmail, setSenderEmail] = useState('')
  const [selectedSchemeId, setSelectedSchemeId] = useState('')
  const [selectedScheduleId, setSelectedScheduleId] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [previewCandidates, setPreviewCandidates] = useState(false)
  const [generated, setGenerated] = useState(null)
  const [receipt, setReceipt] = useState([])
  const [selectionScope, setSelectionScope] = useState('')
  const [previewRowId, setPreviewRowId] = useState('')
  const receiptInput = useRef(null)
  const availableSchemes = useMemo(() => schemeOptions.filter((scheme) => previewCandidates || scheme.confirmed === true), [previewCandidates, schemeOptions])
  const selectedTask = taskOptions.find((task) => task.id === selectedTaskId) ?? taskOptions[0] ?? null
  const activeSchemeId = availableSchemes.some((scheme) => scheme.id === selectedSchemeId)
    ? selectedSchemeId
    : availableSchemes[0]?.id ?? ''
  const selectedScheme = availableSchemes.find((scheme) => scheme.id === activeSchemeId) ?? null
  const scheduledMeetings = useMemo(
    () => selectedScheme?.scheduledMeetings ?? [],
    [selectedScheme],
  )

  const scheduleOptions = useMemo(() => {
    const byDate = new Map()
    scheduledMeetings.forEach((meeting) => {
      const date = meeting.date || 'undated'
      const current = byDate.get(date) ?? []
      current.push(meeting)
      byDate.set(date, current)
    })

    return [
      { id: 'all', label: '全部日程', count: scheduledMeetings.length },
      ...Array.from(byDate.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, items]) => ({
          id: `date:${date}`,
          label: `${formatScheduleDate(date)}（${items.length}）`,
          count: items.length,
        })),
    ]
  }, [scheduledMeetings])
  const selectedScheduleMeetings = useMemo(() => {
    const activeScheduleId = scheduleOptions.some((option) => option.id === selectedScheduleId)
      ? selectedScheduleId
      : 'all'
    if (activeScheduleId === 'all') return scheduledMeetings
    if (activeScheduleId.startsWith('date:')) {
      const date = activeScheduleId.slice(5)
      return scheduledMeetings.filter((meeting) => meeting.date === date)
    }
    return scheduledMeetings
  }, [scheduleOptions, scheduledMeetings, selectedScheduleId])
  const rows = useMemo(
    () => buildOutlookInviteRows({ meetings, scheduledMeetings: selectedScheduleMeetings, taskId: selectedTask?.id }),
    [meetings, selectedScheduleMeetings, selectedTask?.id],
  )
  const selectableRows = useMemo(
    () => rows.filter(rowReady),
    [rows],
  )
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const filteredRows = useMemo(() => {
    const search = searchText.trim().toLowerCase()
    return rows.filter((row) => {
      if (!search) return true
      const haystack = [
        row.subject,
        row.date,
        row.startTime,
        row.endTime,
        row.requiredEmails.join(' '),
        row.optionalEmails.join(' '),
        row.requiredPeople.map((person) => person.label).join(' '),
        row.optionalPeople.map((person) => person.label).join(' '),
        row.missingRequired.join(' '),
        row.body,
      ].join(' ').toLowerCase()
      if (!haystack.includes(search)) return false
      return true
    }).filter((row) => {
      const canGenerate = rowReady(row)
      if (filterType === 'ready') return canGenerate
      if (filterType === 'missing') return !canGenerate || row.missingOptional.length > 0
      if (filterType === 'selected') return selectedSet.has(row.id)
      return true
    })
  }, [filterType, rows, searchText, selectedSet])
  const filteredSelectableRows = useMemo(
    () => filteredRows.filter(rowReady),
    [filteredRows],
  )
  const selectedRows = rows.filter((row) => selectedSet.has(row.id))
  const hiddenSelectedCount = selectedRows.filter(
    (row) => !filteredRows.some((filteredRow) => filteredRow.id === row.id),
  ).length
  const completeCount = selectableRows.length
  const missingCount = rows.filter((row) => row.missingRequired.length > 0 || row.missingOptional.length > 0).length
  const timeIssueCount = rows.filter((row) => row.timeErrors.length).length
  const previewRow = filteredRows.find((row) => row.id === previewRowId) ?? filteredRows[0] ?? null
  const selectedConflicts = detectConflicts(scheduledMeetings).filter((conflict) => conflict.meetingIds.some((id) => selectedSet.has(id)))
  const backToReview = () => (onBackToReview || onGoToPlanner)?.(selectedTask?.id)
  const resolveContacts = (row) => (onResolveContacts || onGoToContacts)?.({ meetingId: row?.sourceMeeting?.id || '', names: row?.recipientIssues.map((issue) => issue.name) || [], issues: row?.recipientIssues || [], returnTo: 'outlookInvite', taskId: selectedTask?.id })

  const currentScope = `${selectedTask?.id || ''}:${activeSchemeId}`
  if (selectionScope !== currentScope) {
    setSelectionScope(currentScope)
    setSelectedIds([])
    setGenerated(null)
    setReceipt([])
    setPreviewRowId('')
  }

  async function importReceipt(event) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('回执文件过大')
      const parsed = parseOutlookReceipt(await file.text())
      const ids = new Set(rows.map((row) => row.externalId))
      if (parsed.some((item) => !ids.has(item.id))) throw new Error('回执不属于当前任务或日期范围，请切换后再导入')
      setReceipt(parsed)
      toast('已读取 Outlook 执行回执')
    } catch (error) { toast(error.message, 'error') }
    event.target.value = ''
  }

  function handleTaskChange(taskId) {
    setSelectedIds([])
    setSelectedSchemeId('')
    setSelectedScheduleId('all')
    onTaskChange?.(taskId)
  }

  function handleSchemeChange(schemeId) {
    setSelectedIds([])
    setSelectedSchemeId(schemeId)
    setSelectedScheduleId('all')
  }

  function handleScheduleChange(scheduleId) {
    setSelectedIds([])
    setSelectedScheduleId(scheduleId)
  }

  function toggleRow(rowId) {
    setSelectedIds((current) =>
      current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId],
    )
  }

  function selectAllVisibleRows() {
    setSelectedIds(filteredSelectableRows.map((row) => row.id))
  }

  function unselectVisibleRows() {
    const visibleIds = new Set(filteredRows.map((row) => row.id))
    setSelectedIds((current) => current.filter((id) => !visibleIds.has(id)))
  }

  function exportSelectedRows() {
    exportRows('vba')
  }

  function exportOneClickScript() {
    exportRows('vbs')
  }

  function exportRows(format) {
    if (!selectedScheme?.confirmed) {
      toast('请先在排程审核中确认正式方案', 'warning')
      return
    }
    if (selectedRows.length === 0) {
      toast('请先选择至少一个可生成会邀的会议方案', 'warning')
      return
    }

    const blocked = selectedRows.filter((row) => !rowReady(row))
    if (blocked.length > 0) {
      toast('有会议的邮箱或日期时间未通过校验，请修正后再生成', 'warning')
      return
    }
    if (senderEmail.trim() && !isValidEmail(senderEmail)) { toast('发件邮箱格式不正确', 'warning'); return }
    if (selectedConflicts.length) { toast('选中会议存在时间冲突，请返回审核处理', 'warning'); return }

    const payload = {
      rows: selectedRows,
      taskName: selectedTask?.name ?? '排程任务',
      senderEmail,
    }

    if (format === 'vbs') {
      downloadOutlookVbsScript(payload)
    } else {
      downloadOutlookVbaScript(payload)
    }
    onExportDrafts?.(selectedRows.length, format)
    setGenerated({ count: selectedRows.length, at: new Date().toLocaleString() })
    setReceipt([])
    toast('执行文件已生成，请在 Outlook 运行并核对执行回执')
  }

  if (taskOptions.length === 0 || schemeOptions.length === 0) {
    const hasTask = taskOptions.length > 0
    return (
      <WorkflowBlocker
        title={hasTask ? '当前任务还没有可生成的会邀方案' : '先采用排程方案，再生成正式会邀'}
        description={hasTask
          ? '当前任务还没有可用的已采用方案。完成排程审核后，系统会在这里检查邮箱并生成 Outlook 草稿脚本。'
          : '会邀生成依赖已经审核采用的排程结果。先完成会议库和排程任务，避免生成空白或重复会邀。'}
        steps={[
          { label: '建立会议库', hint: '补齐参会人和邮箱信息', done: meetings.length > 0 },
          { label: '创建排程任务', hint: '生成候选排程方案', done: taskOptions.length > 0 },
          { label: '审核并采用方案', hint: '采用后解锁会邀生成', done: schemeOptions.length > 0 },
        ]}
        actionLabel="去排程中心"
        onAction={onGoToPlanner}
      />
    )
  }

  return (
    <section className="dd-dispatch-shell dd-outlook-shell">
      <div className="dd-dispatch-toolbar">
        <div className="dd-section-title"><h2>会邀清单</h2><span>{completeCount} 场可生成<span className="dd-dot-separator">·</span>已选 {selectedRows.length} 场</span></div>
        <div className="dd-toolbar-actions">
          <button className="dd-text-button" type="button" onClick={backToReview}>返回审核</button>
          <details className="dd-context-menu">
            <summary>任务与方案 <ChevronDown size={14} /></summary>
            <div className="dd-menu-content">
              <label className="dd-menu-field"><span>切换任务</span><select value={selectedTask?.id ?? ''} onChange={(event) => handleTaskChange(event.target.value)} disabled={!taskOptions.length}>{taskOptions.map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}</select></label>
              <label className="dd-menu-field"><span>排程方案</span><select value={activeSchemeId} onChange={(event) => handleSchemeChange(event.target.value)} disabled={!availableSchemes.length}>{!availableSchemes.length ? <option value="">暂无已确认方案</option> : null}{availableSchemes.map((scheme) => <option key={scheme.id} value={scheme.id}>{scheme.confirmed ? '已确认 · ' : '候选预览 · '}{scheme.label}</option>)}</select></label>
              <label className="dd-menu-checkbox"><input type="checkbox" checked={previewCandidates} onChange={(event) => setPreviewCandidates(event.target.checked)} />显示候选方案，仅供预览</label>
              <div className="dd-menu-divider" />
              <label className="dd-menu-field"><span>指定发件邮箱</span><input type="email" placeholder="留空使用 Outlook 默认账号" value={senderEmail} onChange={(event) => setSenderEmail(event.target.value)} /></label>
              <details className="dd-advanced-section"><summary>高级执行方式</summary><p>默认下载 Windows VBS 执行文件。也可使用 Outlook VBA 模块。</p><button type="button" className="dd-secondary-button" onClick={exportSelectedRows} disabled={!selectedScheme?.confirmed || !selectedRows.length}><Download size={14} />下载 VBA 模块</button></details>
            </div>
          </details>
          <button className="dd-primary-button" type="button" onClick={exportOneClickScript} disabled={!selectedScheme?.confirmed || !selectedRows.length}><CalendarPlus size={16} />生成 Outlook 草稿</button>
        </div>
      </div>

      {!selectedScheme?.confirmed ? <div className="dd-dispatch-warning"><TriangleAlert size={16} /><span>{selectedScheme ? '候选方案仅供预览，确认排程后可生成正式草稿。' : '当前任务尚无已确认排程。'}</span><button type="button" onClick={backToReview}>去确认排程</button></div> : null}
      {missingCount || selectedConflicts.length || timeIssueCount ? (
        <div className="dd-dispatch-warning" role="status"><TriangleAlert size={16} /><span>{[missingCount ? `${missingCount} 场收件人待补齐` : '', selectedConflicts.length ? `选中日程有 ${selectedConflicts.length} 处冲突` : '', timeIssueCount ? `${timeIssueCount} 场日期时间异常` : ''].filter(Boolean).join(' · ')}</span>{missingCount ? <button type="button" onClick={() => resolveContacts(rows.find((row) => row.recipientIssues.length))}>补齐邮箱</button> : null}{selectedConflicts.length || timeIssueCount ? <button type="button" onClick={backToReview}>处理日程</button> : null}</div>
      ) : rows.length ? <div className="dd-validation-success"><CheckCircle2 size={14} />收件人与日期时间校验通过，选择会议后生成草稿。</div> : null}

      <div className="dd-dispatch-grid">
        <div className="dd-list-pane">
          <div className="dd-list-filters">
            <div className="dd-segmented" role="group" aria-label="会邀筛选">{[['all', '全部'], ['ready', '可生成'], ['missing', '待补齐'], ['selected', '已选择']].map(([value, label]) => <button type="button" key={value} className={filterType === value ? 'is-active' : ''} onClick={() => setFilterType(value)}>{label}</button>)}</div>
            <label className="dd-inline-search"><Search size={15} /><input type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="搜索会议或邮箱" aria-label="搜索会邀会议或邮箱" /></label>
          </div>
          <div className="dd-list-subtoolbar">
            <label className="dd-date-filter"><span className="dd-visually-hidden">筛选日程日期</span><select value={scheduleOptions.some((option) => option.id === selectedScheduleId) ? selectedScheduleId : 'all'} onChange={(event) => handleScheduleChange(event.target.value)}>{scheduleOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
            <div><button type="button" className="dd-text-button" onClick={selectAllVisibleRows}><CheckSquare size={14} />全选</button><button type="button" className="dd-text-button" onClick={unselectVisibleRows}><Square size={14} />取消</button></div>
          </div>
          {hiddenSelectedCount > 0 ? <div className="dd-inline-note">筛选外还有 {hiddenSelectedCount} 个已选择项</div> : null}
          <div className="dd-dispatch-list">
            {filteredRows.map((row) => {
              const canGenerate = rowReady(row)
              const isPreview = previewRow?.id === row.id
              return <article key={row.id} className={`dd-dispatch-row ${isPreview ? 'is-active' : ''}`}>
                <label className="dd-row-check"><input type="checkbox" checked={selectedSet.has(row.id)} disabled={!canGenerate || !selectedScheme?.confirmed} onChange={() => toggleRow(row.id)} aria-label={`选择 ${row.subject}`} /></label>
                <button type="button" className="dd-row-main" onClick={() => setPreviewRowId(row.id)} aria-pressed={isPreview}>
                  <strong>{row.subject}</strong><span>{formatDateTime(row)}</span><small>{row.requiredPeople.map((person) => person.name).join(' / ') || '待补齐参会人'}<span className="dd-dot-separator">·</span>{row.duration} 分钟</small>
                </button>
                <span className={`dd-status ${canGenerate ? 'dd-status-ready' : 'dd-status-warning'}`}>{canGenerate ? '可生成' : '待补齐'}</span>
              </article>
            })}
            {!filteredRows.length ? <div className="dd-empty-state">当前筛选下暂无会议</div> : null}
          </div>
          <div className="dd-list-footer">显示 {filteredRows.length} / {rows.length} 场</div>
        </div>

        <aside className="dd-preview-pane" aria-label="正式会邀草稿预览">
          {previewRow ? <>
            <div className="dd-preview-heading"><span className="dd-preview-eyebrow">{selectedScheme?.confirmed ? '正式草稿预览' : '候选草稿预览'}</span><h3>{previewRow.subject}</h3><span className="dd-preview-date">{formatDateTime(previewRow)}</span></div>
            <div className="dd-invite-addresses"><div><span>发件人</span><p>{senderEmail.trim() || 'Outlook 默认账号'}</p></div><div><span>参会人</span><p>{summarizePeople(previewRow.requiredPeople, '尚未解析到有效邮箱')}</p></div>{previewRow.optionalPeople.length ? <div><span>仅收会邀</span><p>{summarizePeople(previewRow.optionalPeople)}</p></div> : null}{previewRow.location ? <div><span>地点</span><p>{previewRow.location}</p></div> : null}<div><span>频率</span><p>{FREQUENCY_LABELS[previewRow.scheduledMeeting.frequency] ?? '不定期'}</p></div></div>
            <div className="dd-invite-body"><p>{previewRow.body || '无正文'}</p></div>
            {previewRow.recipientIssues.length ? <div className="dd-preview-issue"><strong>以下收件人尚未通过校验</strong><ul>{previewRow.recipientIssues.map((issue, index) => <li key={`${issue.name}-${index}`}>{issue.name} · {issue.reason === 'invalid' ? `邮箱格式错误 ${issue.email}` : '缺少邮箱'}</li>)}</ul><button className="dd-secondary-button" type="button" onClick={() => resolveContacts(previewRow)}>补齐这些人的邮箱</button></div> : null}
            {previewRow.timeErrors.length ? <div className="dd-preview-issue"><p>{previewRow.timeErrors.join('、')}</p><button className="dd-secondary-button" type="button" onClick={backToReview}>返回审核修正</button></div> : null}
          </> : <div className="dd-empty-state"><CalendarPlus size={28} /><span>选择会议，查看正式草稿内容</span></div>}
          <div className="dd-execution-panel">
            {generated ? <div className="dd-generated-state"><CheckCircle2 size={15} /><span>已生成 {generated.count} 场执行文件，等待 Outlook 运行</span><small>{generated.at}</small></div> : null}
            <div className="dd-execution-actions"><span>执行文件只保存草稿，发送前请在 Outlook 复核。</span><button type="button" className="dd-text-button" onClick={() => receiptInput.current?.click()}>导入执行回执</button><input ref={receiptInput} type="file" accept=".csv,text/csv" onChange={importReceipt} hidden /></div>
            {receipt.length ? <div className="dd-receipt-summary" role="status">{[['created', '新增'], ['updated', '更新'], ['skipped', '跳过'], ['failed', '失败']].map(([status, label]) => <span key={status}>{label} <strong>{receipt.filter((item) => item.status === status).length}</strong></span>)}{receipt.filter((item) => item.status === 'failed').map((item, index) => <p className="dd-receipt-failure" key={`${item.id}-${index}`}>{item.subject} · {item.detail}</p>)}</div> : null}
            <details className="dd-help-details"><summary>如何运行与核对结果</summary><p>生成后下载 VBS 文件，在 Windows 经典版 Outlook 中运行。脚本按日程 ID 查重，新增或更新草稿，相同内容跳过。桌面会保存 CSV 回执，可在此导入核对。下载文件不代表草稿已创建，脚本不会发送会邀。</p></details>
          </div>
        </aside>
      </div>
    </section>
  )
}
