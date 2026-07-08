import { Trash2 } from 'lucide-react'
import { formatTimestamp, getActionLabel } from './logUtils'

function formatChangeLine(change) {
  if (typeof change === 'string') return change

  if (change && typeof change === 'object') {
    const parts = []

    if (change.field) parts.push(`${change.field}`)
    if (change.old !== undefined || change.new !== undefined) {
      parts.push(`${change.old ?? '-'} → ${change.new ?? '-'}`)
    }
    if (change.detail) parts.push(`${change.detail}`)

    return parts.join(' · ') || JSON.stringify(change)
  }

  return String(change ?? '')
}

const DANGER_ACTIONS = new Set(['delete', 'hard_delete', 'review_delete'])
const OK_ACTIONS = new Set(['create', 'restore', 'import', 'review_import', 'batch_import'])

function logTone(actionType) {
  if (DANGER_ACTIONS.has(actionType)) return 'nx-dot nx-dot-danger'
  if (OK_ACTIONS.has(actionType)) return 'nx-dot nx-dot-ok'
  return 'nx-dot nx-dot-info'
}

export function LogsView({ activeSection, logs, onClear, onDelete }) {
  const safeLogs = Array.isArray(logs) ? logs.filter(Boolean) : []

  const planningActionTypes = new Set(['review', 'review_import', 'review_delete', 'review_move'])
  const planningTargets = new Set(['审核区', '审核排程'])

  const meetingLogs = safeLogs.filter(
    (log) => !planningActionTypes.has(log.actionType) && !planningTargets.has(log.targetName),
  )
  const planningLogs = safeLogs.filter(
    (log) => planningActionTypes.has(log.actionType) || planningTargets.has(log.targetName),
  )
  const visibleLogs = activeSection === 'meetings' ? meetingLogs : planningLogs

  return (
    <section className="nx-card lv-panel">
      <div className="nx-section-head lv-head">
        <span className="nx-section-title">操作审计</span>
        <div className="lv-head-actions">
          <span className="nx-section-count">
            {activeSection === 'meetings' ? `${meetingLogs.length} 条会议记录` : `${planningLogs.length} 条排程记录`}
          </span>
          <button className="nx-btn nx-btn-danger" onClick={onClear} type="button">
            清空日志
          </button>
        </div>
      </div>
      {visibleLogs.length === 0 ? (
        <div className="nx-empty">暂无操作记录。</div>
      ) : (
        <div className="nx-rows">
          {visibleLogs.map((log) => (
            <div key={log.id} className="nx-row lv-row">
              <span className={logTone(log.actionType)} aria-hidden="true" />
              <div className="nx-row-main">
                <div className="lv-line">
                  <strong>{log.targetName || '未命名对象'}</strong>
                  <span className="nx-badge">{getActionLabel(log.actionType)}</span>
                  <span className="lv-detail">{log.detail || '无变更摘要'}</span>
                </div>
                {activeSection === 'meetings' && Array.isArray(log.changes) && log.changes.length ? (
                  <div className="lv-changes">
                    {log.changes.map((change, index) => (
                      <div key={`${log.id}-${index}`} className="lv-change-line">
                        {formatChangeLine(change)}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="lv-meta">
                <span>{formatTimestamp(log.timestamp)}</span>
                <button
                  className="nx-btn nx-btn-danger lv-delete"
                  onClick={() => onDelete(log.id)}
                  type="button"
                  aria-label="删除这条记录"
                  title="删除这条记录"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
