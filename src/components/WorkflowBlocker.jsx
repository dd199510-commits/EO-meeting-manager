import { ArrowRight, CheckCircle2, CircleDashed, Route } from 'lucide-react'

export function WorkflowBlocker({
  eyebrow = '流程暂未解锁',
  title,
  description,
  steps = [],
  actionLabel = '去完成排程',
  onAction,
}) {
  return (
    <section className="nx-card workflow-blocker" aria-label={title}>
      <div className="workflow-blocker-icon" aria-hidden="true">
        <Route />
      </div>
      <div className="workflow-blocker-copy">
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <ol className="workflow-blocker-steps">
        {steps.map((step, index) => (
          <li className={step.done ? 'workflow-blocker-step workflow-blocker-step-done' : 'workflow-blocker-step'} key={step.label}>
            {step.done ? <CheckCircle2 aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}
            <div>
              <strong>{index + 1}. {step.label}</strong>
              <span>{step.hint}</span>
            </div>
          </li>
        ))}
      </ol>
      {onAction ? (
        <button className="nx-btn nx-btn-primary workflow-blocker-action" type="button" onClick={onAction}>
          {actionLabel}
          <ArrowRight aria-hidden="true" />
        </button>
      ) : null}
    </section>
  )
}
