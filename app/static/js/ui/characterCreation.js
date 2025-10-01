// Character Creation Overlay (3x2 class grid with Male/Female toggle)
// Public API:
//   CharacterCreation.open({ onCreate })  -> shows overlay
//   CharacterCreation.close()             -> hides overlay

const tpl = /*html*/ `
<div class="cc-overlay" role="dialog" aria-modal="true" aria-labelledby="ccTitle">
  <div class="cc-modal">
    <div class="cc-header">
      <h2 id="ccTitle">Create Your Character</h2>
      <button class="cc-close" title="Close" aria-label="Close">&times;</button>
    </div>
    <div class="cc-sub">Choose your class. Your name will match your account username; you can set a display name later.</div>

    <div class="cc-grid" id="ccGrid" role="listbox" aria-activedescendant="">
      <!-- tiles injected -->
    </div>

    <div class="cc-preview" id="ccPreview">
      <div class="cc-preview-portrait" id="ccPreviewPortrait"></div>
      <div class="cc-preview-body">
        <div class="cc-preview-title" id="ccPreviewTitle">—</div>
        <div class="cc-preview-tagline" id="ccPreviewTagline">Pick a class to see details.</div>
        <div class="cc-preview-list">
          <div><strong>Origin</strong><div id="ccPreviewOrigin" class="cc-muted">—</div></div>
          <div><strong>Starting Kit</strong><div id="ccPreviewKit" class="cc-muted">—</div></div>
          <div><strong>Base Stats</strong>
            <div id="ccPreviewStats" class="cc-stats"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="cc-footer">
      <div class="cc-gender">
        <span>Appearance:</span>
        <label><input type="radio" name="ccGender" value="male" checked> Male</label>
        <label><input type="radio" name="ccGender" value="female"> Female</label>
      </div>
      <div class="cc-actions">
        <button class="cc-btn ghost" id="ccCancel">Cancel</button>
        <button class="cc-btn primary" id="ccCreate" disabled>Create Character</button>
      </div>
    </div>
  </div>
</div>
`;

async function fetchClasses() {
  const res = await fetch('/api/classes', { credentials: 'include' });
  if (!res.ok) throw new Error(`/api/classes failed: ${res.status}`);
  return res.json();
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

function tileHtml(c) {
  return /*html*/`
  <div class="cc-tile-inner">
    <div class="cc-tile-portrait" style="background-image:url('${c.portraits?.male || c.portraits?.female || ''}')"></div>
    <div class="cc-tile-name">${c.name}</div>
    <div class="cc-tile-tag">${c.tagline || ''}</div>
  </div>`;
}

function updatePreview(c, gender='male'){
  const portrait = document.getElementById('ccPreviewPortrait');
  const title = document.getElementById('ccPreviewTitle');
  const tagline = document.getElementById('ccPreviewTagline');
  const origin = document.getElementById('ccPreviewOrigin');
  const kit = document.getElementById('ccPreviewKit');
  const stats = document.getElementById('ccPreviewStats');

  portrait.style.backgroundImage = `url('${(c.portraits && c.portraits[gender]) || ''}')`;
  title.textContent = c.name;
  tagline.textContent = c.tagline || '';
  origin.textContent = c.preview?.origin || '—';
  kit.textContent = (c.preview?.startingKit || []).join(', ') || '—';

  const bs = c.preview?.baseStats || {};
  stats.innerHTML = '';
  Object.entries(bs).forEach(([k,v])=>{
    const row = el('div','cc-stat-row', `<span>${k}</span><span>${v}</span>`);
    stats.appendChild(row);
  });
}

async function postCreate(classId, gender){
  const res = await fetch('/api/characters', {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    credentials: 'include',
    body: JSON.stringify({ class_id: classId, gender })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const CharacterCreation = (() => {
  let root, classes = [], selectedId = null, selectedGender = 'male', onCreateCb = null;

  function close(){
    root?.remove();
    root = null;
    document.body.classList.remove('no-scroll');
  }

  async function open({ onCreate } = {}){
    onCreateCb = onCreate || null;

    if (root) close();
    root = document.createElement('div');
    root.innerHTML = tpl;
    root = root.firstElementChild;
    document.body.appendChild(root);
    document.body.classList.add('no-scroll');

    // wire close
    root.querySelector('.cc-close')?.addEventListener('click', close);
    root.querySelector('#ccCancel')?.addEventListener('click', close);

    // load classes
    try{
      classes = await fetchClasses();
    }catch(e){
      console.error(e);
      alert('Failed to load classes.');
      return;
    }

    // render tiles
    const grid = root.querySelector('#ccGrid');
    classes.forEach((c, idx)=>{
      const tile = el('button','cc-tile', tileHtml(c));
      tile.type = 'button';
      tile.setAttribute('role','option');
      tile.id = `cc-opt-${c.id}`;
      tile.dataset.classId = c.id;
      tile.addEventListener('click', ()=>select(c.id));
      // keyboard focus
      tile.addEventListener('keydown', (ev)=>{
        const dirs = { ArrowRight:1, ArrowLeft:-1, ArrowDown:3, ArrowUp:-3 };
        if (dirs[ev.key] != null){
          const next = Math.max(0, Math.min(classes.length-1, idx + dirs[ev.key]));
          grid.children[next]?.focus();
          ev.preventDefault();
        } else if (ev.key === 'Enter' || ev.key === ' '){
          select(c.id);
          ev.preventDefault();
        }
      });
      grid.appendChild(tile);
    });

    // gender
    root.querySelectorAll('input[name="ccGender"]').forEach(r=>{
      r.addEventListener('change', ()=>{
        selectedGender = r.value;
        const cls = classes.find(x=>x.id===selectedId);
        if (cls) updatePreview(cls, selectedGender);
      });
    });

    // create
    const btnCreate = root.querySelector('#ccCreate');
    btnCreate.addEventListener('click', async ()=>{
      if (!selectedId) return;
      btnCreate.disabled = true;
      try{
        const payload = await postCreate(selectedId, selectedGender);
        if (onCreateCb) onCreateCb(payload);
        close();
      }catch(e){
        console.error(e);
        alert('Could not create character.');
      }finally{
        btnCreate.disabled = false;
      }
    });
  }

  function select(classId){
    selectedId = classId;
    // highlight tile
    root.querySelectorAll('.cc-tile').forEach(el=>{
      el.classList.toggle('is-selected', el.dataset.classId === classId);
    });
    // enable create
    root.querySelector('#ccCreate').disabled = false;
    // show preview
    const cls = classes.find(x=>x.id===classId);
    if (cls) updatePreview(cls, selectedGender);
    // set aria
    const grid = root.querySelector('#ccGrid');
    grid.setAttribute('aria-activedescendant', `cc-opt-${classId}`);
  }

  return { open, close };
})();
