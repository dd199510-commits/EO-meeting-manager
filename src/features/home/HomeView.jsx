import {
  AlertTriangle,
  ArrowRight,
  CheckSquare2,
  CheckCircle2,
  CalendarCheck,
  CalendarClock,
  Circle,
  Database,
  FileText,
  Mail,
  Megaphone,
  Plus,
  Radar,
  Sparkles,
  Users,
} from 'lucide-react'
import { APP_VERSION_LABEL } from '../../lib/appVersion'

const homeLogoSrc = `${import.meta.env.BASE_URL}home-eo-logo-cutout.png`

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
    <div className={`nx-card nx-card-hover hv-metric hv-metric-${tone}`}>
      <MetricIcon aria-hidden="true" />
      <div className="hv-metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <em>{hint}</em>
      </div>
    </div>
  )
}

function HomeListItem({ label, value, tone = 'default', actionLabel, onClick }) {
  return (
    <div className="nx-row">
      <span className={`nx-dot nx-dot-${tone}`} aria-hidden="true" />
      <div className="nx-row-main">
        <strong>{label}</strong>
        <span>{value}</span>
      </div>
      {onClick ? (
        <button className="nx-btn nx-btn-quiet" onClick={onClick} type="button">
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

function WorkflowStep({ label, hint, state, onClick }) {
  const stateLabel = state === 'done' ? '已完成' : state === 'current' ? '进行中' : '待开始'

  return (
    <button
      className={`hv-flow-step hv-flow-step-${state}`}
      type="button"
      onClick={onClick}
      disabled={!onClick || state === 'locked'}
      aria-label={`${label}，${stateLabel}`}
    >
      <span className="hv-flow-step-icon" aria-hidden="true">
        {state === 'done' ? <CheckCircle2 /> : <Circle />}
      </span>
      <span className="hv-flow-step-copy">
        <strong>{label}</strong>
        <em>{hint}</em>
      </span>
    </button>
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
  onGoToLogs,
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
  const reservedMeetingCount = scheduledTasks.reduce(
    (total, task) => total + (task.reviewState?.scheduledMeetings ?? []).filter((meeting) => meeting.reserved).length,
    0,
  )
  const recentLogs = logs.slice(0, 4)
  const riskCount = reviewConflicts.length + incompleteMeetings.length + missingEmailMeetings.length + contactsMissingEmail.length
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
          tone: 'info',
        }
      : null,
    incompleteMeetings.length > 0
      ? {
          label: '补齐会议资料',
          value: `${incompleteMeetings.length} 个会议缺少名称、时长或参会人`,
          actionLabel: '处理',
          onClick: onGoToMeetings,
          tone: 'warn',
        }
      : null,
    planningTasks.length === 0
      ? {
          label: '创建排程任务',
          value: '还没有排程任务',
          actionLabel: '排程',
          onClick: onGoToPlanner,
          tone: 'info',
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
          tone: 'warn',
        }
      : null,
    contactsMissingEmail.length > 0
      ? {
          label: '通讯录邮箱缺失',
          value: `${contactsMissingEmail.length} 位联系人未填写邮箱`,
          actionLabel: '通讯录',
          onClick: onGoToContacts,
          tone: 'warn',
        }
      : null,
    incompleteMeetings.length > 0
      ? {
          label: '会议资料不完整',
          value: `${incompleteMeetings.length} 个会议待补齐基础字段`,
          actionLabel: '补齐',
          onClick: onGoToMeetings,
          tone: 'info',
        }
      : null,
  ].filter(Boolean)

  const workflowSteps = [
    {
      label: '建立会议库',
      hint: meetings.length > 0 ? `${meetings.length} 条会议资料` : '录入会议与参会人',
      state: meetings.length > 0 ? 'done' : 'current',
      onClick: onGoToMeetings,
    },
    {
      label: '创建排程任务',
      hint: planningTasks.length > 0 ? `${planningTasks.length} 个任务` : '确定排程时间范围',
      state: planningTasks.length > 0 ? 'done' : meetings.length > 0 ? 'current' : 'locked',
      onClick: meetings.length > 0 ? onGoToPlanner : null,
    },
    {
      label: '审核采用方案',
      hint: scheduledTasks.length > 0 ? `${scheduledTasks.length} 个已采用` : '生成并确认候选方案',
      state: scheduledTasks.length > 0 ? 'done' : planningTasks.length > 0 ? 'current' : 'locked',
      onClick: planningTasks.length > 0 ? onGoToPlanner : null,
    },
    {
      label: '发送预留通知',
      hint: reservedMeetingCount > 0 ? `${reservedMeetingCount} 场已预留` : '通知相关人员预留时间',
      state: reservedMeetingCount > 0 ? 'done' : scheduledTasks.length > 0 ? 'current' : 'locked',
      onClick: scheduledTasks.length > 0 ? onGoToReserveNotice : null,
    },
    {
      label: '生成正式会邀',
      hint: scheduledMeetingCount > 0 ? `${scheduledMeetingCount} 场可检查` : '生成 Outlook 草稿',
      state: reservedMeetingCount > 0 ? 'current' : 'locked',
      onClick: scheduledTasks.length > 0 ? onGoToOutlookInvite : null,
    },
  ]
  const currentWorkflowStep = workflowSteps.find((step) => step.state === 'current') ?? workflowSteps.at(-1)

  return (
    <section className="hv-workspace" aria-label="会议运营首页">
      <section className="hv-hero" aria-label="首页总览">
        <div className="hv-hero-main">
          <span className="hv-hero-eyebrow">总裁办 · {todayLabel}</span>
          <h2>总裁办会议管理系统</h2>
          <p className="hv-hero-desc">
            统一汇总会议资产、排程进度、通知预留与会邀生成，按日推进、风险可见、记录可追踪。
          </p>
          <div className="hv-hero-actions">
            <button className="nx-btn nx-btn-primary" onClick={onCreateMeeting} type="button">
              <Plus />
              新建会议
            </button>
            <button className="nx-btn nx-btn-outline" onClick={onGoToPlanner} type="button">
              <Sparkles />
              生成排程
            </button>
            <button className="nx-btn nx-btn-quiet" onClick={onGoToReserveNotice} type="button">
              <Megaphone />
              预留通知
            </button>
            <button className="nx-btn nx-btn-quiet" onClick={onGoToOutlookInvite} type="button">
              <Mail />
              会邀生成
            </button>
            <button className="nx-btn nx-btn-quiet" onClick={onGoToContacts} type="button">
              <Users />
              通讯录
            </button>
          </div>
        </div>

        <div className="hv-hero-logo" aria-hidden="true">
          <img src={homeLogoSrc} alt="" />
        </div>

        <aside className="hv-status" aria-label="运营总览">
          <div className="hv-status-head">
            <strong>运营总览</strong>
            <em>{APP_VERSION_LABEL}</em>
          </div>
          <div className="hv-status-grid">
            <div className="hv-status-cell hv-status-cell-accent">
              <span>会议条目</span>
              <strong>{meetings.length}</strong>
            </div>
            <div className="hv-status-cell hv-status-cell-warn">
              <span>待处理事项</span>
              <strong>{todoItems.length}</strong>
            </div>
            <div className={riskCount > 0 ? 'hv-status-cell hv-status-cell-danger' : 'hv-status-cell'}>
              <span>风险提醒</span>
              <strong>{riskCount}</strong>
            </div>
          </div>
        </aside>
      </section>

      <section className="hv-metrics" aria-label="运营指标">
        <HomeMetric icon={Database} label="会议库" value={meetings.length} hint="有效会议" tone="accent" />
        <HomeMetric icon={CalendarClock} label="排程任务" value={planningTasks.length} hint={`${pendingPlanningTasks.length} 个待推进`} />
        <HomeMetric icon={CalendarCheck} label="已排程" value={scheduledMeetingCount} hint={`${scheduledTasks.length} 个任务`} />
        <HomeMetric
          icon={AlertTriangle}
          label="风险提醒"
          value={riskCount}
          hint={`${reviewConflicts.length} 个冲突`}
          tone={riskCount > 0 ? 'danger' : 'default'}
        />
      </section>

      <section className="nx-card hv-flow" aria-label="会议运营流程">
        <div className="hv-flow-head">
          <div>
            <span>会议运营流程</span>
            <strong>{currentWorkflowStep?.label ?? '流程已完成'}</strong>
          </div>
          {currentWorkflowStep?.onClick ? (
            <button className="nx-btn nx-btn-outline" type="button" onClick={currentWorkflowStep.onClick}>
              继续处理
              <ArrowRight aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="hv-flow-steps">
          {workflowSteps.map((step) => <WorkflowStep key={step.label} {...step} />)}
        </div>
      </section>

      <div className="hv-grid">
        <section className="nx-card hv-panel">
          <div className="nx-section-head">
            <span className="nx-section-title">
              <CheckSquare2 aria-hidden="true" />
              待办事项
            </span>
            <span className="nx-section-count">{todoItems.length > 0 ? `${todoItems.length} 项` : '清爽'}</span>
          </div>
          <div className="nx-rows">
            {todoItems.length > 0 ? (
              todoItems.map((item) => <HomeListItem key={item.label} {...item} />)
            ) : (
              <div className="nx-empty">暂无待办事项。</div>
            )}
          </div>
        </section>

        <section className="nx-card hv-panel">
          <div className="nx-section-head">
            <span className="nx-section-title">
              <Radar aria-hidden="true" style={{ color: riskItems.length > 0 ? '#b91c1c' : undefined }} />
              风险提醒
            </span>
            <span className="nx-section-count">{riskItems.length > 0 ? `${riskItems.length} 项` : '正常'}</span>
          </div>
          <div className="nx-rows">
            {riskItems.length > 0 ? (
              riskItems.map((item) => <HomeListItem key={item.label} {...item} />)
            ) : (
              <div className="nx-empty">当前没有明显风险。</div>
            )}
          </div>
        </section>

        <section className="nx-card hv-panel">
          <div className="nx-section-head">
            <span className="nx-section-title">
              <FileText aria-hidden="true" style={{ color: '#475569' }} />
              最近操作
            </span>
            <button className="nx-btn nx-btn-quiet" onClick={onGoToLogs} type="button">
              全部记录
            </button>
          </div>
          <div className="nx-rows">
            {recentLogs.length > 0 ? (
              recentLogs.map((log) => (
                <div className="nx-row" key={log.id}>
                  <span className="nx-dot" aria-hidden="true" />
                  <div className="nx-row-main">
                    <strong>{log.targetName || log.target || '系统操作'}</strong>
                    <span>{log.detail || log.actionType || '已记录'}</span>
                  </div>
                  <span className="hv-log-time">{formatLogTime(log.timestamp ?? log.createdAt)}</span>
                </div>
              ))
            ) : (
              <div className="nx-empty">暂无操作记录。</div>
            )}
          </div>
        </section>
      </div>
    </section>
  )
}
