import { useEffect, useState } from 'react'
import { FREQUENCY_LABELS } from '../../data/meetingData'

export function FilterPanel({ open, filters, onChange, onReset }) {
  const [draft, setDraft] = useState(filters)

  useEffect(() => {
    setDraft(filters)
  }, [filters])

  if (!open) return null

  return (
    <div className="nx-card fp-panel">
      <div className="fp-grid">
        <label className="nx-field">
          <span>主频率</span>
          <select
            className="nx-select"
            value={draft.frequency}
            onChange={(event) => setDraft({ ...draft, frequency: event.target.value })}
          >
            <option value="all">全部</option>
            {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="nx-field">
          <span>搜索</span>
          <input
            className="nx-input"
            value={draft.search}
            onChange={(event) => setDraft({ ...draft, search: event.target.value })}
            placeholder="会议名称或参会人"
          />
        </label>
        <label className="nx-field">
          <span>参会人</span>
          <input
            className="nx-input"
            value={draft.attendee}
            onChange={(event) => setDraft({ ...draft, attendee: event.target.value })}
            placeholder="按参会人筛选"
          />
        </label>
        <label className="nx-field">
          <span>下次会议</span>
          <select
            className="nx-select"
            value={draft.timeRange}
            onChange={(event) => setDraft({ ...draft, timeRange: event.target.value })}
          >
            <option value="all">全部</option>
            <option value="week">本周</option>
            <option value="month">本月</option>
            <option value="30days">30天内</option>
          </select>
        </label>
        <label className="nx-field">
          <span>历史状态</span>
          <select
            className="nx-select"
            value={draft.historyStatus}
            onChange={(event) => setDraft({ ...draft, historyStatus: event.target.value })}
          >
            <option value="all">全部</option>
            <option value="has">有记录</option>
            <option value="none">无记录</option>
          </select>
        </label>
        <div className="nx-field fp-span-2">
          <span>频率类型（可多选）</span>
          <div className="fp-checks">
            {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
              <label
                key={value}
                className={draft.frequencyTypes.includes(value) ? 'mv-chip mv-chip-active' : 'mv-chip'}
              >
                <input
                  type="checkbox"
                  className="fp-check-input"
                  checked={draft.frequencyTypes.includes(value)}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      frequencyTypes: event.target.checked
                        ? [...current.frequencyTypes, value]
                        : current.frequencyTypes.filter((item) => item !== value),
                    }))
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="fp-actions">
        <button className="nx-btn nx-btn-quiet" onClick={onReset} type="button">
          重置
        </button>
        <button className="nx-btn nx-btn-primary" onClick={() => onChange(draft)} type="button">
          应用筛选
        </button>
      </div>
    </div>
  )
}
