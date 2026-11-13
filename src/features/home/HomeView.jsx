import { useState } from 'react'
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, ChevronRight, Clock3, Mail, Plus, Search, Users } from 'lucide-react'
import { isValidEmail } from '../../lib/email'
import { detectConflicts } from '../../lib/conflicts'

function incomplete(meeting) {
  return !meeting.name?.trim() || !Number(meeting.duration) || (!meeting.attendees?.trim() && !meeting.attendeeRefs?.length)
}

function missingEmail(meeting) {
  const refs = [...(meeting.attendeeRefs || []), ...(meeting.extraInviteeRefs || [])]
  return refs.some(ref => !isValidEmail(ref.emailSnapshot))
}

function shortDate(value, rangeStart) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value || '尚未排程'
  return `${rangeStart && value.slice(0, 4) !== rangeStart.slice(0, 4) ? `${value.slice(0, 4)}年` : ''}${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日`
}

export function HomeView({ meetings = [], contacts = [], planningTasks = [], logs = [], currentTask,
  onCreateMeeting, onGoToPlanner, onGoToMeetings, onGoToLogs, onIssueSelect, onNavigateToWorkflow }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const current = currentTask || planningTasks.find(task => task.status !== 'scheduled') || planningTasks[0]
  const schedule = current?.reviewState?.scheduledMeetings || []
  const conflicts = detectConflicts(schedule.filter(meeting => typeof meeting.startTime === 'string' && typeof meeting.endTime === 'string'))
  const conflictIds = new Set(conflicts.flatMap(conflict => conflict.meetingIds))
  const confirmed = current?.status === 'scheduled'
  const checkStatus = current?.reviewState?.finalCheckStatus || {}
  const reviewed = schedule.filter(meeting => confirmed || checkStatus[meeting.meetingId || meeting.id]).length
  const reserved = schedule.filter(meeting => meeting.reserved).length
  const issues = [
    { id: 'conflicts', label: '检查时间冲突', count: conflicts.length, icon: CalendarDays },
    { id: 'email', label: '补齐参会人邮箱', count: meetings.filter(missingEmail).length, icon: Mail },
    { id: 'incomplete', label: '补齐会议资料', count: meetings.filter(incomplete).length, icon: AlertTriangle },
    { id: 'contacts', label: '维护通讯录邮箱', count: contacts.filter(person => person.status !== 'archived' && !isValidEmail(person.email)).length, icon: Users },
  ].filter(issue => issue.count > 0)
  const nextStep = !current || !schedule.length ? 'prepare' : !confirmed ? 'review' : reserved < schedule.length ? 'reserveNotice' : 'outlookInvite'
  const nextLabels = { prepare: current ? '继续准备清单' : '创建排程任务', review: '继续审核', reserveNotice: '继续预留通知', outlookInvite: '生成会邀草稿' }
  const nextHeadings = { prepare: '准备本期会议清单', review: '完成排程审核', reserveNotice: '发送预留通知', outlookInvite: '生成会邀草稿' }
  const otherTasks = planningTasks.filter(task => task.id !== current?.id).slice(0, 3)
  const continueWork = () => current ? onNavigateToWorkflow?.(current.id, nextStep) : onGoToPlanner?.()
  const sourceRows = schedule.length ? schedule : meetings
  const rows = sourceRows.map(meeting => {
    const checked = confirmed || Boolean(checkStatus[meeting.meetingId || meeting.id])
    const badEmail = missingEmail(meetings.find(item => item.id === meeting.meetingId) || meeting)
    const status = conflictIds.has(meeting.id) ? ['warn', '时间冲突'] : !schedule.length ? ['neutral', '待排程'] : checked ? ['ok', '已核对'] : ['pending', '待审核']
    return { ...meeting, checked, emailWarning: badEmail, displayStatus: status }
  }).filter(meeting => (filter === 'all' || (filter === 'checked' ? meeting.checked : !meeting.checked)) && `${meeting.name} ${meeting.attendees || ''}`.toLowerCase().includes(search.toLowerCase()))

  return (
    <section className="eo-home" aria-label="会议运营工作台">
      <header className="eo-home-heading">
        <div className="eo-breadcrumb">工作台 / 当前任务</div>
        <div className="eo-home-title-line">
          <div>
            <div className="eo-heading-title-row"><h1>{current?.name || '开始本月会议安排'}</h1>{current && <span className="eo-state-pill"><span />{confirmed ? '已确认' : schedule.length ? '待审核' : '准备中'}</span>}</div>
            <p>{current?.timeRange ? `${current.timeRange.start.replaceAll('-', '.')} — ${current.timeRange.end.replaceAll('-', '.')}` : '从会议资料开始，逐步完成排程、通知与会邀。'}</p>
          </div>
          <div className="eo-home-primary-actions"><button className="nx-btn nx-btn-primary" onClick={continueWork}>{nextLabels[nextStep]}<ArrowRight size={17} /></button><button className="eo-text-action" onClick={onGoToPlanner}>查看全部任务</button></div>
        </div>
        {current && <div className="eo-home-progress">
          <p><strong>{schedule.length || current.generatedCount || 0}</strong> 场会议<span>·</span>已核对 <strong>{reviewed}</strong> 场<span>·</span>待审核 <strong>{Math.max(0, schedule.length - reviewed)}</strong> 场</p>
          <div className="eo-progress-track" role="progressbar" aria-label="会议核对进度" aria-valuemin={0} aria-valuemax={schedule.length || 1} aria-valuenow={reviewed}><span style={{ width: `${schedule.length ? reviewed / schedule.length * 100 : 0}%` }} /></div>
        </div>}
      </header>

      <div className="eo-home-grid">
        <section className="eo-home-meetings">
          <div className="eo-home-section-head"><h2>{schedule.length ? '本期会议' : '会议资料'}</h2>
            <div className="eo-home-filters" aria-label="会议核对范围">{[['all', '全部'], ['pending', '待审核'], ['checked', '已核对']].map(([key, label]) => <button className={filter === key ? 'is-active' : ''} key={key} onClick={() => setFilter(key)} aria-pressed={filter === key}>{label}</button>)}</div>
            <button className="eo-icon-action" onClick={() => setSearchOpen(value => !value)} aria-label="筛选本期会议"><Search size={19} /></button>
          </div>
          {searchOpen && <input className="nx-input eo-home-search" autoFocus placeholder="搜索会议、参会人" aria-label="筛选本期会议" value={search} onChange={event => setSearch(event.target.value)} />}
          {sourceRows.length ? <>
            <table className="eo-home-table"><thead><tr><th>会议</th><th>排程时间</th><th>参会人</th><th>状态</th><th><span className="sr-only">操作</span></th></tr></thead>
              <tbody>{rows.slice(0, 6).map(meeting => <tr key={meeting.id}>
                <td><button onClick={() => schedule.length ? onNavigateToWorkflow?.(current.id, 'review') : onGoToMeetings?.()}>{meeting.name}</button></td>
                <td><CalendarDays size={14} /><span>{shortDate(meeting.date || meeting.nextDate, current?.timeRange?.start)}{meeting.startTime ? ` ${meeting.startTime}–${meeting.endTime}` : ''}</span></td>
                <td><Users size={14} /><span title={meeting.attendees}>{meeting.attendees || '待补充'}</span></td>
                <td><span className={`eo-row-status eo-row-status-${meeting.displayStatus[0]}`}><i />{meeting.displayStatus[1]}</span>{meeting.emailWarning && <span className="eo-row-email-warning" title="参会人邮箱待补充" aria-label="参会人邮箱待补充"><Mail size={12} /></span>}</td>
                <td><button className="eo-icon-action" aria-label={`打开 ${meeting.name}`} onClick={() => schedule.length ? onNavigateToWorkflow?.(current.id, 'review') : onGoToMeetings?.()}><ChevronRight size={16} /></button></td>
              </tr>)}</tbody>
            </table>
            <div className="eo-home-table-footer"><span>显示 {Math.min(rows.length, 6)} / {sourceRows.length} 场</span>{rows.length > 6 && <button className="eo-text-action" onClick={() => schedule.length ? onNavigateToWorkflow?.(current.id, 'review') : onGoToMeetings?.()}>查看全部会议<ArrowRight size={14} /></button>}</div>
            {rows.length === 0 && <div className="eo-home-empty-inline">没有符合当前筛选的会议。</div>}
          </> : <div className="eo-home-first-use"><CalendarDays size={30} strokeWidth={1.4} /><h3>先把会议资料整理好</h3><p>录入会议、频率和参会人，下一次排程就能直接复用。</p><button className="nx-btn nx-btn-outline" onClick={onCreateMeeting}><Plus size={15} />录入第一场会议</button></div>}
        </section>

        <aside className="eo-home-side">
          <section className="eo-next-panel"><span>下一步</span><h2>{nextHeadings[nextStep]}</h2><p>{issues.length ? '先处理待核实事项，再继续当前任务。' : current ? '资料已就绪，继续推进当前任务。' : '建好会议资料后，创建本期排程任务。'}</p>
            {issues.map(issue => <button className="eo-next-issue" key={issue.id} onClick={() => onIssueSelect?.(issue.id, current?.id)}><issue.icon size={18} /><span>{issue.label}</span><em>{issue.count}</em><ChevronRight size={15} /></button>)}
            {issues.length === 0 && <div className="eo-ready-note"><CheckCircle2 size={17} /><span>没有待处理的资料问题</span></div>}
          </section>
          {logs.length > 0 && <section className="eo-home-activity"><div className="eo-home-section-head"><h3>最近操作</h3><button className="eo-text-action" onClick={onGoToLogs}>全部</button></div>{logs.slice(0, 3).map(log => <div className="eo-activity-row" key={log.id}><span className="eo-activity-dot" /><div><p>{log.detail || log.targetName || log.actionType}</p><time>{new Date(log.timestamp || log.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></div></div>)}</section>}
          {otherTasks.length > 0 && <section className="eo-home-other"><h3>其他任务</h3>{otherTasks.map(task => <button key={task.id} onClick={() => onNavigateToWorkflow?.(task.id, task.reviewState?.scheduledMeetings?.length ? 'review' : 'prepare')}><Clock3 size={15} /><span>{task.name}</span><ChevronRight size={14} /></button>)}</section>}
        </aside>
      </div>
    </section>
  )
}
