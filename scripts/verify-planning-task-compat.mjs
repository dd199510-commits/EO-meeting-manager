import assert from 'node:assert/strict'
import {
  normalizePlanningInputMeetings,
  normalizePlanningInstances,
  normalizePlanningRange,
} from '../src/features/planner/planningTaskData.js'

assert.equal(normalizePlanningRange(null), null)
assert.equal(normalizePlanningRange('2026-08-01'), null)
assert.deepEqual(
  normalizePlanningRange({ start: '2026-08-01', end: '2026-08-31', ignored: true }),
  { start: '2026-08-01', end: '2026-08-31' },
)

assert.deepEqual(normalizePlanningInstances({ date: '2026-08-07' }), [])
assert.deepEqual(normalizePlanningInstances([null, 'bad data', { name: '缺少日期' }]), [])

const normalizedInstances = normalizePlanningInstances([
  {
    id: '',
    name: null,
    date: '2026-08-07',
    duration: '45',
    attendees: ['不应直接渲染数组'],
    noteMentions: null,
  },
  { id: 'invalid-date', name: '错误日期', date: 'August 8' },
])

assert.equal(normalizedInstances.length, 1)
assert.equal(normalizedInstances[0].id, 'planning-instance-1')
assert.equal(normalizedInstances[0].name, '未命名会议')
assert.equal(normalizedInstances[0].duration, 45)
assert.equal(normalizedInstances[0].attendees, '')
assert.deepEqual(normalizedInstances[0].noteMentions, [])
assert.equal(normalizedInstances[0].frequency, 'adhoc')

assert.equal(normalizePlanningInputMeetings({ meetings: [] }), null)
assert.deepEqual(
  normalizePlanningInputMeetings({
    timeRange: { start: '2026-08-01', end: '2026-08-31' },
    meetings: { broken: true },
    metadata: 'broken',
  }),
  {
    timeRange: { start: '2026-08-01', end: '2026-08-31' },
    meetings: [],
    metadata: { totalCount: 0, sourceSignature: '' },
  },
)

console.log('planning task compatibility verification passed')
