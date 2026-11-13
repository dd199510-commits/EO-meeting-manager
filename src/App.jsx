import { scopedLocalStorage, scopedSessionStorage, decodeStorageEventKey } from './lib/scopedStorage.js'
import { Component, lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2 } from 'lucide-react'
import './App.css'
import './styles/index.css'
import { TaskContextBar } from './components/TaskContextBar'
import { persistJson, inspectStoredJson, getPersistenceStatus, PERSISTENCE_EVENT, commitStorageTransaction, pauseForExternalChange } from './lib/persistence'
import { scheduleSignature, updateSchedulePreservingNotices } from './lib/workflow'
import { createNoticeSentRecord, getNoticeDeliveryState } from './lib/noticeRevision'
import './styles/operations.css'
import './styles/dispatch.css'
import './styles/polish.css'
import './styles/air-workspace.css'
import './styles/dispatch-design.css'
import './styles/review-design.css'
import './styles/analysis-empty.css'
import { AppSidebar } from './components/AppSidebar'
import { FeedbackHost, confirmDialog, toast } from './components/Feedback'
import {
  AI_STORAGE_KEY,
  STORAGE_KEY,
  createEmptyMeeting,
  LOG_STORAGE_KEY,
  normalizeMeeting,
  REVIEW_STORAGE_KEY,
} from './data/meetingData'
import { BatchImportModal } from './features/batchImport/BatchImportModal'
import { ContactsView } from './features/contacts/ContactsView'
import { HomeView } from './features/home/HomeView'
import { LogsView } from './features/logs/LogsView'
import { createLog, readLogs } from './features/logs/logUtils'
import { MeetingsView } from './features/meetings/MeetingsView'
import { EditModal } from './features/meetings/EditModal'
import { normalizeNoticeTemplates } from './features/reserveNotice/notificationTemplates'
import { normalizeNoticeSettingsStore } from './features/reserveNotice/noticeSettings'
import {
  DEFAULT_REVIEW_STATE,
  normalizeReviewState,
  importAiScheduleToReview,
  readReviewState,
} from './features/review/reviewUtils'
import { TrashView } from './features/trash/TrashView'
import {
  normalizePlanningInputMeetings,
  normalizePlanningRange,
} from './features/planner/planningTaskData'
import { detectConflicts } from './lib/conflicts'
import { normalizeContact, resolveAttendeeRefs } from './lib/contacts'
import { calculateNextOccurrence, syncMeetingAnchorDate } from './lib/meetingFrequency'
import { persistStorage, readStorage } from './lib/storage'
import { APP_VERSION_LABEL, BACKUP_SCHEMA_VERSION } from './lib/appVersion'
import { readModuleBackupData, saveRecoveryPoint, readRecoveryPoint, getModuleStorageEntries, recordBackupTime, readBackupTime } from './lib/backupData'
import {
  DEFAULT_AI_STATE,
  normalizeAiState,
  readAiState,
} from './features/aiScheduler/aiSchedulerUtils'

const PlanningWorkbench = lazy(() => import('./features/planner/PlanningWorkbench').then((module) => ({ default: module.PlanningWorkbench })))
const ReviewBoard = lazy(() => import('./features/review/ReviewBoard').then((module) => ({ default: module.ReviewBoard })))
const ReserveNoticeBoard = lazy(() => import('./features/reserveNotice/ReserveNoticeBoard').then((module) => ({ default: module.ReserveNoticeBoard })))
const OutlookInviteBoard = lazy(() => import('./features/outlookInvite/OutlookInviteBoard').then((module) => ({ default: module.OutlookInviteBoard })))
const TimeAnalysisWorkbench = lazy(() => import('./features/timeAnalysis').then((module) => ({ default: module.TimeAnalysisWorkbench })))

const PLANNING_TASKS_STORAGE_KEY = 'meeting-manager:planning-tasks:v1'
const RESERVE_NOTICE_SCHEME_STATUS_KEY = 'meeting-manager:reserve-notice-scheme-status:v1'
const RESERVE_NOTICE_SCHEME_SETTINGS_KEY = 'meeting-manager:reserve-notice-scheme-settings:v1'

class PlannerErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidUpdate(previousProps) {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="panel empty-state">
          <CalendarDays size={28} />
          <h3>这个排程任务的数据暂时无法显示</h3>
          <p>系统已拦截异常数据，其他页面不受影响。返回任务中心后可重新生成清单。</p>
          <button type="button" className="primary-button" onClick={this.props.onReset}>
            返回排程任务中心
          </button>
        </section>
      )
    }

    return this.props.children
  }
}

function normalizePlanningTask(task) {
  const now = new Date().toISOString()
  const normalizedAiState = task?.aiState ? normalizeAiState(task.aiState) : null
  const normalizedInputMeetings = normalizePlanningInputMeetings(normalizedAiState?.inputMeetings)
  const aiState = normalizedAiState
    ? {
        ...normalizedAiState,
        inputMeetings: normalizedInputMeetings,
      }
    : null
  const range = normalizePlanningRange(task?.timeRange) ?? normalizedInputMeetings?.timeRange ?? null
  const generatedCount = normalizedInputMeetings?.meetings.length ?? 0

  return {
    id: task?.id || `planning-task-${crypto.randomUUID()}`,
    name: task?.name || (range ? `${range.start} 至 ${range.end}` : '未命名排程任务'),
    status: task?.status || 'draft',
    confirmedAt: task?.confirmedAt || '',
    confirmationSignature: task?.confirmationSignature || '',
    timeRange: range,
    aiState,
    reviewState: task?.reviewState ? normalizeReviewState(task.reviewState) : null,
    generatedCount: Number.isFinite(Number(task?.generatedCount))
      ? Math.max(0, Number(task.generatedCount))
      : generatedCount,
    scheduledCount: Number(task?.scheduledCount ?? task?.reviewState?.scheduledMeetings?.length ?? 0),
    createdAt: task?.createdAt || now,
    updatedAt: task?.updatedAt || now,
  }
}

