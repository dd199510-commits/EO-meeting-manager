import { useEffect, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { confirmDialog } from '../../components/Feedback'
import {
  FREQUENCY_LABELS,
  MONTHS,
  WEEKDAYS,
  getMeetingFrequencyType,
  getMeetingInterval,
  groupMeetingHistory,
  updateMeetingFrequency,
} from '../../data/meetingData'
import { MeetingNotesField } from './MeetingNotesField'
import { AttendeeResolver } from './AttendeeResolver'
import { appendAttendeeNames, removeAttendeeNames } from '../../lib/contacts'

export function EditModal({ meeting, meetings = [], contacts = [], open, isClosing = false, onClose, onSave, onAddContact }) {
  const [formData, setFormData] = useState(meeting)
  const [historyInput, setHistoryInput] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const frequencyType = formData ? getMeetingFrequencyType(formData) : 'weekly'
  const historyGroups = formData ? groupMeetingHistory(formData) : []
  const selectedMonths = Array.isArray(formData?.frequency?.monthSpec)
    ? formData.frequency.monthSpec
    : [formData?.frequency?.monthSpec || 1]

  function addHistoryDates() {
    const inputDates = historyInput
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    const today = new Date()
    const todayValue = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-')
    const invalidDates = inputDates.filter((item) => !/^\d{4}-\d{2}-\d{2}$/.test(item))
    const futureDates = inputDates.filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item) && item > todayValue)
    const dates = inputDates.filter(
      (item) => /^\d{4}-\d{2}-\d{2}$/.test(item) && item <= todayValue,
    )

    if (invalidDates.length > 0 || futureDates.length > 0) {
      const messages = []
      if (invalidDates.length > 0) messages.push(`日期格式不正确：${invalidDates.join('、')}`)
      if (futureDates.length > 0) messages.push(`未来日期不能作为历史记录：${futureDates.join('、')}`)
      setHistoryError(messages.join('；'))
    } else {
      setHistoryError('')
    }

    if (dates.length === 0) return

    setFormData((current) => ({
      ...current,
      history: [...new Set([...(current.history ?? []), ...dates])].sort(),
    }))
    setHistoryInput('')
  }

  function toggleSecretaryInvite(contactId) {
    const contact = contacts.find((item) => item.id === contactId)
    const secretaryNames = (contact?.secretaries ?? []).map((item) => item.name).filter(Boolean)
    if (secretaryNames.length === 0) return

    setFormData((current) => {
      const selectedIds = current.secretaryInviteContactIds ?? []
      const selected = selectedIds.includes(contactId)

      return {
        ...current,
        secretaryInviteContactIds: selected
          ? selectedIds.filter((id) => id !== contactId)
          : [...selectedIds, contactId],
        extraInvitees: selected
          ? removeAttendeeNames(current.extraInvitees, secretaryNames)
          : appendAttendeeNames(current.extraInvitees, secretaryNames),
      }
    })
  }

  const isDirty = JSON.stringify(formData) !== JSON.stringify(meeting)

  async function requestClose() {
    if (isDirty) {
      const discard = await confirmDialog({
        title: '放弃修改',
        message: '当前会议资料有未保存的修改，确定放弃并关闭吗？',
        confirmLabel: '放弃修改',
        danger: true,
      })
      if (!discard) return
    }
    onClose()
  }

  // 注意：Hook 需在提前 return 之前声明
  useEffect(() => {
    if (!open) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape') requestClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isDirty, formData])

  if (!meeting || !formData) return null

  return (
    <div
      className={open && !isClosing ? 'modal-backdrop modal-open' : 'modal-backdrop modal-closing'}
      onClick={requestClose}
    >
      <div
        className={open && !isClosing ? 'modal-card modal-card-open' : 'modal-card modal-card-closing'}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{meeting.id ? '编辑会议' : '新建会议'}</h2>
          <button className="icon-button" onClick={requestClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>会议前缀</span>
            <input
              value={formData.meetingPrefix ?? ''}
              onChange={(event) => setFormData({ ...formData, meetingPrefix: event.target.value })}
              placeholder="可留空"
            />
          </label>
          <label className="field field-span-2">
            <span>会议名称</span>
            <input
              value={formData.name}
              onChange={(event) => setFormData({ ...formData, name: event.target.value })}
            />
          </label>
          <div className="field field-span-2 rule-builder">
            <span>频率设置</span>
            <div className="rule-builder-shell">
              <div className="rule-builder-head">
                <label className="field inline-mini-field rule-field-type">
                  <span>会议类型</span>
                  <select
                    value={frequencyType}
                    onChange={(event) =>
                      setFormData((current) => updateMeetingFrequency(current, { type: event.target.value }))
                    }
                  >
                    {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field inline-mini-field rule-field-duration">
                  <span>会议时长</span>
                  <input
                    type="number"
                    value={formData.duration}
                    onChange={(event) =>
                      setFormData({ ...formData, duration: Number(event.target.value) || 0 })
                    }
                  />
                </label>
              </div>

              {frequencyType === 'weekly' ? (
                <div className="rule-sentence">
                  <div className="rule-group">
                    <span>每</span>
                    <input
                      className="rule-number-input"
                      type="number"
                      min="1"
                      value={getMeetingInterval(formData)}
                      onChange={(event) =>
                        setFormData((current) =>
                          updateMeetingFrequency(current, { interval: Number(event.target.value) || 1 }),
                        )
                      }
                    />
                    <span>周</span>
                  </div>
                  <div className="rule-group">
                    <span>在</span>
                  </div>
                  <div className="option-chip-row option-chip-row-dense">
                    {WEEKDAYS.map((day) => (
                      <button
                        key={day.val}
                        type="button"
                        className={formData.frequency?.daySpec === day.val ? 'option-chip option-chip-active' : 'option-chip'}
                        onClick={() =>
                          setFormData((current) => updateMeetingFrequency(current, { daySpec: day.val }))
                        }
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                  <span>举行</span>
                </div>
              ) : null}

              {frequencyType === 'monthly' ? (
                <div className="rule-sentence">
                  <div className="rule-group">
                    <span>每</span>
                    <input
                      className="rule-number-input"
                      type="number"
                      min="1"
                      value={getMeetingInterval(formData)}
                      onChange={(event) =>
                        setFormData((current) =>
                          updateMeetingFrequency(current, { interval: Number(event.target.value) || 1 }),
                        )
                      }
                    />
                    <span>月</span>
                  </div>
                  <div className="rule-group">
                    <span>在当月</span>
                    <input
                      className="rule-number-input"
                      type="number"
                      min="1"
                      max="31"
                      value={formData.frequency?.daySpec ?? 1}
                      onChange={(event) =>
                        setFormData((current) =>
                          updateMeetingFrequency(current, { daySpec: Number(event.target.value) || 1 }),
                        )
                      }
                    />
                    <span>号举行</span>
                  </div>
                </div>
              ) : null}

              {frequencyType === 'yearly' ? (
                <div className="rule-builder-stack">
                  <div className="rule-sentence">
                    <div className="rule-group">
                      <span>每</span>
                      <input
                        className="rule-number-input"
                        type="number"
                        min="1"
                        value={getMeetingInterval(formData)}
                        onChange={(event) =>
                          setFormData((current) =>
                            updateMeetingFrequency(current, { interval: Number(event.target.value) || 1 }),
                          )
                        }
                      />
                      <span>年</span>
                    </div>
                    <div className="rule-group">
                      <span>在选定月份的</span>
                      <input
                        className="rule-number-input"
                        type="number"
                        min="1"
                        max="31"
                        value={formData.frequency?.daySpec ?? 1}
                        onChange={(event) =>
                          setFormData((current) =>
                            updateMeetingFrequency(current, { daySpec: Number(event.target.value) || 1 }),
                          )
                        }
                      />
                      <span>号举行</span>
                    </div>
                  </div>
                  <div className="field inline-flex-field">
                    <span>发生月份</span>
                    <div className="option-chip-row option-chip-row-wrap option-chip-row-dense">
                      {MONTHS.map((month) => {
                        const selected = selectedMonths.includes(month.val)
                        return (
                          <button
                            key={month.val}
                            type="button"
                            className={selected ? 'option-chip option-chip-active' : 'option-chip'}
                            onClick={() => {
                              const nextMonths = selected
                                ? selectedMonths.filter((item) => item !== month.val)
                                : [...selectedMonths, month.val].sort((a, b) => a - b)

                              setFormData((current) =>
                                updateMeetingFrequency(current, {
                                  monthSpec: nextMonths.length > 0 ? nextMonths : [month.val],
                                }),
                              )
                            }}
                          >
                            {month.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : null}

              {frequencyType === 'adhoc' ? (
                <div className="rule-helper-text">不定期会议不参与自动周期计算。</div>
              ) : null}

              {frequencyType !== 'adhoc' ? (
                <div className="rule-helper-row">
                  <label className="field inline-mini-field">
                    <span>起始参考日</span>
                    <input
                      type="date"
                      value={formData.frequency?.anchorDate || ''}
                      onChange={(event) =>
                        setFormData((current) => updateMeetingFrequency(current, { anchorDate: event.target.value }))
                      }
                    />
                  </label>
                  <span className="rule-helper-text">没有历史记录时从这里起算；有历史记录后，只按最近一次实际日期所在的周或月继续排期。</span>
                </div>
              ) : null}

              {frequencyType !== 'adhoc' && formData.frequency?.daySpec >= 29 ? (
                <div className="warning-text rule-warning-text">天数不足的月份会自动调整到当月最后一天。</div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="modal-section modal-section-static modal-section-fields">
          <div className="form-grid compact-form-grid modal-fields-grid">
            <label className="field field-span-2">
              <span>参会人</span>
              <textarea
                rows="3"
                value={formData.attendees}
                onChange={(event) => setFormData({ ...formData, attendees: event.target.value })}
              />
              <AttendeeResolver
                attendees={formData.attendees}
                contacts={contacts}
                onChangeAttendees={(attendees) => setFormData((current) => ({ ...current, attendees }))}
                onAddContact={onAddContact}
                secretaryContactIds={formData.secretaryInviteContactIds ?? []}
                onToggleSecretaries={toggleSecretaryInvite}
              />
            </label>
            <label className="field field-span-2">
              <span>不参会但需发会邀人员</span>
              <textarea
                rows="2"
                value={formData.extraInvitees}
                onChange={(event) => setFormData({ ...formData, extraInvitees: event.target.value })}
              />
              <AttendeeResolver
                attendees={formData.extraInvitees}
                contacts={contacts}
                onChangeAttendees={(extraInvitees) => setFormData((current) => ({ ...current, extraInvitees }))}
                onAddContact={onAddContact}
              />
            </label>
            <label className="field field-span-2">
              <span>备注</span>
              <MeetingNotesField
                value={formData.notes}
                noteMentions={formData.noteMentions}
                meetings={meetings}
                currentMeetingId={formData.id}
                rows={3}
                onChange={({ value, noteMentions }) =>
                  setFormData((current) => ({
                    ...current,
                    notes: value,
                    noteMentions,
                  }))
                }
              />
            </label>
          </div>
        </div>
        <div className="modal-section">
          <button
            type="button"
            className="section-toggle"
            onClick={() => setShowHistory((current) => !current)}
          >
            <div className="section-toggle-copy">
              <strong>历史记录管理</strong>
              <span>当前 {(formData.history ?? []).length} 条记录，按需展开编辑。</span>
            </div>
            <ChevronDown size={16} className={showHistory ? 'section-toggle-icon section-toggle-icon-open' : 'section-toggle-icon'} />
          </button>
          {showHistory ? (
            <div className="section-toggle-body">
              <div className="inline-history-block">
                <div className="inline-history-row">
                  <input
                    value={historyInput}
                    onChange={(event) => {
                      setHistoryInput(event.target.value)
                      setHistoryError('')
                    }}
                    placeholder="输入日期，逗号分隔：2026-03-01, 2026-03-08"
                  />
                  <button className="ghost-button" onClick={addHistoryDates}>
                    添加历史
                  </button>
                </div>
                {historyError ? <div className="warning-text rule-warning-text">{historyError}</div> : null}
                <div className="inline-history-list">
                  {(formData.history ?? []).length === 0 ? <div className="empty-state">暂无历史记录</div> : null}
                  {historyGroups.map((group) => (
                    <div key={group.key} className="history-group history-group-modal">
                      <div className="history-group-label">{group.label}</div>
                      <div className="history-group-items">
                        {group.items.map((item) => (
                          <div key={item.value} className="inline-history-item">
                            <span>{item.label}</span>
                            <button
                              className="icon-button danger"
                              onClick={() =>
                                setFormData((current) => ({
                                  ...current,
                                  history: (current.history ?? []).filter((historyItem) => historyItem !== item.value),
                                }))
                              }
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <div className="panel-actions">
          {!formData.name?.trim() ? (
            <span className="edit-modal-validation-hint">请填写会议名称后保存</span>
          ) : null}
          <button className="ghost-button" onClick={requestClose}>
            取消
          </button>
          <button
            className="primary-button"
            onClick={() => onSave(formData)}
            disabled={!formData.name?.trim()}
            title={!formData.name?.trim() ? '请先填写会议名称' : '保存会议'}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
