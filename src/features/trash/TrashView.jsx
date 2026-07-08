import { RotateCcw, Trash2 } from 'lucide-react'

export function TrashView({ deletedMeetings, onRestore, onDeleteForever }) {
  return (
    <section className="tv-section">
      <div className="nx-section-head">
        <span className="nx-section-title">
          <Trash2 aria-hidden="true" />
          回收站
        </span>
        <span className="nx-section-count">
          {deletedMeetings.length > 0 ? `${deletedMeetings.length} 条已删除会议` : '空'}
        </span>
      </div>
      {deletedMeetings.length === 0 ? (
        <div className="nx-empty">回收站为空。被删除的会议会先移到这里，可随时恢复。</div>
      ) : (
        <div className="nx-rows">
          {deletedMeetings.map((meeting) => (
            <div key={meeting.id} className="nx-row tv-row">
              <span className="nx-dot nx-dot-danger" aria-hidden="true" />
              <div className="nx-row-main">
                <strong>{meeting.name || '未命名会议'}</strong>
                <span>
                  {meeting.attendees ? `参会人：${meeting.attendees.split('\n').join('、')} · ` : ''}
                  {meeting.notes?.trim() || '无备注'}
                </span>
              </div>
              <div className="tv-actions">
                <button className="nx-btn nx-btn-outline" onClick={() => onRestore(meeting.id)} type="button">
                  <RotateCcw size={14} />
                  恢复
                </button>
                <button className="nx-btn nx-btn-danger" onClick={() => onDeleteForever(meeting.id)} type="button">
                  <Trash2 size={14} />
                  彻底删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
