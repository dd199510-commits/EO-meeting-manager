import assert from 'node:assert/strict'
import { updateSchedulePreservingNotices, scheduleSignature } from '../src/lib/workflow.js'
import { commitStorageTransaction, persistJson, blockStorageKey } from '../src/lib/persistence.js'
import { buildNoticeSnapshot, createNoticeSentRecord, getNoticeDeliveryState } from '../src/lib/noticeRevision.js'
import { STORAGE_PREFIX, scopedLocalStorage } from '../src/lib/scopedStorage.js'

const values = new Map([[STORAGE_PREFIX + 'a', 'a'.repeat(92)], [STORAGE_PREFIX + 'b', 'b'.repeat(12)]])
const storage = {
  getItem: key => values.get(key) ?? null,
  removeItem: key => values.delete(key),
  setItem(key, value) {
    const next = new Map(values); next.set(key, String(value))
    if ([...next.values()].reduce((sum, item) => sum + item.length, 0) > 104) throw new Error('Quota exceeded')
    values.set(key, String(value))
  },
}
globalThis.window = { localStorage: storage, dispatchEvent() {} }
assert.throws(() => commitStorageTransaction([['a', 'a'.repeat(10)], ['b', 'b'.repeat(90)], ['c', 'extra']]))
assert.equal(scopedLocalStorage.getItem('a'), 'a'.repeat(92))
assert.equal(scopedLocalStorage.getItem('b'), 'b'.repeat(12))
assert.equal(scopedLocalStorage.getItem('c'), null)
values.clear()
scopedLocalStorage.setItem('broken', '{invalid')
blockStorageKey('broken')
assert.equal(persistJson('broken', { empty: true }), false)
assert.equal(scopedLocalStorage.getItem('broken'), '{invalid')
commitStorageTransaction([['broken', { repaired: true }]])
assert.equal(persistJson('broken', { working: true }), true)

const meeting = { id: 's1', meetingId: 'm1', date: '2026-11-16', startTime: '10:00', endTime: '11:00', name: '经营复盘', reserved: true, locked: true }
const snapshot = buildNoticeSnapshot({ rowId: 'meeting:m1', subject: meeting.name, occurrences: [meeting], text: '11月16日10点', templateKey: 'general' })
const record = createNoticeSentRecord(snapshot)
const review = { scheduledMeetings: [meeting], finalCheckStatus: { m1: true }, reserveNoticeStatus: { 'meeting:m1': record } }
const next = updateSchedulePreservingNotices(review, [{ ...meeting, date: '2026-11-17' }])
assert.equal(next.scheduledMeetings[0].reserved, false)
assert.equal(next.scheduledMeetings[0].locked, false)
assert.equal(next.finalCheckStatus.m1, undefined)
assert.equal(next.reserveNoticeStatus['meeting:m1'], record)
assert.notEqual(scheduleSignature(review.scheduledMeetings), scheduleSignature(next.scheduledMeetings))
assert.equal(scheduleSignature([{ ...meeting, reserved: false }]), scheduleSignature([meeting]))
const changed = buildNoticeSnapshot({ rowId: 'meeting:m1', subject: meeting.name, occurrences: next.scheduledMeetings, text: '11月17日10点', templateKey: 'general' })
assert.equal(getNoticeDeliveryState(record, changed).status, 'stale')
assert.equal(updateSchedulePreservingNotices(review, []).scheduledMeetings.length, 0)
console.log('PASS · 备份配额失败完整回滚、异常存储保护与修复、改期通知快照保留及失效、清空审核日程')
