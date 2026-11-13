import { useMemo, useRef, useState } from 'react'
import { CheckCircle2, ChevronDown, Copy, FilePlus2, PencilLine, Search, Trash2, X } from 'lucide-react'
import { FREQUENCY_LABELS } from '../../data/meetingData'
import { toast } from '../../components/Feedback'
import { WorkflowBlocker } from '../../components/WorkflowBlocker'
import { splitAttendees } from '../../lib/contacts'
import { buildNoticeSnapshot, getNoticeDeliveryState } from '../../lib/noticeRevision'
import {
  BUILT_IN_NOTICE_TEMPLATES,
  getMergedNoticeTemplates,
  getNoticeTemplateOptions,
  NOTICE_VARIABLE_OPTIONS,
  normalizeNoticeTemplates,
} from './notificationTemplates'
import {
  buildNoticeContextMeeting,
  normalizeNoticeRowSettings,
  resolveNoticeRowSource,
} from './noticeSettings'

function weekdayLabel(dateString) {
  const date = new Date(dateString)
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
}

function formatDisplayDate(dateString) {
  const date = new Date(dateString)
  return `${date.getMonth() + 1}月${date.getDate()}日（${weekdayLabel(dateString)}）`
}

function formatDisplayTime(startTime, endTime) {
  return `${startTime} - ${endTime}`
}

function buildOccurrenceRangeLabel(occurrences) {
  if (!Array.isArray(occurrences) || occurrences.length === 0) return '暂无安排'
  if (occurrences.length === 1) {
    return `${formatDisplayDate(occurrences[0].date)} ${formatDisplayTime(occurrences[0].startTime, occurrences[0].endTime)}`
  }

  const first = occurrences[0]
  const last = occurrences[occurrences.length - 1]
  return `${formatDisplayDate(first.date)} 至 ${formatDisplayDate(last.date)}`
}

function summarizeText(value, fallback = '未填写') {
  if (!value) return fallback
  const normalized = String(value).replace(/\s+/g, ' ').trim()
  return normalized || fallback
}

function buildArrangementList(occurrences) {
  return occurrences
    .map((item) => `- ${formatDisplayDate(item.date)} ${formatDisplayTime(item.startTime, item.endTime)}`)
    .join('\n')
}

function resolveTemplateKey(meeting, scheduledMeeting, templates) {
  if (meeting?.notificationTemplateKey && templates[meeting.notificationTemplateKey]) {
    return meeting.notificationTemplateKey
  }

  const meetingName = meeting?.name ?? scheduledMeeting.name ?? ''
  if (/1-1/i.test(meetingName)) {
    return 'one_on_one_exec'
  }

  if (scheduledMeeting.frequency === 'monthly' || scheduledMeeting.frequency === 'yearly') {
    return 'monthly_general'
  }

  return 'general'
}

function extractExecutiveName(meeting, scheduledMeeting) {
  if (meeting?.notificationConfig?.executiveName) {
    return meeting.notificationConfig.executiveName
  }

  const meetingName = String(meeting?.name || scheduledMeeting.name || '')
  const oneOnOneMatch = meetingName.match(/1\s*-\s*1\s*w\s*(.+)$/i)
  if (oneOnOneMatch?.[1]) {
    return oneOnOneMatch[1].trim()
  }

  const attendees = splitAttendees(meeting?.attendees || scheduledMeeting.attendees || '')
  const nonRobin = attendees.find((item) => !/^robin$/i.test(item))

  return nonRobin ?? attendees[0] ?? meeting?.name ?? scheduledMeeting.name
}

function extractSecretaryName(meeting) {
  return meeting?.notificationConfig?.secretaryName || 'Robin'
}

function buildNoticeContext(template, meeting, scheduledMeeting, occurrences) {
  const primaryOccurrence = occurrences[0] ?? scheduledMeeting
  const latestOccurrence = occurrences[occurrences.length - 1] ?? primaryOccurrence
  const recentHistory =
    Array.isArray(meeting?.history) && meeting.history.length > 0
      ? meeting.history[meeting.history.length - 1]
      : ''
  return {
    '【会议名称】': scheduledMeeting.name,
    '【日期】': formatDisplayDate(primaryOccurrence.date),
    '【时间】': formatDisplayTime(primaryOccurrence.startTime, primaryOccurrence.endTime),
    '【月份】': `${new Date(primaryOccurrence.date).getMonth() + 1}月`,
    '【星期】': weekdayLabel(primaryOccurrence.date),
    '【参会人】': summarizeText(meeting?.attendees || scheduledMeeting.attendees, '相关同事'),
    '【高管名称】': extractExecutiveName(meeting, scheduledMeeting),
    '【秘书名称】': extractSecretaryName(meeting),
    '【安排列表】': buildArrangementList(occurrences),
    '【本阶段安排次数】': String(occurrences.length),
    '【首次安排日期】': formatDisplayDate(primaryOccurrence.date),
    '【最后安排日期】': formatDisplayDate(latestOccurrence.date),
    '【会议类型】': FREQUENCY_LABELS[scheduledMeeting.frequency] ?? '不定期',
    '【最近一次发生日期】': recentHistory || '无',
    '【备注摘要】': summarizeText(meeting?.notes || scheduledMeeting.notes, '无'),
  }
}

