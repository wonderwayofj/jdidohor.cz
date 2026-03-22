(async function () {
  if (document.getElementById('jdh-overlay')) {
    document.getElementById('jdh-overlay').remove()
    return
  }

  const overlay = document.createElement('div')
  overlay.id = 'jdh-overlay'
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(13,27,46,0.97);z-index:999999;display:flex;flex-direction:column;font-family:system-ui,sans-serif;color:#fff'
  overlay.innerHTML = `
    <div style="background:#0d1b2e;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1e3050;flex-shrink:0">
      <strong style="font-size:17px">▲ JDI DO HOR — Finišeři výzev</strong>
      <button id="jdh-close" style="background:#e63329;border:none;color:#fff;padding:7px 16px;border-radius:4px;cursor:pointer;font-size:13px">✕ Zavřít</button>
    </div>
    <div id="jdh-status" style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px">
      <div style="font-size:22px">⏳ Načítám data…</div>
      <div id="jdh-msg" style="opacity:.6;font-size:14px">Připravuji…</div>
      <div style="width:320px;height:6px;background:#1e3050;border-radius:3px;overflow:hidden">
        <div id="jdh-bar" style="height:100%;background:#e63329;width:0%;transition:width .4s"></div>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  document.getElementById('jdh-close').onclick = () => overlay.remove()

  const msg = t => { const el = document.getElementById('jdh-msg'); if (el) el.textContent = t }
  const bar = p => { const el = document.getElementById('jdh-bar'); if (el) el.style.width = p + '%' }
  const sleep = ms => new Promise(r => setTimeout(r, ms))

  try {
    // 1. Load challenges
    msg('Načítám výzvy…'); bar(5)
    const chRes = await fetch('/api/challenges?limit=100&depth=0').then(r => r.json())
    const challengeMap = {}
    chRes.docs.forEach(c => { challengeMap[c.id] = c.name })
    const challengeNames = chRes.docs.map(c => c.name).sort()
    bar(10)

    // 2. Load all participants
    let allParticipants = [], page = 1
    while (true) {
      const res = await fetch('/api/participants?limit=100&depth=0&page=' + page).then(r => r.json())
      allParticipants.push(...res.docs)
      bar(10 + Math.round((allParticipants.length / res.totalDocs) * 30))
      msg('Načítám participanty… ' + allParticipants.length + ' / ' + res.totalDocs)
      if (!res.hasNextPage) break
      page++
    }
    bar(40)

    // 3. Process
    msg('Zpracovávám…')
    const rows = allParticipants
      .map(p => {
        const finished = (p.challengesRef || []).filter(c => c.finished)
        const all = (p.challengesRef || [])
        return {
          id: p.id,
          totalChallenges: all.length,
          finishedCount: finished.length,
          finishedNames: finished.map(c => challengeMap[c.id] || '?'),
          allNames: all.map(c => challengeMap[c.id] || '?'),
          name: '…', email: '…'
        }
      })
      .filter(r => r.finishedCount > 0)
      .sort((a, b) => b.finishedCount - a.finishedCount)
    bar(45)

    // 4. Load all users in bulk pages and build a map
    const userMap = {}
    let uPage = 1, uTotal = null
    while (true) {
      const uRes = await fetch('/api/users?limit=100&depth=0&page=' + uPage).then(r => r.json())
      if (uTotal === null) uTotal = uRes.totalPages || 1
      uRes.docs.forEach(u => { userMap[u.id] = { name: u.name || u.email || '?', email: u.email || '?' } })
      bar(45 + Math.round((uPage / uTotal) * 50))
      msg('Načítám uživatele… stránka ' + uPage + ' / ' + uTotal)
      if (!uRes.hasNextPage) break
      uPage++
      await sleep(700)
    }
    // Apply user data to rows
    rows.forEach(r => {
      const u = userMap[r.id]
      if (u) { r.name = u.name; r.email = u.email } else { r.name = '?'; r.email = '?' }
    })
    bar(98)

    // 5. Build UI
    document.getElementById('jdh-status').remove()

    // Multi-select dropdown state
    const selectedChallenges = new Set()
    let filterMode = 'finished' // 'finished' = dokončili, 'not' = nedokončili

    const filterBar = document.createElement('div')
    filterBar.style.cssText = 'background:#1a2a3e;padding:12px 24px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;flex-shrink:0;border-bottom:1px solid #1e3050;position:relative'
    filterBar.innerHTML = `
      <input id="jdh-s" placeholder="🔍 Jméno nebo email…" style="padding:7px 11px;border-radius:4px;border:none;font-size:13px;min-width:220px">

      <!-- Challenge multi-select -->
      <div style="position:relative">
        <button id="jdh-ch-btn" style="padding:7px 11px;border-radius:4px;border:none;font-size:13px;cursor:pointer;background:#fff;min-width:180px;text-align:left">
          Výzvy: Všechny ▼
        </button>
        <div id="jdh-ch-dropdown" style="display:none;position:absolute;top:110%;left:0;background:#fff;color:#222;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.4);z-index:100;min-width:260px;max-height:320px;overflow-y:auto;padding:8px 0">
          <label style="display:flex;align-items:center;gap:8px;padding:7px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid #eee">
            <input type="checkbox" id="jdh-ch-all" checked> <span>Všechny výzvy</span>
          </label>
          <div style="padding:6px 14px;font-size:11px;color:#888;font-weight:600;margin-top:4px">FILTROVAT PODLE VÝZVY:</div>
          ${challengeNames.map(c => `
            <label style="display:flex;align-items:center;gap:8px;padding:6px 14px;cursor:pointer;font-size:13px;hover:background:#f5f5f5" class="jdh-ch-item">
              <input type="checkbox" class="jdh-ch-cb" value="${c}"> <span>${c}</span>
            </label>
          `).join('')}
        </div>
      </div>

      <!-- Finished / Not finished toggle -->
      <div id="jdh-mode-wrap" style="display:none;background:#0d1b2e;border-radius:4px;overflow:hidden;display:none">
        <button id="jdh-mode-yes" style="padding:7px 12px;border:none;font-size:12px;cursor:pointer;background:#e63329;color:#fff">✓ Dokončili</button>
        <button id="jdh-mode-no"  style="padding:7px 12px;border:none;font-size:12px;cursor:pointer;background:transparent;color:#aaa">✗ Nedokončili</button>
      </div>

      <select id="jdh-mn" style="padding:7px 11px;border-radius:4px;border:none;font-size:13px">
        ${[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17].map(n => `<option value="${n}">Min. dokončeno: ${n}</option>`).join('')}
      </select>

      <button id="jdh-csv" style="background:#e63329;border:none;color:#fff;padding:7px 14px;border-radius:4px;cursor:pointer;font-size:13px">⬇ CSV</button>
      <span id="jdh-cnt" style="opacity:.5;font-size:12px"></span>
    `
    overlay.appendChild(filterBar)

    const tableWrap = document.createElement('div')
    tableWrap.style.cssText = 'overflow:auto;flex:1'
    tableWrap.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead style="position:sticky;top:0;background:#0d1b2e">
          <tr>
            <th data-k="name"         style="padding:10px 16px;text-align:left;cursor:pointer;white-space:nowrap">Jméno ↕</th>
            <th data-k="email"        style="padding:10px 16px;text-align:left;cursor:pointer;white-space:nowrap">Email ↕</th>
            <th data-k="finishedCount" style="padding:10px 16px;text-align:center;cursor:pointer;white-space:nowrap">Dokončeno ↕</th>
            <th style="padding:10px 16px;text-align:left">Splněné výzvy</th>
          </tr>
        </thead>
        <tbody id="jdh-body"></tbody>
      </table>
    `
    overlay.appendChild(tableWrap)

    let sortKey = 'finishedCount', sortDir = -1

    function getFiltered() {
      const s = document.getElementById('jdh-s').value.toLowerCase()
      const mn = parseInt(document.getElementById('jdh-mn').value)
      const sel = [...selectedChallenges]

      return rows.filter(r => {
        if (s && !r.name.toLowerCase().includes(s) && !r.email.toLowerCase().includes(s)) return false
        if (r.finishedCount < mn) return false
        if (sel.length > 0) {
          if (filterMode === 'finished') {
            // Must have finished ALL selected challenges
            if (!sel.every(ch => r.finishedNames.includes(ch))) return false
          } else {
            // Must NOT have finished ANY of selected challenges (but was registered)
            if (!sel.every(ch => r.allNames.includes(ch) && !r.finishedNames.includes(ch))) return false
          }
        }
        return true
      }).sort((a, b) => {
        const av = typeof a[sortKey] === 'string' ? a[sortKey].toLowerCase() : a[sortKey]
        const bv = typeof b[sortKey] === 'string' ? b[sortKey].toLowerCase() : b[sortKey]
        return av > bv ? sortDir : av < bv ? -sortDir : 0
      })
    }

    function render() {
      const data = getFiltered()
      document.getElementById('jdh-cnt').textContent = data.length + ' výsledků'
      document.getElementById('jdh-body').innerHTML = data.map((r, i) => `
        <tr style="background:${i%2===0?'#1e2d3d':'#243347'}">
          <td style="padding:9px 16px;font-weight:600">${r.name}</td>
          <td style="padding:9px 16px;opacity:.7">${r.email}</td>
          <td style="padding:9px 16px;text-align:center">
            <span style="background:#e63329;color:#fff;border-radius:12px;padding:2px 10px;font-weight:700">${r.finishedCount}</span>
            <span style="opacity:.4;font-size:11px"> /${r.totalChallenges}</span>
          </td>
          <td style="padding:9px 16px;font-size:11px;opacity:.75">${r.finishedNames.join(', ')}</td>
        </tr>
      `).join('')
    }

    function updateChBtn() {
      const sel = [...selectedChallenges]
      const btn = document.getElementById('jdh-ch-btn')
      const modeWrap = document.getElementById('jdh-mode-wrap')
      if (sel.length === 0) {
        btn.textContent = 'Výzvy: Všechny ▼'
        modeWrap.style.display = 'none'
      } else {
        btn.textContent = sel.length === 1 ? sel[0] + ' ▼' : sel.length + ' výzev vybráno ▼'
        modeWrap.style.display = 'flex'
      }
    }

    // Dropdown toggle
    document.getElementById('jdh-ch-btn').onclick = e => {
      e.stopPropagation()
      const dd = document.getElementById('jdh-ch-dropdown')
      dd.style.display = dd.style.display === 'none' ? 'block' : 'none'
    }
    document.addEventListener('click', () => {
      const dd = document.getElementById('jdh-ch-dropdown')
      if (dd) dd.style.display = 'none'
    })
    document.getElementById('jdh-ch-dropdown').onclick = e => e.stopPropagation()

    // "All" checkbox
    document.getElementById('jdh-ch-all').onchange = function () {
      if (this.checked) {
        selectedChallenges.clear()
        document.querySelectorAll('.jdh-ch-cb').forEach(cb => cb.checked = false)
        updateChBtn(); render()
      }
    }

    // Individual checkboxes
    document.querySelectorAll('.jdh-ch-cb').forEach(cb => {
      cb.onchange = function () {
        if (this.checked) {
          selectedChallenges.add(this.value)
          document.getElementById('jdh-ch-all').checked = false
        } else {
          selectedChallenges.delete(this.value)
          if (selectedChallenges.size === 0) document.getElementById('jdh-ch-all').checked = true
        }
        updateChBtn(); render()
      }
    })

    // Mode buttons (finished / not finished)
    document.getElementById('jdh-mode-yes').onclick = function () {
      filterMode = 'finished'
      this.style.background = '#e63329'; this.style.color = '#fff'
      document.getElementById('jdh-mode-no').style.background = 'transparent'
      document.getElementById('jdh-mode-no').style.color = '#aaa'
      render()
    }
    document.getElementById('jdh-mode-no').onclick = function () {
      filterMode = 'not'
      this.style.background = '#e63329'; this.style.color = '#fff'
      document.getElementById('jdh-mode-yes').style.background = 'transparent'
      document.getElementById('jdh-mode-yes').style.color = '#aaa'
      render()
    }

    // Search + min filter
    document.getElementById('jdh-s').addEventListener('input', render)
    document.getElementById('jdh-mn').addEventListener('change', render)

    // Column sort
    tableWrap.querySelectorAll('th[data-k]').forEach(th => {
      th.addEventListener('click', () => {
        const k = th.dataset.k
        if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = 1 }
        render()
      })
    })

    // CSV export
    document.getElementById('jdh-csv').onclick = () => {
      const data = getFiltered()
      const csv = ['Jméno,Email,Dokončeno,Výzvy']
        .concat(data.map(r => `"${r.name}","${r.email}",${r.finishedCount},"${r.finishedNames.join('; ')}"`))
        .join('\n')
      const a = document.createElement('a')
      a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv)
      a.download = 'finiseri-jdidohor.csv'
      a.click()
    }

    render()
    bar(100)

  } catch (e) {
    msg('Chyba: ' + e.message)
  }
})()
