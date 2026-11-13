import { useState } from 'react'
import { Download, Search, Upload, Undo2, X } from 'lucide-react'
import { APP_VERSION_LABEL } from '../lib/appVersion'
import brandMark from '../assets/eo-mark.png'

const TABS = [
  ['home', '首页'], ['planner', '排程'], ['reserveNotice', '预留通知'],
  ['outlookInvite', '会邀生成'], ['meetings', '会议库'], ['contacts', '通讯录'],
  ['timeAnalysis', '时间分析'], ['logs', '记录'],
]

export function AppSidebar({ activeTab, onTabChange, onImportData, onExport, onUndoRestore, recoveryPoint, onSearchMeetings }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')

  function submitSearch(event) {
    event.preventDefault()
    if (!query.trim()) return
    onSearchMeetings(query.trim())
    setSearchOpen(false)
  }

  return (
    <header className="eo-topbar">
      <button className="eo-brand" onClick={() => onTabChange('home')} type="button" aria-label="返回首页">
        <span className="eo-brand-mark" aria-hidden="true"><img src={brandMark} alt="" /></span>
        <span>EO 会议管理</span>
      </button>
      <nav className="eo-main-nav" aria-label="系统主导航">
        {TABS.map(([id, label]) => <button key={id} type="button"
          className={activeTab === id ? 'eo-nav-item eo-nav-item-active' : 'eo-nav-item'}
          aria-current={activeTab === id ? 'page' : undefined} onClick={() => onTabChange(id)}>{label}</button>)}
      </nav>
      <div className="eo-topbar-tools">
        <button className="eo-icon-action" aria-label={searchOpen ? '关闭搜索' : '搜索会议'} title="搜索会议" onClick={() => setSearchOpen(value => !value)} type="button">
          {searchOpen ? <X size={19} /> : <Search size={19} />}
        </button>
        {searchOpen && <form className="eo-global-search" onSubmit={submitSearch}>
          <Search size={17} aria-hidden="true" />
          <input autoFocus aria-label="搜索会议名称或参会人" placeholder="搜索会议名称或参会人" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setSearchOpen(false) }} />
          <button className="nx-btn nx-btn-primary" type="submit">搜索</button>
        </form>}
        <details className="eo-account-menu">
          <summary aria-label="本机与备份" title="本机与备份">EO</summary>
          <div className="eo-account-popover">
            <span className="eo-menu-caption">本机工作区 · {APP_VERSION_LABEL}</span>
            <button type="button" onClick={onExport}><Download size={16} />导出备份</button>
            <button type="button" onClick={onImportData}><Upload size={16} />恢复备份</button>
            {recoveryPoint && <button type="button" onClick={onUndoRestore}><Undo2 size={16} />撤销上次恢复</button>}
            <p>数据保存在这台电脑，建议定期导出备份。</p>
          </div>
        </details>
      </div>
    </header>
  )
}