function readPlanningTasks() {
  try {
    const parsed = JSON.parse(scopedLocalStorage.getItem(PLANNING_TASKS_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.map(normalizePlanningTask) : []
  } catch {
    return []
  }
}

function persistPlanningTasks(tasks) {
  return persistJson(PLANNING_TASKS_STORAGE_KEY, tasks)
}

function readReserveNoticeSchemeStatus() {
  try {
    const parsed = JSON.parse(scopedLocalStorage.getItem(RESERVE_NOTICE_SCHEME_STATUS_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function normalizeReserveNoticeSchemeStatus(input) {
  return input && typeof input === 'object' && !Array.isArray(input) ? input : {}
}

function readReserveNoticeSchemeSettings() {
  try {
    const parsed = JSON.parse(scopedLocalStorage.getItem(RESERVE_NOTICE_SCHEME_SETTINGS_KEY) || '{}')
    return normalizeNoticeSettingsStore(parsed)
  } catch {
    return {}
  }
}

function clearAiPlanningState(state) {
  const normalized = normalizeAiState(state)
  return {
    ...normalized,
    inputMeetings: null,
    exportBatch: null,
    scheduledMeetings: null,
  }
}

function App() {
  const PAGE_META = {
    home: {
      title: '首页',
      description: '会议资产、排程进度、风险提醒与下一步动作',
    },
    meetings: {
      title: '会议库',
      description: '会议资料、回收站与排程准备',
    },
    planner: {
      title: '排程',
      description: '创建排程任务、生成清单并完成排程调整',
    },
    reserveNotice: {
      title: '预留通知',
      description: '选择已排程任务，生成与跟踪预留通知',
    },
    outlookInvite: {
      title: '会邀生成',
      description: '选择已排程任务、日程安排和会议方案，生成 Outlook 批量草稿脚本',
    },
    timeAnalysis: {
      title: '时间分析',
      description: '批量维护会议明细，生成季度趋势、问题会议与排期建议',
    },
    contacts: {
      title: '通讯录',
      description: '维护参会人姓名、邮箱与别名',
    },
    logs: {
      title: '记录',
      description: '会议与排程操作记录',
    },
  }
  const MEETING_TAB_META = {
    active: '会议列表',
    trash: '回收站',
  }
  const LOG_TAB_META = {
    meetings: '会议记录',
    planning: '排程记录',
  }
  const PAGE_IDS = Object.keys(PAGE_META)

  const readInitialTab = () => {
    if (typeof window === 'undefined') return 'home'
    const hashTab = window.location.hash.replace(/^#\/?/, '').split('?')[0]
    return PAGE_IDS.includes(hashTab) ? hashTab : 'home'
  }

  const defaultFilters = {
    search: '',
    frequency: 'all',
    frequencyTypes: [],
    attendee: '',
    timeRange: 'all',
    historyStatus: 'all',
    issue: 'all',
  }

  const initialData = useMemo(() => {
    inspectStoredJson([STORAGE_KEY, AI_STORAGE_KEY, REVIEW_STORAGE_KEY, LOG_STORAGE_KEY,
      PLANNING_TASKS_STORAGE_KEY, RESERVE_NOTICE_SCHEME_STATUS_KEY, RESERVE_NOTICE_SCHEME_SETTINGS_KEY])
    return readStorage()
  }, [])
  const initialPlanningTasks = useMemo(() => readPlanningTasks(), [])
  const initialTask = useMemo(() => {
    try { const id=scopedLocalStorage.getItem('meeting-manager:ui:current-task:v1'); return initialPlanningTasks.find(task=>task.id===id) || null }
    catch { return null }
  }, [initialPlanningTasks])
  const [activeTab, setActiveTabState] = useState(readInitialTab)
  const [meetings, setMeetings] = useState(initialData.meetings)
  const [scheduledMeetings, setScheduledMeetings] = useState(initialData.scheduled)
  const [contacts, setContacts] = useState(initialData.contacts)
  const [noticeTemplates, setNoticeTemplates] = useState(
    normalizeNoticeTemplates(initialData.noticeTemplates),
  )
  const [disabledNoticeTemplateKeys, setDisabledNoticeTemplateKeys] = useState(
    initialData.disabledNoticeTemplateKeys ?? [],
  )
  const [aiState, setAiState] = useState(() => initialTask?.aiState || readAiState(AI_STORAGE_KEY) || DEFAULT_AI_STATE)
  const [reviewState, setReviewState] = useState(
    () => initialTask?.reviewState || readReviewState(REVIEW_STORAGE_KEY) || DEFAULT_REVIEW_STATE,
  )
  const [planningTasks, setPlanningTasks] = useState(initialPlanningTasks)
  const [outlookInviteJobs, setOutlookInviteJobs] = useState([])
  const [reserveNoticeSchemeStatus, setReserveNoticeSchemeStatus] = useState(() => readReserveNoticeSchemeStatus())
  const [reserveNoticeSchemeSettings, setReserveNoticeSchemeSettings] = useState(() => readReserveNoticeSchemeSettings())
  const [currentPlanningTaskId, setCurrentPlanningTaskId] = useState(initialTask?.id || '')
  const selectedNoticeTaskId = currentPlanningTaskId
  const selectedOutlookTaskId = currentPlanningTaskId
  const setSelectedNoticeTaskId = id => setCurrentPlanningTaskId(id === 'current' ? '' : id)
  const setSelectedOutlookTaskId = id => setCurrentPlanningTaskId(id === 'current' ? '' : id)
  const [logs, setLogs] = useState(() => readLogs(LOG_STORAGE_KEY))
  const [filters, setFilters] = useState(defaultFilters)
  const [showFilters, setShowFilters] = useState(false)
  const [planningTab, setPlanningTab] = useState('planner')
  const [meetingTab, setMeetingTab] = useState('active')
  const [logsTab, setLogsTab] = useState('meetings')
  const [editingMeeting, setEditingMeeting] = useState(null)
  const [isEditModalClosing, setIsEditModalClosing] = useState(false)
  const [showBatchImport, setShowBatchImport] = useState(false)
  const [timeAnalysisRevision, setTimeAnalysisRevision] = useState(0)
  const [plannerRecoveryRevision, setPlannerRecoveryRevision] = useState(0)
  const [meetingSearchRevision, setMeetingSearchRevision] = useState(0)

  const [persistence, setPersistence] = useState(getPersistenceStatus)
  const [lastBackupAt, setLastBackupAt] = useState(readBackupTime)
  const [recoveryPoint, setRecoveryPoint] = useState(readRecoveryPoint)
  const [contactsDirty, setContactsDirty] = useState(false)
  const [returnContext, setReturnContext] = useState(null)
  const [requestedStep, setRequestedStep] = useState('')
  const [workflowStage, setWorkflowStage] = useState('prepare')
  const currentTask = planningTasks.find(task => task.id === currentPlanningTaskId) || null

  function setActiveTab(next) {
    const tab = typeof next === 'function' ? next(activeTab) : next
    if (!PAGE_IDS.includes(tab) || tab === activeTab) return
    if (['planner', 'reserveNotice', 'outlookInvite'].includes(tab) && !currentPlanningTaskId && planningTasks.length) selectPlanningTask(planningTasks[0].id)
    if (activeTab === 'contacts' && contactsDirty) {
      confirmDialog({ title: '离开通讯录', message: '当前联系人有未保存修改，放弃修改并离开吗？', confirmLabel: '放弃并离开', danger: true }).then(confirmed => {
        if (confirmed) { setContactsDirty(false); setActiveTabState(tab) }
        else window.history.replaceState(null, '', '#/' + activeTab)
      })
      return
    }
    setActiveTabState(tab)
  }

  function selectPlanningTask(taskId) {
    const task = planningTasks.find(item => item.id === taskId)
    if (!task) { setCurrentPlanningTaskId(''); return }
    setCurrentPlanningTaskId(task.id)
    setSelectedNoticeTaskId(task.id)
    setSelectedOutlookTaskId(task.id)
    setAiState(task.aiState ? normalizeAiState(task.aiState) : clearAiPlanningState(aiState))
    setReviewState(task.reviewState ? normalizeReviewState(task.reviewState) : DEFAULT_REVIEW_STATE)
  }

  function navigateWorkflow(taskId, stage) {
    const task = planningTasks.find(item => item.id === taskId)
    if (!task) { setActiveTab('planner'); return }
    if (taskId !== currentPlanningTaskId) selectPlanningTask(taskId)
    if (stage === 'reserveNotice' || stage === 'outlookInvite') {
      if (task.status !== 'scheduled') {
        toast('请先在审核区确认本次排程，再继续通知和会邀。', 'info')
        setRequestedStep('review'); setActiveTab('planner'); return
      }
      setSelectedNoticeTaskId(taskId); setSelectedOutlookTaskId(taskId); setActiveTab(stage)
    } else { setRequestedStep(stage); setWorkflowStage(stage); setActiveTab('planner') }
  }

  function openWorkflowContacts() {
    setReturnContext({ tab: activeTab, taskId: currentPlanningTaskId, step: workflowStage })
    setActiveTab('contacts')
  }

  function returnToWorkflow(alreadyConfirmed = false) {
    if (!returnContext) return
    if (returnContext.taskId && returnContext.taskId !== currentPlanningTaskId) selectPlanningTask(returnContext.taskId)
    setRequestedStep(returnContext.step)
    if (alreadyConfirmed === true) { setContactsDirty(false); setActiveTabState(returnContext.tab) }
    else setActiveTab(returnContext.tab)
  }

  function handleHomeIssue(issue, taskId) {
    if (issue === 'conflicts') { navigateWorkflow(taskId, 'review'); return }
    if (issue === 'contacts') { openWorkflowContacts(); return }
    setFilters({ ...defaultFilters, issue })
    setMeetingTab('active'); setActiveTab('meetings')
  }

  useEffect(() => {
    const update = () => setPersistence(getPersistenceStatus())
    window.addEventListener(PERSISTENCE_EVENT, update)
    const onStorage = event => {
      const key = decodeStorageEventKey(event.key, event.storageArea)
      if (key && !key.includes(':ui:') && /^meeting-manager(?::|-)/.test(key)) pauseForExternalChange()
    }
    window.addEventListener('storage', onStorage)
    return () => { window.removeEventListener(PERSISTENCE_EVENT, update); window.removeEventListener('storage', onStorage) }
  }, [])

  useEffect(() => {
    if (!currentPlanningTaskId) return
    try { scopedLocalStorage.setItem('meeting-manager:ui:current-task:v1', currentPlanningTaskId) } catch { /* Business save status reports storage issues. */ }
  }, [currentPlanningTaskId])

  useEffect(() => {
    const nextHash = `#/${activeTab}`
    if (window.location.hash !== nextHash) {
      window.history.pushState(null, '', nextHash)
    }
  }, [activeTab])

  useEffect(() => {
    function handleHashChange() {
      const hashTab = window.location.hash.replace(/^#\/?/, '').split('?')[0]
      if (PAGE_IDS.includes(hashTab)) {
        setActiveTab((current) => (current === hashTab ? current : hashTab))
      }
    }

    window.addEventListener('hashchange', handleHashChange)
    window.addEventListener('popstate', handleHashChange)
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
      window.removeEventListener('popstate', handleHashChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    persistStorage({
      meetings,
      scheduled: scheduledMeetings,
      contacts,
      noticeTemplates,
      disabledNoticeTemplateKeys,
    })
  }, [meetings, scheduledMeetings, contacts, noticeTemplates, disabledNoticeTemplateKeys])

  useEffect(() => {
    persistJson(AI_STORAGE_KEY, aiState)
  }, [aiState])

  useEffect(() => {
    persistJson(REVIEW_STORAGE_KEY, reviewState)
  }, [reviewState])

  useEffect(() => {
    persistPlanningTasks(planningTasks)
  }, [planningTasks])

  useEffect(() => {
    persistJson(RESERVE_NOTICE_SCHEME_STATUS_KEY, reserveNoticeSchemeStatus)
  }, [reserveNoticeSchemeStatus])

  useEffect(() => {
    persistJson(RESERVE_NOTICE_SCHEME_SETTINGS_KEY, reserveNoticeSchemeSettings)
  }, [reserveNoticeSchemeSettings])

  useEffect(() => {
    if (!['outlookInvite', 'reserveNotice'].includes(activeTab) || typeof window === 'undefined') return undefined
    if (typeof window.aiScheduler?.listJobs !== 'function') return undefined

    let cancelled = false

    const loadOutlookInviteJobs = async () => {
      try {
        const jobs = await window.aiScheduler.listJobs()
        if (!cancelled) {
          setOutlookInviteJobs(Array.isArray(jobs) ? jobs : [])
        }
      } catch {
        if (!cancelled) setOutlookInviteJobs([])
      }
    }

    loadOutlookInviteJobs()
    const timerId = window.setInterval(loadOutlookInviteJobs, 15000)

    return () => {
      cancelled = true
      window.clearInterval(timerId)
    }
  }, [activeTab])

  useEffect(() => {
    if (!currentPlanningTaskId || reviewState.scheduledMeetings.length === 0) return

    // Keep the existing task snapshot in sync with in-place calendar edits.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlanningTasks((current) =>
      current.map((task) =>
        task.id === currentPlanningTaskId
          ? task.status === 'scheduled' || task.reviewState
            ? normalizePlanningTask({
                ...task,
                status: task.status === 'draft' || task.status === 'list_ready' ? 'reviewing' : task.status,
                reviewState,
                scheduledCount: reviewState.scheduledMeetings.length,
                updatedAt: new Date().toISOString(),
              })
            : task
          : task,
      ),
    )
  }, [currentPlanningTaskId, reviewState])

  useEffect(() => {
    persistJson(LOG_STORAGE_KEY, logs)
  }, [logs])

  useEffect(() => {
    if (planningTab !== 'planner') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlanningTab('planner')
    }
  }, [planningTab])

  const activeMeetings = useMemo(
    () =>
      meetings
        .filter((meeting) => meeting.status === 'active')
        .map((meeting) => {
          const syncedMeeting = syncMeetingAnchorDate(normalizeMeeting(meeting))
          return {
            ...syncedMeeting,
            nextDate: calculateNextOccurrence(syncedMeeting) || '',
          }
        }),
    [meetings],
  )

  const reviewConflicts = useMemo(
    () => detectConflicts(reviewState.scheduledMeetings),
    [reviewState.scheduledMeetings],
  )
  const deletedMeetings = useMemo(
    () => meetings.filter((meeting) => meeting.status === 'deleted'),
    [meetings],
  )
  const meetingTabOptions = Object.entries(MEETING_TAB_META).map(([id, label]) => ({
    id,
    label: id === 'trash' && deletedMeetings.length > 0 ? `${label} (${deletedMeetings.length})` : label,
  }))
  const logTabOptions = Object.entries(LOG_TAB_META).map(([id, label]) => ({ id, label }))
  const activePageTab = activeTab === 'meetings' ? meetingTab : activeTab === 'logs' ? logsTab : ''

  useEffect(() => {
    const key='meeting-manager:ui:scroll:' + activeTab + ':' + activePageTab
    let top=0
    try { top=Number(scopedSessionStorage.getItem(key)) || 0 } catch { /* Use top on first visit. */ }
    const frame=window.requestAnimationFrame(()=>window.scrollTo({top,left:0}))
    return () => {
      window.cancelAnimationFrame(frame)
      try { scopedSessionStorage.setItem(key,String(window.scrollY)) } catch { /* Scroll is optional UI state. */ }
    }
  }, [activeTab,activePageTab])

  function buildImportedQueueJobPayload(reviewPlan) {
    const scheduledList = Array.isArray(reviewPlan?.scheduledMeetings) ? reviewPlan.scheduledMeetings : []
    const unscheduledDetails = Array.isArray(reviewPlan?.aiSummary?.unscheduledMeetingDetails)
      ? reviewPlan.aiSummary.unscheduledMeetingDetails
      : []
    const exportTaskMap = [
      ...scheduledList
        .filter((meeting) => meeting.taskId)
        .map((meeting) => ({
          taskId: meeting.taskId,
          instanceId: meeting.id ?? '',
          meetingId: meeting.meetingId ?? '',
          date: meeting.date ?? '',
        })),
      ...unscheduledDetails
        .filter((meeting) => meeting?.taskId)
        .map((meeting) => ({
          taskId: meeting.taskId,
          instanceId: meeting.instanceId ?? '',
          meetingId: meeting.meetingId ?? '',
          date: meeting.date ?? '',
        })),
    ]

    const dedupedTaskMap = exportTaskMap.filter(
      (item, index, items) => item.taskId && items.findIndex((candidate) => candidate.taskId === item.taskId) === index,
    )

    const importedResult = {
      scheduledMeetings: scheduledList
        .filter((meeting) => meeting.taskId)
        .map((meeting) => ({
          taskId: meeting.taskId,
          date: meeting.date ?? '',
          startTime: meeting.startTime ?? '',
          endTime: meeting.endTime ?? '',
          duration: Number(meeting.duration ?? 0),
          frequency: meeting.frequency ?? 'adhoc',
          ...(meeting.notes ? { notes: meeting.notes } : {}),
          aiReason: meeting.aiReason ?? '导入排程方案',
        })),
      unscheduledMeetings: unscheduledDetails
        .filter((meeting) => meeting?.taskId)
        .map((meeting) => ({
          taskId: meeting.taskId,
          reason: meeting.reason ?? '无',
          ...(meeting.type ? { type: meeting.type } : {}),
        })),
      summary: {
        unscheduledMeetings: reviewPlan?.aiSummary?.unscheduledMeetings ?? unscheduledDetails.length,
      },
    }

    if (!reviewPlan?.sourceInputMeetings?.timeRange || dedupedTaskMap.length === 0) {
      return null
    }

    return {
      provider: 'imported',
      model: '导入方案',
      inputMeetings: reviewPlan.sourceInputMeetings,
      exportBatch: {
        batchId: `imported-${reviewPlan.importedAt ?? Date.now()}`,
        taskMap: dedupedTaskMap,
      },
      result: importedResult,
    }
  }

  function appendLog(actionType, targetName, detail) {
    setLogs((current) => [createLog(actionType, targetName, detail), ...current])
  }

  function upsertPlanningTask(patch) {
    const now = new Date().toISOString()
    const taskId = patch.id || (patch.createNew ? '' : currentPlanningTaskId) || `planning-task-${crypto.randomUUID()}`
    const normalizedPatch = normalizePlanningTask({
      ...patch,
      id: taskId,
      updatedAt: now,
      createdAt: patch.createdAt || now,
    })

    setPlanningTasks((current) => {
      const exists = current.some((task) => task.id === taskId)
      const nextTasks = exists
        ? current.map((task) =>
            task.id === taskId
              ? normalizePlanningTask({
                  ...task,
                  ...patch,
                  id: taskId,
                  createdAt: task.createdAt,
                  updatedAt: now,
                })
              : task,
          )
        : [normalizedPatch, ...current]

      return nextTasks.sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))
    })
    setCurrentPlanningTaskId(taskId)
    return taskId
  }

  function createPlanningTaskFromAiState(payload, fallbackStatus = 'list_ready') {
    const hasExplicitAiState = Object.prototype.hasOwnProperty.call(payload ?? {}, 'aiState')
    const nextAiState = hasExplicitAiState ? payload.aiState : payload
    const status = payload?.status ?? fallbackStatus
    const range = nextAiState?.inputMeetings?.timeRange ?? null
    const isNewDraft = payload?.createNew && status === 'draft'
    const explicitName = String(payload?.name || '').trim()

    const taskId = upsertPlanningTask({
      ...payload,
      aiState: nextAiState,
      status,
      timeRange: payload?.timeRange ?? range,
      ...(explicitName ? { name: explicitName } : {}),
      generatedCount: payload?.generatedCount ?? nextAiState?.inputMeetings?.meetings?.length ?? 0,
    })
    if (isNewDraft) {
      setAiState((current) => clearAiPlanningState(current))
      setReviewState(DEFAULT_REVIEW_STATE)
    }
    return taskId
  }

  function updateCurrentPlanningTaskAiState(nextAiState) {
    if (!currentPlanningTaskId) return

    const normalizedAiState = normalizeAiState(nextAiState)
    const now = new Date().toISOString()

    setPlanningTasks((current) =>
      current.map((task) =>
        task.id === currentPlanningTaskId
          ? normalizePlanningTask({
              ...task,
              aiState: normalizedAiState,
              timeRange: normalizedAiState.inputMeetings?.timeRange ?? task.timeRange,
              generatedCount: normalizedAiState.inputMeetings?.meetings?.length ?? task.generatedCount,
              updatedAt: now,
            })
          : task,
      ),
    )
  }

  function deletePlanningTask(taskId) {
    setPlanningTasks((current) => current.filter((task) => task.id !== taskId))
    if (taskId === currentPlanningTaskId) {
      setCurrentPlanningTaskId('')
      setAiState((current) => clearAiPlanningState(current))
      setReviewState(DEFAULT_REVIEW_STATE)
    }
    if (taskId === selectedNoticeTaskId) {
      setSelectedNoticeTaskId('current')
    }
    if (taskId === selectedOutlookTaskId) {
      setSelectedOutlookTaskId('current')
    }
  }

  function openEditMeeting(meeting) {
    setIsEditModalClosing(false)
    setEditingMeeting(meeting)
  }

  function closeEditMeeting() {
    setIsEditModalClosing(true)
    window.setTimeout(() => {
      setEditingMeeting(null)
      setIsEditModalClosing(false)
    }, 220)
  }

  function updateReviewMeetings(updater) {
    const next=typeof updater==='function'?updater(reviewState.scheduledMeetings):updater
    const changed=scheduleSignature(next)!==scheduleSignature(reviewState.scheduledMeetings)
    const nextReview = updateSchedulePreservingNotices(reviewState,next)
    setReviewState(nextReview)
    if(currentPlanningTaskId) setPlanningTasks(current=>current.map(task=>task.id===currentPlanningTaskId
      ? {...task,reviewState:nextReview,scheduledCount:next.length,
          ...(changed ? {status:'reviewing',confirmedAt:'',confirmationSignature:''} : {}),
          updatedAt:new Date().toISOString()}:task))
  }

  function toggleFinalCheckLinkage(currentState, meetingId) {
    const nextChecked = !currentState.finalCheckStatus?.[meetingId]

    return {
      ...currentState,
      finalCheckStatus: {
        ...(currentState.finalCheckStatus ?? {}),
        [meetingId]: nextChecked,
      },
      scheduledMeetings: currentState.scheduledMeetings.map((meeting) =>
        meeting.meetingId === meetingId ? { ...meeting, locked: nextChecked } : meeting,
      ),
    }
  }

  function toggleReserveNoticeLinkage(currentState, noticeId, snapshot, options = {}) {
    const delivery=getNoticeDeliveryState(currentState.reserveNoticeStatus?.[noticeId],snapshot)
    const nextSent=typeof options.sent === 'boolean' ? options.sent : delivery.status!=='sent'
    const nextRecord=nextSent?createNoticeSentRecord(snapshot):false
    const [scope, scopedId] = String(noticeId).split(':')

    return {
      ...currentState,
      reserveNoticeStatus: {
        ...(currentState.reserveNoticeStatus ?? {}),
        [noticeId]: nextRecord,
      },
      scheduledMeetings: currentState.scheduledMeetings.map((meeting) => {
        if (scope === 'meeting' && meeting.meetingId === scopedId) {
          return { ...meeting, reserved: nextSent }
        }

        if (scope === 'adhoc' && meeting.id === scopedId) {
          return { ...meeting, reserved: nextSent }
        }

        return meeting
      }),
    }
  }

  function handleSaveMeeting(nextMeeting) {
    const isNew = !nextMeeting.id
    const syncedMeeting = syncMeetingAnchorDate({
      ...nextMeeting,
      attendeeRefs: resolveAttendeeRefs(nextMeeting.attendees, contacts),
      extraInviteeRefs: resolveAttendeeRefs(nextMeeting.extraInvitees, contacts),
      secretaryInviteContactIds: Array.isArray(nextMeeting.secretaryInviteContactIds)
        ? nextMeeting.secretaryInviteContactIds
        : [],
      noteMentions: Array.isArray(nextMeeting.noteMentions) ? nextMeeting.noteMentions : [],
    })
    const persistedMeeting = {
      ...syncedMeeting,
      nextDate: calculateNextOccurrence(syncedMeeting) || syncedMeeting.nextDate || '',
    }

    setMeetings((current) => {
      if (!persistedMeeting.id) {
        const maxOrder = Math.max(-1, ...current.map((meeting) => meeting.customOrder ?? 0))
        return [
          ...current,
          {
            ...persistedMeeting,
            id: `m${crypto.randomUUID()}`,
            customOrder: maxOrder + 1,
          },
        ]
      }

      return current.map((meeting) => (meeting.id === persistedMeeting.id ? persistedMeeting : meeting))
    })
    appendLog(
      isNew ? 'create' : 'update',
      persistedMeeting.name || '未命名会议',
      isNew ? '新建会议' : '编辑会议',
    )
    toast(isNew ? `已新建会议「${persistedMeeting.name || '未命名会议'}」` : '会议修改已更新，请留意顶部保存状态')
    closeEditMeeting()
  }

  function refreshMeetingAttendeeRefs(nextContacts) {
    setMeetings((current) =>
      current.map((meeting) => ({
        ...meeting,
        attendeeRefs: resolveAttendeeRefs(meeting.attendees, nextContacts),
        extraInviteeRefs: resolveAttendeeRefs(meeting.extraInvitees, nextContacts),
      })),
    )
  }

  function handleSaveContact(contact) {
    const normalizedContact = normalizeContact(contact)
    const nextContacts = contacts.some((item) => item.id === normalizedContact.id)
      ? contacts.map((item) => (item.id === normalizedContact.id ? normalizedContact : item))
      : [...contacts, normalizedContact]

    setContacts(nextContacts)
    refreshMeetingAttendeeRefs(nextContacts)
    appendLog('update', normalizedContact.name || '未命名联系人', '保存通讯录联系人')
    toast(`联系人「${normalizedContact.name || '未命名联系人'}」已更新，请留意顶部保存状态`)
    return true
  }

  function handleAddContactFromName(name) {
    const trimmedName = String(name || '').trim()
    if (!trimmedName) return

    const nextContact = normalizeContact({
      name: trimmedName,
      email: '',
      aliases: [],
      department: '',
      title: '',
      notes: '',
      status: 'active',
    })

    if (contacts.some((contact) => contact.name.toLowerCase() === trimmedName.toLowerCase())) {
      return
    }

    const nextContacts = [...contacts, nextContact]
    setContacts(nextContacts)
    refreshMeetingAttendeeRefs(nextContacts)
    appendLog('create', trimmedName, '从参会人标签添加到通讯录')
  }

  async function handleDeleteContact(id) {
    const target = contacts.find((contact) => contact.id === id)
    const confirmed = await confirmDialog({
      title: '删除联系人',
      message: `确定删除「${target?.name || '未命名联系人'}」吗？删除后无法恢复，会议中的参会人关联将失效。`,
      confirmLabel: '删除',
      danger: true,
    })
    if (!confirmed) return false

    const nextContacts = contacts.filter((contact) => contact.id !== id)
    setContacts(nextContacts)
    refreshMeetingAttendeeRefs(nextContacts)
    if (target) appendLog('delete', target.name, '从通讯录删除')
    toast(`联系人「${target?.name || '未命名联系人'}」已删除`, 'info')
    return true
  }

  function handleDeleteMeeting(id) {
    const target = meetings.find((meeting) => meeting.id === id)
    setMeetings((current) =>
      current.map((meeting) => (meeting.id === id ? { ...meeting, status: 'deleted' } : meeting)),
    )
    if (target) {
      appendLog('delete', target.name, '移入回收站')
      toast(`「${target.name}」已移入回收站，可随时恢复`, 'info')
    }
  }

  function formatExportTimestamp(date = new Date()) {
    const pad = (value) => String(value).padStart(2, '0')

    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      '-',
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds()),
    ].join('')
  }

  function buildSystemBackupPayload() {
    const exportedMeetings = meetings.map((meeting) => ({
      ...meeting,
      attendeeRefs: resolveAttendeeRefs(meeting.attendees, contacts),
      extraInviteeRefs: resolveAttendeeRefs(meeting.extraInvitees, contacts),
    }))

    return {
      version: APP_VERSION_LABEL,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      meetings: exportedMeetings,
      scheduled: scheduledMeetings,
      contacts,
      noticeTemplates,
      disabledNoticeTemplateKeys,
      logs,
      aiState,
      reviewState,
      planningTasks,
      reserveNoticeSchemeStatus,
      reserveNoticeSchemeSettings,
      moduleData: readModuleBackupData(),
    }
  }

  function handleExport() {
    const exportPayload = buildSystemBackupPayload()

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `meeting-manager-export-${formatExportTimestamp()}.json`
    link.click()
    URL.revokeObjectURL(url)
    setLastBackupAt(recordBackupTime())
    toast('完整系统备份已导出（含时间分析与本地任务数据）')
  }

  function normalizeSystemBackup(parsed) {
    if (!parsed || typeof parsed !== 'object') throw new Error('文件格式不正确')
    const importedMeetings=Array.isArray(parsed)?parsed:parsed.meetings
    if (!Array.isArray(importedMeetings)) throw new Error('文件中未找到 meetings 数据')
    if (importedMeetings.some(meeting=>!meeting || typeof meeting!=='object')) throw new Error('会议记录格式不正确')
    const importedContacts=Array.isArray(parsed.contacts)?parsed.contacts.map(normalizeContact):contacts
    const nextMeetings=importedMeetings.map(meeting=>{
      const normalized=normalizeMeeting(meeting)
      return {...normalized,attendeeRefs:resolveAttendeeRefs(normalized.attendees,importedContacts),extraInviteeRefs:resolveAttendeeRefs(normalized.extraInvitees,importedContacts)}
    })
    return {
      meetings:nextMeetings,scheduled:Array.isArray(parsed.scheduled)?parsed.scheduled:[],contacts:importedContacts,
      noticeTemplates:normalizeNoticeTemplates(parsed.noticeTemplates),
      disabledNoticeTemplateKeys:Array.isArray(parsed.disabledNoticeTemplateKeys)?parsed.disabledNoticeTemplateKeys:[],
      logs:Array.isArray(parsed.logs)?parsed.logs:[],
      aiState:parsed.aiState?normalizeAiState(parsed.aiState):DEFAULT_AI_STATE,
      reviewState:parsed.reviewState?normalizeReviewState(parsed.reviewState):DEFAULT_REVIEW_STATE,
      planningTasks:Array.isArray(parsed.planningTasks)?parsed.planningTasks.map(normalizePlanningTask):[],
      reserveNoticeSchemeStatus:normalizeReserveNoticeSchemeStatus(parsed.reserveNoticeSchemeStatus),
      reserveNoticeSchemeSettings:normalizeNoticeSettingsStore(parsed.reserveNoticeSchemeSettings),
      moduleData:parsed.moduleData,
    }
  }

  function applySystemBackup(next) {
    const entries=[
      [STORAGE_KEY,{meetings:next.meetings,scheduled:next.scheduled,contacts:next.contacts,noticeTemplates:next.noticeTemplates,disabledNoticeTemplateKeys:next.disabledNoticeTemplateKeys}],
      [AI_STORAGE_KEY,next.aiState],[REVIEW_STORAGE_KEY,next.reviewState],[LOG_STORAGE_KEY,next.logs],
      [PLANNING_TASKS_STORAGE_KEY,next.planningTasks],
      [RESERVE_NOTICE_SCHEME_STATUS_KEY,next.reserveNoticeSchemeStatus],
      [RESERVE_NOTICE_SCHEME_SETTINGS_KEY,next.reserveNoticeSchemeSettings],
      ...getModuleStorageEntries(next.moduleData),
      ['meeting-manager:time-analysis-import-undo:v1', null],
    ]
    commitStorageTransaction(entries)
    setCurrentPlanningTaskId('');setSelectedNoticeTaskId('current');setSelectedOutlookTaskId('current')
    try { scopedLocalStorage.removeItem('meeting-manager:ui:current-task:v1') } catch { /* No selected task after restore. */ }
    setMeetings(next.meetings);setScheduledMeetings(next.scheduled);setContacts(next.contacts)
    setNoticeTemplates(next.noticeTemplates);setDisabledNoticeTemplateKeys(next.disabledNoticeTemplateKeys)
    setLogs(next.logs);setAiState(next.aiState);setReviewState(next.reviewState);setPlanningTasks(next.planningTasks)
    setReserveNoticeSchemeStatus(next.reserveNoticeSchemeStatus);setReserveNoticeSchemeSettings(next.reserveNoticeSchemeSettings)
    setTimeAnalysisRevision(current=>current+1);setContactsDirty(false)
  }

  async function handleUndoRestore() {
    const point=readRecoveryPoint()
    if(!point) {toast('没有可恢复的快照','info');return}
    const next=normalizeSystemBackup(point.payload)
    const confirmed=await confirmDialog({title:'撤销上次恢复',message:'将恢复到 '+new Date(point.savedAt).toLocaleString('zh-CN')+' 的快照（'+next.meetings.length+' 条会议）。当前工作将另存为新的恢复快照。',confirmLabel:'恢复快照',danger:true})
    if(!confirmed)return
    const current=buildSystemBackupPayload()
    if(!saveRecoveryPoint(current)){toast('无法保留当前数据，请先导出备份并释放本地空间','error');return}
    try {applySystemBackup(next);setRecoveryPoint(readRecoveryPoint());toast('已恢复快照，当前工作也已保留，可再次撤销')}
    catch(error){toast(error.message,'error')}
  }

  function handleImportData() {
    const input=document.createElement('input');input.type='file';input.accept='.json,application/json'
    input.onchange=async event=>{
      const file=event.target.files?.[0];if(!file)return
      try {
        if(file.size>50*1024*1024)throw new Error('文件超过 50 MB，请确认选择的是系统备份')
        const parsed=JSON.parse(await file.text())
        const next=normalizeSystemBackup(parsed)
        const backupDate=parsed.exportedAt?new Date(parsed.exportedAt).toLocaleString('zh-CN'):'旧版备份'
        const confirmed=await confirmDialog({title:'预览系统备份',
          message:'备份时间 '+backupDate+'\n会议 '+meetings.length+' → '+next.meetings.length+' 条\n联系人 '+contacts.length+' → '+next.contacts.length+' 位\n排程任务 '+planningTasks.length+' → '+next.planningTasks.length+' 个\n将覆盖当前测试版数据，恢复前会保留快照，可从右上角 EO 菜单撤销。',confirmLabel:'保留快照并恢复',danger:true})
        if(!confirmed)return
        if(!saveRecoveryPoint(buildSystemBackupPayload()))throw new Error('本地空间不足，未能保留恢复前快照。请先导出当前工作再释放空间。')
        applySystemBackup(next)
        setRecoveryPoint(readRecoveryPoint())
        appendLog('import','系统备份','恢复系统备份，共 '+next.meetings.length+' 条会议，恢复前快照可撤销')
        toast('测试版备份已恢复。可在右上角 EO 菜单选择“撤销上次恢复”。')
      }catch(error){toast('恢复未完成：'+error.message,'error')}
    }
    input.click()
  }

  function handleExportReviewPlan() {
    const exportPayload = {
      version: APP_VERSION_LABEL,
      exportedAt: new Date().toISOString(),
      reviewState,
    }

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'review-schedule-plan.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  function handleImportReviewPlan() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'

    input.onchange = async (event) => {
      const file = event.target.files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const parsed = JSON.parse(text)
        const importedReview = parsed.reviewState ?? parsed
        if (!importedReview || typeof importedReview !== 'object' || !Array.isArray(importedReview.scheduledMeetings)) {
          toast('导入失败：文件中未找到有效的审核排程数据', 'error')
          return
        }
        const normalized = normalizeReviewState(importedReview)
        if (reviewState.scheduledMeetings.length > 0 || normalized.scheduledMeetings.length === 0) {
          const confirmed = await confirmDialog({
            title: '替换当前审核排程',
            message: `当前审核区有 ${reviewState.scheduledMeetings.length} 场会议，导入后将替换为 ${normalized.scheduledMeetings.length} 场。${normalized.scheduledMeetings.length === 0 ? '文件中的排程为空，继续将清空审核区。' : '导入的排程需要重新审核确认。'}`,
            confirmLabel: normalized.scheduledMeetings.length === 0 ? '确认清空审核区' : '确认替换并审核',
            danger: true,
          })
          if (!confirmed) return
        }

        setReviewState(normalized)
        upsertPlanningTask({
          reviewState: normalized,
          status: 'reviewing',
          confirmedAt: '',
          confirmationSignature: '',
          timeRange: normalized.sourceInputMeetings?.timeRange ?? null,
          scheduledCount: normalized.scheduledMeetings.length,
          generatedCount: normalized.sourceInputMeetings?.meetings?.length ?? normalized.scheduledMeetings.length,
        })
        if (typeof window !== 'undefined' && typeof window.aiScheduler?.registerImportedJob === 'function') {
          const importedJobPayload = buildImportedQueueJobPayload(normalized)
          if (importedJobPayload) {
            try {
              await window.aiScheduler.registerImportedJob(importedJobPayload)
            } catch (queueError) {
              console.error('register imported review plan failed', queueError)
            }
          }
        }
        appendLog('review_import', '审核排程', `导入 ${normalized.scheduledMeetings.length} 条排程方案`)
        toast(`审核排程方案导入完成，共 ${normalized.scheduledMeetings.length} 条`)
      } catch (error) {
        toast(`导入失败：${error.message}`, 'error')
      }
    }

    input.click()
  }

  function importAiStateToReview(nextAiState) {
    const nextReview = importAiScheduleToReview(nextAiState)
    setReviewState(nextReview)
    upsertPlanningTask({
      aiState: nextAiState,
      reviewState: nextReview,
      status: 'reviewing',
      confirmedAt: '',
      confirmationSignature: '',
      timeRange: nextAiState?.inputMeetings?.timeRange ?? nextReview.sourceInputMeetings?.timeRange ?? null,
      generatedCount: nextAiState?.inputMeetings?.meetings?.length ?? 0,
      scheduledCount: nextReview.scheduledMeetings.length,
    })
    appendLog(
      'review_import',
      '审核排程',
      `导入 ${nextReview.scheduledMeetings.length} 条 AI 排程结果`,
    )

    setPlanningTab('planner')
  }

  function renderReviewBoard(onGoToPlannerStep = () => setPlanningTab('planner')) {
    return (
      <ReviewBoard
        key={currentPlanningTaskId || 'new'}
        taskId={currentPlanningTaskId}
        taskStatus={currentTask?.status || ''}
        onConfirmSchedule={async () => {
          if(!currentTask) { toast('请先选择排程任务','error');return false }
          const confirmedAt=new Date().toISOString()
          setPlanningTasks(current=>current.map(task=>task.id===currentPlanningTaskId
            ? normalizePlanningTask({...task,status:'scheduled',reviewState,confirmedAt,confirmationSignature:scheduleSignature(reviewState.scheduledMeetings),updatedAt:confirmedAt}):task))
          appendLog('review','确认排程',currentTask.name+' 已完成审核确认')
          toast('排程已确认，可以继续生成预留通知')
          return true
        }}
        onContinueToNotice={() => {setSelectedNoticeTaskId(currentPlanningTaskId);setActiveTab('reserveNotice')}}
        meetings={meetings}
        scheduledMeetings={reviewState.scheduledMeetings}
        reviewState={reviewState}
        conflicts={reviewConflicts}
        onGoToPlannerStep={onGoToPlannerStep}
        onToggleLocked={(id) => {
          const target = reviewState.scheduledMeetings.find((meeting) => meeting.id === id)
          updateReviewMeetings((meetingsList) =>
            meetingsList.map((meeting) =>
              meeting.id === id ? { ...meeting, locked: !meeting.locked } : meeting,
            ),
          )
          if (target) appendLog('review', target.name, '切换锁定状态')
        }}
        onToggleReserved={(id) => {
          const target = reviewState.scheduledMeetings.find((meeting) => meeting.id === id)
          updateReviewMeetings((meetingsList) =>
            meetingsList.map((meeting) =>
              meeting.id === id ? { ...meeting, reserved: !meeting.reserved } : meeting,
            ),
          )
          if (target) appendLog('review', target.name, '切换预留状态')
        }}
        onDeleteMeeting={(id) => {
          const target = reviewState.scheduledMeetings.find((meeting) => meeting.id === id)
          updateReviewMeetings((meetingsList) => meetingsList.filter((meeting) => meeting.id !== id))
          if (target) appendLog('review_delete', target.name, '从审核区删除')
        }}
        onMoveMeeting={(id, date, startTime, endTime) => {
          const target = reviewState.scheduledMeetings.find((meeting) => meeting.id === id)
          updateReviewMeetings((meetingsList) =>
            meetingsList.map((meeting) =>
              meeting.id === id ? { ...meeting, date, startTime, endTime } : meeting,
            ),
          )
          if (target) appendLog('review_move', target.name, `调整到 ${date} ${startTime}-${endTime}`)
        }}
        onLockAll={() => {
          updateReviewMeetings((meetingsList) => meetingsList.map((meeting) => ({ ...meeting, locked: true })))
          appendLog('review', '审核区', '全部锁定')
        }}
        onUnlockAll={() => {
          updateReviewMeetings((meetingsList) => meetingsList.map((meeting) => ({ ...meeting, locked: false })))
          appendLog('review', '审核区', '全部解锁')
        }}
        onReserveAll={() => {
          updateReviewMeetings((meetingsList) => meetingsList.map((meeting) => ({ ...meeting, reserved: true })))
          appendLog('review', '审核区', '全部预留')
        }}
        onUnreserveAll={() => {
          updateReviewMeetings((meetingsList) => meetingsList.map((meeting) => ({ ...meeting, reserved: false })))
          appendLog('review', '审核区', '取消全部预留')
        }}
        onAddMeeting={(meeting) => {
          updateReviewMeetings((meetingsList) => [...meetingsList, meeting])
          const actionLabel =
            meeting.addSource === 'linked'
              ? '从会议列表补进'
              : meeting.addSource === 'review-checklist' || meeting.addSource === 'final-check'
                ? '检查清单补进'
                : '新增临时日程'
          appendLog('review', meeting.name, `${actionLabel} ${meeting.date} ${meeting.startTime}-${meeting.endTime}`)
        }}
        onExportPlan={handleExportReviewPlan}
        onImportPlan={handleImportReviewPlan}
        onToggleChecked={(meetingId) => {
          const target = meetings.find((meeting) => meeting.id === meetingId)
          const nextChecked = !reviewState.finalCheckStatus?.[meetingId]
          setReviewState((current) => toggleFinalCheckLinkage(current, meetingId))
          if (target) {
            appendLog(
              'review',
              target.name,
              nextChecked ? '检查清单已确认，审核排程自动锁定' : '取消检查确认，审核排程自动解锁',
            )
          }
        }}
        onRestoreMissingInstance={({ meeting, date, startTime, endTime }) => {
          const restoredMeeting = {
            id: `review-restored-${crypto.randomUUID()}`,
            taskId: '',
            meetingId: meeting.id,
            name: meeting.name,
            date,
            startTime,
            endTime,
            duration: meeting.duration,
            attendees: meeting.attendees ?? '',
            notes: meeting.notes ?? '',
            noteMentions: meeting.noteMentions ?? [],
            frequency: meeting.frequency?.type ?? 'adhoc',
            sourceFrequency: meeting.frequency ?? null,
            sourceAnchorDate: meeting.frequency?.anchorDate ?? '',
            aiReason: '检查清单补进',
            locked: false,
            reserved: false,
            manuallyAdded: false,
            restoredFromFinalCheck: true,
            addSource: 'review-checklist',
          }
          updateReviewMeetings((meetingsList) => [...meetingsList, restoredMeeting])
          appendLog('review', meeting.name, `检查清单补进方案 ${date} ${startTime}-${endTime}`)
        }}
      />
    )
  }

  function renderReserveNoticeBoard() {
    const noticeTaskOptions = buildScheduledTaskOptions()
    const selectedNoticeTask =
      planningTasks.find((task) => task.id === selectedNoticeTaskId) ??
      planningTasks.find((task) => task.id === noticeTaskOptions[0]?.id)
    const noticeSchemeOptions = buildOutlookSchemeOptions(selectedNoticeTask).map((scheme) => ({
      ...scheme,
      reserveNoticeStatus:
        scheme.source === 'review'
          ? selectedNoticeTask?.reviewState?.reserveNoticeStatus ?? {}
          : reserveNoticeSchemeStatus[scheme.id] ?? {},
      reserveNoticeSettings: reserveNoticeSchemeSettings[scheme.id] ?? {},
    }))

    return (
      <ReserveNoticeBoard
        meetings={meetings}
        schemeOptions={noticeSchemeOptions}
        noticeTaskOptions={noticeTaskOptions}
        selectedTaskId={selectedNoticeTask?.id ?? ''}
        onTaskChange={selectPlanningTask}
        onBackToReview={() => navigateWorkflow(selectedNoticeTask?.id, 'review')}
        onContinueToInvite={() => navigateWorkflow(selectedNoticeTask?.id, 'outlookInvite')}
        onResolveContacts={openWorkflowContacts}
        onGoToPlanner={() => {
          setActiveTab('planner')
          setPlanningTab('planner')
        }}
        noticeTemplates={noticeTemplates}
        disabledNoticeTemplateKeys={disabledNoticeTemplateKeys}
        onUpdateMeeting={(meetingId, patch) => {
          setMeetings((current) =>
            current.map((meeting) =>
              meeting.id === meetingId
                ? {
                    ...meeting,
                    ...patch,
                    notificationConfig: patch.notificationConfig ?? meeting.notificationConfig ?? {},
                  }
                : meeting,
            ),
          )
          const target = meetings.find((meeting) => meeting.id === meetingId)
          if (target) {
            appendLog('update', target.name, '更新通知设置')
          }
        }}
        onUpdateAdhocNoticeSettings={(rowId, settings, selectedScheme) => {
          const schemeId = selectedScheme?.id
          if (!schemeId) return

          setReserveNoticeSchemeSettings((current) => ({
            ...current,
            [schemeId]: {
              ...(current[schemeId] ?? {}),
              [rowId]: settings,
            },
          }))
          const target = selectedScheme.scheduledMeetings?.find(
            (meeting) => `adhoc:${meeting.id}` === rowId || `meeting:${meeting.meetingId}` === rowId,
          )
          appendLog('update', target?.name ?? '不定期会议', '保存本次排程的独立通知设置')
          toast('通知设置已保存到本次排程，不会修改会议库')
        }}
        onSaveTemplates={({ templates, disabledBuiltInKeys }) => {
          setNoticeTemplates(templates)
          setDisabledNoticeTemplateKeys(disabledBuiltInKeys)
          appendLog(
            'update',
            '通知模板库',
            `保存 ${templates.length} 个通知模板，删除 ${disabledBuiltInKeys.length} 个默认模板`,
          )
        }}
        onToggleSent={(scheduledMeetingId, selectedScheme, snapshot, options = {}) => {
          const activeScheduledMeetings = selectedScheme?.scheduledMeetings ?? []
          const activeReserveNoticeStatus = selectedScheme?.reserveNoticeStatus ?? {}
          const [scope, scopedId] = String(scheduledMeetingId).split(':')
          const target =
            scope === 'meeting'
              ? meetings.find((meeting) => meeting.id === scopedId)
              : activeScheduledMeetings.find((meeting) => meeting.id === scopedId)
          const nextSent=typeof options.sent === 'boolean' ? options.sent : getNoticeDeliveryState(activeReserveNoticeStatus?.[scheduledMeetingId],snapshot).status!=='sent'
          const nextRecord=nextSent?createNoticeSentRecord(snapshot):false

          if (selectedNoticeTask && selectedScheme?.source === 'review') {
            const nextTaskReview = toggleReserveNoticeLinkage(selectedNoticeTask.reviewState, scheduledMeetingId, snapshot, options)
            setPlanningTasks((current) =>
              current.map((task) =>
                task.id === selectedNoticeTask.id
                  ? normalizePlanningTask({ ...task, reviewState: nextTaskReview, updatedAt: new Date().toISOString() })
                  : task,
              ),
            )
            if (selectedNoticeTask.id === currentPlanningTaskId) setReviewState(nextTaskReview)
          } else {
            const schemeId = selectedScheme?.id ?? 'unknown'
            setReserveNoticeSchemeStatus((current) => ({
              ...current,
              [schemeId]: {
                ...(current[schemeId] ?? {}),
                [scheduledMeetingId]: nextRecord,
              },
            }))
          }

          if (target) {
            appendLog(
              'review',
              target.name,
              nextSent ? '预留通知已发送，审核排程自动标记预留' : '取消预留通知已发送，审核排程自动取消预留',
            )
          }
        }}
      />
    )
  }

  function isUsableOutlookInviteJob(job) {
    return (
      job?.planningTaskId &&
      job.status === 'completed' &&
      job.result &&
      job.inputMeetings &&
      job.exportBatch
    )
  }

  function buildScheduledTaskOptions() {
    const taskIdsWithSchemes = new Set(
      outlookInviteJobs
        .filter(isUsableOutlookInviteJob)
        .map((job) => job.planningTaskId),
    )
    const scheduledPlanningTasks = planningTasks.filter(
      (task) => task.reviewState?.scheduledMeetings?.length > 0 || taskIdsWithSchemes.has(task.id),
    )

    return scheduledPlanningTasks.map((task) => ({
        id: task.id,
        name: task.name,
        status: ({scheduled:'已确认排程',reviewing:'待审核确认',draft:'草稿',list_ready:'清单已准备',ai_running:'方案生成中',ai_done:'待选择方案'})[task.status] || '待处理',
        scheduledCount: task.scheduledCount,
        updatedAt: task.updatedAt,
      }))
  }

  function getOutlookSchemeProviderLabel(job) {
    const labels = {
      imported: '导入方案',
      gemini: 'Gemini',
      openai: 'OpenAI',
      deepseek: 'DeepSeek',
    }

    return labels[job?.provider] ?? job?.provider ?? 'AI 方案'
  }

  function formatOutlookSchemeTime(value) {
    const date = value ? new Date(value) : null
    if (!date || Number.isNaN(date.getTime())) return ''

    const pad = (number) => String(number).padStart(2, '0')
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  function buildOutlookSchemeOptions(task) {
    if (!task) return []

    const adoptedMeetings = task.reviewState?.scheduledMeetings ?? []
    const adoptedOption =
      adoptedMeetings.length > 0
        ? [{
            id: `${task.id}:review`,
            label: `已采用方案（${adoptedMeetings.length} 会）`,
            source: 'review',
            confirmed: task.status === 'scheduled',
            scheduledMeetings: adoptedMeetings,
          }]
        : []

    const jobOptions = outlookInviteJobs
      .filter((job) => isUsableOutlookInviteJob(job) && job.planningTaskId === task.id)
      .map((job) => {
        let reviewFromJob = DEFAULT_REVIEW_STATE

        try {
          reviewFromJob = importAiScheduleToReview({
            inputMeetings: job.inputMeetings,
            exportBatch: job.exportBatch,
            scheduledMeetings: job.result,
          })
        } catch {
          return null
        }

        const scheduledFromJob = reviewFromJob.scheduledMeetings ?? []
        if (scheduledFromJob.length === 0) return null

        const providerLabel = getOutlookSchemeProviderLabel(job)
        const modelLabel = job.model && job.model !== providerLabel ? ` · ${job.model}` : ''
        const timeLabel = formatOutlookSchemeTime(job.completedAt ?? job.updatedAt ?? job.createdAt)

        return {
          id: `${task.id}:job:${job.id}`,
          label: `${providerLabel}${modelLabel}${timeLabel ? ` · ${timeLabel}` : ''}（${scheduledFromJob.length} 会）`,
          source: 'job',
          confirmed: false,
          jobId: job.id,
          scheduledMeetings: scheduledFromJob,
        }
      })
      .filter(Boolean)

    return [...adoptedOption, ...jobOptions]
  }

  function renderOutlookInviteBoard() {
    const taskOptions = buildScheduledTaskOptions()
    const selectedOutlookTask =
      planningTasks.find((task) => task.id === selectedOutlookTaskId) ??
      planningTasks.find((task) => task.id === taskOptions[0]?.id)
    const outlookSchemeOptions = buildOutlookSchemeOptions(selectedOutlookTask)

    return (
      <OutlookInviteBoard
        meetings={meetings}
        schemeOptions={outlookSchemeOptions}
        taskOptions={taskOptions}
        selectedTaskId={selectedOutlookTask?.id ?? ''}
        onTaskChange={selectPlanningTask}
        onBackToReview={() => navigateWorkflow(selectedOutlookTask?.id, 'review')}
        onResolveContacts={openWorkflowContacts}
        onGoToPlanner={() => {
          setActiveTab('planner')
          setPlanningTab('planner')
        }}
        onExportDrafts={(count, format = 'vba') => {
          appendLog(
            'outlook_invite_export',
            'Outlook 会邀生成',
            `已导出 ${count} 场会议的执行文件（${format === 'vbs' ? 'VBS' : 'VBA'}），待 Outlook 运行并导入回执`,
          )
        }}
      />
    )
  }

  return (
    <main className={[
      'app-shell app-frame',
      `app-frame-${activeTab}`,
    ].filter(Boolean).join(' ')}>
      <AppSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSearchMeetings={search => {
          setFilters({ ...defaultFilters, search })
          setMeetingSearchRevision(value => value + 1)
          setMeetingTab('active')
          setActiveTab('meetings')
        }}
        onImportData={handleImportData}
        onExport={handleExport}
        onUndoRestore={handleUndoRestore}
        recoveryPoint={recoveryPoint}
      />
      <div className="app-main">
        <TaskContextBar tasks={planningTasks} task={currentTask} activeTab={activeTab} workflowStage={workflowStage}
          onTaskChange={selectPlanningTask} onStageChange={stage=>navigateWorkflow(currentPlanningTaskId,stage)}
          onReturn={activeTab==='contacts' && returnContext ? returnToWorkflow : null} />
        {(persistence.failed || persistence.externalChange) && <div className="nx-persistence-banner" role="alert">
          <div><strong>{persistence.externalChange?'其他窗口更新了本地数据，已暂停自动覆盖':'部分数据未能写入本机'}</strong><p>{persistence.externalChange?'先导出当前工作，再重新打开以载入最新数据。':'请先导出备份。读取异常的原存档会被保留，不会自动覆盖。'}</p></div>
          <button className="nx-btn nx-btn-outline" onClick={handleExport}>导出当前工作</button>
        </div>}
        <div className="app-page-content">
          <Suspense fallback={<div className="route-loading"><span />正在打开工作区…</div>}>
          {activeTab === 'home' ? (
            <HomeView
              meetings={activeMeetings}
              contacts={contacts}
              currentTask={currentTask}
              onIssueSelect={handleHomeIssue}
              onNavigateToWorkflow={navigateWorkflow}
              planningTasks={planningTasks}
              scheduledTaskOptions={buildScheduledTaskOptions()}
              reviewConflicts={reviewConflicts}
              logs={logs}
              onCreateMeeting={() => openEditMeeting(createEmptyMeeting())}
              onGoToMeetings={() => {
                setActiveTab('meetings')
                setMeetingTab('active')
              }}
              onGoToPlanner={() => {
                setRequestedStep('home')
                setActiveTab('planner')
                setPlanningTab('planner')
              }}
              onGoToReserveNotice={() => setActiveTab('reserveNotice')}
              onGoToOutlookInvite={() => setActiveTab('outlookInvite')}
              onGoToContacts={() => setActiveTab('contacts')}
              onGoToLogs={() => {
                setActiveTab('logs')
                setLogsTab('meetings')
              }}
            />
          ) : activeTab === 'meetings' ? (
            <MeetingsView
              key={`meetings-${meetingSearchRevision}`}
              contentTab={meetingTab}
              tabOptions={meetingTabOptions}
              onTabChange={setMeetingTab}
              meetings={activeMeetings}
              deletedMeetings={deletedMeetings}
              filters={filters}
              setFilters={setFilters}
              defaultFilters={defaultFilters}
              showFilters={showFilters}
              setShowFilters={setShowFilters}
              onEditMeeting={openEditMeeting}
              onCreateMeeting={() => openEditMeeting(createEmptyMeeting())}
              onDeleteMeeting={handleDeleteMeeting}
              onSaveMeeting={handleSaveMeeting}
              contacts={contacts}
              onAddContact={handleAddContactFromName}
              onRestoreMeeting={(id) => {
                const target = meetings.find((meeting) => meeting.id === id)
                setMeetings((current) =>
                  current.map((meeting) =>
                    meeting.id === id ? { ...meeting, status: 'active' } : meeting,
                  ),
                )
                if (target) {
                  appendLog('restore', target.name, '从回收站恢复')
                  toast(`「${target.name}」已恢复到会议列表`)
                }
              }}
              onDeleteMeetingForever={async (id) => {
                const target = meetings.find((meeting) => meeting.id === id)
                const confirmed = await confirmDialog({
                  title: '彻底删除会议',
                  message: `确定彻底删除「${target?.name || '未命名会议'}」吗？此操作无法恢复。`,
                  confirmLabel: '彻底删除',
                  danger: true,
                })
                if (!confirmed) return
                setMeetings((current) => current.filter((meeting) => meeting.id !== id))
                if (target) {
                  appendLog('hard_delete', target.name, '从回收站彻底删除')
                  toast(`「${target.name}」已彻底删除`, 'info')
                }
              }}
              onBatchImport={() => setShowBatchImport(true)}
              onGoToPlanner={() => {
                setActiveTab('planner')
                setPlanningTab('planner')
              }}
              onReorderMeetings={(orderedIds) => {
                setMeetings((current) =>
                  current.map((meeting) => ({
                    ...meeting,
                    customOrder:
                      orderedIds.indexOf(meeting.id) >= 0
                        ? orderedIds.indexOf(meeting.id)
                        : meeting.customOrder ?? 0,
                  })),
                )
                appendLog('reorder', '会议列表', '调整自定义排序')
              }}
            />
          ) : activeTab === 'reserveNotice' ? (
            renderReserveNoticeBoard()
          ) : activeTab === 'outlookInvite' ? (
            renderOutlookInviteBoard()
          ) : activeTab === 'timeAnalysis' ? (
            <TimeAnalysisWorkbench key={`time-analysis-${timeAnalysisRevision}`} />
          ) : activeTab === 'contacts' ? (
            <ContactsView
              contacts={contacts}
              onDirtyChange={setContactsDirty}
              onReturnToWorkflow={returnContext ? () => returnToWorkflow(true) : undefined}
              onSaveContact={handleSaveContact}
              onDeleteContact={handleDeleteContact}
            />
          ) : activeTab === 'planner' ? (
            <PlannerErrorBoundary
              resetKey={plannerRecoveryRevision}
              onReset={() => {
                setCurrentPlanningTaskId('')
                setAiState((current) => clearAiPlanningState(current))
                setReviewState(DEFAULT_REVIEW_STATE)
                setPlannerRecoveryRevision((current) => current + 1)
              }}
            >
              <PlanningWorkbench
                key={currentPlanningTaskId || 'new'}
                requestedStep={requestedStep}
                onRequestedStepApplied={()=>setRequestedStep('')}
                onWorkflowStepChange={setWorkflowStage}
                meetings={meetings}
                aiState={aiState}
                setAiState={setAiState}
                planningTasks={planningTasks}
                currentPlanningTaskId={currentPlanningTaskId}
                onCreatePlanningTask={createPlanningTaskFromAiState}
                onCreateDraftTask={createPlanningTaskFromAiState}
                onUpdatePlanningTaskAiState={updateCurrentPlanningTaskAiState}
                onDeletePlanningTask={deletePlanningTask}
                onSelectPlanningTask={selectPlanningTask}
                renderReviewBoard={renderReviewBoard}
                onApplyAiSchedule={(nextAiState, options) => {
                  setAiState(nextAiState)
                  appendLog(
                    'ai_schedule',
                    'AI 排程',
                    `接收 ${nextAiState.scheduledMeetings?.scheduledMeetings?.length ?? 0} 条后台结果`,
                  )
                  if (options?.importToReview) {
                    importAiStateToReview(nextAiState, { openReview: true })
                  }
                }}
              />
            </PlannerErrorBoundary>
          ) : (
            <LogsView
              activeSection={logsTab}
              sectionOptions={logTabOptions}
              onSectionChange={setLogsTab}
              logs={logs}
              onClear={async () => {
                const confirmed = await confirmDialog({
                  title: '清空全部日志',
                  message: `确定清空 ${logs.length} 条操作记录吗？此操作无法恢复。`,
                  confirmLabel: '清空',
                  danger: true,
                })
                if (!confirmed) return
                setLogs([])
                toast('操作日志已清空', 'info')
              }}
              onDelete={(id) => setLogs((current) => current.filter((log) => log.id !== id))}
            />
          )}
          </Suspense>
        </div>
        <footer className={persistence.failed || persistence.externalChange ? 'eo-status-footer eo-status-footer-warning' : 'eo-status-footer'}>
          <span>{lastBackupAt ? `最近备份 ${new Date(lastBackupAt).toLocaleString('zh-CN')}` : '本机工作区 · 建议定期备份'}</span>
          <span role="status"><CheckCircle2 size={14} />{persistence.externalChange ? '其他窗口已修改，自动保存暂停' : persistence.failed ? '本地保存异常，请导出备份' : '已保存在本机'}</span>
        </footer>
      </div>

      {editingMeeting ? (
        <EditModal
          meeting={editingMeeting}
          meetings={meetings}
          contacts={contacts}
          open={Boolean(editingMeeting) && !isEditModalClosing}
          isClosing={isEditModalClosing}
          onClose={closeEditMeeting}
          onSave={handleSaveMeeting}
          onAddContact={handleAddContactFromName}
        />
      ) : null}
      <BatchImportModal
        open={showBatchImport}
        meetings={meetings}
        onClose={() => setShowBatchImport(false)}
        onConfirm={(rows) => {
          const grouped = rows.reduce((accumulator, row) => {
            const meetingId = row.matchedMeeting.id
            const current = accumulator.get(meetingId) ?? []
            current.push(row.date)
            accumulator.set(meetingId, current)
            return accumulator
          }, new Map())

          setMeetings((current) =>
            current.map((meeting) => {
              const importedDates = grouped.get(meeting.id)
              if (!importedDates) return meeting

              const history = [...new Set([...(meeting.history ?? []), ...importedDates])].sort()
              const syncedMeeting = syncMeetingAnchorDate({
                ...meeting,
                history,
              })

              return {
                ...syncedMeeting,
                nextDate: calculateNextOccurrence(syncedMeeting) || meeting.nextDate || '',
              }
            }),
          )

          const duplicateCount = rows.filter((row) => row.isDuplicate).length
          appendLog(
            'batch_import',
            '会议历史记录',
            `批量导入 ${rows.length} 条历史记录${duplicateCount > 0 ? `，其中 ${duplicateCount} 条为重复日期` : ''}`,
          )
          toast(`已导入 ${rows.length} 条历史记录${duplicateCount > 0 ? `（${duplicateCount} 条重复日期）` : ''}`)
          setShowBatchImport(false)
        }}
      />
      <FeedbackHost />
    </main>
  )
}

export default App
