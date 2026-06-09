import {
  AlertTriangle,
  CheckSquare2,
  CalendarCheck,
  CalendarClock,
  Database,
  FileText,
  Mail,
  Megaphone,
  Plus,
  Radar,
  Sparkles,
  Users,
} from 'lucide-react'
import homeLogoSrc from '../../../public/home-eo-logo-cutout.png'

function isMeetingIncomplete(meeting) {
  const hasAttendees = String(meeting.attendees || '').trim() || meeting.attendeeRefs?.length > 0
  return !String(meeting.name || '').trim() || !Number(meeting.duration) || !hasAttendees
}

function hasMissingMeetingEmail(meeting) {
  const refs = [...(meeting.attendeeRefs ?? []), ...(meeting.extraInviteeRefs ?? [])]
  return refs.some((ref) => ref.status !== 'linked' || !ref.emailSnapshot)
}

function formatLogTime(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return '刚刚'

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function HomeMetric({ icon, label, value, hint, tone = 'default' }) {
  const MetricIcon = icon

  return (
    <div className={`home-metric home-metric-${tone}`}>
      <MetricIcon size={18} />
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{hint}</em>
    </div>
  )
}

function HomeListItem({ label, value, tone = 'default', actionLabel, onClick }) {
  return (
    <div className={`home-list-item home-list-item-${tone}`}>
      <div>
        <strong>{label}</strong>
        <span>{value}</span>
      </div>
      {onClick ? (
        <button className="ghost-button home-inline-action" onClick={onClick} type="button">
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

export function HomeView({
  meetings = [],
  contacts = [],
  planningTasks = [],
  scheduledTaskOptions = [],
  reviewConflicts = [],
  logs = [],
  onCreateMeeting,
  onGoToMeetings,
  onGoToPlanner,
  onGoToReserveNotice,
  onGoToOutlookInvite,
  onGoToContacts,
}) {
  const incompleteMeetings = meetings.filter(isMeetingIncomplete)
  const missingEmailMeetings = meetings.filter(hasMissingMeetingEmail)
  const contactsMissingEmail = contacts.filter((contact) => contact.status !== 'archived' && !contact.email)
  const scheduledTasks = planningTasks.filter((task) => task.reviewState?.scheduledMeetings?.length > 0 || task.status === 'scheduled')
  const pendingPlanningTasks = planningTasks.filter((task) => !task.reviewState?.scheduledMeetings?.length && task.status !== 'scheduled')
  const scheduledMeetingCount = scheduledTasks.reduce(
    (total, task) => total + Number(task.reviewState?.scheduledMeetings?.length ?? task.scheduledCount ?? 0),
    0,
  )
  const recentLogs = logs.slice(0, 4)
  const riskCount = reviewConflicts.length + incompleteMeetings.length + missingEmailMeetings.length + contactsMissingEmail.length
  const healthLabel = riskCount > 0 ? '需要关注' : meetings.length > 0 ? '运行正常' : '待初始化'
  const healthDetail = riskCount > 0 ? `${riskCount} 个事项待处理` : meetings.length > 0 ? '会议资产状态稳定' : '请先导入或新建会议'
  const todayLabel = new Date().toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })

  const todoItems = [
    meetings.length === 0
      ? {
          label: '建立会议库',
          value: '当前还没有会议资料',
          actionLabel: '新建',
          onClick: onCreateMeeting,
          tone: 'attention',
        }
      : null,
    incompleteMeetings.length > 0
      ? {
          label: '补齐会议资料',
          value: `${incompleteMeetings.length} 个会议缺少名称、时长或参会人`,
          actionLabel: '处理',
          onClick: onGoToMeetings,
          tone: 'warning',
        }
      : null,
    planningTasks.length === 0
      ? {
          label: '创建排程任务',
          value: '还没有排程任务',
          actionLabel: '排程',
          onClick: onGoToPlanner,
          tone: 'attention',
        }
      : null,
    pendingPlanningTasks.length > 0
      ? {
          label: '推进排程',
          value: `${pendingPlanningTasks.length} 个任务还未形成可用排程`,
          actionLabel: '查看',
          onClick: onGoToPlanner,
          tone: 'default',
        }
      : null,
    scheduledTaskOptions.length > 0
      ? {
          label: '发送预留通知',
          value: `${scheduledTaskOptions.length} 个已排程任务可进入通知环节`,
          actionLabel: '通知',
          onClick: onGoToReserveNotice,
          tone: 'ok',
        }
      : null,
  ].filter(Boolean)

  const riskItems = [
    reviewConflicts.length > 0
      ? {
          label: '排程冲突',
          value: `${reviewConflicts.length} 个冲突需要处理`,
          actionLabel: '审核',
          onClick: onGoToPlanner,
          tone: 'danger',
        }
      : null,
    missingEmailMeetings.length > 0
      ? {
          label: '参会人邮箱缺失',
          value: `${missingEmailMeetings.length} 个会议存在未关联或缺邮箱人员`,
          actionLabel: '会议库',
          onClick: onGoToMeetings,
          tone: 'warning',
        }
      : null,
    contactsMissingEmail.length > 0
      ? {
          label: '通讯录邮箱缺失',
          value: `${contactsMissingEmail.length} 位联系人未填写邮箱`,
          actionLabel: '通讯录',
          onClick: onGoToContacts,
          tone: 'warning',
        }
      : null,
    incompleteMeetings.length > 0
      ? {
          label: '会议资料不完整',
          value: `${incompleteMeetings.length} 个会议待补齐基础字段`,
          actionLabel: '补齐',
          onClick: onGoToMeetings,
          tone: 'attention',
        }
      : null,
  ].filter(Boolean)

  return (
    <section className="home-workspace" aria-label="会议运营首页">
      <section className="home-command-center" aria-label="首页总览">
        <div className="home-command-main">
          <div className="home-command-date">总裁办 · {todayLabel}</div>
          <h2>总裁办会议管理系统</h2>
          <p>统一汇总总裁办会议资产、排程进度、通知预留与会邀生成，帮助会议运营按日推进、风险可见、记录可追踪。</p>
          <div className="home-command-actions">
            <button className="primary-button" onClick={onCreateMeeting} type="button">
              <Plus size={16} />
              新建会议
            </button>
            <button className="ghost-button" onClick={onGoToPlanner} type="button">
              <Sparkles size={16} />
              生成排程
            </button>
            <button className="home-command-action-muted" onClick={onGoToReserveNotice} type="button">
              <Megaphone size={15} />
              预留通知
            </button>
            <button className="home-command-action-muted" onClick={onGoToOutlookInvite} type="button">
              <Mail size={15} />
              会邀生成
            </button>
            <button className="home-command-action-muted" onClick={onGoToContacts} type="button">
              <Users size={15} />
              通讯录
            </button>
          </div>
          <div className="home-office-logo" aria-label="总办 EO 标识">
            <img src={homeLogoSrc} alt="" aria-hidden="true" />
          </div>
        </div>

        <aside className="home-command-status" aria-label="首页状态">
          <div className="home-command-status-head">
            <strong>运营总览</strong>
            <em>V3.5</em>
          </div>
          <div className="home-status-summary" aria-label="运营总览摘要">
            <div className="home-status-summary-meetings">
              <span>会议条目</span>
              <strong>{meetings.length}</strong>
            </div>
            <div className="home-status-summary-todo">
              <span>待处理事项</span>
              <strong>{todoItems.length}</strong>
            </div>
            <div className="home-status-summary-risk">
              <span>风险提醒</span>
              <strong>{riskCount}</strong>
            </div>
          </div>
        </aside>
      </section>

      <section className="home-signal-strip" aria-label="运营总览">
        <HomeMetric icon={Database} label="会议库" value={meetings.length} hint="有效会议" tone="blue" />
        <HomeMetric icon={CalendarClock} label="排程任务" value={planningTasks.length} hint={`${pendingPlanningTasks.length} 个待推进`} tone="amber" />
        <HomeMetric icon={CalendarCheck} label="已排程" value={scheduledMeetingCount} hint={`${scheduledTasks.length} 个任务`} tone="green" />
        <HomeMetric icon={AlertTriangle} label="风险提醒" value={riskCount} hint={`${reviewConflicts.length} 个冲突`} tone={riskCount > 0 ? 'red' : 'gray'} />
      </section>

      <div className="home-main-grid">
        <section className="home-section home-section-focus">
          <div className="home-section-head">
            <span className="home-section-title">
              <CheckSquare2 size={15} />
              待办事项
            </span>
            <strong>{todoItems.length || '清爽'}</strong>
          </div>
          <div className="home-list">
            {todoItems.length > 0 ? (
              todoItems.map((item) => <HomeListItem key={item.label} {...item} />)
            ) : (
              <div className="home-empty-line">暂无待办事项。</div>
            )}
          </div>
        </section>

        <section className="home-section home-section-risk">
          <div className="home-section-head">
            <span className="home-section-title">
              <Radar size={15} />
              风险提醒
            </span>
            <strong>{riskItems.length || '正常'}</strong>
          </div>
          <div className="home-list">
            {riskItems.length > 0 ? (
              riskItems.map((item) => <HomeListItem key={item.label} {...item} />)
            ) : (
              <div className="home-empty-line">当前没有明显风险。</div>
            )}
          </div>
        </section>

        <section className="home-section home-section-log">
          <div className="home-section-head">
            <span className="home-section-title">
              <FileText size={15} />
              最近操作
            </span>
            <button className="ghost-button home-inline-action" onClick={onGoToMeetings} type="button">
              记录
            </button>
          </div>
          <div className="home-log-list">
            {recentLogs.length > 0 ? (
              recentLogs.map((log) => (
                <div className="home-log-item" key={log.id}>
                  <FileText size={15} />
                  <strong>{log.targetName || log.target || '系统操作'}</strong>
                  <span>{log.detail || log.actionType || '已记录'}</span>
                  <em>{formatLogTime(log.timestamp ?? log.createdAt)}</em>
                </div>
              ))
            ) : (
              <div className="home-empty-line">暂无操作记录。</div>
            )}
          </div>
        </section>
      </div>

    </section>
  )
}
