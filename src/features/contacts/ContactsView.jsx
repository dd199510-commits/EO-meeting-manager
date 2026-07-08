import { useMemo, useState } from 'react'
import { Mail, Plus, Search, Trash2, UserRound, X } from 'lucide-react'
import { parseSecretaries } from '../../lib/contacts'

function createEmptyContact(name = '') {
  return {
    id: '',
    name,
    email: '',
    aliases: [],
    secretaries: [],
    department: '',
    title: '',
    notes: '',
    status: 'active',
  }
}

export function ContactsView({ contacts, onSaveContact, onDeleteContact }) {
  const [search, setSearch] = useState('')
  const [editingContact, setEditingContact] = useState(null)
  const filteredContacts = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return contacts

    return contacts.filter((contact) => {
      const haystack = [
        contact.name,
        contact.email,
        contact.department,
        contact.title,
        ...(contact.aliases ?? []),
        ...(contact.secretaries ?? []).flatMap((secretary) => [secretary.name, secretary.email]),
      ].join(' ').toLowerCase()

      return haystack.includes(keyword)
    })
  }, [contacts, search])

  const formData = editingContact ?? createEmptyContact()
  const linkedCount = contacts.filter((contact) => contact.email).length

  function updateForm(patch) {
    setEditingContact((current) => ({
      ...(current ?? createEmptyContact()),
      ...patch,
    }))
  }

  function updateSecretary(index, patch) {
    const secretaries = Array.isArray(formData.secretaries) ? formData.secretaries : parseSecretaries(formData.secretaries)
    updateForm({
      secretaries: secretaries.map((secretary, secretaryIndex) =>
        secretaryIndex === index ? { ...secretary, ...patch } : secretary,
      ),
    })
  }

  function addSecretary() {
    const secretaries = Array.isArray(formData.secretaries) ? formData.secretaries : parseSecretaries(formData.secretaries)
    updateForm({
      secretaries: [
        ...secretaries,
        {
          id: `sec-${crypto.randomUUID()}`,
          name: '',
          email: '',
        },
      ],
    })
  }

  function removeSecretary(index) {
    const secretaries = Array.isArray(formData.secretaries) ? formData.secretaries : parseSecretaries(formData.secretaries)
    updateForm({
      secretaries: secretaries.filter((_, secretaryIndex) => secretaryIndex !== index),
    })
  }

  function saveForm() {
    const nextContact = {
      ...formData,
      aliases: Array.isArray(formData.aliases)
        ? formData.aliases
        : String(formData.aliases || '')
          .split(/\n|,|，|、|；|;/)
          .map((item) => item.trim())
          .filter(Boolean),
      secretaries: parseSecretaries(formData.secretaries),
    }

    if (!nextContact.name.trim()) return
    onSaveContact(nextContact)
    setEditingContact(null)
  }

  return (
    <section className="cv-workspace">
      <div className="nx-card cv-list-panel">
        <div className="cv-toolbar">
          <div className="cv-toolbar-copy">
            <strong>通讯录</strong>
            <span>{linkedCount} / {contacts.length} 已填写邮箱</span>
          </div>
          <button className="nx-btn nx-btn-primary" type="button" onClick={() => setEditingContact(createEmptyContact())}>
            <Plus />
            新建联系人
          </button>
        </div>
        <div className="cv-search">
          <Search size={15} aria-hidden="true" />
          <input
            className="nx-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索姓名、邮箱或别名"
            aria-label="搜索联系人"
          />
        </div>
        <div className="cv-rows" role="list">
          {filteredContacts.map((contact) => (
            <button
              key={contact.id}
              type="button"
              role="listitem"
              className={
                editingContact?.id === contact.id ? 'cv-row cv-row-active' : 'cv-row'
              }
              onClick={() => setEditingContact(contact)}
            >
              <span className="cv-avatar" aria-hidden="true"><UserRound size={15} /></span>
              <span className="cv-row-main">
                <strong>{contact.name || '未命名联系人'}</strong>
                <em>
                  {contact.secretaries?.length
                    ? `${contact.secretaries.length} 位秘书`
                    : contact.aliases?.length
                      ? contact.aliases.join('、')
                      : contact.department || '暂无别名'}
                </em>
              </span>
              <span className={contact.email ? 'nx-badge nx-badge-accent' : 'nx-badge nx-badge-warn'}>
                <Mail size={12} aria-hidden="true" />
                {contact.email || '未填写邮箱'}
              </span>
            </button>
          ))}
          {filteredContacts.length === 0 ? (
            <div className="nx-empty cv-empty">
              <span>没有找到联系人。</span>
              {search.trim() ? (
                <button
                  className="nx-btn nx-btn-outline"
                  type="button"
                  onClick={() => {
                    setEditingContact(createEmptyContact(search.trim()))
                    setSearch('')
                  }}
                >
                  <Plus size={14} />
                  新建联系人「{search.trim()}」
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <aside className="nx-card cv-editor-panel">
        <div className="cv-editor-head">
          <strong>{formData.id ? '编辑联系人' : '新建联系人'}</strong>
          <span>用于会议参会人自动匹配与后续会邀发送。</span>
        </div>
        <div className="cv-editor-form">
          <label className="nx-field">
            <span>姓名</span>
            <input
              className="nx-input"
              value={formData.name}
              onChange={(event) => updateForm({ name: event.target.value })}
              placeholder="张三"
            />
          </label>
          <label className="nx-field">
            <span>邮箱</span>
            <input
              className="nx-input"
              value={formData.email}
              onChange={(event) => updateForm({ email: event.target.value })}
              placeholder="name@example.com"
            />
          </label>
          <label className="nx-field">
            <span>别名</span>
            <input
              className="nx-input"
              value={Array.isArray(formData.aliases) ? formData.aliases.join('、') : formData.aliases}
              onChange={(event) => updateForm({ aliases: event.target.value })}
              placeholder="英文名、中文名或常用简称，用顿号分隔"
            />
          </label>
          <div className="nx-field">
            <span>秘书</span>
            <div className="cv-secretaries">
              {(Array.isArray(formData.secretaries) ? formData.secretaries : parseSecretaries(formData.secretaries)).map((secretary, index) => (
                <div key={secretary.id || index} className="cv-secretary-row">
                  <input
                    className="nx-input"
                    value={secretary.name}
                    onChange={(event) => updateSecretary(index, { name: event.target.value })}
                    placeholder="秘书姓名"
                  />
                  <input
                    className="nx-input"
                    value={secretary.email}
                    onChange={(event) => updateSecretary(index, { email: event.target.value })}
                    placeholder="秘书邮箱"
                  />
                  <button
                    type="button"
                    className="nx-btn nx-btn-danger cv-secretary-remove"
                    onClick={() => removeSecretary(index)}
                    aria-label="删除秘书"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button type="button" className="nx-btn nx-btn-outline" onClick={addSecretary}>
                <Plus size={14} />
                添加秘书
              </button>
            </div>
          </div>
          <div className="cv-editor-grid">
            <label className="nx-field">
              <span>部门</span>
              <input
                className="nx-input"
                value={formData.department}
                onChange={(event) => updateForm({ department: event.target.value })}
              />
            </label>
            <label className="nx-field">
              <span>职务</span>
              <input
                className="nx-input"
                value={formData.title}
                onChange={(event) => updateForm({ title: event.target.value })}
              />
            </label>
          </div>
          <label className="nx-field">
            <span>备注</span>
            <textarea
              className="nx-input"
              rows="3"
              value={formData.notes}
              onChange={(event) => updateForm({ notes: event.target.value })}
            />
          </label>
        </div>
        <div className="cv-editor-actions">
          {formData.id ? (
            <button
              className="nx-btn nx-btn-danger"
              type="button"
              onClick={() => {
                onDeleteContact(formData.id)
                setEditingContact(null)
              }}
            >
              <Trash2 size={15} />
              删除
            </button>
          ) : (
            <button className="nx-btn nx-btn-quiet" type="button" onClick={() => setEditingContact(null)}>
              清空
            </button>
          )}
          <button className="nx-btn nx-btn-primary" type="button" onClick={saveForm}>
            保存联系人
          </button>
        </div>
      </aside>
    </section>
  )
}
