import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  CalendarRange,
  Clock,
  Download,
  FileText,
  Filter,
  GripVertical,
  Link2,
  Mail,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { FREQUENCY_LABELS, getMeetingFrequencyType } from '../../data/meetingData'
import { getAttendeeSummary, getResolvedAttendeeStats, splitAttendees } from '../../lib/contacts'
import { calculateNextOccurrence, formatNextDateInfo } from '../../lib/meetingFrequency'
import { FilterPanel } from './FilterPanel'
import { TrashView } from '../trash/TrashView'
import {
  filterMeetings,
  getActiveFilterTags,
  getCompactFrequencyLabel,
  getGroupTone,
  getGroupSummary,
  getSubGroupKey,
  getSubGroupLabel,
  getSubGroupTone,
  groupMeetingsByFrequency,
  hasActiveFilters,
  sortMeetings,
} from './meetingsUtils'

function getAttendeeList(meeting) {
  return splitAttendees(meeting.attendees)
}

function getMeetingDateLabel(meeting) {
  const nextOccurrence = calculateNextOccurrence(meeting)
  const nextDateInfo = formatNextDateInfo(nextOccurrence)
  return nextDateInfo.prefix ? `${nextDateInfo.prefix} ${nextDateInfo.date}` : nextDateInfo.date
}