function buildNoticeText(template, meeting, scheduledMeeting, occurrences) {
  const content = template?.content ?? BUILT_IN_NOTICE_TEMPLATES.general.content
  const replacements = buildNoticeContext(template, meeting, scheduledMeeting, occurrences)

  return Object.entries(replacements).reduce(
    (current, [token, value]) => current.replaceAll(token, value),
    content,
  )
}

function extractTemplateTokens(content) {
  const matches = String(content || '').match(/【[^】]+】/g) ?? []
  return NOTICE_VARIABLE_OPTIONS.filter((token) => matches.includes(token))
}

const EDITABLE_NOTICE_TOKENS = new Set(['【高管名称】', '【秘书名称】'])

async function copyText(text, label = '通知文案') {
  try {
    await navigator.clipboard.writeText(text)
    toast(`${label}已复制到剪贴板`)
  } catch {
    toast('复制失败，请检查剪贴板权限', 'error')
  }
}

export function ReserveNoticeBoard({
  meetings = [],
  schemeOptions = [],
  noticeTaskOptions = [],
  selectedTaskId = '',
  onTaskChange,
  noticeTemplates = [],
  disabledNoticeTemplateKeys = [],
  onToggleSent,
  onUpdateMeeting,
  onUpdateAdhocNoticeSettings,
  onSaveTemplates,
  onGoToPlanner,
  onBackToReview,
  onContinueToInvite,
}) {
  const [selectedId, setSelectedId] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [searchText, setSearchText] = useState('')
  const [showTemplateManager, setShowTemplateManager] = useState(false)
  const [draftNoticeSettings, setDraftNoticeSettings] = useState(null)
  const [selectedSchemeId, setSelectedSchemeId] = useState('')
  const [previewCandidates, setPreviewCandidates] = useState(false)
  const availableSchemes = useMemo(() => schemeOptions.filter((scheme) => previewCandidates || scheme.confirmed === true), [previewCandidates, schemeOptions])
  const selectedTask =
    noticeTaskOptions.find((task) => task.id === selectedTaskId) ?? noticeTaskOptions[0] ?? null
  const activeSchemeId = availableSchemes.some((scheme) => scheme.id === selectedSchemeId)
    ? selectedSchemeId
    : availableSchemes[0]?.id ?? ''
  const selectedScheme = availableSchemes.find((scheme) => scheme.id === activeSchemeId) ?? null
  const scheduledMeetings = useMemo(
    () => selectedScheme?.scheduledMeetings ?? [],
    [selectedScheme],
  )
  const reserveNoticeStatus = useMemo(
    () => selectedScheme?.reserveNoticeStatus ?? {},
    [selectedScheme],
  )
  const reserveNoticeSettings = useMemo(
    () => selectedScheme?.reserveNoticeSettings ?? {},
    [selectedScheme],
  )
  const meetingMap = useMemo(() => new Map(meetings.map((meeting) => [meeting.id, meeting])), [meetings])
  const mergedTemplates = useMemo(
    () => getMergedNoticeTemplates(noticeTemplates, disabledNoticeTemplateKeys),
    [disabledNoticeTemplateKeys, noticeTemplates],
  )
  const templateOptions = useMemo(
    () => getNoticeTemplateOptions(noticeTemplates, disabledNoticeTemplateKeys),
    [disabledNoticeTemplateKeys, noticeTemplates],
  )

  const rows = useMemo(() => {
    const grouped = new Map()

    scheduledMeetings
      .slice()
      .sort(
        (left, right) =>
          left.date.localeCompare(right.date) || left.startTime.localeCompare(right.startTime),
      )
      .forEach((scheduledMeeting) => {
        const { rowId: groupId, sourceMeeting, settings, isIndependent } = resolveNoticeRowSource(
          scheduledMeeting,
          meetingMap,
          reserveNoticeSettings,
        )

        if (!grouped.has(groupId)) {
          const contextMeeting = buildNoticeContextMeeting(sourceMeeting, scheduledMeeting, settings)
          const templateKey = resolveTemplateKey(contextMeeting, scheduledMeeting, mergedTemplates)
          grouped.set(groupId, {
            id: groupId,
            meeting: sourceMeeting,
            contextMeeting,
            noticeSettings: settings,
            isIndependent,
            scheduledMeeting,
            template: mergedTemplates[templateKey] ?? BUILT_IN_NOTICE_TEMPLATES.general,
            occurrences: [],
          })
        }

        grouped.get(groupId).occurrences.push(scheduledMeeting)
      })

    return Array.from(grouped.values()).map((row) => {
      const text = buildNoticeText(row.template, row.contextMeeting, row.scheduledMeeting, row.occurrences)
      const snapshot = buildNoticeSnapshot({ rowId: row.id, subject: row.scheduledMeeting.name, occurrences: row.occurrences, text, templateKey: row.template.key })
      const delivery = getNoticeDeliveryState(reserveNoticeStatus[row.id], snapshot)
      return { ...row, text, snapshot, delivery, sent: delivery.sent && !delivery.stale, tokens: extractTemplateTokens(row.template.content), context: buildNoticeContext(row.template, row.contextMeeting, row.scheduledMeeting, row.occurrences) }
    })
  }, [meetingMap, mergedTemplates, reserveNoticeSettings, reserveNoticeStatus, scheduledMeetings])

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const search = searchText.trim().toLowerCase()
      if (search) {
        const haystack =
          `${row.scheduledMeeting.name} ${row.scheduledMeeting.attendees || ''} ${row.text}`.toLowerCase()
        if (!haystack.includes(search)) return false
      }

      if (filterType === 'unsent') return !row.sent
      if (filterType === 'stale') return row.delivery.stale
      if (filterType === 'sent') return row.sent
      return true
    })
  }, [filterType, rows, searchText])

  const selectedRow =
    filteredRows.find((row) => row.id === selectedId) ??
    rows.find((row) => row.id === selectedId) ??
    filteredRows[0] ??
    null
  const selectedDraft =
    selectedRow &&
    draftNoticeSettings?.rowId === selectedRow.id &&
    draftNoticeSettings?.schemeId === selectedScheme?.id
      ? draftNoticeSettings
      : null
  const selectedPreviewMeeting = useMemo(
    () =>
      selectedRow
        ? {
            ...selectedRow.contextMeeting,
            notificationTemplateKey: selectedDraft?.templateKey ?? selectedRow.noticeSettings.templateKey,
            notificationConfig: {
              ...(selectedRow.contextMeeting.notificationConfig ?? {}),
              executiveName: selectedDraft?.executiveName ?? selectedRow.noticeSettings.executiveName,
              secretaryName: selectedDraft?.secretaryName ?? selectedRow.noticeSettings.secretaryName,
            },
          }
        : null,
    [selectedDraft, selectedRow],
  )
  const selectedPreviewTemplateKey = selectedRow
    ? resolveTemplateKey(selectedPreviewMeeting, selectedRow.scheduledMeeting, mergedTemplates)
    : ''
  const selectedPreviewTemplate = selectedRow
    ? mergedTemplates[selectedPreviewTemplateKey] ?? BUILT_IN_NOTICE_TEMPLATES.general
    : null
  const selectedPreviewTokens = useMemo(
    () => extractTemplateTokens(selectedPreviewTemplate?.content),
    [selectedPreviewTemplate],
  )
  const selectedPreviewContext = useMemo(
    () =>
      selectedRow
        ? buildNoticeContext(
            selectedPreviewTemplate,
            selectedPreviewMeeting,
            selectedRow.scheduledMeeting,
            selectedRow.occurrences,
          )
        : {},
    [selectedPreviewMeeting, selectedPreviewTemplate, selectedRow],
  )
  const selectedPreviewText = useMemo(
    () =>
      selectedRow
        ? buildNoticeText(
            selectedPreviewTemplate,
            selectedPreviewMeeting,
            selectedRow.scheduledMeeting,
            selectedRow.occurrences,
          )
        : '',
    [selectedPreviewMeeting, selectedPreviewTemplate, selectedRow],
  )

  const sentCount = useMemo(() => rows.filter((row) => row.sent).length, [rows])
  const unsentCount = rows.length - sentCount
  const selectedOccurrenceRange = selectedRow ? buildOccurrenceRangeLabel(selectedRow.occurrences) : '暂无安排'

  function handleTaskChange(taskId) {
    setSelectedId('')
    setSelectedSchemeId('')
    setDraftNoticeSettings(null)
    onTaskChange?.(taskId)
  }

  function handleSchemeChange(schemeId) {
    setSelectedId('')
    setSelectedSchemeId(schemeId)
    setDraftNoticeSettings(null)
  }

  function saveSelectedNoticeSettings(nextSettings) {
    if (!selectedRow) return

    const normalizedSettings = normalizeNoticeRowSettings(nextSettings)
    if (!selectedRow.isIndependent && selectedRow.meeting) {
      onUpdateMeeting?.(selectedRow.meeting.id, {
        notificationTemplateKey: normalizedSettings.templateKey,
        notificationConfig: {
          ...(selectedRow.meeting.notificationConfig ?? {}),
          executiveName: normalizedSettings.executiveName,
          secretaryName: normalizedSettings.secretaryName,
        },
      })
      return
    }

    onUpdateAdhocNoticeSettings?.(selectedRow.id, normalizedSettings, selectedScheme)
  }

  function toggleSent(row) {
    if (!selectedScheme?.confirmed) { toast('候选方案仅供预览，请先确认正式排程', 'warning'); return }
    if (row.id === selectedRow?.id && selectedPreviewText !== row.text) {
      toast('请先保存通知设置，再确认发送，确保发送记录与已保存文案一致', 'warning')
      return
    }
    const sent = !row.sent || row.delivery.status === 'legacy'
    onToggleSent?.(row.id, selectedScheme, row.snapshot, { sent })
  }

  if (noticeTaskOptions.length === 0 || schemeOptions.length === 0) {
    const hasTask = noticeTaskOptions.length > 0
    return (
      <WorkflowBlocker
        title={hasTask ? '当前任务还没有可发送的通知方案' : '先完成排程审核，再发送预留通知'}
        description={hasTask
          ? '当前排程任务尚未形成可用的已采用方案。回到排程完成方案生成与审核后，这里会自动生成通知清单。'
          : '预留通知依赖已采用的排程结果。完成会议资料、排程任务和方案审核后，系统会自动汇总需要通知的会议。'}
        steps={[
          { label: '建立会议库', hint: '准备会议、参会人与时长资料', done: meetings.length > 0 },
          { label: '创建排程任务', hint: '确定本次排程时间范围', done: noticeTaskOptions.length > 0 },
          { label: '审核并采用方案', hint: '确认最终日程后解锁通知', done: schemeOptions.length > 0 },
        ]}
        actionLabel="去排程中心"
        onAction={onGoToPlanner}
      />
    )
  }

  return (
    <section className="dd-dispatch-shell dd-notice-shell">
      <div className="dd-dispatch-toolbar">
        <div className="dd-section-title"><h2>通知清单</h2><span>已确认发送 {sentCount} / {rows.length}<span className="dd-dot-separator">·</span>待发送 {unsentCount}</span></div>
        <div className="dd-toolbar-actions">
          <button type="button" className="dd-text-button" onClick={() => (onBackToReview || onGoToPlanner)?.(selectedTask?.id)}>返回审核</button>
          <details className="dd-context-menu">
            <summary>任务与方案 <ChevronDown size={14} /></summary>
            <div className="dd-menu-content">
              <label className="dd-menu-field"><span>切换任务</span><select value={selectedTask?.id ?? ''} onChange={(event) => handleTaskChange(event.target.value)} disabled={!noticeTaskOptions.length}>{noticeTaskOptions.map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}</select></label>
              <label className="dd-menu-field"><span>排程方案</span><select value={activeSchemeId} onChange={(event) => handleSchemeChange(event.target.value)} disabled={!availableSchemes.length}>{!availableSchemes.length ? <option value="">暂无已确认方案</option> : null}{availableSchemes.map((scheme) => <option key={scheme.id} value={scheme.id}>{scheme.confirmed ? '已确认 · ' : '候选预览 · '}{scheme.label}</option>)}</select></label>
              <label className="dd-menu-checkbox"><input type="checkbox" checked={previewCandidates} onChange={(event) => setPreviewCandidates(event.target.checked)} />显示候选方案，仅供预览</label>
              <div className="dd-menu-divider" /><button type="button" className="dd-text-button" onClick={() => setShowTemplateManager(true)}><PencilLine size={14} />管理通知模板</button>
            </div>
          </details>
          <button type="button" className="dd-primary-button" disabled={!selectedScheme?.confirmed} onClick={() => onContinueToInvite?.(selectedTask?.id)}>继续生成会邀</button>
        </div>
      </div>
      {!selectedScheme?.confirmed ? <div className="dd-dispatch-warning"><span>{selectedScheme ? '候选方案仅供预览，确认排程后可记录正式发送状态。' : '当前任务尚无已确认排程。'}</span><button type="button" onClick={() => (onBackToReview || onGoToPlanner)?.(selectedTask?.id)}>去确认排程</button></div> : null}
      <div className="dd-dispatch-grid">
        <div className="dd-list-pane">
          <div className="dd-list-filters">
            <div className="dd-segmented" role="group" aria-label="通知发送状态筛选">{[['all', '全部'], ['unsent', '待发送'], ['sent', '已发送'], ['stale', '待重发']].map(([value, label]) => <button type="button" key={value} className={filterType === value ? 'is-active' : ''} onClick={() => setFilterType(value)}>{label}{value === 'stale' && rows.some((row) => row.delivery.stale) ? <span className="dd-filter-count">{rows.filter((row) => row.delivery.stale).length}</span> : null}</button>)}</div>
            <label className="dd-inline-search"><Search size={15} /><input type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="搜索会议或通知内容" aria-label="搜索通知" /></label>
          </div>
          <div className="dd-dispatch-list">
            {filteredRows.map((row) => <article key={row.id} className={`dd-dispatch-row dd-notice-row ${row.id === selectedRow?.id ? 'is-active' : ''}`}>
              <button type="button" className="dd-row-main" onClick={() => setSelectedId(row.id)} aria-pressed={row.id === selectedRow?.id}><strong>{row.scheduledMeeting.name}</strong><span>{buildOccurrenceRangeLabel(row.occurrences)}</span><small>{FREQUENCY_LABELS[row.scheduledMeeting.frequency] ?? '不定期'}<span className="dd-dot-separator">·</span>本阶段 {row.occurrences.length} 次</small></button>
              <div className="dd-notice-row-side"><button type="button" className="dd-icon-button" onClick={() => copyText(row.id === selectedRow?.id ? selectedPreviewText || row.text : row.text, `「${row.scheduledMeeting.name}」通知`)} aria-label={`复制 ${row.scheduledMeeting.name} 的通知`} title="复制通知"><Copy size={15} /></button><label className="dd-notice-check"><input type="checkbox" checked={row.sent} disabled={!selectedScheme?.confirmed} onChange={() => toggleSent(row)} aria-label={`${row.scheduledMeeting.name} 的发送确认`} /><span className={row.delivery.stale || row.delivery.status === 'legacy' ? 'dd-status-warning' : row.sent ? 'dd-status-ready' : ''}>{row.delivery.stale ? '待重发' : row.delivery.status === 'legacy' ? '需复核' : row.sent ? '已发送' : '待发送'}</span></label></div>
            </article>)}
            {!filteredRows.length ? <div className="dd-empty-state">当前筛选下暂无通知</div> : null}
          </div>
          <div className="dd-list-footer">显示 {filteredRows.length} / {rows.length} 条通知</div>
        </div>
        <aside className="dd-preview-pane dd-notice-preview" aria-label="正式通知内容预览">
          {selectedRow ? <>
            <div className="dd-preview-heading"><span className="dd-preview-eyebrow">{selectedScheme?.confirmed ? '正式通知预览' : '候选通知预览'}</span><h3>{selectedRow.scheduledMeeting.name}</h3><span className="dd-preview-date">{selectedOccurrenceRange}<span className="dd-dot-separator">·</span>{selectedRow.occurrences.length} 次安排</span><div className="dd-preview-actions"><button type="button" className="dd-primary-button" onClick={() => copyText(selectedPreviewText || selectedRow.text)}><Copy size={15} />复制通知</button><button type="button" className="dd-secondary-button" disabled={!selectedScheme?.confirmed} onClick={() => toggleSent(selectedRow)}><CheckCircle2 size={15} />{selectedRow.delivery.stale ? '确认已重新发送' : selectedRow.delivery.status === 'legacy' ? '复核并确认发送' : selectedRow.sent ? '取消发送标记' : '确认已发送'}</button></div></div>
            {selectedRow.delivery.stale ? <div className="dd-notice-revision"><strong>内容已变化，请重新通知</strong>{selectedRow.delivery.changes.map((change) => <details key={change.field}><summary>{change.label}已更新</summary><div><del>{change.before || '无'}</del><ins>{change.after || '无'}</ins></div></details>)}{selectedRow.delivery.sentAt ? <small>上次确认 {new Date(selectedRow.delivery.sentAt).toLocaleString()}</small> : null}</div> : null}
            {selectedRow.delivery.status === 'legacy' ? <div className="dd-inline-note">旧记录没有保存发送时正文，请复核后确认。</div> : null}
            <div className="dd-notice-paper"><pre>{selectedPreviewText || selectedRow.text}</pre></div>
            <details className="dd-content-details"><summary>本次通知覆盖 {selectedRow.occurrences.length} 个安排 <ChevronDown size={14} /></summary><div className="dd-occurrence-list">{selectedRow.occurrences.map((item) => <div key={item.id}><strong>{formatDisplayDate(item.date)}</strong><span>{formatDisplayTime(item.startTime, item.endTime)}</span></div>)}</div></details>
            <details className="dd-content-details"><summary>通知设置与模板 <ChevronDown size={14} /></summary><div className="dd-template-settings"><ReserveNoticeSettings key={`${selectedScheme?.id ?? 'scheme'}:${selectedRow.id}`} schemeId={selectedScheme?.id ?? ''} rowId={selectedRow.id} settings={selectedRow.noticeSettings} isIndependent={selectedRow.isIndependent} templateOptions={templateOptions} onSave={saveSelectedNoticeSettings} onOpenTemplateManager={() => setShowTemplateManager(true)} onDraftChange={setDraftNoticeSettings} /><ReserveNoticeTemplateSource selectedTemplate={selectedPreviewTemplate} /><ReserveNoticeVariableMapping templateTokens={selectedPreviewTokens} templateContext={selectedPreviewContext} /></div></details>
          </> : <div className="dd-empty-state"><Copy size={28} /><span>选择会议，预览并复制通知</span></div>}
        </aside>
      </div>
      {showTemplateManager ? <TemplateManagerModal templates={noticeTemplates} disabledBuiltInKeys={disabledNoticeTemplateKeys} onClose={() => setShowTemplateManager(false)} onSave={({ templates, disabledBuiltInKeys }) => { onSaveTemplates?.({ templates: normalizeNoticeTemplates(templates), disabledBuiltInKeys }); setShowTemplateManager(false) }} /> : null}
    </section>
  )
}

