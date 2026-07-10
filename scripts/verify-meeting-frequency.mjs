import { createServer } from 'vite'

const server = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    calculateNextOccurrence,
    generateOccurrencesInRange,
    syncMeetingAnchorDate,
  } = await server.ssrLoadModule('/src/lib/meetingFrequency.js')

  const createMeeting = (type, interval, daySpec, anchorDate, history) => ({
    id: `${type}-${interval}`,
    name: '频率回归测试会议',
    status: 'active',
    nextDate: '',
    history,
    frequency: {
      type,
      interval,
      monthSpec: 1,
      daySpec,
      anchorDate,
    },
  })

  const cases = [
    {
      name: '月会提前发生后跳过本月计划日',
      meeting: createMeeting('monthly', 1, 7, '2026-05-07', ['2026-05-07', '2026-06-07', '2026-07-04']),
      referenceDate: '2026-07-04',
      expected: '2026-08-07',
    },
    {
      name: '双月会提前发生后保持奇偶月份相位',
      meeting: createMeeting('monthly', 2, 7, '2026-05-07', ['2026-05-07', '2026-07-04']),
      referenceDate: '2026-07-04',
      expected: '2026-09-07',
    },
    {
      name: '周三周会在当周周二发生后不再安排次日',
      meeting: createMeeting('weekly', 1, 3, '2026-06-24', ['2026-06-24', '2026-07-07']),
      referenceDate: '2026-07-07',
      expected: '2026-07-15',
    },
    {
      name: '双周周三会议在当周周二发生后从本周继续递推',
      meeting: createMeeting('weekly', 2, 3, '2026-06-24', ['2026-06-24', '2026-07-07']),
      referenceDate: '2026-07-07',
      expected: '2026-07-22',
    },
    {
      name: '双周周三会议在当周周四发生后从本周继续递推',
      meeting: createMeeting('weekly', 2, 3, '2026-06-24', ['2026-06-24', '2026-07-09']),
      referenceDate: '2026-07-09',
      expected: '2026-07-22',
    },
    {
      name: '双周会提前整整一周后以最近发生周重新起算',
      meeting: createMeeting('weekly', 2, 3, '2026-06-24', ['2026-06-24', '2026-07-01']),
      referenceDate: '2026-07-01',
      expected: '2026-07-15',
    },
    {
      name: '双周会延期整整一周后以最近发生周重新起算',
      meeting: createMeeting('weekly', 2, 3, '2026-06-24', ['2026-06-24', '2026-07-15']),
      referenceDate: '2026-07-15',
      expected: '2026-07-29',
    },
    {
      name: '更早的历史记录不参与下一次日期判断',
      meeting: createMeeting('weekly', 2, 3, '2026-01-07', ['2026-06-24', '2026-07-01']),
      referenceDate: '2026-07-01',
      expected: '2026-07-15',
    },
    {
      name: '跨过若干周期后仍以最近一次发生周保持固定频率',
      meeting: createMeeting('weekly', 2, 3, '2026-01-07', ['2026-07-01']),
      referenceDate: '2026-07-20',
      expected: '2026-07-29',
    },
    {
      name: '31 日月会经过二月后仍回到每月最后有效目标日',
      meeting: createMeeting('monthly', 1, 31, '2026-01-31', ['2026-01-31']),
      referenceDate: '2026-03-01',
      expected: '2026-03-31',
    },
    {
      name: '没有历史记录的未来周会保留首次计划日',
      meeting: createMeeting('weekly', 1, 3, '2026-07-15', []),
      referenceDate: '2026-07-10',
      expected: '2026-07-15',
    },
    {
      name: '没有历史记录的未来月会保留首次计划日',
      meeting: createMeeting('monthly', 1, 12, '2026-07-12', []),
      referenceDate: '2026-07-10',
      expected: '2026-07-12',
    },
    {
      name: '周会实际发生日与起始参考日相同后进入下一周期',
      meeting: createMeeting('weekly', 1, 3, '2026-07-08', ['2026-07-08']),
      referenceDate: '2026-07-08',
      expected: '2026-07-15',
    },
    {
      name: '月会实际发生日与起始参考日相同后进入下一周期',
      meeting: createMeeting('monthly', 1, 7, '2026-07-07', ['2026-07-07']),
      referenceDate: '2026-07-07',
      expected: '2026-08-07',
    },
    {
      name: '没有历史记录的未来年会保留首次计划日',
      meeting: {
        ...createMeeting('yearly', 1, 14, '2026-12-14', []),
        frequency: {
          ...createMeeting('yearly', 1, 14, '2026-12-14', []).frequency,
          monthSpec: [12],
        },
      },
      referenceDate: '2026-07-10',
      expected: '2026-12-14',
    },
    {
      name: '晚于基准日的历史日期不应被视为已经发生',
      meeting: {
        ...createMeeting('yearly', 1, 14, '2026-12-14', ['2026-05-10', '2026-12-14']),
        frequency: {
          ...createMeeting('yearly', 1, 14, '2026-12-14', []).frequency,
          monthSpec: [12],
        },
      },
      referenceDate: '2026-07-10',
      expected: '2026-12-14',
    },
    {
      name: '无法归属到计划月份的历史日期不应跳过未来年会',
      meeting: {
        ...createMeeting('yearly', 1, 15, '2026-11-15', ['2026-06-11', '2026-11-15']),
        frequency: {
          ...createMeeting('yearly', 1, 15, '2026-11-15', []).frequency,
          monthSpec: [11],
        },
      },
      referenceDate: '2026-07-10',
      expected: '2026-11-15',
    },
    {
      name: '季度会议提前发生后跳过所属月份的计划日',
      meeting: {
        ...createMeeting('yearly', 1, 19, '2026-01-19', ['2026-04-13', '2026-07-04']),
        frequency: {
          ...createMeeting('yearly', 1, 19, '2026-01-19', []).frequency,
          monthSpec: [1, 4, 7, 10],
        },
      },
      referenceDate: '2026-07-04',
      expected: '2026-10-19',
    },
  ]

  const failures = cases.flatMap((item) => {
    const actual = calculateNextOccurrence(item.meeting, item.referenceDate)
    return actual === item.expected ? [] : [{ ...item, actual }]
  })

  const monthlyMeeting = cases[0].meeting
  const julyOccurrences = generateOccurrencesInRange(monthlyMeeting, '2026-07-01', '2026-07-31', '2026-07-04')
  const augustOccurrences = generateOccurrencesInRange(monthlyMeeting, '2026-08-01', '2026-08-31', '2026-07-04')
  const stableAnchor = syncMeetingAnchorDate(monthlyMeeting).frequency.anchorDate

  if (julyOccurrences.length !== 0) {
    failures.push({ name: '已提前完成的月度周期不应再次进入排程', expected: [], actual: julyOccurrences })
  }
  if (JSON.stringify(augustOccurrences) !== JSON.stringify(['2026-08-07'])) {
    failures.push({ name: '下一个月度周期应正常进入排程', expected: ['2026-08-07'], actual: augustOccurrences })
  }
  if (stableAnchor !== '2026-05-07') {
    failures.push({ name: '实际发生日期不得改写起始参考日', expected: '2026-05-07', actual: stableAnchor })
  }

  if (failures.length > 0) {
    console.error(JSON.stringify({ failures }, null, 2))
    process.exitCode = 1
  } else {
    console.log(JSON.stringify({ passed: cases.length + 3 }, null, 2))
  }
} finally {
  await server.close()
}