export function MeetingsView({
  contentTab,
  tabOptions = [],
  onTabChange,
  meetings,
  deletedMeetings,
  filters,
  setFilters,
  defaultFilters,
  showFilters,
  setShowFilters,
  onDeleteMeeting,
  onEditMeeting,
  onRestoreMeeting,
  onDeleteMeetingForever,
  onReorderMeetings,
  onCreateMeeting,
  onBatchImport,
  onGoToPlanner,
}) {
  const SORT_STORAGE_KEY = 'meeting-manager:ui:meetings-sort:v1'
  const VALID_SORTS = ['frequency', 'nextDate', 'lastDate', 'name', 'custom']
  const [sortBy, setSortBy] = useState(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(SORT_STORAGE_KEY) : ''
    return VALID_SORTS.includes(saved) ? saved : 'frequency'
  })
  const [draggedMeetingId, setDraggedMeetingId] = useState(null)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)

  useEffect(() => {
    window.localStorage.setItem(SORT_STORAGE_KEY, sortBy)
  }, [sortBy])
  const [selectedMeetingId, setSelectedMeetingId] = useState('')
  const [navigatorFilter, setNavigatorFilter] = useState({ type: 'all', key: 'all' })
  const [quickFilter, setQuickFilter] = useState('all')
  const moreMenuRef = useRef(null)

  const summaryFilters = useMemo(
    () => ({
      ...filters,
      frequency: 'all',
      frequencyTypes: [],
    }),
    [filters],
  )
  const filteredMeetings = useMemo(() => filterMeetings(meetings, filters), [filters, meetings])
  const sortedMeetings = useMemo(() => sortMeetings(filteredMeetings, sortBy), [filteredMeetings, sortBy])
  const quickFilteredMeetings = useMemo(() => {
    if (quickFilter === 'notes') {
      return sortedMeetings.filter((meeting) => meeting.notes?.trim())
    }
    if (quickFilter === 'linked') {
      return sortedMeetings.filter((meeting) => (meeting.noteMentions?.length ?? 0) > 0)
    }
    if (quickFilter === 'history') {
      return sortedMeetings.filter((meeting) => (meeting.history?.length ?? 0) > 0)
    }
    if (quickFilter === 'review') {
      return sortedMeetings.filter((meeting) => !meeting.attendees?.trim() || !meeting.notes?.trim())
    }
    return sortedMeetings
  }, [quickFilter, sortedMeetings])
  const displayedMeetings = useMemo(() => {
    if (navigatorFilter.type === 'group') {
      return quickFilteredMeetings.filter((meeting) => getMeetingFrequencyType(meeting) === navigatorFilter.key)
    }
    if (navigatorFilter.type === 'subgroup') {
      return quickFilteredMeetings.filter((meeting) => getSubGroupKey(meeting) === navigatorFilter.key)
    }
    return quickFilteredMeetings
  }, [navigatorFilter, quickFilteredMeetings])
  const navigatorGroupedMeetings = useMemo(() => groupMeetingsByFrequency(quickFilteredMeetings), [quickFilteredMeetings])
  const groupedSummary = useMemo(
    () => getGroupSummary(filterMeetings(meetings, summaryFilters)),
    [meetings, summaryFilters],
  )
  const isFiltered = hasActiveFilters(filters)
  const activeFilterTags = getActiveFilterTags(filters)
  const canDrag = sortBy === 'custom' && !isFiltered
  const selectedMeeting = useMemo(
    () => displayedMeetings.find((meeting) => meeting.id === selectedMeetingId) ?? displayedMeetings[0] ?? null,
    [displayedMeetings, selectedMeetingId],
  )
  const quickFilterCounts = useMemo(() => ({
    all: sortedMeetings.length,
    notes: sortedMeetings.filter((meeting) => meeting.notes?.trim()).length,
    linked: sortedMeetings.filter((meeting) => (meeting.noteMentions?.length ?? 0) > 0).length,
    history: sortedMeetings.filter((meeting) => (meeting.history?.length ?? 0) > 0).length,
    review: sortedMeetings.filter((meeting) => !meeting.attendees?.trim() || !meeting.notes?.trim()).length,
  }), [sortedMeetings])

  useEffect(() => {
    function handlePointerDown(event) {
      if (!moreMenuRef.current?.contains(event.target)) {
        setMoreMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  function moveMeeting(targetId) {
    if (!draggedMeetingId || draggedMeetingId === targetId) return

    const customSorted = sortMeetings(meetings, 'custom')
    const sourceIndex = customSorted.findIndex((meeting) => meeting.id === draggedMeetingId)
    const targetIndex = customSorted.findIndex((meeting) => meeting.id === targetId)
    if (sourceIndex < 0 || targetIndex < 0) return

    const reordered = [...customSorted]
    const [dragged] = reordered.splice(sourceIndex, 1)
    reordered.splice(targetIndex, 0, dragged)
    onReorderMeetings(reordered.map((meeting) => meeting.id))
  }

  function isFrequencySummaryActive(key) {
    return filters.frequencyTypes?.includes(key) || filters.frequency === key
  }

  function toggleFrequencySummary(key) {
    const isActive = isFrequencySummaryActive(key)
    const nextFrequencyTypes = isActive
      ? (filters.frequencyTypes ?? []).filter((item) => item !== key)
      : [...new Set([...(filters.frequencyTypes ?? []), key])]

    setFilters({
      ...filters,
      frequency: 'all',
      frequencyTypes: nextFrequencyTypes,
    })
  }

  function selectNavigatorFilter(nextFilter) {
    setNavigatorFilter(nextFilter)
    setSelectedMeetingId('')
  }

  function renderFrequencyNavigator() {
    const totalVisible = quickFilteredMeetings.length || 1

    return (
      <aside className="nx-card mv-nav" aria-label="频率导航">
        <button
          type="button"
          className={navigatorFilter.type === 'all' ? 'mv-nav-item mv-nav-item-active' : 'mv-nav-item'}
          onClick={() => selectNavigatorFilter({ type: 'all', key: 'all' })}
        >
          <span>全部会议</span>
          <strong>{quickFilteredMeetings.length}</strong>
          <em style={{ width: '100%' }} />
        </button>
        {Object.entries(navigatorGroupedMeetings).map(([groupKey, subGroups]) => {
          const groupCount = Object.values(subGroups).reduce((count, items) => count + items.length, 0)
          if (groupCount === 0) return null
          const groupTone = getGroupTone(groupKey)

          return (
            <div key={groupKey} className="mv-nav-group">
              <button
                type="button"
                className={
                  navigatorFilter.type === 'group' && navigatorFilter.key === groupKey
                    ? `mv-nav-item mv-nav-item-${groupTone} mv-nav-item-active`
                    : `mv-nav-item mv-nav-item-${groupTone}`
                }
                onClick={() => selectNavigatorFilter({ type: 'group', key: groupKey })}
              >
                <span>{FREQUENCY_LABELS[groupKey]}</span>
                <strong>{groupCount}</strong>
                <em style={{ width: `${Math.max(8, (groupCount / totalVisible) * 100)}%` }} />
              </button>
              <div className="mv-subnav">
                {Object.entries(subGroups)
                  .filter(([, items]) => items.length > 0)
                  .map(([subGroupKey, items]) => {
                    const subTone = getSubGroupTone(subGroupKey)
                    return (
                      <button
                        key={subGroupKey}
                        type="button"
                        className={
                          navigatorFilter.type === 'subgroup' && navigatorFilter.key === subGroupKey
                            ? `mv-subnav-item mv-subnav-item-${subTone} mv-subnav-item-active`
                            : `mv-subnav-item mv-subnav-item-${subTone}`
                        }
                        onClick={() => selectNavigatorFilter({ type: 'subgroup', key: subGroupKey })}
                      >
                        <span>{getSubGroupLabel(subGroupKey)}</span>
                        <strong>{items.length}</strong>
                      </button>
                    )
                  })}
              </div>
            </div>
          )
        })}
      </aside>
    )
  }

  function renderMeetingRow(meeting) {
    const frequencyType = getMeetingFrequencyType(meeting)
    const historyCount = meeting.history?.length ?? 0
    const linkedCount = meeting.noteMentions?.length ?? 0
    const attendeeSummary = getAttendeeSummary(meeting.attendees, 3)
    const isSelected = selectedMeeting?.id === meeting.id

    return (
      <div
        key={meeting.id}
        draggable={canDrag}
        onDragStart={() => setDraggedMeetingId(meeting.id)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={() => moveMeeting(meeting.id)}
        onDragEnd={() => setDraggedMeetingId(null)}
        className={[
          'mv-row',
          isSelected ? 'mv-row-selected' : '',
          draggedMeetingId === meeting.id ? 'mv-row-dragging' : '',
        ].filter(Boolean).join(' ')}
        onClick={() => setSelectedMeetingId(meeting.id)}
      >
        <div className="mv-cell mv-cell-name">
          {canDrag ? <GripVertical size={14} className="mv-drag" /> : null}
          <div>
            <strong>{meeting.name}</strong>
            <span>{meeting.notes?.trim() || '暂无备注'}</span>
          </div>
        </div>
        <div className="mv-cell">
          <span className={`meeting-frequency-badge meeting-frequency-badge-${frequencyType}`}>
            {getCompactFrequencyLabel(meeting)}
          </span>
        </div>
        <div className="mv-cell">
          <CalendarDays size={13} />
          <span>{getMeetingDateLabel(meeting)}</span>
        </div>
        <div className="mv-cell">
          <Clock size={13} />
          <span>{meeting.duration}m</span>
        </div>
        <div className="mv-cell">
          <Users size={13} />
          <span>{attendeeSummary}</span>
        </div>
        <div className="mv-cell mv-cell-signals">
          {linkedCount > 0 ? <span><Link2 size={12} />{linkedCount}</span> : <span className="mv-muted">无依赖</span>}
          <span>{historyCount} 次</span>
        </div>
        <div className="mv-actions">
          <button
            type="button"
            className="icon-button"
            onClick={(event) => {
              event.stopPropagation()
              setSelectedMeetingId(meeting.id)
              onEditMeeting(meeting)
            }}
            aria-label={`编辑 ${meeting.name}`}
            title="编辑"
          >
            <FileText size={14} />
          </button>
          <button
            type="button"
            className="icon-button danger"
            onClick={(event) => {
              event.stopPropagation()
              onDeleteMeeting(meeting.id)
            }}
            aria-label={`删除 ${meeting.name}`}
            title="移入回收站"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    )
  }

  function renderMeetingInspector() {
    if (!selectedMeeting) {
      return (
        <aside className="nx-card mv-inspector">
          <div className="nx-empty">选择一条会议查看详情。</div>
        </aside>
      )
    }

    const frequencyType = getMeetingFrequencyType(selectedMeeting)
    const attendees = getAttendeeList(selectedMeeting)
    const extraInvitees = splitAttendees(selectedMeeting.extraInvitees)
    const attendeeStats = getResolvedAttendeeStats(selectedMeeting.attendeeRefs)
    const extraInviteeStats = getResolvedAttendeeStats(selectedMeeting.extraInviteeRefs)
    const history = [...(selectedMeeting.history ?? [])].slice(-5).reverse()
    const linkedMeetings = (selectedMeeting.noteMentions ?? []).filter(Boolean)

    return (
      <aside className="nx-card mv-inspector">
        <div className="mv-inspector-head">
          <div className="mv-inspector-title">
            <span className={`meeting-frequency-badge meeting-frequency-badge-${frequencyType}`}>
              {getCompactFrequencyLabel(selectedMeeting)}
            </span>
            <h2>{selectedMeeting.name}</h2>
            <p>{getMeetingDateLabel(selectedMeeting)} · {selectedMeeting.duration} 分钟</p>
          </div>
          <div className="mv-inspector-title-actions">
            <button
              type="button"
              className="nx-btn nx-btn-outline"
              onClick={() => onEditMeeting(selectedMeeting)}
            >
              <FileText size={14} />
              编辑
            </button>
            <button
              type="button"
              className="nx-btn nx-btn-danger"
              onClick={() => onDeleteMeeting(selectedMeeting.id)}
              aria-label="移入回收站"
              title="移入回收站"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div className="mv-inspector-scroll">
          <div className="mv-inspector-metrics">
            <div><span>历史</span><strong>{selectedMeeting.history?.length ?? 0}</strong></div>
            <div><span>参会人</span><strong>{attendees.length || '-'}</strong></div>
            <div><span>依赖</span><strong>{linkedMeetings.length}</strong></div>
          </div>

          <section className="mv-inspector-section">
            <div className="mv-inspector-section-head">
              <Users size={14} />
              <strong>参会人</strong>
              {attendeeStats.total > 0 ? <span>{attendeeStats.linked}/{attendeeStats.total} 已关联</span> : null}
            </div>
            <p>{attendees.length > 0 ? attendees.join('、') : '未指定'}</p>
          </section>

          <section className="mv-inspector-section">
            <div className="mv-inspector-section-head">
              <Mail size={14} />
              <strong>不参会但需发会邀</strong>
              {extraInviteeStats.total > 0 ? <span>{extraInviteeStats.linked}/{extraInviteeStats.total} 已关联</span> : null}
            </div>
            <p>{extraInvitees.length > 0 ? extraInvitees.join('、') : '未指定'}</p>
          </section>

          <section className="mv-inspector-section">
            <div className="mv-inspector-section-head">
              <FileText size={14} />
              <strong>备注与排程约束</strong>
            </div>
            <p>{selectedMeeting.notes?.trim() || '暂无备注'}</p>
          </section>

          <section className="mv-inspector-section">
            <div className="mv-inspector-section-head">
              <Link2 size={14} />
              <strong>关联会议</strong>
            </div>
            {linkedMeetings.length > 0 ? (
              <div className="mv-inspector-tags">
                {linkedMeetings.map((mention) => (
                  <span key={`${mention.meetingId}-${mention.label}`}>@{mention.label}</span>
                ))}
              </div>
            ) : (
              <p>暂无关联会议。</p>
            )}
          </section>

          <section className="mv-inspector-section">
            <div className="mv-inspector-section-head">
              <Clock size={14} />
              <strong>最近记录</strong>
            </div>
            {history.length > 0 ? (
              <div className="mv-inspector-history">
                {history.map((item) => <span key={item}>{item}</span>)}
              </div>
            ) : (
              <p>暂无历史记录。</p>
            )}
          </section>
        </div>
      </aside>
    )
  }

  function renderContentTabs(extraClassName = '') {
    if (!tabOptions.length) return null

    return (
      <div
        className={['module-tabs', 'mv-content-tabs', extraClassName].filter(Boolean).join(' ')}
        role="tablist"
        aria-label="会议库页面切换"
      >
        {tabOptions.map(({ id, label }) => (
          <button
            key={id}
            className={contentTab === id ? 'module-tab module-tab-active' : 'module-tab'}
            onClick={() => onTabChange?.(id)}
            type="button"
            role="tab"
            aria-selected={contentTab === id}
          >
            {label}
          </button>
        ))}
      </div>
    )
  }

  if (contentTab === 'trash') {
    return (
      <section className="nx-card mv-trash-panel">
        <div className="mv-trash-tabs-row">{renderContentTabs()}</div>
        <TrashView
          deletedMeetings={deletedMeetings}
          onRestore={onRestoreMeeting}
          onDeleteForever={onDeleteMeetingForever}
        />
      </section>
    )
  }

  return (
    <div className="mv-workspace">
      {renderFrequencyNavigator()}

      <section className="nx-card mv-list-panel">
        <div className="mv-toolbar">
          {renderContentTabs()}
          <div className="mv-search">
            <Search size={14} aria-hidden="true" />
            <input
              className="nx-input"
              value={filters.search}
              onChange={(event) => setFilters({ ...filters, search: event.target.value })}
              placeholder="搜索会议名称或参会人"
              aria-label="搜索会议"
            />
          </div>
          <label className="mv-sort">
            <select
              className="nx-select"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              aria-label="排序方式"
            >
              <option value="frequency">按频率分组</option>
              <option value="nextDate">按下次会议</option>
              <option value="lastDate">按最近历史</option>
              <option value="name">按名称</option>
              <option value="custom">自定义排序</option>
            </select>
          </label>
          <span className="mv-count" title="当前显示的会议数 / 总数 · 单次总时长">
            {displayedMeetings.length} / {meetings.length}
            {displayedMeetings.length > 0
              ? ` · 共 ${Math.round(displayedMeetings.reduce((total, meeting) => total + (Number(meeting.duration) || 0), 0) / 60 * 10) / 10}h`
              : ''}
          </span>
          <button className="nx-btn nx-btn-primary" onClick={onCreateMeeting} type="button">
            <Plus />
            新建会议
          </button>
          <div className="mv-more" ref={moreMenuRef}>
            <button
              className={moreMenuOpen ? 'nx-btn nx-btn-outline mv-more-open' : 'nx-btn nx-btn-outline'}
              onClick={() => setMoreMenuOpen((current) => !current)}
              type="button"
              aria-label="更多操作"
            >
              <MoreHorizontal size={15} />
            </button>
            {moreMenuOpen ? (
              <div className="nx-card mv-more-popover">
                <button
                  className="mv-more-item"
                  onClick={() => {
                    setMoreMenuOpen(false)
                    setShowFilters((value) => !value)
                  }}
                  type="button"
                >
                  <Filter size={15} />
                  {showFilters ? '收起筛选' : '高级筛选'}
                </button>
                <button
                  className="mv-more-item"
                  onClick={() => {
                    setMoreMenuOpen(false)
                    onBatchImport()
                  }}
                  type="button"
                >
                  <Download size={15} />
                  批量导入历史
                </button>
                <button
                  className="mv-more-item"
                  onClick={() => {
                    setMoreMenuOpen(false)
                    onGoToPlanner()
                  }}
                  type="button"
                >
                  <CalendarRange size={15} />
                  去排程
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mv-chips" role="toolbar" aria-label="快捷筛选">
          {Object.entries(FREQUENCY_LABELS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={isFrequencySummaryActive(key) ? 'mv-chip mv-chip-active' : 'mv-chip'}
              onClick={() => toggleFrequencySummary(key)}
              aria-pressed={isFrequencySummaryActive(key)}
            >
              {label} {groupedSummary[key] ?? 0}
            </button>
          ))}
          <span className="mv-chip-divider" aria-hidden="true" />
          {[
            ['notes', '有备注'],
            ['linked', '有依赖'],
            ['history', '有记录'],
            ['review', '待复核'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={quickFilter === key ? 'mv-chip mv-chip-active' : 'mv-chip'}
              onClick={() => {
                setQuickFilter((current) => (current === key ? 'all' : key))
                selectNavigatorFilter({ type: 'all', key: 'all' })
              }}
              aria-pressed={quickFilter === key}
            >
              {label} {quickFilterCounts[key]}
            </button>
          ))}
          {activeFilterTags.length > 0 ? (
            <>
              <span className="mv-chip-divider" aria-hidden="true" />
              {activeFilterTags.map((tag) => (
                <span key={tag.key} className="nx-badge nx-badge-accent">{tag.label}</span>
              ))}
              <button className="mv-chip mv-chip-clear" onClick={() => setFilters(defaultFilters)} type="button">
                <X size={12} />
                清除筛选
              </button>
            </>
          ) : null}
          {sortBy === 'custom' && !canDrag ? (
            <span className="mv-chip-hint">筛选状态下禁用拖拽排序</span>
          ) : null}
        </div>

        {showFilters ? (
          <div className="mv-filter-layer">
            <FilterPanel
              open={showFilters}
              filters={filters}
              onChange={(nextFilters) => {
                setFilters(nextFilters)
                setShowFilters(false)
              }}
              onReset={() => setFilters(defaultFilters)}
            />
          </div>
        ) : null}

        <div className="mv-table-head" aria-hidden="true">
          <span>会议</span>
          <span>类型</span>
          <span>下次</span>
          <span>时长</span>
          <span>参会人</span>
          <span>信号</span>
          <span />
        </div>
        <div className="mv-list">
          {displayedMeetings.map((meeting) => renderMeetingRow(meeting))}
          {displayedMeetings.length === 0 ? (
            <div className="mv-list-empty">
              <p>{meetings.length === 0 ? '还没有会议，建议先新建一条会议资料。' : '当前筛选下没有会议。'}</p>
              <div className="mv-list-empty-actions">
                <button className="nx-btn nx-btn-primary" onClick={onCreateMeeting} type="button">
                  <Plus />
                  新建会议
                </button>
                {meetings.length === 0 ? (
                  <button className="nx-btn nx-btn-outline" onClick={onBatchImport} type="button">
                    <Download />
                    导入历史记录
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {renderMeetingInspector()}
    </div>
  )
}