function ReserveNoticeSettings({
  schemeId,
  rowId,
  settings,
  isIndependent,
  templateOptions,
  onSave,
  onOpenTemplateManager,
  onDraftChange,
}) {
  const normalizedSettings = normalizeNoticeRowSettings(settings)
  const [templateKey, setTemplateKey] = useState(normalizedSettings.templateKey)
  const [executiveName, setExecutiveName] = useState(normalizedSettings.executiveName)
  const [secretaryName, setSecretaryName] = useState(normalizedSettings.secretaryName)

  function syncDraft(patch = {}) {
    onDraftChange?.({
      schemeId,
      rowId,
      templateKey: patch.templateKey ?? templateKey,
      executiveName: patch.executiveName ?? executiveName,
      secretaryName: patch.secretaryName ?? secretaryName,
    })
  }

  function saveNotificationConfig() {
    onSave?.({
      templateKey,
      executiveName: executiveName.trim(),
      secretaryName: secretaryName.trim(),
    })
  }

  return (
    <div className="reserve-notice-settings">
      <div className="reserve-notice-settings-head">
        <div>
          <strong>通知设置</strong>
          {isIndependent ? <span>独立保存，不会修改会议库中的同名会议</span> : null}
        </div>
        <button className="ghost-button" onClick={saveNotificationConfig}>
          {isIndependent ? '保存到本次排程' : '保存设置'}
        </button>
      </div>
      <div className="reserve-notice-settings-grid">
        <label className="field">
          <span>通知模板</span>
          <select
            value={templateKey}
            onChange={(event) => {
              const nextValue = event.target.value
              setTemplateKey(nextValue)
              syncDraft({ templateKey: nextValue })
            }}
          >
            <option value="">自动匹配</option>
            {templateOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="reserve-notice-settings-inline-actions">
          <button type="button" className="ghost-button" onClick={onOpenTemplateManager}>
            <PencilLine size={16} />
            管理模板
          </button>
        </div>
        <label className="field">
          <span>高管名称</span>
          <input
            value={executiveName}
            placeholder="按需填写"
            onChange={(event) => {
              const nextValue = event.target.value
              setExecutiveName(nextValue)
              syncDraft({ executiveName: nextValue })
            }}
          />
        </label>
        <label className="field">
          <span>秘书名称</span>
          <input
            value={secretaryName}
            placeholder="默认 Robin"
            onChange={(event) => {
              const nextValue = event.target.value
              setSecretaryName(nextValue)
              syncDraft({ secretaryName: nextValue })
            }}
          />
        </label>
      </div>
    </div>
  )
}

function ReserveNoticeTemplateSource({ selectedTemplate }) {
  return (
    <div className="reserve-notice-template-card reserve-notice-template-source-card">
      <div className="reserve-notice-template-card-head">
        <strong>模板原文</strong>
        <span>{selectedTemplate?.label ?? '自动匹配模板'}</span>
      </div>
      <pre>{selectedTemplate?.content ?? BUILT_IN_NOTICE_TEMPLATES.general.content}</pre>
    </div>
  )
}

function ReserveNoticeVariableMapping({ templateTokens, templateContext }) {
  const visibleTokens = templateTokens ?? []

  return (
    <div className="reserve-notice-template-card reserve-notice-variable-card">
      <div className="reserve-notice-template-card-head">
        <strong>变量映射</strong>
        <span>仅显示已用变量</span>
      </div>
      <div className="reserve-notice-template-variable-grid">
        {visibleTokens.length > 0 ? (
          visibleTokens.map((token) => (
            <div
              key={token}
              className={
                EDITABLE_NOTICE_TOKENS.has(token)
                  ? 'reserve-notice-template-variable-row reserve-notice-template-variable-row-editable'
                  : 'reserve-notice-template-variable-row'
              }
            >
              <strong>{token}</strong>
              <span>{templateContext?.[token] ?? '无'}</span>
            </div>
          ))
        ) : (
          <div className="empty-state">未使用变量</div>
        )}
      </div>
    </div>
  )
}

function getInitialTemplateDrafts(templates, disabledBuiltInKeys = []) {
  const customTemplates = normalizeNoticeTemplates(templates)
  const customByKey = new Map(customTemplates.map((template) => [template.key, template]))
  const hiddenBuiltIns = new Set(Array.isArray(disabledBuiltInKeys) ? disabledBuiltInKeys : [])
  const builtInDrafts = Object.values(BUILT_IN_NOTICE_TEMPLATES)
    .filter((template) => !hiddenBuiltIns.has(template.key))
    .map((template) => ({
      ...template,
      ...(customByKey.get(template.key) ?? {}),
      isBuiltIn: false,
    }))
  const customOnlyDrafts = customTemplates.filter((template) => !BUILT_IN_NOTICE_TEMPLATES[template.key])

  return [...builtInDrafts, ...customOnlyDrafts]
}

function TemplateManagerModal({ templates, disabledBuiltInKeys = [], onClose, onSave }) {
  const initialDrafts = useMemo(
    () => getInitialTemplateDrafts(templates, disabledBuiltInKeys),
    [disabledBuiltInKeys, templates],
  )
  const [drafts, setDrafts] = useState(() => initialDrafts)
  const [deletedBuiltInKeys, setDeletedBuiltInKeys] = useState(() =>
    Array.from(new Set(Array.isArray(disabledBuiltInKeys) ? disabledBuiltInKeys : [])),
  )
  const [selectedKey, setSelectedKey] = useState(() => initialDrafts[0]?.key ?? '')
  const templateContentRef = useRef(null)

  const selectedTemplate = drafts.find((item) => item.key === selectedKey) ?? drafts[0] ?? null

  function addTemplate() {
    const template = {
      key: `custom-${crypto.randomUUID()}`,
      label: '新模板',
      content: BUILT_IN_NOTICE_TEMPLATES.general.content,
      isBuiltIn: false,
    }
    setDrafts((current) => [...current, template])
    setSelectedKey(template.key)
  }

  function duplicateTemplate(sourceTemplate) {
    if (!sourceTemplate) return

    const nextTemplate = {
      key: `custom-${crypto.randomUUID()}`,
      label: `${sourceTemplate.label}（副本）`,
      content: sourceTemplate.content,
      isBuiltIn: false,
    }
    setDrafts((current) => [...current, nextTemplate])
    setSelectedKey(nextTemplate.key)
  }

  function updateTemplate(key, patch) {
    setDrafts((current) =>
      current.map((template) => (template.key === key ? { ...template, ...patch } : template)),
    )
  }

  function insertVariableToken(token) {
    if (!selectedTemplate) return

    const textarea = templateContentRef.current
    const currentContent = selectedTemplate.content ?? ''
    const selectionStart = typeof textarea?.selectionStart === 'number' ? textarea.selectionStart : currentContent.length
    const selectionEnd = typeof textarea?.selectionEnd === 'number' ? textarea.selectionEnd : currentContent.length
    const nextContent = `${currentContent.slice(0, selectionStart)}${token}${currentContent.slice(selectionEnd)}`
    const nextCursor = selectionStart + token.length

    updateTemplate(selectedTemplate.key, { content: nextContent })
    window.requestAnimationFrame(() => {
      templateContentRef.current?.focus()
      templateContentRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  function deleteTemplate(key) {
    if (BUILT_IN_NOTICE_TEMPLATES[key]) {
      setDeletedBuiltInKeys((current) => Array.from(new Set([...current, key])))
    }
    setDrafts((current) => current.filter((template) => template.key !== key))
    if (selectedKey === key) {
      const fallback = drafts.find((template) => template.key !== key)
      setSelectedKey(fallback?.key ?? '')
    }
  }

  return (
    <div className="modal-backdrop modal-open" onClick={onClose}>
      <div className="modal-card modal-card-open modal-wide reserve-template-modal" onClick={(event) => event.stopPropagation()}>
        <div className="reserve-template-modal-head">
          <div>
            <h3>管理通知模板</h3>
            <p>所有模板均可直接编辑、复制和删除。删除默认模板后，可新增模板重新配置通知文案。</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭模板管理">
            <X size={18} />
          </button>
        </div>

        <div className="reserve-template-modal-layout">
          <div className="reserve-template-library">
            <div className="reserve-template-section-head">
              <strong>模板库</strong>
              <button type="button" className="ghost-button" onClick={addTemplate}>
                <FilePlus2 size={16} />
                新增模板
              </button>
            </div>

            <div className="reserve-template-list">
              {drafts.length > 0 ? (
                drafts.map((template) => (
                  <button
                    key={template.key}
                    type="button"
                    className={
                      template.key === selectedTemplate?.key
                        ? 'reserve-template-list-item reserve-template-list-item-active'
                        : 'reserve-template-list-item'
                    }
                    onClick={() => setSelectedKey(template.key)}
                  >
                    <div>
                      <strong>{template.label}</strong>
                      <span>{BUILT_IN_NOTICE_TEMPLATES[template.key] ? '默认模板，可编辑' : '模板'}</span>
                    </div>
                    <div className="reserve-template-inline-actions">
                      <button
                        type="button"
                        className="icon-button"
                        onClick={(event) => {
                          event.stopPropagation()
                          duplicateTemplate(template)
                        }}
                        aria-label={`复制模板 ${template.label}`}
                      >
                        <FilePlus2 size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-button danger-button-ghost"
                        onClick={(event) => {
                          event.stopPropagation()
                          deleteTemplate(template.key)
                        }}
                        aria-label={`删除模板 ${template.label}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </button>
                ))
              ) : (
                <div className="empty-state">暂无模板</div>
              )}
            </div>
          </div>

          <div className="reserve-template-editor">
            {selectedTemplate ? (
              <>
                <label className="field">
                  <span>模板名称</span>
                  <input
                    value={selectedTemplate.label}
                    onChange={(event) => updateTemplate(selectedTemplate.key, { label: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>模板内容</span>
                  <textarea
                    ref={templateContentRef}
                    rows="10"
                    value={selectedTemplate.content}
                    onChange={(event) => updateTemplate(selectedTemplate.key, { content: event.target.value })}
                  />
                </label>

                <div className="reserve-template-variables">
                  <strong>可用变量</strong>
                  <div className="reserve-template-variable-list">
                    {NOTICE_VARIABLE_OPTIONS.map((token) => (
                      <button
                        key={token}
                        type="button"
                        className="reserve-template-variable"
                        onClick={() => insertVariableToken(token)}
                      >
                        {token}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state">请选择一个模板进行编辑。</div>
            )}
          </div>
        </div>

        <div className="reserve-template-modal-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => onSave({ templates: drafts, disabledBuiltInKeys: deletedBuiltInKeys })}
          >
            保存模板库
          </button>
        </div>
      </div>
    </div>
  )
}
