function encodedLiteral(value) {
  const text = String(value ?? '').replace(/\r\n?/g, '\n').replaceAll('<<BR>>', '< <BR> >').replaceAll('\n', '<<BR>>')
  let encoded = ''
  // Iterate UTF-16 units so emoji and other surrogate pairs also round-trip through ChrW.
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    encoded += code < 32 || code > 126 || text[index] === '\\' ? `\\u${code.toString(16).padStart(4, '0')}` : text[index]
  }
  const chunks = []
  for (let index = 0; index < encoded.length; index += 600) chunks.push(`"${encoded.slice(index, index + 600).replaceAll('"', '""')}"`)
  return chunks.length ? chunks.join(' & _\n    ') : '""'
}

function dateExpression(date, time) {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  return `DateSerial(${year}, ${month}, ${day}) + TimeSerial(${hour}, ${minute}, 0)`
}

function signature(row) {
  const value = JSON.stringify([row.subject, row.date, row.startTime, row.endTime, row.location, row.body, row.requiredEmails, row.optionalEmails])
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  return (hash >>> 0).toString(16)
}

export function buildIdempotentOutlookScript({ rows, senderEmail = '', scriptKind = 'vbs' }) {
  const vbs = scriptKind === 'vbs'
  const exit = vbs ? 'WScript.Quit' : 'Exit Sub'
  const calls = rows.map((row) => `  rowDetail = ""
  rowResult = ApplyOneMeeting(calendarFolder, managedItems, senderAccount, _
    ${encodedLiteral(row.externalId || row.legacyDraftId || row.id)}, _
    ${encodedLiteral(row.legacyDraftId || '')}, _
    ${encodedLiteral(signature(row))}, _
    ${encodedLiteral(row.subject)}, _
    ${dateExpression(row.date, row.startTime)}, _
    ${dateExpression(row.date, row.endTime)}, _
    ${encodedLiteral(row.location)}, _
    ${encodedLiteral(row.body)}, _
    ${encodedLiteral(row.requiredEmails.join(';'))}, _
    ${encodedLiteral(row.optionalEmails.join(';'))}, rowDetail)
  Select Case rowResult
    Case "created": createdCount = createdCount + 1
    Case "updated": updatedCount = updatedCount + 1
    Case "skipped": skippedCount = skippedCount + 1
    Case Else: failedCount = failedCount + 1
  End Select
  receipt = receipt & CsvCell(DecodeText(${encodedLiteral(row.externalId || row.legacyDraftId || row.id)})) & "," & CsvCell(rowResult) & "," & CsvCell(DecodeText(${encodedLiteral(row.subject)})) & "," & CsvCell(rowDetail) & vbCrLf`).join('\n\n')
  return `' Meeting Manager managed Outlook drafts v2. No email is sent by this script.
${vbs ? '' : 'Option Explicit\n'}
${vbs ? '' : 'Sub CreateMeetingDrafts()'}
  Dim olApp, senderAccount, calendarFolder, managedItems
  Dim createdCount, updatedCount, skippedCount, failedCount
  Dim rowResult, rowDetail, receipt, receiptPath
  createdCount = 0: updatedCount = 0: skippedCount = 0: failedCount = 0
  receipt = "draft_id,status,subject,detail" & vbCrLf
  If MsgBox("Prepare ${rows.length} managed Outlook draft(s). Existing matching drafts will be updated or skipped. Nothing will be sent. Continue?", vbOKCancel + vbQuestion, "Meeting Manager") <> vbOK Then ${exit}
  On Error Resume Next
  Set olApp = GetObject(, "Outlook.Application")
  If olApp Is Nothing Then Set olApp = CreateObject("Outlook.Application")
  If olApp Is Nothing Then
    MsgBox "Classic Outlook for Windows is required.", vbExclamation, "Meeting Manager"
    ${exit}
  End If
  Err.Clear
  Set senderAccount = FindAccount(olApp, DecodeText(${encodedLiteral(senderEmail.trim())}))
  If ${encodedLiteral(senderEmail.trim())} <> "" And senderAccount Is Nothing Then
    MsgBox "The selected sender account was not found in Outlook.", vbExclamation, "Meeting Manager"
    ${exit}
  End If
  If senderAccount Is Nothing Then
    Set calendarFolder = olApp.Session.GetDefaultFolder(9)
  Else
    Set calendarFolder = senderAccount.DeliveryStore.GetDefaultFolder(9)
  End If
  If Err.Number <> 0 Or calendarFolder Is Nothing Then
    MsgBox "Cannot open the Outlook calendar: " & Err.Description, vbExclamation, "Meeting Manager"
    ${exit}
  End If
  On Error GoTo 0
  Set managedItems = BuildManagedIndex(calendarFolder)

${calls}

  receiptPath = SaveReceipt(receipt)
  MsgBox "Created: " & createdCount & vbCrLf & "Updated: " & updatedCount & vbCrLf & "Unchanged: " & skippedCount & vbCrLf & "Failed: " & failedCount & vbCrLf & receiptPath & vbCrLf & "Review the drafts in Outlook before sending.", vbInformation, "Meeting Manager"
${vbs ? '' : 'End Sub'}

Function FindAccount(olApp, address)
  Dim account
  Set FindAccount = Nothing
  If Trim(address) = "" Then Exit Function
  For Each account In olApp.Session.Accounts
    If LCase(Trim(account.SmtpAddress)) = LCase(Trim(address)) Then
      Set FindAccount = account
      Exit Function
    End If
  Next
End Function

Function BuildManagedIndex(folder)
  Dim result, item, propertyItem, identifier
  Set result = CreateObject("Scripting.Dictionary")
  On Error Resume Next
  For Each item In folder.Items
    Err.Clear
    Set propertyItem = Nothing
    Set propertyItem = item.UserProperties.Find("MeetingManagerDraftId", True)
    If Err.Number = 0 And Not propertyItem Is Nothing Then
      identifier = CStr(propertyItem.Value)
      If result.Exists(identifier) Then
        result.Item("duplicate:" & identifier) = True
      Else
        result.Add identifier, item
      End If
    End If
  Next
  On Error GoTo 0
  Set BuildManagedIndex = result
End Function

Function ApplyOneMeeting(folder, managedItems, senderAccount, encodedId, encodedLegacyId, fingerprint, encodedSubject, startAt, endAt, encodedLocation, encodedBody, requiredAddresses, optionalAddresses, detail)
  Dim identifier, legacyId, appt, propertyItem, isNew, address, recipient, index
  ApplyOneMeeting = "failed"
  identifier = DecodeText(encodedId): legacyId = DecodeText(encodedLegacyId)
  If managedItems.Exists("duplicate:" & identifier) Or managedItems.Exists("duplicate:" & legacyId) Then
    detail = "Multiple managed drafts use this ID. Review duplicates manually."
    Exit Function
  End If
  Set appt = Nothing
  If managedItems.Exists(identifier) Then
    Set appt = managedItems.Item(identifier)
  ElseIf legacyId <> "" And managedItems.Exists(legacyId) Then
    Set appt = managedItems.Item(legacyId)
  End If
  On Error Resume Next
  isNew = appt Is Nothing
  If isNew Then Set appt = folder.Items.Add(1)
  If Err.Number <> 0 Or appt Is Nothing Then
    detail = Err.Description: Err.Clear: Exit Function
  End If
  Set propertyItem = appt.UserProperties.Find("MeetingManagerFingerprint", True)
  If Not propertyItem Is Nothing Then
    If CStr(propertyItem.Value) = fingerprint Then
      ApplyOneMeeting = "skipped": detail = "Unchanged managed draft": Exit Function
    End If
  End If
  Err.Clear
  With appt
    .MeetingStatus = 1
    If Not senderAccount Is Nothing Then Set .SendUsingAccount = senderAccount
    .Subject = DecodeText(encodedSubject): .Start = startAt: .End = endAt
    .Location = DecodeText(encodedLocation): .Body = DecodeText(encodedBody)
    .BusyStatus = 2: .ReminderSet = True: .ReminderMinutesBeforeStart = 15
    For index = .Recipients.Count To 1 Step -1
      .Recipients.Remove index
    Next
    For Each address In Split(DecodeText(requiredAddresses), ";")
      If Trim(address) <> "" Then
        Set recipient = .Recipients.Add(Trim(address)): recipient.Type = 1
      End If
    Next
    For Each address In Split(DecodeText(optionalAddresses), ";")
      If Trim(address) <> "" Then
        Set recipient = .Recipients.Add(Trim(address)): recipient.Type = 2
      End If
    Next
    If Err.Number <> 0 Then
      detail = Err.Description: Err.Clear: Exit Function
    End If
    If Not .Recipients.ResolveAll Then
      detail = "Outlook could not resolve all recipients. Draft was not saved.": Exit Function
    End If
    Set propertyItem = .UserProperties.Find("MeetingManagerDraftId", True)
    If propertyItem Is Nothing Then Set propertyItem = .UserProperties.Add("MeetingManagerDraftId", 1, True)
    propertyItem.Value = identifier
    Set propertyItem = .UserProperties.Find("MeetingManagerFingerprint", True)
    If propertyItem Is Nothing Then Set propertyItem = .UserProperties.Add("MeetingManagerFingerprint", 1, True)
    propertyItem.Value = fingerprint
    If Err.Number <> 0 Then
      detail = Err.Description: Err.Clear: Exit Function
    End If
    .Save
  End With
  If Err.Number <> 0 Then
    detail = Err.Description: Err.Clear: Exit Function
  End If
  If Not managedItems.Exists(identifier) Then managedItems.Add identifier, appt
  If isNew Then ApplyOneMeeting = "created" Else ApplyOneMeeting = "updated"
  detail = "Saved draft. Sending requires manual review in Outlook."
  On Error GoTo 0
End Function

Function CsvCell(value)
  CsvCell = Chr(34) & Replace(Replace(Replace(CStr(value), Chr(34), Chr(34) & Chr(34)), vbCr, " "), vbLf, " ") & Chr(34)
End Function

Function SaveReceipt(text)
  Dim stream, shell, target
  On Error Resume Next
  Set shell = CreateObject("WScript.Shell")
  target = shell.SpecialFolders("Desktop") & "\\meeting-manager-receipt-" & Year(Now) & Right("0" & Month(Now), 2) & Right("0" & Day(Now), 2) & "-" & Right("0" & Hour(Now), 2) & Right("0" & Minute(Now), 2) & Right("0" & Second(Now), 2) & ".csv"
  Set stream = CreateObject("ADODB.Stream")
  stream.Type = 2: stream.Charset = "utf-8": stream.Open: stream.WriteText text
  stream.SaveToFile target, 2: stream.Close
  If Err.Number <> 0 Then
    SaveReceipt = "Receipt could not be saved: " & Err.Description
  Else
    SaveReceipt = "Receipt saved to " & target
  End If
  On Error GoTo 0
End Function

Function DecodeText(value)
  Dim text, result, index, code, unit
  text = Replace(CStr(value), "<<BR>>", vbCrLf): result = "": index = 1
  Do While index <= Len(text)
    If Mid(text, index, 2) = "\\u" And index + 5 <= Len(text) Then
      code = Mid(text, index + 2, 4)
      unit = CLng("&H" & code)
      If unit > 32767 Then unit = unit - 65536
      result = result & ChrW(unit): index = index + 6
    Else
      result = result & Mid(text, index, 1): index = index + 1
    End If
  Loop
  DecodeText = result
End Function
`
}

export function parseOutlookReceipt(text) {
  const lines = String(text).replace(/^\uFEFF/, '').trim().split(/\r?\n/)
  if (lines[0] !== 'draft_id,status,subject,detail') throw new Error('请选择本系统生成的 Outlook 回执 CSV')
  const rows = lines.slice(1).filter(Boolean).map((line) => {
    const values = []
    let value = '', quoted = false
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]
      if (char === '"') {
        if (quoted && line[index + 1] === '"') { value += '"'; index += 1 } else quoted = !quoted
      } else if (char === ',' && !quoted) { values.push(value); value = '' } else value += char
    }
    if (quoted) throw new Error('回执包含未闭合的引号')
    values.push(value)
    if (values.length !== 4 || !['created', 'updated', 'skipped', 'failed'].includes(values[1])) throw new Error('回执内容不完整')
    return { id: values[0], status: values[1], subject: values[2], detail: values[3] }
  })
  if (!rows.length) throw new Error('回执没有执行记录')
  return rows
}
