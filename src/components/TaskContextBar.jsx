import { ArrowRight, Check, ChevronDown, CornerUpLeft } from 'lucide-react'

const STAGES = [
  ['prepare', '准备清单'], ['ai', '选择方案'], ['review', '审核确认'],
  ['reserveNotice', '预留通知'], ['outlookInvite', '会邀草稿'],
]
const PAGE_LABELS = { planner: '排程', reserveNotice: '预留通知', outlookInvite: '会邀生成' }

export function TaskContextBar({ tasks, task, activeTab, workflowStage, onTaskChange, onStageChange, onReturn, returnLabel }) {
  if (!PAGE_LABELS[activeTab]) {
    return onReturn ? <div className="eo-return-context"><button className="nx-btn nx-btn-quiet" onClick={onReturn}><CornerUpLeft size={15} />{returnLabel || '返回刚才的工作'}</button></div> : null
  }
  const hasReview = Boolean(task?.reviewState?.scheduledMeetings?.length)
  const currentStage = activeTab === 'planner' ? workflowStage : activeTab
  const stageLabel = STAGES.find(([id]) => id === currentStage)?.[1] || PAGE_LABELS[activeTab]
  return (
    <section className="eo-task-heading" aria-label="当前运营任务">
      <div className="eo-heading-copy">
        <div className="eo-breadcrumb"><span>{PAGE_LABELS[activeTab]}</span>{activeTab === 'planner' && <><span>/</span><span>{stageLabel}</span></>}</div>
        <div className="eo-heading-title-row">
          <h1>{task?.name || PAGE_LABELS[activeTab]}</h1>
          {task && <span className="eo-state-pill"><span />{task.status === 'scheduled' ? '已确认' : hasReview ? '待审核' : '准备中'}</span>}
        </div>
        <p>{task?.timeRange ? `${task.timeRange.start.replaceAll('-', '.')} — ${task.timeRange.end.replaceAll('-', '.')}` : '创建任务后，按顺序完成清单、审核、通知和会邀'}{task && <> · {task.reviewState?.scheduledMeetings?.length || task.generatedCount || 0} 场会议</>}</p>
      </div>
      <div className="eo-heading-actions">
        {tasks.length > 0 && <label className="eo-task-picker"><select value="" aria-label="切换当前任务" onChange={event => { if (event.target.value) onTaskChange(event.target.value) }}><option value="">切换任务</option>{tasks.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={15} /></label>}
        {task && <details className="eo-stage-menu">
          <summary>{stageLabel}<ChevronDown size={15} /></summary>
          <div className="eo-stage-popover">
            <span className="eo-menu-caption">继续当前任务</span>
            {STAGES.map(([id, label], index) => <button key={id} disabled={index > 1 && !hasReview} onClick={event => { onStageChange(id); event.currentTarget.closest('details').open = false }}>
              <span>{label}</span>{id === currentStage ? <Check size={15} /> : <ArrowRight size={14} />}
            </button>)}
          </div>
        </details>}
      </div>
    </section>
  )
}
