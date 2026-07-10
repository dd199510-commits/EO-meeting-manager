/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'

/*
 * 全局反馈体系（模块级 API，任何文件可直接 import 使用）：
 *   toast(message, type?)       —— 非阻塞通知，type: success | info | warning | error
 *   confirmDialog(options)      —— Promise<boolean> 确认弹窗
 *     options: { title, message, confirmLabel, cancelLabel, danger }
 * App 根部需挂载一次 <FeedbackHost />。
 */

let hostApi = null
const pendingToasts = []

export function toast(message, type = 'success') {
  if (hostApi) {
    hostApi.pushToast({ message, type })
  } else {
    pendingToasts.push({ message, type })
  }
}

export function confirmDialog(options) {
  if (!hostApi) return Promise.resolve(window.confirm(options?.message ?? options?.title ?? '确认操作？'))
  return hostApi.openConfirm(options ?? {})
}

const TOAST_ICONS = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
}

const TOAST_DURATION = 3200

export function FeedbackHost() {
  const [toasts, setToasts] = useState([])
  const [confirmState, setConfirmState] = useState(null)

  useEffect(() => {
    hostApi = {
      pushToast({ message, type }) {
        const id = `toast-${crypto.randomUUID()}`
        setToasts((current) => [...current.slice(-3), { id, message, type }])
        window.setTimeout(() => {
          setToasts((current) => current.filter((item) => item.id !== id))
        }, TOAST_DURATION)
      },
      openConfirm(options) {
        return new Promise((resolve) => {
          setConfirmState({ options, resolve })
        })
      },
    }

    while (pendingToasts.length > 0) {
      hostApi.pushToast(pendingToasts.shift())
    }

    return () => {
      hostApi = null
    }
  }, [])

  function settleConfirm(result) {
    confirmState?.resolve(result)
    setConfirmState(null)
  }

  useEffect(() => {
    if (!confirmState) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        settleConfirm(false)
      }
      if (event.key === 'Enter') {
        event.stopPropagation()
        settleConfirm(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmState])

  const confirmOptions = confirmState?.options ?? {}

  return createPortal(
    <>
      <div className="nx-toast-stack" aria-live="polite">
        {toasts.map((item) => {
          const ToastIcon = TOAST_ICONS[item.type] ?? Info
          return (
            <div key={item.id} className={`nx-toast nx-toast-${item.type}`} role="status">
              <ToastIcon size={16} aria-hidden="true" />
              <span>{item.message}</span>
            </div>
          )
        })}
      </div>

      {confirmState ? (
        <div className="nx-confirm-backdrop" onClick={() => settleConfirm(false)}>
          <div
            className="nx-confirm-card"
            role="alertdialog"
            aria-modal="true"
            aria-label={confirmOptions.title ?? '确认操作'}
            onClick={(event) => event.stopPropagation()}
          >
            <strong>{confirmOptions.title ?? '确认操作'}</strong>
            {confirmOptions.message ? <p>{confirmOptions.message}</p> : null}
            <div className="nx-confirm-actions">
              <button className="nx-btn nx-btn-quiet" type="button" onClick={() => settleConfirm(false)} autoFocus>
                {confirmOptions.cancelLabel ?? '取消'}
              </button>
              <button
                className={confirmOptions.danger ? 'nx-btn nx-btn-confirm-danger' : 'nx-btn nx-btn-primary'}
                type="button"
                onClick={() => settleConfirm(true)}
              >
                {confirmOptions.confirmLabel ?? '确定'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>,
    document.body,
  )
}
